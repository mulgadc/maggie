// Command maggie serves a read-only web UI over the Beads `bd` CLI.
package main

import (
	"embed"
	"encoding/json"
	"io"
	"io/fs"
	"log/slog"
	"net/http"
	"os"
	"path"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/mulgadc/maggie/internal/beads"
)

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
	addr := envOr("MAGGIE_ADDR", ":8088")
	dir := envOr("MAGGIE_BEADS_DIR", ".")
	bin := envOr("MAGGIE_BD_BIN", "bd")

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

	slog.Info("maggie listening", "addr", addr, "beads_dir", dir)
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
			if _, ok := err.(badRequest); ok {
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
