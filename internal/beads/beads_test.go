package beads

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"
)

// The stub bd is this test binary re-execed. TestMain checks stubEnv before
// running any test, so Client.run gets a process that records argv and replays
// canned stdout instead of the real CLI.
const (
	stubEnv     = "MAGGIE_BD_STUB"        // 1 = succeed, fail = exit 3, sleep = hang
	stubArgvEnv = "MAGGIE_BD_STUB_ARGV"   // file to record argv into
	stubOutEnv  = "MAGGIE_BD_STUB_STDOUT" // stdout to replay
	stubStderr  = "bd: no such issue"
)

func TestMain(m *testing.M) {
	if os.Getenv(stubEnv) == "" {
		os.Exit(m.Run())
	}
	os.Exit(stubMain())
}

func stubMain() int {
	if f := os.Getenv(stubArgvEnv); f != "" {
		b, err := json.Marshal(os.Args[1:])
		if err == nil {
			err = os.WriteFile(f, b, 0o600)
		}
		if err != nil {
			fmt.Fprintln(os.Stderr, "stub:", err)
			return 1
		}
	}
	switch os.Getenv(stubEnv) {
	case "fail":
		fmt.Fprint(os.Stderr, stubStderr)
		return 3
	case "sleep":
		time.Sleep(30 * time.Second)
	}
	fmt.Print(os.Getenv(stubOutEnv))
	return 0
}

