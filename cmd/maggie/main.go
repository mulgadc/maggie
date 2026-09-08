// Command maggie serves a web UI over the Beads `bd` CLI.
package main

import (
	"context"
	"embed"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"io/fs"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"path"
	"regexp"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/mulgadc/maggie/internal/beads"
)

// Version is set via ldflags at build time.
// Example: go build -ldflags "-X main.Version=v1.0.0".
var Version = "dev"

//go:embed web
var webFS embed.FS

var (
	idRe       = regexp.MustCompile(`^[A-Za-z0-9._-]{1,64}$`)
	statusRe   = regexp.MustCompile(`^(open|in_progress|blocked|deferred|closed)$`)
	priorityRe = regexp.MustCompile(`^[0-4]$`)
	actorRe    = regexp.MustCompile(`^[A-Za-z0-9-]{1,39}$`) // GitHub username shape
	labelRe    = regexp.MustCompile(`^[A-Za-z0-9._:/-]{1,64}$`)
	depTypeRe  = regexp.MustCompile(`^(blocks|relates-to|parent)$`)
)

func main() {
	showVersion := flag.Bool("version", false, "print the version and exit")
	flag.Parse()
	if *showVersion {
		fmt.Println("maggie", Version)
		return
	}

	addr := envOr("MAGGIE_ADDR", ":8088")
	dir := envOr("MAGGIE_BEADS_DIR", ".")
	bin := envOr("MAGGIE_BD_BIN", "bd")

	bd := beads.New(bin, dir, bdTimeout)
	actors := splitActors(os.Getenv("MAGGIE_ACTORS"))

	sub, err := fs.Sub(webFS, "web")
	if err != nil {
		slog.Error("embed web", "err", err)
		os.Exit(1)
	}

	slog.Info("maggie listening", "addr", addr, "beads_dir", dir)
	srv := httpServer(addr, securityHeaders(routes(bd, actors, sub)))

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	if err := serve(ctx, srv); err != nil {
		slog.Error("serve", "err", err)
		os.Exit(1)
	}
}

// bdTimeout caps a single bd invocation. The server's WriteTimeout is derived
// from it, so a bd call that runs long fails as a bd error rather than as a
// truncated response.
const bdTimeout = 15 * time.Second

// httpServer builds the listener's server with every timeout set. WriteTimeout
// clears bdTimeout so a slow bd call still gets to answer; the rest bound how
// long an idle or trickling connection can hold a slot.
func httpServer(addr string, h http.Handler) *http.Server {
	return &http.Server{
		Addr:              addr,
		Handler:           h,
		ReadTimeout:       30 * time.Second,
		ReadHeaderTimeout: 10 * time.Second,
		WriteTimeout:      bdTimeout + 15*time.Second,
		IdleTimeout:       60 * time.Second,
	}
}

// shutdownGrace bounds the wait for in-flight requests once a signal arrives. A
// bd write holds its own 15s timeout, so the grace period clears it and the
// mutation lands rather than being killed halfway through.
const shutdownGrace = 30 * time.Second

// serve runs srv until it fails or ctx is cancelled, then drains in-flight
// requests. ErrServerClosed is Shutdown's documented return once the drain has
// been asked for, so it reports success rather than a failure to exit non-zero.
func serve(ctx context.Context, srv *http.Server) error {
	errCh := make(chan error, 1)
	go func() {
		err := srv.ListenAndServe()
		if errors.Is(err, http.ErrServerClosed) {
			err = nil
		}
		errCh <- err
	}()

	select {
	case err := <-errCh:
		return err
	case <-ctx.Done():
	}

	slog.Info("shutdown signal received, draining in-flight requests")
	drainCtx, cancel := context.WithTimeout(context.Background(), shutdownGrace)
	defer cancel()
	if err := srv.Shutdown(drainCtx); err != nil {
		return fmt.Errorf("shutdown: %w", err)
	}
	return <-errCh
}

