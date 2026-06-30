// Command waratah serves a read-only web UI over the Beads `bd` CLI.
package main

import (
	"bytes"
	"embed"
	"io/fs"
	"log/slog"
	"net/http"
	"os"
	"path"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/mulgadc/waratah/internal/beads"
)

//go:embed web
var webFS embed.FS

var (
	idRe       = regexp.MustCompile(`^[A-Za-z0-9._-]{1,64}$`)
	statusRe   = regexp.MustCompile(`^(open|in_progress|blocked|deferred|closed)$`)
	priorityRe = regexp.MustCompile(`^[0-4]$`)
)

func main() {
	addr := envOr("WARATAH_ADDR", ":8088")
	dir := envOr("WARATAH_BEADS_DIR", ".")
	bin := envOr("WARATAH_BD_BIN", "bd")

	bd := beads.New(bin, dir, 15*time.Second)

	sub, err := fs.Sub(webFS, "web")
	if err != nil {
		slog.Error("embed web", "err", err)
		os.Exit(1)
	}

	mux := http.NewServeMux()
	mux.Handle("/", spaHandler(sub))
	mux.HandleFunc("/api/ready", jsonHandler(func(r *http.Request) ([]byte, error) {
		return bd.Ready(r.Context())
	}))
	mux.HandleFunc("/api/issues", jsonHandler(func(r *http.Request) ([]byte, error) {
		return bd.List(r.Context(), parseList(r))
	}))
	mux.HandleFunc("/api/issue", jsonHandler(func(r *http.Request) ([]byte, error) {
		id := r.URL.Query().Get("id")
		if !idRe.MatchString(id) {
			return nil, errBadRequest("invalid id")
		}
		return bd.Show(r.Context(), id)
	}))
	mux.HandleFunc("/api/graph", func(w http.ResponseWriter, r *http.Request) {
		out, err := bd.GraphHTML(r.Context())
		if err != nil {
			slog.Error("graph", "err", err)
			http.Error(w, "graph failed", http.StatusBadGateway)
			return
		}
		// bd loads D3 from an external CDN; rewrite to the locally vendored
		// copy so the graph renders on offline/firewalled hosts.
		out = bytes.ReplaceAll(out,
			[]byte("https://d3js.org/d3.v7.min.js"),
			[]byte("/vendor/d3.v7.min.js"))
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write(out)
	})

	slog.Info("waratah listening", "addr", addr, "beads_dir", dir)
	srv := &http.Server{Addr: addr, Handler: mux, ReadHeaderTimeout: 10 * time.Second}
	if err := srv.ListenAndServe(); err != nil {
		slog.Error("serve", "err", err)
		os.Exit(1)
	}
}

// spaHandler serves embedded static assets, falling back to index.html for
// client-side routes (paths with no file extension that are not found).
func spaHandler(sub fs.FS) http.Handler {
	fileServer := http.FileServer(http.FS(sub))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p := path.Clean(strings.TrimPrefix(r.URL.Path, "/"))
		if p == "." {
			p = "index.html"
		}
		if _, err := fs.Stat(sub, p); err != nil && path.Ext(p) == "" {
			r = r.Clone(r.Context())
			r.URL.Path = "/"
		}
		fileServer.ServeHTTP(w, r)
	})
}

// parseList builds ListOpts from allowlisted, validated query params.
func parseList(r *http.Request) beads.ListOpts {
	q := r.URL.Query()
	o := beads.ListOpts{All: q.Get("all") == "true"}
	if s := q.Get("status"); statusRe.MatchString(s) {
		o.Status = s
	}
	if p := q.Get("priority"); priorityRe.MatchString(p) {
		o.Priority = p
	}
	if n, err := strconv.Atoi(q.Get("limit")); err == nil && n > 0 && n <= 1000 {
		o.Limit = n
	}
	return o
}

type badRequest struct{ msg string }

func (e badRequest) Error() string { return e.msg }
func errBadRequest(m string) error { return badRequest{m} }

// jsonHandler adapts a bd-backed fetch into an HTTP handler, forwarding raw JSON.
func jsonHandler(fn func(*http.Request) ([]byte, error)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		out, err := fn(r)
		if err != nil {
			if _, ok := err.(badRequest); ok {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			slog.Error("api", "path", r.URL.Path, "err", err)
			http.Error(w, "upstream bd failed", http.StatusBadGateway)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(out)
	}
}

func envOr(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}