// newStub returns a Client wired to the stub bd, plus the argv recording path.
func newStub(t *testing.T, mode string) (*Client, string) {
	t.Helper()
	self, err := os.Executable()
	if err != nil {
		t.Fatalf("os.Executable: %v", err)
	}
	argv := filepath.Join(t.TempDir(), "argv.json")
	t.Setenv(stubEnv, mode)
	t.Setenv(stubArgvEnv, argv)
	return New(self, t.TempDir(), 5*time.Second), argv
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

func TestNewDefaults(t *testing.T) {
	c := New("", "/tmp", 0)
	if c.bin != "bd" {
		t.Errorf("bin = %q, want bd", c.bin)
	}
	if c.timeout != 15*time.Second {
		t.Errorf("timeout = %v, want 15s", c.timeout)
	}

	c = New("/usr/bin/bd", "/tmp", time.Second)
	if c.bin != "/usr/bin/bd" || c.timeout != time.Second {
		t.Errorf("explicit values overwritten: %q %v", c.bin, c.timeout)
	}
}

func TestListArgs(t *testing.T) {
	tests := []struct {
		name string
		opts ListOpts
		want []string
	}{
		{"no filters", ListOpts{}, []string{"list", "--json"}},
		{
			"all forces a high limit so bd does not truncate at 50",
			ListOpts{All: true},
			[]string{"list", "--json", "--all", "--limit", "100000"},
		},
		{
			"explicit limit wins over the all default",
			ListOpts{All: true, Limit: 25},
			[]string{"list", "--json", "--all", "--limit", "25"},
		},
		{"status", ListOpts{Status: "open"}, []string{"list", "--json", "--status", "open"}},
		{"priority", ListOpts{Priority: "0"}, []string{"list", "--json", "--priority", "0"}},
		{
			"every filter",
			ListOpts{Status: "blocked", Priority: "2", Limit: 10},
			[]string{"list", "--json", "--status", "blocked", "--priority", "2", "--limit", "10"},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			c, argv := newStub(t, "1")
			if _, err := c.List(t.Context(), tt.opts); err != nil {
				t.Fatalf("List: %v", err)
			}
			if got := readArgv(t, argv); !slices.Equal(got, tt.want) {
				t.Errorf("argv = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestReadyArgs(t *testing.T) {
	c, argv := newStub(t, "1")
	if _, err := c.Ready(t.Context()); err != nil {
		t.Fatalf("Ready: %v", err)
	}
	want := []string{"ready", "--json"}
	if got := readArgv(t, argv); !slices.Equal(got, want) {
		t.Errorf("argv = %q, want %q", got, want)
	}
}

// Show must ask for dependents and comments explicitly; bd returns counts only
// by default, which would leave epic children and comment bodies out of the UI.
func TestShowArgs(t *testing.T) {
	c, argv := newStub(t, "1")
	if _, err := c.Show(t.Context(), "mg-1"); err != nil {
		t.Fatalf("Show: %v", err)
	}
	want := []string{"show", "--id", "mg-1", "--json", "--include-dependents", "--include-comments"}
	if got := readArgv(t, argv); !slices.Equal(got, want) {
		t.Errorf("argv = %q, want %q", got, want)
	}
}

func TestReadForwardsStdoutVerbatim(t *testing.T) {
	c, _ := newStub(t, "1")
	t.Setenv(stubOutEnv, `{"issues":[{"id":"mg-1"}]}`)
	out, err := c.List(t.Context(), ListOpts{})
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if string(out) != `{"issues":[{"id":"mg-1"}]}` {
		t.Errorf("out = %q, want the raw bd JSON unchanged", out)
	}
}

func ptr(s string) *string { return &s }

func TestUpdateArgs(t *testing.T) {
	tests := []struct {
		name   string
		fields UpdateFields
		want   []string
	}{
		{"status", UpdateFields{Status: "closed"}, []string{"update", "mg-1", "-s", "closed"}},
		{"priority", UpdateFields{Priority: "1"}, []string{"update", "mg-1", "-p", "1"}},
		{"assignee", UpdateFields{Assignee: ptr("ana")}, []string{"update", "mg-1", "-a", "ana"}},
		{
			"empty assignee clears rather than being dropped",
			UpdateFields{Assignee: ptr("")},
			[]string{"update", "mg-1", "-a", ""},
		},
		{
			"empty description is still sent",
			UpdateFields{Description: ptr("")},
			[]string{"update", "mg-1", "-d", ""},
		},
		{"notes", UpdateFields{Notes: ptr("n")}, []string{"update", "mg-1", "--notes", "n"}},
		{
			"acceptance",
			UpdateFields{Acceptance: ptr("a")},
			[]string{"update", "mg-1", "--acceptance", "a"},
		},
		{
			"labels",
			UpdateFields{AddLabels: []string{"ui", "bug"}, RemoveLabels: []string{"old"}},
			[]string{"update", "mg-1", "--add-label", "ui", "--add-label", "bug", "--remove-label", "old"},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			c, argv := newStub(t, "1")
			if err := c.Update(t.Context(), "mg-1", tt.fields, "ana"); err != nil {
				t.Fatalf("Update: %v", err)
			}
			want := append(slices.Clone(tt.want), "--actor", "ana", "--dolt-auto-commit", "on")
			if got := readArgv(t, argv); !slices.Equal(got, want) {
				t.Errorf("argv = %q, want %q", got, want)
			}
		})
	}
}

// A no-op update must not reach bd at all, or it would write an audit entry and
// a dolt commit for a change nobody made.
func TestUpdateRejectsEmptyFields(t *testing.T) {
	c, argv := newStub(t, "1")
	if err := c.Update(t.Context(), "mg-1", UpdateFields{}, "ana"); err == nil {
		t.Fatal("Update with no fields succeeded, want error")
	}
	if _, err := os.Stat(argv); err == nil {
		t.Error("bd was invoked for an empty update")
	}
}

func TestUpdateFieldsEmpty(t *testing.T) {
	tests := []struct {
		name   string
		fields UpdateFields
		want   bool
	}{
		{"zero value", UpdateFields{}, true},
		{"status", UpdateFields{Status: "open"}, false},
		{"priority", UpdateFields{Priority: "0"}, false},
		{"cleared assignee counts as a change", UpdateFields{Assignee: ptr("")}, false},
		{"cleared description counts as a change", UpdateFields{Description: ptr("")}, false},
		{"cleared notes counts as a change", UpdateFields{Notes: ptr("")}, false},
		{"cleared acceptance counts as a change", UpdateFields{Acceptance: ptr("")}, false},
		{"empty label slices are no change", UpdateFields{AddLabels: []string{}}, true},
		{"add labels", UpdateFields{AddLabels: []string{"ui"}}, false},
		{"remove labels", UpdateFields{RemoveLabels: []string{"ui"}}, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.fields.empty(); got != tt.want {
				t.Errorf("empty() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestAddCommentArgs(t *testing.T) {
	c, argv := newStub(t, "1")
	if err := c.AddComment(t.Context(), "mg-1", "looks good", "ana"); err != nil {
		t.Fatalf("AddComment: %v", err)
	}
	want := []string{
		"comments", "add", "mg-1", "looks good",
		"--actor", "ana", "--dolt-auto-commit", "on",
	}
	if got := readArgv(t, argv); !slices.Equal(got, want) {
		t.Errorf("argv = %q, want %q", got, want)
	}
}

func TestAddDepArgs(t *testing.T) {
	tests := []struct {
		depType string
		want    []string
	}{
		{"blocks", []string{"dep", "add", "mg-1", "mg-2"}},
		{"relates-to", []string{"dep", "relate", "mg-1", "mg-2"}},
		{"parent", []string{"update", "mg-1", "--parent", "mg-2"}},
	}
	for _, tt := range tests {
		t.Run(tt.depType, func(t *testing.T) {
			c, argv := newStub(t, "1")
			if err := c.AddDep(t.Context(), "mg-1", "mg-2", tt.depType, "ana"); err != nil {
				t.Fatalf("AddDep: %v", err)
			}
			want := append(slices.Clone(tt.want), "--actor", "ana", "--dolt-auto-commit", "on")
			if got := readArgv(t, argv); !slices.Equal(got, want) {
				t.Errorf("argv = %q, want %q", got, want)
			}
		})
	}
}

func TestAddDepRejectsUnknownType(t *testing.T) {
	c, argv := newStub(t, "1")
	if err := c.AddDep(t.Context(), "mg-1", "mg-2", "supersedes", "ana"); err == nil {
		t.Fatal("AddDep with an unknown type succeeded, want error")
	}
	if _, err := os.Stat(argv); err == nil {
		t.Error("bd was invoked for an unknown dep type")
	}
}

func TestGraphEdgesArgs(t *testing.T) {
	c, argv := newStub(t, "1")
	if _, err := c.GraphEdges(t.Context()); err != nil {
		t.Fatalf("GraphEdges: %v", err)
	}
	want := []string{"graph", "--all", "--dot"}
	if got := readArgv(t, argv); !slices.Equal(got, want) {
		t.Errorf("argv = %q, want %q", got, want)
	}
}

func TestGraphEdgesParsesDot(t *testing.T) {
	tests := []struct {
		name string
		dot  string
		want []Edge
	}{
		{"empty graph", "digraph G {\n}\n", nil},
		{
			"solid and dashed",
			`digraph G {
  "mg-1" -> "mg-2" [style=solid];
  "mg-2" -> "mg-3" [style=dashed,color=grey];
}`,
			[]Edge{
				{From: "mg-1", To: "mg-2", Dashed: false},
				{From: "mg-2", To: "mg-3", Dashed: true},
			},
		},
		{
			"loose spacing around the arrow",
			`"a"->"b"[style=dashed]`,
			[]Edge{{From: "a", To: "b", Dashed: true}},
		},
		{
			"node declarations are not edges",
			`digraph G {
  "mg-1" [label="thing",style=dashed];
  "mg-1" -> "mg-2" [];
}`,
			[]Edge{{From: "mg-1", To: "mg-2", Dashed: false}},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			c, _ := newStub(t, "1")
			t.Setenv(stubOutEnv, tt.dot)
			got, err := c.GraphEdges(t.Context())
			if err != nil {
				t.Fatalf("GraphEdges: %v", err)
			}
			if got == nil {
				t.Fatal("edges = nil, want a non-nil slice so it encodes as []")
			}
			if !slices.Equal(got, tt.want) {
				t.Errorf("edges = %+v, want %+v", got, tt.want)
			}
		})
	}
}

// A failing bd must surface its stderr, which carries the actual reason.
func TestRunWrapsExitErrorWithStderr(t *testing.T) {
	c, _ := newStub(t, "fail")
	_, err := c.Show(t.Context(), "mg-404")
	if err == nil {
		t.Fatal("Show against a failing bd succeeded, want error")
	}
	if !strings.Contains(err.Error(), stubStderr) {
		t.Errorf("err = %v, want it to include bd stderr %q", err, stubStderr)
	}
	if !strings.Contains(err.Error(), "mg-404") {
		t.Errorf("err = %v, want it to include the argv", err)
	}
}

func TestRunHonoursTimeout(t *testing.T) {
	self, err := os.Executable()
	if err != nil {
		t.Fatalf("os.Executable: %v", err)
	}
	t.Setenv(stubEnv, "sleep")
	c := New(self, t.TempDir(), 50*time.Millisecond)

	start := time.Now()
	if _, err := c.Ready(t.Context()); err == nil {
		t.Fatal("Ready against a hanging bd succeeded, want a timeout error")
	}
	if elapsed := time.Since(start); elapsed > 10*time.Second {
		t.Errorf("took %v, want the 50ms timeout to fire", elapsed)
	}
}

func TestRunHonoursCallerCancellation(t *testing.T) {
	self, err := os.Executable()
	if err != nil {
		t.Fatalf("os.Executable: %v", err)
	}
	t.Setenv(stubEnv, "sleep")
	c := New(self, t.TempDir(), time.Minute)

	ctx, cancel := context.WithCancel(t.Context())
	go func() {
		time.Sleep(50 * time.Millisecond)
		cancel()
	}()
	if _, err := c.Ready(ctx); err == nil {
		t.Fatal("Ready survived a cancelled context, want error")
	}
}
