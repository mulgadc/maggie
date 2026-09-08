package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"testing/fstest"
	"time"

	"github.com/mulgadc/maggie/internal/beads"
)

// As in internal/beads, the stub bd is this test binary re-execed: TestMain
// intercepts before any test runs and replays canned stdout for the argv it got.
const (
	stubEnv     = "MAGGIE_BD_STUB"
	stubArgvEnv = "MAGGIE_BD_STUB_ARGV"
	stubOutEnv  = "MAGGIE_BD_STUB_STDOUT"
)

func TestMain(m *testing.M) {
	if os.Getenv(stubEnv) == "" {
		os.Exit(m.Run())
	}
	if f := os.Getenv(stubArgvEnv); f != "" {
		b, err := json.Marshal(os.Args[1:])
		if err == nil {
			err = os.WriteFile(f, b, 0o600)
		}
		if err != nil {
			fmt.Fprintln(os.Stderr, "stub:", err)
			os.Exit(1)
		}
	}
	// failshow lets the mutation land and fails only the refresh that follows it.
	if os.Getenv(stubEnv) == "fail" ||
		(os.Getenv(stubEnv) == "failshow" && len(os.Args) > 1 && os.Args[1] == "show") {
		fmt.Fprint(os.Stderr, "bd: boom")
		os.Exit(3)
	}
	fmt.Print(os.Getenv(stubOutEnv))
	os.Exit(0)
}

// newServer starts routes() over a stub bd and returns the client, the base URL
// and the path the stub records argv into.
func newServer(t *testing.T, mode string, actors []string) (*http.Client, string, string) {
	t.Helper()
	self, err := os.Executable()
	if err != nil {
		t.Fatalf("os.Executable: %v", err)
	}
	argv := filepath.Join(t.TempDir(), "argv.json")
	t.Setenv(stubEnv, mode)
	t.Setenv(stubArgvEnv, argv)

	bd := beads.New(self, t.TempDir(), 5*time.Second)
	web := fstest.MapFS{
		"index.html":     {Data: []byte("<!doctype html>spa")},
		"assets/app.js":  {Data: []byte("console.log(1)")},
		"favicon.ico":    {Data: []byte("icon")},
		"assets/app.css": {Data: []byte("body{}")},
	}
	srv := httptest.NewServer(routes(bd, actors, web))
	t.Cleanup(srv.Close)
	return srv.Client(), srv.URL, argv
}

func readArgv(t *testing.T, path string) []string {
	t.Helper()
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read argv: %v", err)
	}
	var got []string
	if err := json.Unmarshal(b, &got); err != nil {
		t.Fatalf("unmarshal argv %q: %v", b, err)
	}
	return got
}

func post(t *testing.T, c *http.Client, url, body string) *http.Response {
	t.Helper()
	resp, err := c.Post(url, "application/json", strings.NewReader(body))
	if err != nil {
		t.Fatalf("post %s: %v", url, err)
	}
	t.Cleanup(func() { _ = resp.Body.Close() })
	return resp
}

func get(t *testing.T, c *http.Client, url string) *http.Response {
	t.Helper()
	resp, err := c.Get(url)
	if err != nil {
		t.Fatalf("get %s: %v", url, err)
	}
	t.Cleanup(func() { _ = resp.Body.Close() })
	return resp
}

func body(t *testing.T, resp *http.Response) string {
	t.Helper()
	b, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("read body: %v", err)
	}
	return string(b)
}

func TestSplitActors(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want []string
	}{
		{"empty", "", []string{}},
		{"only separators", ",,,", []string{}},
		{"single", "ana", []string{"ana"}},
		{"trims surrounding space", " ana , bo ", []string{"ana", "bo"}},
		{"drops blank entries", "ana,,bo,", []string{"ana", "bo"}},
		{"newlines are trimmed too", "ana,\n bo\t", []string{"ana", "bo"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := splitActors(tt.in)
			if got == nil {
				t.Fatal("splitActors returned nil; /api/actors would encode null")
			}
			if !slices.Equal(got, tt.want) {
				t.Errorf("splitActors(%q) = %q, want %q", tt.in, got, tt.want)
			}
		})
	}
}

// An unset MAGGIE_ACTORS must still produce [], since the UI types the response
// as string[] and would throw on null.
func TestActorsEndpointEncodesEmptyArray(t *testing.T) {
	c, url, _ := newServer(t, "1", splitActors(""))
	resp := get(t, c, url+"/api/actors")
	if got := strings.TrimSpace(body(t, resp)); got != "[]" {
		t.Errorf("body = %s, want []", got)
	}
}

