package users

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestGoTrueClientUpdateUser(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPut || r.URL.Path != "/auth/v1/admin/users/user-1" {
			t.Errorf("request = %s %s", r.Method, r.URL.Path)
		}
		if r.Header.Get("apikey") != "secret" || r.Header.Get("Authorization") != "Bearer secret" {
			t.Error("missing admin authentication headers")
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()
	client := newGoTrueClient(server.URL, "secret")
	if err := client.updateUser(context.Background(), "user-1", map[string]any{"password": "a secure password"}); err != nil {
		t.Fatal(err)
	}
}

func TestGoTrueClientRejectsUnavailable(t *testing.T) {
	client := newGoTrueClient("", "")
	if err := client.updateUser(context.Background(), "u", nil); err == nil || !strings.Contains(err.Error(), "non configuré") {
		t.Fatalf("err = %v", err)
	}
}

func TestGoTrueClientPropagatesStatus(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { http.Error(w, "no", http.StatusForbidden) }))
	defer server.Close()
	if err := newGoTrueClient(server.URL, "secret").updateUser(context.Background(), "u", nil); err == nil {
		t.Fatal("expected status error")
	}
}