// routes wires the bd-backed API and the embedded SPA onto a mux.
func routes(bd *beads.Client, actors []string, web fs.FS) *http.ServeMux {
	mux := http.NewServeMux()
	mux.Handle("/", spaHandler(web))
	mux.HandleFunc("/health", healthHandler)
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
	mux.HandleFunc("/api/actors", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(actors); err != nil {
			slog.Error("actors encode", "err", err)
		}
	})
	mux.HandleFunc("/api/issue/update", writeHandler(func(r *http.Request) (string, error) {
		var b updateBody
		if err := decode(r, &b); err != nil {
			return "", err
		}
		if !idRe.MatchString(b.ID) {
			return "", errBadRequest("invalid id")
		}
		f, err := b.fields()
		if err != nil {
			return "", err
		}
		return b.ID, bd.Update(r.Context(), b.ID, f, b.Actor)
	}, bd))
	mux.HandleFunc("/api/issue/comment", writeHandler(func(r *http.Request) (string, error) {
		var b commentBody
		if err := decode(r, &b); err != nil {
			return "", err
		}
		if !idRe.MatchString(b.ID) {
			return "", errBadRequest("invalid id")
		}
		if strings.TrimSpace(b.Text) == "" {
			return "", errBadRequest("empty comment")
		}
		return b.ID, bd.AddComment(r.Context(), b.ID, b.Text, b.Actor)
	}, bd))
	mux.HandleFunc("/api/issue/dep", writeHandler(func(r *http.Request) (string, error) {
		var b depBody
		if err := decode(r, &b); err != nil {
			return "", err
		}
		if !idRe.MatchString(b.ID) || !idRe.MatchString(b.DependsOn) {
			return "", errBadRequest("invalid id")
		}
		if !depTypeRe.MatchString(b.Type) {
			return "", errBadRequest("invalid dep type")
		}
		if b.ID == b.DependsOn {
			return "", errBadRequest("cannot depend on self")
		}
		return b.ID, bd.AddDep(r.Context(), b.ID, b.DependsOn, b.Type, b.Actor)
	}, bd))
	mux.HandleFunc("/api/graph", func(w http.ResponseWriter, r *http.Request) {
		edges, err := bd.GraphEdges(r.Context())
		if err != nil {
			slog.Error("graph", "err", err)
			http.Error(w, "graph failed", http.StatusBadGateway)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(edges); err != nil {
			slog.Error("graph encode", "err", err)
		}
	})
	return mux
}

// Content-Security-Policy header. Everything the SPA needs is same-origin
// except the display font, which index.html pulls from Google Fonts. No HSTS or
// upgrade-insecure-requests: maggie serves plain HTTP and expects a reverse
// proxy to terminate TLS, so either would break a direct http:// deployment.
const csp = "default-src 'self'; script-src 'self'; " +
	"style-src 'self' https://fonts.googleapis.com; " +
	"img-src 'self' data:; font-src 'self' https://fonts.gstatic.com; " +
	"connect-src 'self'; object-src 'none'; base-uri 'self'; " +
	"form-action 'self'; frame-ancestors 'none';"

// securityHeaders applies the response headers that bound what the page is
// allowed to do. Bead text is rendered as markdown with raw HTML disabled, so
// this is defence in depth rather than the only control.
func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Security-Policy", csp)
		w.Header().Set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), browsing-topics=()")
		w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		next.ServeHTTP(w, r)
	})
}

// healthHandler answers a liveness probe: the process is up and serving. It
// deliberately does not shell out to bd, so a probe cannot be turned into an
// unauthenticated way to spawn subprocesses. /api/ready is beads' ready-to-work
// list, not a readiness probe, despite the name.
func healthHandler(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	if err := json.NewEncoder(w).Encode(map[string]string{
		"status":  "ok",
		"version": Version,
	}); err != nil {
		slog.Error("health encode", "err", err)
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
		if _, err := fs.Stat(sub, p); err != nil {
			// A missing path that names a file is a real 404, and it is served
			// without a cache directive so the miss is not remembered.
			if path.Ext(p) != "" {
				fileServer.ServeHTTP(w, r)
				return
			}
			r = r.Clone(r.Context())
			r.URL.Path = "/"
			p = "index.html"
		}
		w.Header().Set("Cache-Control", assetCacheControl(p))
		fileServer.ServeHTTP(w, r)
	})
}

// embed.FS reports a zero ModTime and FileServer sets no ETag, so a revalidated
// response has no validator to answer 304 with. The content hash under assets/
// is that validator: the name addresses one build, so it can be cached forever.
// Everything else is revalidated, index.html above all — it is what points at
// the current build's hashed names.
func assetCacheControl(p string) string {
	if strings.HasPrefix(p, "assets/") {
		return "public, max-age=31536000, immutable"
	}
	return "no-cache"
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
	if n, err := strconv.Atoi(q.Get("limit")); err == nil && n > 0 && n <= 100000 {
		o.Limit = n
	}
	return o
}

