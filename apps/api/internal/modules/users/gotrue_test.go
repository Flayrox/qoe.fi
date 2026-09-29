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

// TestRevokeUserSessions vérifie l'appel exact au fournisseur : méthode
// DELETE sur le chemin des sessions du compte, avec les en-têtes admin.
// C'est l'outil de la récupération après perte de facteurs et de la réponse
// à une compromission (fiche 05 §8) : un mauvais chemin révoquerait autre
// chose — ou rien, en silence.
func TestRevokeUserSessions(t *testing.T) {
	var gotMethod, gotPath string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotMethod, gotPath = r.Method, r.URL.Path
		if r.Header.Get("apikey") != "secret" || r.Header.Get("Authorization") != "Bearer secret" {
			t.Error("missing admin authentication headers")
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()
	svc := NewServiceWithGoTrue(nil, server.URL, "secret")
	if err := svc.RevokeUserSessions(context.Background(), "user-9"); err != nil {
		t.Fatal(err)
	}
	if gotMethod != http.MethodDelete || gotPath != "/auth/v1/admin/users/user-9/sessions" {
		t.Fatalf("request = %s %s, attendu DELETE /auth/v1/admin/users/user-9/sessions", gotMethod, gotPath)
	}
}

func TestRevokeUserSessions_Errors(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "no", http.StatusForbidden)
	}))
	defer server.Close()
	svc := NewServiceWithGoTrue(nil, server.URL, "secret")
	// Refus du fournisseur : propagé, pas masqué (l'opérateur doit savoir que
	// les sessions sont peut-être toujours valides).
	if err := svc.RevokeUserSessions(context.Background(), "user-9"); err == nil {
		t.Fatal("erreur fournisseur masquée")
	}
	// Identifiant vide : refusé avant tout appel réseau.
	if err := svc.RevokeUserSessions(context.Background(), "  "); err == nil {
		t.Fatal("identifiant vide accepté")
	}
}
