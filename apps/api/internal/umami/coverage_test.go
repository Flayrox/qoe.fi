package umami

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestWebsiteStats_NilClientOrEmptyID(t *testing.T) {
	ctx := context.Background()

	var nilClient *Client
	if s, err := nilClient.WebsiteStats(ctx, "w1", 1, 2); err != nil || s.Pageviews != 0 {
		t.Fatalf("nil client: s=%+v err=%v", s, err)
	}

	c := NewClient("http://example.invalid", "k", "", "")
	if s, err := c.WebsiteStats(ctx, "", 1, 2); err != nil || s.Pageviews != 0 {
		t.Fatalf("empty id: s=%+v err=%v", s, err)
	}
}

func TestTopPages_NilClientOrEmptyID(t *testing.T) {
	ctx := context.Background()

	var nilClient *Client
	if p, err := nilClient.TopPages(ctx, "w1", 1, 2, 10); err != nil || len(p) != 0 {
		t.Fatalf("nil client: p=%+v err=%v", p, err)
	}

	c := NewClient("http://example.invalid", "k", "", "")
	if p, err := c.TopPages(ctx, "", 1, 2, 10); err != nil || len(p) != 0 {
		t.Fatalf("empty id: p=%+v err=%v", p, err)
	}
}

func TestWebsiteStats_Non200(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer srv.Close()

	c := NewClient(srv.URL, "k", "", "")
	if _, err := c.WebsiteStats(context.Background(), "w1", 1, 2); err == nil {
		t.Fatal("stats 500 attendu erreur")
	}
}

func TestWebsiteStats_InvalidJSON(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte("{not json"))
	}))
	defer srv.Close()

	c := NewClient(srv.URL, "k", "", "")
	if _, err := c.WebsiteStats(context.Background(), "w1", 1, 2); err == nil {
		t.Fatal("JSON invalide attendu erreur")
	}
}

func TestCreateWebsite_Non2xx(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusConflict)
	}))
	defer srv.Close()

	c := NewClient(srv.URL, "k", "", "")
	if _, err := c.CreateWebsite(context.Background(), "X", "x.qoe.fi"); err == nil ||
		!strings.Contains(err.Error(), "status 409") {
		t.Fatalf("create 409 attendu erreur explicite, got %v", err)
	}
}

func TestCreateWebsite_EmptyID(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(`{"id":""}`))
	}))
	defer srv.Close()

	c := NewClient(srv.URL, "k", "", "")
	if _, err := c.CreateWebsite(context.Background(), "X", "x.qoe.fi"); err == nil {
		t.Fatal("id vide attendu erreur")
	}
}

func TestCreateWebsite_InvalidJSON(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte("oops"))
	}))
	defer srv.Close()

	c := NewClient(srv.URL, "k", "", "")
	if _, err := c.CreateWebsite(context.Background(), "X", "x.qoe.fi"); err == nil {
		t.Fatal("JSON invalide attendu erreur")
	}
}

func TestBearerToken_LoginNon200(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/auth/login" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		http.NotFound(w, r)
	}))
	defer srv.Close()

	c := NewClient(srv.URL, "", "admin", "bad")
	if _, err := c.CreateWebsite(context.Background(), "X", "x.qoe.fi"); err == nil ||
		!strings.Contains(err.Error(), "login status 401") {
		t.Fatalf("login 401 attendu erreur explicite, got %v", err)
	}
}

func TestBearerToken_LoginInvalidJSON(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/auth/login" {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte("{bad"))
			return
		}
		http.NotFound(w, r)
	}))
	defer srv.Close()

	c := NewClient(srv.URL, "", "admin", "secret")
	if _, err := c.CreateWebsite(context.Background(), "X", "x.qoe.fi"); err == nil {
		t.Fatal("login JSON invalide attendu erreur")
	}
}

func TestBearerToken_LoginNetworkError(t *testing.T) {
	// Serveur qui refuse la connexion → Post error.
	c := NewClient("http://127.0.0.1:1", "", "admin", "secret")
	if _, err := c.CreateWebsite(context.Background(), "X", "x.qoe.fi"); err == nil {
		t.Fatal("login réseau down attendu erreur")
	}
}

// TestCreateWebsite_NoAuthConfigured : ni apiKey ni user/pass → erreur.
func TestCreateWebsite_NoAuthConfigured(t *testing.T) {
	c := NewClient("http://example.invalid", "", "", "")
	if _, err := c.CreateWebsite(context.Background(), "X", "x.qoe.fi"); err == nil ||
		!strings.Contains(err.Error(), "aucune authentification") {
		t.Fatalf("sans auth attendu erreur explicite, got %v", err)
	}
}
