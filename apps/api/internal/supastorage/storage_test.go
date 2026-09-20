package supastorage

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestClientNotConfigured(t *testing.T) {
	c := New("", "")
	if _, err := c.Upload(context.Background(), "b", "p", "image/webp", strings.NewReader("x")); err == nil {
		t.Error("Upload sans config doit échouer")
	}
	if err := c.Delete(context.Background(), "b", "p"); err == nil {
		t.Error("Delete sans config doit échouer")
	}
}

func TestUploadSuccess(t *testing.T) {
	var gotMethod, gotPath, gotAuth, gotCT string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotMethod, gotPath = r.Method, r.URL.Path
		gotAuth, gotCT = r.Header.Get("Authorization"), r.Header.Get("Content-Type")
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	c := New(srv.URL, "service-key")
	url, err := c.Upload(context.Background(), "articles-media", "avatars/u/x.webp", "image/webp", strings.NewReader("data"))
	if err != nil {
		t.Fatalf("Upload: %v", err)
	}
	if gotMethod != http.MethodPost || gotPath != "/storage/v1/object/articles-media/avatars/u/x.webp" {
		t.Errorf("requête = %s %s", gotMethod, gotPath)
	}
	if gotAuth != "Bearer service-key" || gotCT != "image/webp" {
		t.Errorf("headers auth=%q ct=%q", gotAuth, gotCT)
	}
	want := srv.URL + "/storage/v1/object/public/articles-media/avatars/u/x.webp"
	if url != want {
		t.Errorf("url = %q, attendu %q", url, want)
	}
}

func TestUploadError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		_, _ = io.WriteString(w, "bad path")
	}))
	defer srv.Close()

	c := New(srv.URL, "k")
	if _, err := c.Upload(context.Background(), "b", "p", "image/webp", strings.NewReader("x")); err == nil {
		t.Error("statut 400 doit échouer")
	}
}

func TestDeleteSuccess(t *testing.T) {
	var gotMethod, gotPath, gotBody string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotMethod, gotPath = r.Method, r.URL.Path
		raw, _ := io.ReadAll(r.Body)
		gotBody = string(raw)
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	c := New(srv.URL, "service-key")
	if err := c.Delete(context.Background(), "articles-media", "avatars/u/x.webp"); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	if gotMethod != http.MethodDelete || gotPath != "/storage/v1/object/articles-media" {
		t.Errorf("requête = %s %s", gotMethod, gotPath)
	}
	if !strings.Contains(gotBody, `"prefixes":["avatars/u/x.webp"]`) {
		t.Errorf("body = %q", gotBody)
	}
}

func TestDeleteIdempotentNotFound(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	}))
	defer srv.Close()

	c := New(srv.URL, "k")
	if err := c.Delete(context.Background(), "b", "missing.webp"); err != nil {
		t.Errorf("404 doit être idempotent (nil), obtenu %v", err)
	}
}

func TestDeleteError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer srv.Close()

	c := New(srv.URL, "k")
	if err := c.Delete(context.Background(), "b", "p"); err == nil {
		t.Error("statut 500 doit échouer")
	}
}

func TestPublicURL(t *testing.T) {
	c := New("https://xxx.supabase.co", "k")
	got := c.PublicURL("articles-media", "a/b.webp", "https://cdn.qoe.fi")
	want := "https://cdn.qoe.fi/storage/v1/object/public/articles-media/a/b.webp"
	if got != want {
		t.Errorf("PublicURL CDN = %q, attendu %q", got, want)
	}
	raw := c.PublicURL("articles-media", "a/b.webp", "")
	if raw != "https://xxx.supabase.co/storage/v1/object/public/articles-media/a/b.webp" {
		t.Errorf("PublicURL sans CDN = %q", raw)
	}
}
