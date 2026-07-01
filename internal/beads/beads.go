// Package beads wraps the `bd` CLI as the data source for Maggie.
//
// Reads shell out to `bd ... --json`; the raw JSON is forwarded to clients.
// Writes (later phases) also go through `bd` so bead invariants stay intact.
package beads

import (
	"context"
	"fmt"
	"os/exec"
	"regexp"
	"strings"
	"time"
)

// Client runs the bd CLI against a beads working directory.
type Client struct {
	bin     string        // bd binary, e.g. "bd"
	dir     string        // working dir containing .beads/
	timeout time.Duration // per-command timeout
}

// New returns a Client. bin defaults to "bd" when empty.
func New(bin, dir string, timeout time.Duration) *Client {
	if bin == "" {
		bin = "bd"
	}
	if timeout == 0 {
		timeout = 15 * time.Second
	}
	return &Client{bin: bin, dir: dir, timeout: timeout}
}

// run executes bd with the given argv (no shell) and returns stdout.
func (c *Client) run(ctx context.Context, args ...string) ([]byte, error) {
	ctx, cancel := context.WithTimeout(ctx, c.timeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, c.bin, args...)
	cmd.Dir = c.dir
	out, err := cmd.Output()
	if err != nil {
		if ee, ok := err.(*exec.ExitError); ok {
			return nil, fmt.Errorf("bd %v: %w: %s", args, err, ee.Stderr)
		}
		return nil, fmt.Errorf("bd %v: %w", args, err)
	}
	return out, nil
}

// ListOpts holds the allowlisted filters for List. Empty fields are omitted;
// callers must validate values before constructing this struct.
type ListOpts struct {
	Status   string // open|in_progress|blocked|deferred|closed
	Priority string // 0-4
	Limit    int    // 0 = bd default
	All      bool   // include closed
}

// List returns issues as raw bd JSON.
func (c *Client) List(ctx context.Context, o ListOpts) ([]byte, error) {
	args := []string{"list", "--json"}
	if o.All {
		args = append(args, "--all")
	}
	if o.Status != "" {
		args = append(args, "--status", o.Status)
	}
	if o.Priority != "" {
		args = append(args, "--priority", o.Priority)
	}
	limit := o.Limit
	// bd caps list output at 50 unless --limit is passed, so --all alone still
	// truncates. Force a high limit when none is supplied to return everything.
	if limit == 0 && o.All {
		limit = 100000
	}
	if limit > 0 {
		args = append(args, "--limit", fmt.Sprintf("%d", limit))
	}
	return c.run(ctx, args...)
}

// Ready returns ready-to-work issues as raw bd JSON.
func (c *Client) Ready(ctx context.Context) ([]byte, error) {
	return c.run(ctx, "ready", "--json")
}

// Show returns details for a single issue as raw bd JSON. bd defaults to
// count-only for dependents and comments; --include-dependents streams the
// full dependents list (so epic children appear) and --include-comments
// streams comment bodies.
func (c *Client) Show(ctx context.Context, id string) ([]byte, error) {
	return c.run(ctx, "show", "--id", id, "--json", "--include-dependents", "--include-comments")
}

// UpdateFields holds the mutable issue fields for Update. Empty scalar fields
// are omitted from the bd call; a nil pointer means "leave unchanged" while a
// non-nil pointer (including "") is applied, so assignee can be cleared.
type UpdateFields struct {
	Status       string   // open|in_progress|blocked|deferred|closed
	Priority     string   // 0-4
	Assignee     *string  // nil = unchanged, "" = clear
	Description  *string  // nil = unchanged
	Notes        *string  // nil = unchanged
	Acceptance   *string  // nil = unchanged
	AddLabels    []string // labels to add
	RemoveLabels []string // labels to remove
}

// empty reports whether f carries no change, so callers can reject no-op writes.
func (f UpdateFields) empty() bool {
	return f.Status == "" && f.Priority == "" && f.Assignee == nil && f.Description == nil &&
		f.Notes == nil && f.Acceptance == nil && len(f.AddLabels) == 0 && len(f.RemoveLabels) == 0
}

// write runs a bd mutation with the shared audit actor and eager dolt commit so
// the change lands in history immediately (the server defaults auto-commit off).
func (c *Client) write(ctx context.Context, actor string, args ...string) error {
	args = append(args, "--actor", actor, "--dolt-auto-commit", "on")
	_, err := c.run(ctx, args...)
	return err
}

// Update applies the provided fields to one issue via a single `bd update`.
func (c *Client) Update(ctx context.Context, id string, f UpdateFields, actor string) error {
	if f.empty() {
		return fmt.Errorf("update: no fields to change")
	}
	args := []string{"update", id}
	if f.Status != "" {
		args = append(args, "-s", f.Status)
	}
	if f.Priority != "" {
		args = append(args, "-p", f.Priority)
	}
	if f.Assignee != nil {
		args = append(args, "-a", *f.Assignee)
	}
	if f.Description != nil {
		args = append(args, "-d", *f.Description)
	}
	if f.Notes != nil {
		args = append(args, "--notes", *f.Notes)
	}
	if f.Acceptance != nil {
		args = append(args, "--acceptance", *f.Acceptance)
	}
	for _, l := range f.AddLabels {
		args = append(args, "--add-label", l)
	}
	for _, l := range f.RemoveLabels {
		args = append(args, "--remove-label", l)
	}
	return c.write(ctx, actor, args...)
}

// AddComment appends a comment authored by actor to an issue.
func (c *Client) AddComment(ctx context.Context, id, text, actor string) error {
	return c.write(ctx, actor, "comments", "add", id, text)
}

// AddDep links issueID to dependsOn. depType selects the bd verb: "blocks"
// (dependsOn blocks issueID), "relates-to" (symmetric), or "parent" (reparent).
func (c *Client) AddDep(ctx context.Context, issueID, dependsOn, depType, actor string) error {
	switch depType {
	case "blocks":
		return c.write(ctx, actor, "dep", "add", issueID, dependsOn)
	case "relates-to":
		return c.write(ctx, actor, "dep", "relate", issueID, dependsOn)
	case "parent":
		return c.write(ctx, actor, "update", issueID, "--parent", dependsOn)
	default:
		return fmt.Errorf("addDep: bad type %q", depType)
	}
}

// Edge is a single directed dependency between two issues. Dashed edges are
// parent/child (subtask) links; solid edges are hard dependencies.
type Edge struct {
	From   string `json:"from"`
	To     string `json:"to"`
	Dashed bool   `json:"dashed"`
}

// dot "a" -> "b" [attrs] edge line; attrs captured to detect dashed style.
var dotEdgeRe = regexp.MustCompile(`"([^"]+)"\s*->\s*"([^"]+)"\s*\[([^\]]*)\]`)

// GraphEdges returns the dependency edges across all open issues. It parses
// `bd graph --all --dot`, whose HTML form emits one document per connected
// component and is unusable in a single view; the DOT form carries every edge.
func (c *Client) GraphEdges(ctx context.Context) ([]Edge, error) {
	out, err := c.run(ctx, "graph", "--all", "--dot")
	if err != nil {
		return nil, err
	}
	matches := dotEdgeRe.FindAllStringSubmatch(string(out), -1)
	edges := make([]Edge, 0, len(matches))
	for _, m := range matches {
		edges = append(edges, Edge{
			From:   m[1],
			To:     m[2],
			Dashed: strings.Contains(m[3], "dashed"),
		})
	}
	return edges, nil
}
