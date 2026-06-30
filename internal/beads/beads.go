// Package beads wraps the `bd` CLI as the data source for Waratah.
//
// Reads shell out to `bd ... --json`; the raw JSON is forwarded to clients.
// Writes (later phases) also go through `bd` so bead invariants stay intact.
package beads

import (
	"context"
	"fmt"
	"os/exec"
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

// GraphHTML returns the self-contained interactive dependency graph for all
// open issues as standalone HTML.
func (c *Client) GraphHTML(ctx context.Context) ([]byte, error) {
	return c.run(ctx, "graph", "--all", "--html")
}