func TestActorsEndpointReturnsRoster(t *testing.T) {
	c, url, _ := newServer(t, "1", []string{"ana", "bo"})
	resp := get(t, c, url+"/api/actors")
	var got []string
	if err := json.NewDecoder(resp.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if !slices.Equal(got, []string{"ana", "bo"}) {
		t.Errorf("actors = %q, want [ana bo]", got)
	}
}

func TestParseList(t *testing.T) {
	tests := []struct {
		name  string
		query string
		want  beads.ListOpts
	}{
		{"empty", "", beads.ListOpts{}},
		{"all", "all=true", beads.ListOpts{All: true}},
		{"all only honours the literal true", "all=1", beads.ListOpts{}},
		{"status", "status=in_progress", beads.ListOpts{Status: "in_progress"}},
		{"unknown status is dropped", "status=wontfix", beads.ListOpts{}},
		{"priority", "priority=3", beads.ListOpts{Priority: "3"}},
		{"out of range priority is dropped", "priority=9", beads.ListOpts{}},
		{"limit", "limit=42", beads.ListOpts{Limit: 42}},
		{"zero limit is dropped", "limit=0", beads.ListOpts{}},
		{"negative limit is dropped", "limit=-5", beads.ListOpts{}},
		{"oversized limit is dropped", "limit=100001", beads.ListOpts{}},
		{"limit at the cap is kept", "limit=100000", beads.ListOpts{Limit: 100000}},
		{"non-numeric limit is dropped", "limit=abc", beads.ListOpts{}},
		{
			"injection attempt in status is dropped, not forwarded",
			"status=open;rm+-rf+/",
			beads.ListOpts{},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r := httptest.NewRequest(http.MethodGet, "/api/issues?"+tt.query, nil)
			if got := parseList(r); got != tt.want {
				t.Errorf("parseList(%q) = %+v, want %+v", tt.query, got, tt.want)
			}
		})
	}
}

func TestIssuesEndpointForwardsBdJSON(t *testing.T) {
	c, url, argv := newServer(t, "1", nil)
	t.Setenv(stubOutEnv, `{"issues":[]}`)

	resp := get(t, c, url+"/api/issues?status=open&limit=5")
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}
	if got := body(t, resp); got != `{"issues":[]}` {
		t.Errorf("body = %q, want the raw bd JSON", got)
	}
	if ct := resp.Header.Get("Content-Type"); ct != "application/json" {
		t.Errorf("Content-Type = %q, want application/json", ct)
	}
	want := []string{"list", "--json", "--status", "open", "--limit", "5"}
	if got := readArgv(t, argv); !slices.Equal(got, want) {
		t.Errorf("argv = %q, want %q", got, want)
	}
}

func TestIssueEndpointRejectsBadID(t *testing.T) {
	for _, id := range []string{"", "mg 1", "mg/1", "../etc/passwd", strings.Repeat("a", 65)} {
		t.Run(id, func(t *testing.T) {
			c, base, argv := newServer(t, "1", nil)
			resp := get(t, c, base+"/api/issue?id="+url.QueryEscape(id))
			if resp.StatusCode != http.StatusBadRequest {
				t.Errorf("status = %d, want 400", resp.StatusCode)
			}
			if _, err := os.Stat(argv); err == nil {
				t.Error("bd was invoked with an invalid id")
			}
		})
	}
}

// A failing bd is an upstream fault, not the caller's: it must be 502, and the
// stderr must not be echoed to the client.
func TestUpstreamFailureIsBadGateway(t *testing.T) {
	c, url, _ := newServer(t, "fail", nil)
	resp := get(t, c, url+"/api/issues")
	if resp.StatusCode != http.StatusBadGateway {
		t.Errorf("status = %d, want 502", resp.StatusCode)
	}
	if got := body(t, resp); strings.Contains(got, "boom") {
		t.Errorf("body = %q, want bd stderr withheld from the client", got)
	}
}

func TestWritesRejectGET(t *testing.T) {
	for _, p := range []string{"/api/issue/update", "/api/issue/comment", "/api/issue/dep"} {
		t.Run(p, func(t *testing.T) {
			c, url, argv := newServer(t, "1", nil)
			resp := get(t, c, url+p)
			if resp.StatusCode != http.StatusBadRequest {
				t.Errorf("status = %d, want 400", resp.StatusCode)
			}
			if _, err := os.Stat(argv); err == nil {
				t.Error("bd was invoked for a GET write")
			}
		})
	}
}

func TestWritesRejectBadActor(t *testing.T) {
	tests := []struct {
		name string
		body string
	}{
		{"missing actor", `{"id":"mg-1","status":"open"}`},
		{"empty actor", `{"id":"mg-1","actor":"","status":"open"}`},
		{"actor with a space", `{"id":"mg-1","actor":"a n","status":"open"}`},
		{"actor with a shell metachar", `{"id":"mg-1","actor":"a;b","status":"open"}`},
		{"overlong actor", `{"id":"mg-1","actor":"` + strings.Repeat("a", 40) + `"}`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			c, url, argv := newServer(t, "1", nil)
			resp := post(t, c, url+"/api/issue/update", tt.body)
			if resp.StatusCode != http.StatusBadRequest {
				t.Errorf("status = %d, want 400", resp.StatusCode)
			}
			if _, err := os.Stat(argv); err == nil {
				t.Error("bd was invoked without a valid actor")
			}
		})
	}
}

