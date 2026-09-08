package main

import (
	"compress/gzip"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"sync"
)

// compressibleTypes are the media types worth gzipping. Everything maggie
// serves is text — the SPA bundle and bd's JSON — and already-compressed
// formats (png, woff2) are absent on purpose: re-compressing them costs CPU and
// grows the payload.
var compressibleTypes = map[string]struct{}{
	"application/javascript": {},
	"application/json":       {},
	"image/svg+xml":          {},
	"text/css":               {},
	"text/html":              {},
	"text/javascript":        {},
	"text/plain":             {},
}

// gzipLevel trades ratio for latency. 5 is chi's default and sits near the knee
// of the curve for text.
const gzipLevel = 5

var gzipWriters = sync.Pool{
	New: func() any {
		w, err := gzip.NewWriterLevel(io.Discard, gzipLevel)
		if err != nil {
			// Only returned for an out-of-range level, and gzipLevel is a
			// constant, so this is unreachable short of editing it wrongly.
			return gzip.NewWriter(io.Discard)
		}
		return w
	},
}

// compress gzips responses whose type is worth compressing, for clients that
// asked for it. The bundle is the reason: it ships uncompressed otherwise.
func compress(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Vary goes on every response, compressed or not, so a shared cache
		// keys the entry on the encoding rather than serving gzip to a client
		// that cannot read it.
		w.Header().Add("Vary", "Accept-Encoding")
		if !acceptsGzip(r.Header.Get("Accept-Encoding")) {
			next.ServeHTTP(w, r)
			return
		}
		cw := &compressWriter{ResponseWriter: w}
		defer cw.close()
		next.ServeHTTP(cw, r)
	})
}

// acceptsGzip reports whether the client offered gzip. A "gzip;q=0" is an
// explicit refusal, so the quality value is honoured rather than ignored.
func acceptsGzip(header string) bool {
	for enc := range strings.SplitSeq(header, ",") {
		name, params, _ := strings.Cut(strings.TrimSpace(enc), ";")
		if !strings.EqualFold(strings.TrimSpace(name), "gzip") {
			continue
		}
		q := strings.TrimSpace(params)
		return !strings.EqualFold(q, "q=0") && !strings.HasPrefix(q, "q=0.0")
	}
	return false
}

var (
	_ http.ResponseWriter = (*compressWriter)(nil)
	_ http.Flusher        = (*compressWriter)(nil)
)

// compressWriter defers the decision to WriteHeader, which is the first moment
// the handler's Content-Type and status are both known.
type compressWriter struct {
	http.ResponseWriter

	gz          *gzip.Writer
	wroteHeader bool
}

func (w *compressWriter) WriteHeader(code int) {
	if w.wroteHeader {
		return
	}
	w.wroteHeader = true
	if shouldCompress(w.Header(), code) {
		// The length describes the uncompressed body and would be wrong.
		w.Header().Del("Content-Length")
		w.Header().Set("Content-Encoding", "gzip")
		gz, ok := gzipWriters.Get().(*gzip.Writer)
		if ok {
			gz.Reset(w.ResponseWriter)
			w.gz = gz
		} else {
			w.Header().Del("Content-Encoding")
		}
	}
	w.ResponseWriter.WriteHeader(code)
}

func (w *compressWriter) Write(p []byte) (int, error) {
	if !w.wroteHeader {
		w.WriteHeader(http.StatusOK)
	}
	if w.gz != nil {
		return w.gz.Write(p)
	}
	return w.ResponseWriter.Write(p)
}

// Flush pushes buffered bytes through the gzip writer before the underlying
// one, so a streaming response is not held up inside the compressor.
func (w *compressWriter) Flush() {
	if w.gz != nil {
		if err := w.gz.Flush(); err != nil {
			slog.Debug("gzip flush", "err", err)
		}
	}
	if f, ok := w.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

// Unwrap lets http.ResponseController reach the underlying writer for
// deadlines and hijacking.
func (w *compressWriter) Unwrap() http.ResponseWriter { return w.ResponseWriter }

// close finishes the gzip stream and returns the writer to the pool. Writing
// the trailer can only fail if the client already went away.
func (w *compressWriter) close() {
	if w.gz == nil {
		return
	}
	if err := w.gz.Close(); err != nil {
		slog.Debug("gzip close", "err", err)
	}
	gzipWriters.Put(w.gz)
	w.gz = nil
}

// shouldCompress decides from the headers the handler has set so far.
func shouldCompress(h http.Header, code int) bool {
	// 1xx, 204 and 304 carry no body, and a body already encoded by the
	// handler must not be wrapped a second time.
	if code < http.StatusOK || code == http.StatusNoContent || code == http.StatusNotModified {
		return false
	}
	if h.Get("Content-Encoding") != "" {
		return false
	}
	mediaType, _, _ := strings.Cut(h.Get("Content-Type"), ";")
	_, ok := compressibleTypes[strings.ToLower(strings.TrimSpace(mediaType))]
	return ok
}
