package umami

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
)

// newTestServer monte un serveur Umami factice qui enregistre les appels
// reçus et répond selon un handler fourni.
func newTestServer(t *testing.T, handler http.HandlerFunc) (*httptest.Server, *httpRequests) {
	t.Helper()
	reqs := &httpRequests{}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		reqs.mu.Lock()
		reqs.calls = append(reqs.calls, httpRequest{method: r.Method, path: r.URL.Path, auth: r.Header.Get("Authorization")})
		reqs.mu.Unlock()
		handler(w, r)
	}))
	t.Cleanup(srv.Close)
	return srv, reqs
}

type httpRequest struct {
	method string
	path   string
	auth   string
}

// httpRequests enregistre les appels reçus par le serveur factice.
type httpRequests struct {
	mu    sync.Mutex
	calls []httpRequest
}

func (c *httpRequests) paths() []string {
	out := make([]string, 0, len(c.calls))
	for _, call := range c.calls {
		out = append(out, call.method+" "+call.path)
	}
	return out
}

func TestCreateWebsiteWithAPIKey(t *testing.T) {
	srv, calls := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/websites" {
			t.Errorf("unexpected call: %s %s", r.Method, r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		_ = json.NewEncoder(w).Encode(map[string]string{"id": "web-123"})
	})

	client := NewClient(srv.URL, "cloud-key", "", "")
	got, err := client.CreateWebsite(context.Background(), "Mon Média", "monmedia.qoe.fi")
	if err != nil {
		t.Fatalf("CreateWebsite: %v", err)
	}
	if got != "web-123" {
		t.Fatalf("expected id web-123, got %q", got)
	}
	if len(calls.calls) != 1 || calls.calls[0].auth != "Bearer cloud-key" {
		t.Fatalf("expected single authed call, got %v", calls.paths())
	}
}

func TestLoginCachedAndStats(t *testing.T) {
	var loginCount int
	srv, calls := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/auth/login":
			loginCount++
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]string{"token": "tok-abc"})
		case "/websites/w1/stats":
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(Stats{Pageviews: 42, Visitors: 7, Visits: 9})
		default:
			http.NotFound(w, r)
		}
	})

	client := NewClient(srv.URL, "", "admin", "secret")
	ctx := context.Background()

	s1, err := client.WebsiteStats(ctx, "w1", 1000, 2000)
	if err != nil {
		t.Fatalf("first stats: %v", err)
	}
	if s1.Pageviews != 42 {
		t.Fatalf("expected 42 pageviews, got %d", s1.Pageviews)
	}
	s2, err := client.WebsiteStats(ctx, "w1", 1000, 2000)
	if err != nil {
		t.Fatalf("second stats: %v", err)
	}
	if s2.Pageviews != 42 {
		t.Fatalf("expected 42 pageviews (2nd), got %d", s2.Pageviews)
	}

	if loginCount != 1 {
		t.Fatalf("expected exactly 1 login (token cached), got %d", loginCount)
	}
	if len(calls.calls) != 3 {
		t.Fatalf("expected 3 calls total, got %v", calls.paths())
	}
	// Les appels stats doivent porter le token Bearer issu du login.
	for _, call := range calls.calls {
		if call.path == "/websites/w1/stats" && call.auth != "Bearer tok-abc" {
			t.Fatalf("stats call not authed with cached token: %v", call.auth)
		}
	}
}

func TestTopPages(t *testing.T) {
	srv, _ := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/websites/w1/metrics" {
			http.NotFound(w, r)
			return
		}
		if r.URL.Query().Get("type") != "url" {
			t.Errorf("expected type=url, got %q", r.URL.Query().Get("type"))
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode([]PageMetric{{X: "/articles/foo", Y: 12}})
	})

	client := NewClient(srv.URL, "key", "", "")
	pages, err := client.TopPages(context.Background(), "w1", 1, 2, 10)
	if err != nil {
		t.Fatalf("TopPages: %v", err)
	}
	if len(pages) != 1 || pages[0].X != "/articles/foo" || pages[0].Y != 12 {
		t.Fatalf("unexpected pages: %+v", pages)
	}
}

func TestCreateWebsiteWithoutAuth(t *testing.T) {
	client := NewClient("http://example.invalid", "", "", "")
	_, err := client.CreateWebsite(context.Background(), "X", "x.qoe.fi")
	if err == nil {
		t.Fatal("expected error without auth configured")
	}
}
