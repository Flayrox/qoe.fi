package supastorage

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestUpload_Success(t *testing.T) {
	var gotPath, gotCT, gotAuth string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		gotCT = r.Header.Get("Content-Type")
		gotAuth = r.Header.Get("Authorization")
		body, _ := io.ReadAll(r.Body)
		if string(body) != "data" {
			t.Errorf("body = %q", body)
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	c := New(srv.URL, "service-role")
	url, err := c.Upload(context.Background(), "articles-media", "creator/u1/a.jpg", "image/jpeg", strings.NewReader("data"))
	if err != nil {
		t.Fatalf("upload: %v", err)
	}
	if gotPath != "/storage/v1/object/articles-media/creator/u1/a.jpg" {
		t.Fatalf("path = %q", gotPath)
	}
	if gotCT != "image/jpeg" {
		t.Fatalf("content-type = %q", gotCT)
	}
	if gotAuth != "Bearer service-role" {
		t.Fatalf("auth = %q", gotAuth)
	}
	if url != srv.URL+"/storage/v1/object/public/articles-media/creator/u1/a.jpg" {
		t.Fatalf("url publique = %q", url)
	}
}

func TestUpload_ErrorPropagated(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"error":"bucket not found"}`))
	}))
	defer srv.Close()

	c := New(srv.URL, "secret")
	_, err := c.Upload(context.Background(), "missing", "x", "image/png", strings.NewReader("d"))
	if err == nil || !strings.Contains(err.Error(), "bucket not found") {
		t.Fatalf("erreur attendue avec le message storage, got %v", err)
	}
}

func TestUpload_Unconfigured(t *testing.T) {
	c := New("", "")
	if _, err := c.Upload(context.Background(), "b", "p", "image/png", strings.NewReader("d")); err == nil {
		t.Fatal("upload sans configuration doit échouer explicitement")
	}
}
