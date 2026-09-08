// Package roster resolves the list of developer identities used as bd --actor
// and assignee options. It reads members from a GitHub organisation and caches
// them, falling back to a static list so the picker keeps working offline or
// without a token.
package roster

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"slices"
	"sync"
	"time"
)

// Fetcher returns org member logins with an in-memory TTL cache.
type Fetcher struct {
	org      string
	token    string
	ttl      time.Duration
	client   *http.Client
	fallback []string

	mu     sync.Mutex
	cached []string
	expiry time.Time
}

// New builds a Fetcher. org empty disables fetching (fallback only). token is an
// optional PAT (read:org) needed to see private members; public members list
// without it.
func New(org, token string, fallback []string) *Fetcher {
	return &Fetcher{
		org:      org,
		token:    token,
		ttl:      time.Hour,
		client:   &http.Client{Timeout: 8 * time.Second},
		fallback: fallback,
	}
}

// Members returns the current roster, sorted. It serves the cache while fresh,
// refetches when stale, and on any failure returns the last good cache or the
// static fallback so callers always get a usable list.
func (f *Fetcher) Members(ctx context.Context) []string {
	f.mu.Lock()
	defer f.mu.Unlock()
	if time.Now().Before(f.expiry) && len(f.cached) > 0 {
		return f.cached
	}
	logins, err := f.fetch(ctx)
	if err != nil || len(logins) == 0 {
		if len(f.cached) > 0 {
			return f.cached
		}
		return f.fallback
	}
	slices.Sort(logins)
	f.cached = logins
	f.expiry = time.Now().Add(f.ttl)
	return logins
}

// fetch pages through the org members API (100 per page, capped) and collects
// logins.
func (f *Fetcher) fetch(ctx context.Context) ([]string, error) {
	if f.org == "" {
		return nil, fmt.Errorf("no org configured")
	}
	var out []string
	for page := 1; page <= 10; page++ {
		url := fmt.Sprintf("https://api.github.com/orgs/%s/members?per_page=100&page=%d", f.org, page)
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
		if err != nil {
			return nil, err
		}
		req.Header.Set("Accept", "application/vnd.github+json")
		if f.token != "" {
			req.Header.Set("Authorization", "Bearer "+f.token)
		}
		resp, err := f.client.Do(req)
		if err != nil {
			return nil, err
		}
		if resp.StatusCode != http.StatusOK {
			resp.Body.Close()
			return nil, fmt.Errorf("github %s: %s", f.org, resp.Status)
		}
		var members []struct {
			Login string `json:"login"`
		}
		err = json.NewDecoder(resp.Body).Decode(&members)
		resp.Body.Close()
		if err != nil {
			return nil, err
		}
		for _, m := range members {
			out = append(out, m.Login)
		}
		if len(members) < 100 {
			break
		}
	}
	return out, nil
}