// Write request bodies. Assignee/Description are pointers so "absent" (leave
// unchanged) is distinct from "" (clear). Every write requires a valid actor.
type updateBody struct {
	ID           string   `json:"id"`
	Actor        string   `json:"actor"`
	Status       string   `json:"status"`
	Priority     string   `json:"priority"`
	Assignee     *string  `json:"assignee"`
	Description  *string  `json:"description"`
	Notes        *string  `json:"notes"`
	Acceptance   *string  `json:"acceptance"`
	AddLabels    []string `json:"add_labels"`
	RemoveLabels []string `json:"remove_labels"`
}

type commentBody struct {
	ID    string `json:"id"`
	Actor string `json:"actor"`
	Text  string `json:"text"`
}

type depBody struct {
	ID        string `json:"id"`
	Actor     string `json:"actor"`
	DependsOn string `json:"depends_on"`
	Type      string `json:"type"`
}

// fields validates the update payload and builds beads.UpdateFields.
func (b updateBody) fields() (beads.UpdateFields, error) {
	var f beads.UpdateFields
	if b.Status != "" {
		if !statusRe.MatchString(b.Status) {
			return f, errBadRequest("invalid status")
		}
		f.Status = b.Status
	}
	if b.Priority != "" {
		if !priorityRe.MatchString(b.Priority) {
			return f, errBadRequest("invalid priority")
		}
		f.Priority = b.Priority
	}
	if b.Assignee != nil {
		if *b.Assignee != "" && !actorRe.MatchString(*b.Assignee) {
			return f, errBadRequest("invalid assignee")
		}
		f.Assignee = b.Assignee
	}
	f.Description = b.Description
	f.Notes = b.Notes
	f.Acceptance = b.Acceptance
	for _, l := range append(b.AddLabels, b.RemoveLabels...) {
		if !labelRe.MatchString(l) {
			return f, errBadRequest("invalid label")
		}
	}
	f.AddLabels = b.AddLabels
	f.RemoveLabels = b.RemoveLabels
	return f, nil
}

// decode enforces POST + JSON body and rejects a missing/invalid actor up front.
func decode(r *http.Request, v interface{ actor() string }) error {
	if r.Method != http.MethodPost {
		return errBadRequest("method not allowed")
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(v); err != nil {
		return errBadRequest("invalid body")
	}
	if !actorRe.MatchString(v.actor()) {
		return errBadRequest("invalid actor")
	}
	return nil
}

func (b updateBody) actor() string  { return b.Actor }
func (b commentBody) actor() string { return b.Actor }
func (b depBody) actor() string     { return b.Actor }

// writeHandler runs a bd mutation then returns the fresh issue JSON (bd show) so
// clients can update their cache without a round-trip.
func writeHandler(fn func(*http.Request) (string, error), bd *beads.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := fn(r)
		if err != nil {
			if _, ok := errors.AsType[badRequestError](err); ok {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			slog.Error("write", "path", r.URL.Path, "err", err)
			http.Error(w, "upstream bd failed", http.StatusBadGateway)
			return
		}
		out, err := bd.Show(r.Context(), id)
		if err != nil {
			slog.Error("write show", "id", id, "err", err)
			w.WriteHeader(http.StatusNoContent)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(out)
	}
}

type badRequestError struct{ msg string }

func (e badRequestError) Error() string { return e.msg }
func errBadRequest(m string) error      { return badRequestError{m} }

// jsonHandler adapts a bd-backed fetch into an HTTP handler, forwarding raw JSON.
func jsonHandler(fn func(*http.Request) ([]byte, error)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		out, err := fn(r)
		if err != nil {
			if _, ok := errors.AsType[badRequestError](err); ok {
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

// splitActors parses MAGGIE_ACTORS, the comma-separated roster offered by the
// identity picker. Always non-nil so /api/actors encodes [] rather than null;
// an empty roster just means users type their own name.
func splitActors(s string) []string {
	out := []string{}
	for a := range strings.SplitSeq(s, ",") {
		if a = strings.TrimSpace(a); a != "" {
			out = append(out, a)
		}
	}
	return out
}

func envOr(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}
