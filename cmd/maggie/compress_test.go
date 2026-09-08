package main

import (
	"compress/gzip"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
	"time"

	"github.com/mulgadc/maggie/internal/beads"
)

// handler returns a handler writing body with the given content type and status.
func handler(contentType, body string, code int) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		if contentType != "" {
			w.Header().Set("Content-Type", contentType)
		}
		w.WriteHeader(code)
		_, _ = io.WriteString(w, body)
	})
}

// do runs one request through compress and returns the recorded response.
func do(h http.Handler, acceptEncoding string) *http.Response {
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	if acceptEncoding != "" {
		req.Header.Set("Accept-Encoding", acceptEncoding)
	}
	rec := httptest.NewRecorder()
	compress(h).ServeHTTP(rec, req)
	return rec.Result()
}

func TestCompressGzipsTextResponses(t *testing.T) {
	// Repetitive text so the gzip trailer cannot outweigh the saving.
	want := strings.Repeat("console.log(1);", 200)
	resp := do(handler("application/javascript", want, http.StatusOK), "gzip")
	defer func() { _ = resp.Body.Close() }()

	if got := resp.Header.Get("Content-Encoding"); got != "gzip" {
		t.Fatalf("Content-Encoding = %q, want gzip", got)
	}
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("read body: %v", err)
	}
	if len(raw) >= len(want) {
		t.Errorf("compressed body is %d bytes, uncompressed is %d", len(raw), len(want))
	}
	zr, err := gzip.NewReader(strings.NewReader(string(raw)))
	if err != nil {
		t.Fatalf("gzip reader: %v", err)
	}
	defer func() { _ = zr.Close() }()
	got, err := io.ReadAll(zr)
	if err != nil {
		t.Fatalf("decompress: %v", err)
	}
	if string(got) != want {
		t.Error("decompressed body does not match what the handler wrote")
	}
}

// A stale Content-Length would describe the uncompressed body and truncate the
// response on the client.
func TestCompressDropsContentLength(t *testing.T) {
	h := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		body := strings.Repeat("a", 500)
		w.Header().Set("Content-Type", "text/html")
		w.Header().Set("Content-Length", "500")
		_, _ = io.WriteString(w, body)
	})
	resp := do(h, "gzip")
	defer func() { _ = resp.Body.Close() }()

	if got := resp.Header.Get("Content-Length"); got != "" {
		t.Errorf("Content-Length = %q, want it removed", got)
	}
}

func TestCompressSkips(t *testing.T) {
	tests := []struct {
		name           string
		contentType    string
		code           int
		acceptEncoding string
	}{
		{"client did not ask", "text/html", http.StatusOK, ""},
		{"client refused with q=0", "text/html", http.StatusOK, "gzip;q=0"},
		{"already compressed format", "image/png", http.StatusOK, "gzip"},
		{"unknown type", "application/octet-stream", http.StatusOK, "gzip"},
		{"no content type", "", http.StatusOK, "gzip"},
		{"no body to compress", "text/html", http.StatusNoContent, "gzip"},
		{"not modified", "text/html", http.StatusNotModified, "gzip"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			resp := do(handler(tt.contentType, "body", tt.code), tt.acceptEncoding)
			defer func() { _ = resp.Body.Close() }()
			if got := resp.Header.Get("Content-Encoding"); got != "" {
				t.Errorf("Content-Encoding = %q, want none", got)
			}
		})
	}
}

// An encoding the handler applied itself must not be wrapped a second time.
func TestCompressDoesNotDoubleEncode(t *testing.T) {
	h := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Content-Encoding", "br")
		_, _ = io.WriteString(w, "payload")
	})
	resp := do(h, "gzip")
	defer func() { _ = resp.Body.Close() }()

	if got := resp.Header.Get("Content-Encoding"); got != "br" {
		t.Errorf("Content-Encoding = %q, want br untouched", got)
	}
}

// Vary must be set even when the response is not compressed, or a shared cache
// can hand a gzip entry to a client that never asked for one.
func TestCompressAlwaysVaries(t *testing.T) {
	for _, ae := range []string{"", "gzip"} {
		resp := do(handler("text/html", "body", http.StatusOK), ae)
		defer func() { _ = resp.Body.Close() }()
		if got := resp.Header.Get("Vary"); got != "Accept-Encoding" {
			t.Errorf("Accept-Encoding %q: Vary = %q, want Accept-Encoding", ae, got)
		}
	}
}

func TestCompressContentTypeParsing(t *testing.T) {
	tests := []struct {
		contentType string
		want        bool
	}{
		{"application/json", true},
		{"application/json; charset=utf-8", true},
		{"TEXT/HTML; charset=UTF-8", true},
		{"text/html ", true},
		{"application/jsonl", false},
	}
	for _, tt := range tests {
		t.Run(tt.contentType, func(t *testing.T) {
			h := http.Header{"Content-Type": []string{tt.contentType}}
			if got := shouldCompress(h, http.StatusOK); got != tt.want {
				t.Errorf("shouldCompress(%q) = %v, want %v", tt.contentType, got, tt.want)
			}
		})
	}
}

func TestAcceptsGzip(t *testing.T) {
	tests := []struct {
		header string
		want   bool
	}{
		{"gzip", true},
		{"gzip, deflate, br", true},
		{"br, gzip;q=0.8", true},
		{" GZIP ", true},
		{"gzip;q=0", false},
		{"gzip;q=0.0", false},
		{"deflate, br", false},
		{"", false},
		{"x-gzip", false},
	}
	for _, tt := range tests {
		t.Run(tt.header, func(t *testing.T) {
			if got := acceptsGzip(tt.header); got != tt.want {
				t.Errorf("acceptsGzip(%q) = %v, want %v", tt.header, got, tt.want)
			}
		})
	}
}

// Flush must reach the underlying writer so a streaming response is not stuck
// inside the compressor.
func TestCompressFlushReachesTheUnderlyingWriter(t *testing.T) {
	h := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/plain")
		_, _ = io.WriteString(w, strings.Repeat("chunk", 100))
		f, ok := w.(http.Flusher)
		if !ok {
			t.Error("compressWriter does not implement http.Flusher")
			return
		}
		f.Flush()
	})
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Accept-Encoding", "gzip")
	rec := httptest.NewRecorder()
	compress(h).ServeHTTP(rec, req)

	if !rec.Flushed {
		t.Error("Flush did not reach the underlying ResponseWriter")
	}
}

// The bundle shipping compressed is the whole point, so check it end to end
// through the same chain main serves.
func TestCompressAppliesToTheSPABundle(t *testing.T) {
	web := fstest.MapFS{
		"index.html":    {Data: []byte("<!doctype html>spa")},
		"assets/app.js": {Data: []byte(strings.Repeat("console.log(1);", 200))},
	}
	bd := beads.New("bd", t.TempDir(), time.Second)
	srv := httptest.NewServer(handlerChain(routes(bd, nil, web)))
	t.Cleanup(srv.Close)

	c := srv.Client()
	req, err := http.NewRequestWithContext(t.Context(), http.MethodGet, srv.URL+"/assets/app.js", nil)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	// Go's transport strips Content-Encoding when it decompresses transparently,
	// so ask explicitly to see the header the server actually sent.
	req.Header.Set("Accept-Encoding", "gzip")
	resp, err := c.Do(req)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if got := resp.Header.Get("Content-Encoding"); got != "gzip" {
		t.Errorf("Content-Encoding = %q, want gzip", got)
	}
}
