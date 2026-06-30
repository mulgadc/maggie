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
	if o.Limit > 0 {
		args = append(args, "--limit", fmt.Sprintf("%d", o.Limit))
	}
	return c.run(ctx, args...)
}

// Ready returns ready-to-work issues as raw bd JSON.
func (c *Client) Ready(ctx context.Context) ([]byte, error) {
	return c.run(ctx, "ready", "--json")
}

// Show returns details for a single issue as raw bd JSON.
func (c *Client) Show(ctx context.Context, id string) ([]byte, error) {
	return c.run(ctx, "show", "--id", id, "--json")
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