func TestUpdateRejectsInvalidFields(t *testing.T) {
	tests := []struct {
		name string
		body string
	}{
		{"malformed json", `{`},
		{"bad id", `{"id":"mg 1","actor":"ana","status":"open"}`},
		{"bad status", `{"id":"mg-1","actor":"ana","status":"wontfix"}`},
		{"bad priority", `{"id":"mg-1","actor":"ana","priority":"9"}`},
		{"bad assignee", `{"id":"mg-1","actor":"ana","assignee":"a b"}`},
		{"bad add label", `{"id":"mg-1","actor":"ana","add_labels":["a b"]}`},
		{"bad remove label", `{"id":"mg-1","actor":"ana","remove_labels":["a b"]}`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			c, url, argv := newServer(t, "1", nil)
			resp := post(t, c, url+"/api/issue/update", tt.body)
			if resp.StatusCode != http.StatusBadRequest {
				t.Errorf("status = %d, want 400", resp.StatusCode)
			}
			if _, err := os.Stat(argv); err == nil {
				t.Error("bd was invoked with an invalid field")
			}
		})
	}
}

// An empty assignee is a clear, not an omission, so it must pass validation.
func TestUpdateAcceptsClearedAssignee(t *testing.T) {
	c, url, _ := newServer(t, "1", nil)
	resp := post(t, c, url+"/api/issue/update", `{"id":"mg-1","actor":"ana","assignee":""}`)
	if resp.StatusCode != http.StatusOK {
		t.Errorf("status = %d, want 200", resp.StatusCode)
	}
}

// A successful write replies with fresh `bd show` output so the client can
// update its cache without a second round-trip.
func TestUpdateReturnsRefreshedIssue(t *testing.T) {
	c, url, argv := newServer(t, "1", nil)
	t.Setenv(stubOutEnv, `{"id":"mg-1","status":"closed"}`)

	resp := post(t, c, url+"/api/issue/update", `{"id":"mg-1","actor":"ana","status":"closed"}`)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}
	if got := body(t, resp); got != `{"id":"mg-1","status":"closed"}` {
		t.Errorf("body = %q, want the refreshed issue", got)
	}
	// argv records the last invocation, which is the show that follows the write.
	want := []string{"show", "--id", "mg-1", "--json", "--include-dependents", "--include-comments"}
	if got := readArgv(t, argv); !slices.Equal(got, want) {
		t.Errorf("argv = %q, want the follow-up show %q", got, want)
	}
}

// The write already landed, so a failed refresh must not look like a failed
// write: 204 tells the client to refetch, where 502 would invite a retry that
// applies the change twice.
func TestWriteWithFailedRefreshIsNoContent(t *testing.T) {
	c, url, _ := newServer(t, "failshow", nil)
	resp := post(t, c, url+"/api/issue/update", `{"id":"mg-1","actor":"ana","status":"closed"}`)
	if resp.StatusCode != http.StatusNoContent {
		t.Errorf("status = %d, want 204", resp.StatusCode)
	}
}

func TestCommentRejectsEmptyText(t *testing.T) {
	for _, b := range []string{
		`{"id":"mg-1","actor":"ana","text":""}`,
		`{"id":"mg-1","actor":"ana","text":"   \n\t"}`,
	} {
		c, url, argv := newServer(t, "1", nil)
		resp := post(t, c, url+"/api/issue/comment", b)
		if resp.StatusCode != http.StatusBadRequest {
			t.Errorf("status = %d for %s, want 400", resp.StatusCode, b)
		}
		if _, err := os.Stat(argv); err == nil {
			t.Error("bd was invoked for an empty comment")
		}
	}
}

func TestCommentReachesBd(t *testing.T) {
	c, url, argv := newServer(t, "1", nil)
	resp := post(t, c, url+"/api/issue/comment", `{"id":"mg-1","actor":"ana","text":"hi"}`)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}
	if _, err := os.Stat(argv); err != nil {
		t.Fatal("bd was never invoked for a valid comment")
	}
}

