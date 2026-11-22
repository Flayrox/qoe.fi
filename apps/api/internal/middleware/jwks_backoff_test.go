package middleware

import (
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
)

// TestJWKSBackoffApresEchec : après un échec, aucune nouvelle tentative réseau
// avant jwksRetryBackoff (avant le correctif, chaque appel retentait et
// sérialisait les autres requêtes pendant la panne).
func TestJWKSBackoffApresEchec(t *testing.T) {
	var hits atomic.Int64
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		hits.Add(1)
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer srv.Close()

	a := NewAuth("", "")
	a.jwksURL = srv.URL
	a.client = srv.Client()

	for i := 0; i < 5; i++ {
		if _, err := a.getJWKS(); err == nil {
			t.Fatalf("appel %d : un JWKS en erreur doit remonter une erreur", i+1)
		}
	}
	if got := hits.Load(); got != 1 {
		t.Fatalf("requêtes JWKS = %d, attendu 1 (backoff après échec)", got)
	}
}

// TestJWKSCacheApresSucces : un jeu de clés frais est réutilisé sans réseau.
func TestJWKSCacheApresSucces(t *testing.T) {
	var hits atomic.Int64
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		hits.Add(1)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"keys":[]}`))
	}))
	defer srv.Close()

	a := NewAuth("", "")
	a.jwksURL = srv.URL
	a.client = srv.Client()

	for i := 0; i < 3; i++ {
		if _, err := a.getJWKS(); err != nil {
			t.Fatalf("appel %d : %v", i+1, err)
		}
	}
	if got := hits.Load(); got != 1 {
		t.Fatalf("requêtes JWKS = %d, attendu 1 (cache)", got)
	}
}

// TestJWKSStaleSertLeCache : pendant une panne, les clés déjà connues restent
// utilisables (pas de déconnexion générale), mais un cache absent remonte
// l'erreur.
func TestJWKSStaleSertLeCache(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusBadGateway)
	}))
	defer srv.Close()

	a := NewAuth("", "")
	a.jwksURL = srv.URL
	a.client = srv.Client()

	if _, err := a.getJWKS(); err == nil {
		t.Fatal("sans cache, l'échec doit remonter")
	}

	cached := &jwkSet{}
	a.mu.Lock()
	a.jwks = cached
	a.lastErr = a.fetched
	a.mu.Unlock()

	got, err := a.getJWKS()
	if err != nil {
		t.Fatalf("avec cache, l'erreur ne doit pas remonter : %v", err)
	}
	if got != cached {
		t.Fatal("le cache doit être servi tel quel")
	}
}