func TestDepValidation(t *testing.T) {
	tests := []struct {
		name string
		body string
		want int
	}{
		{
			"valid",
			`{"id":"mg-1","actor":"ana","depends_on":"mg-2","type":"blocks"}`,
			http.StatusOK,
		},
		{
			"self dependency",
			`{"id":"mg-1","actor":"ana","depends_on":"mg-1","type":"blocks"}`,
			http.StatusBadRequest,
		},
		{
			"unknown type",
			`{"id":"mg-1","actor":"ana","depends_on":"mg-2","type":"supersedes"}`,
			http.StatusBadRequest,
		},
		{
			"bad depends_on",
			`{"id":"mg-1","actor":"ana","depends_on":"mg 2","type":"blocks"}`,
			http.StatusBadRequest,
		},
		{
			"missing depends_on",
			`{"id":"mg-1","actor":"ana","type":"blocks"}`,
			http.StatusBadRequest,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			c, url, _ := newServer(t, "1", nil)
			resp := post(t, c, url+"/api/issue/dep", tt.body)
			if resp.StatusCode != tt.want {
				t.Errorf("status = %d, want %d", resp.StatusCode, tt.want)
			}
		})
	}
}

func TestGraphEndpoint(t *testing.T) {
	c, url, _ := newServer(t, "1", nil)
	t.Setenv(stubOutEnv, `"mg-1" -> "mg-2" [style=dashed]`)

	resp := get(t, c, url+"/api/graph")
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}
	var edges []beads.Edge
	if err := json.NewDecoder(resp.Body).Decode(&edges); err != nil {
		t.Fatalf("decode: %v", err)
	}
	want := []beads.Edge{{From: "mg-1", To: "mg-2", Dashed: true}}
	if !slices.Equal(edges, want) {
		t.Errorf("edges = %+v, want %+v", edges, want)
	}
}

func TestGraphEndpointUpstreamFailure(t *testing.T) {
	c, url, _ := newServer(t, "fail", nil)
	resp := get(t, c, url+"/api/graph")
	if resp.StatusCode != http.StatusBadGateway {
		t.Errorf("status = %d, want 502", resp.StatusCode)
	}
}

func TestReadyEndpoint(t *testing.T) {
	c, url, argv := newServer(t, "1", nil)
	t.Setenv(stubOutEnv, `{"issues":[]}`)
	resp := get(t, c, url+"/api/ready")
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}
	if got := readArgv(t, argv); !slices.Equal(got, []string{"ready", "--json"}) {
		t.Errorf("argv = %q, want [ready --json]", got)
	}
}

func TestSPAHandler(t *testing.T) {
	web := fstest.MapFS{
		"index.html":    {Data: []byte("<!doctype html>spa")},
		"assets/app.js": {Data: []byte("console.log(1)")},
	}
	srv := httptest.NewServer(spaHandler(web))
	t.Cleanup(srv.Close)

	tests := []struct {
		name string
		path string
		want string
	}{
		{"root serves index", "/", "<!doctype html>spa"},
		{"real asset is served", "/assets/app.js", "console.log(1)"},
		{"client route falls back to index", "/board", "<!doctype html>spa"},
		{"nested client route falls back", "/issue/mg-1", "<!doctype html>spa"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			resp := get(t, srv.Client(), srv.URL+tt.path)
			if resp.StatusCode != http.StatusOK {
				t.Fatalf("status = %d, want 200", resp.StatusCode)
			}
			if got := body(t, resp); got != tt.want {
				t.Errorf("body = %q, want %q", got, tt.want)
			}
		})
	}
}

// A missing file that looks like an asset must 404 rather than silently serving
// index.html, or a broken bundle reference would surface as a parse error.
func TestSPAHandlerMissingAssetIs404(t *testing.T) {
	web := fstest.MapFS{"index.html": {Data: []byte("spa")}}
	srv := httptest.NewServer(spaHandler(web))
	t.Cleanup(srv.Close)

	resp := get(t, srv.Client(), srv.URL+"/assets/missing.js")
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("status = %d, want 404", resp.StatusCode)
	}
}

func TestEnvOr(t *testing.T) {
	t.Setenv("MAGGIE_TEST_ENV", "")
	if got := envOr("MAGGIE_TEST_ENV", "fallback"); got != "fallback" {
		t.Errorf("envOr with an empty value = %q, want fallback", got)
	}
	t.Setenv("MAGGIE_TEST_ENV", "set")
	if got := envOr("MAGGIE_TEST_ENV", "fallback"); got != "set" {
		t.Errorf("envOr = %q, want set", got)
	}
}

func TestUpdateBodyFieldsPassesThroughPointers(t *testing.T) {
	empty := ""
	b := updateBody{
		ID:          "mg-1",
		Actor:       "ana",
		Description: &empty,
		Notes:       &empty,
		Acceptance:  &empty,
	}
	f, err := b.fields()
	if err != nil {
		t.Fatalf("fields: %v", err)
	}
	// nil would mean "leave unchanged"; these were explicitly cleared.
	if f.Description == nil || f.Notes == nil || f.Acceptance == nil {
		t.Error("cleared text fields were dropped instead of forwarded")
	}
}
