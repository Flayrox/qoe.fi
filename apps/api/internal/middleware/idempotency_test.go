package middleware

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
)

// idemRedis monte un Redis minifié pour les tests d'idempotence.
func idemRedis(t *testing.T) *redis.Client {
	t.Helper()
	s := miniredis.RunT(t)
	rc := redis.NewClient(&redis.Options{Addr: s.Addr()})
	t.Cleanup(func() { _ = rc.Close() })
	return rc
}

func idemRequest(method, path, key, userID string) *http.Request {
	req := httptest.NewRequest(method, path, strings.NewReader(`{"title":"x"}`))
	if key != "" {
		req.Header.Set(IdempotencyKeyHeader, key)
	}
	if userID != "" {
		req = req.WithContext(context.WithValue(req.Context(), UserIDKey, userID))
	}
	return req
}

func TestIdempotency_ReplaySameKey(t *testing.T) {
	rc := idemRedis(t)
	var calls int
	inner := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		calls++
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(`{"id":"art_1"}`))
	})
	h := Idempotency(rc, time.Hour)(inner)

	first := httptest.NewRecorder()
	h.ServeHTTP(first, idemRequest(http.MethodPost, "/v1/articles", "abc-123", "user-1"))
	second := httptest.NewRecorder()
	h.ServeHTTP(second, idemRequest(http.MethodPost, "/v1/articles", "abc-123", "user-1"))

	if first.Code != http.StatusCreated || second.Code != http.StatusCreated {
		t.Fatalf("codes = %d / %d, attendu 201", first.Code, second.Code)
	}
	if first.Body.String() != second.Body.String() {
		t.Fatalf("rejeu différent : %q vs %q", first.Body.String(), second.Body.String())
	}
	if calls != 1 {
		t.Fatalf("handler exécuté %d fois, attendu 1 (rejeu depuis le cache)", calls)
	}
	if ct := second.Header().Get("Content-Type"); ct != "application/json" {
		t.Fatalf("Content-Type rejoué = %q", ct)
	}
}

func TestIdempotency_KeyScopedByActorMethodPath(t *testing.T) {
	rc := idemRedis(t)
	var calls int
	inner := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		calls++
		w.WriteHeader(http.StatusOK)
	})
	h := Idempotency(rc, time.Hour)(inner)

	serve := func(method, path, key, userID string) {
		h.ServeHTTP(httptest.NewRecorder(), idemRequest(method, path, key, userID))
	}

	// Même clé, autre utilisateur → pas de rejeu (la clé ne se « partage » pas).
	serve(http.MethodPost, "/v1/articles", "k", "user-1")
	serve(http.MethodPost, "/v1/articles", "k", "user-2")
	// Même utilisateur, autre route → pas de rejeu.
	serve(http.MethodPost, "/v1/webhooks", "k", "user-1")
	// Même utilisateur + route, autre clé d'idempotence → pas de rejeu.
	serve(http.MethodPost, "/v1/articles", "k2", "user-1")
	// Même utilisateur + route + clé → rejeu.
	serve(http.MethodPost, "/v1/articles", "k", "user-1")

	if calls != 4 {
		t.Fatalf("handler exécuté %d fois, attendu 4 (un seul rejeu)", calls)
	}
}

func TestIdempotency_NoKeyAndGETPassThrough(t *testing.T) {
	rc := idemRedis(t)
	var calls int
	inner := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		calls++
		w.WriteHeader(http.StatusOK)
	})
	h := Idempotency(rc, time.Hour)(inner)

	// POST sans header → exécuté à chaque fois.
	h.ServeHTTP(httptest.NewRecorder(), idemRequest(http.MethodPost, "/v1/articles", "", "user-1"))
	h.ServeHTTP(httptest.NewRecorder(), idemRequest(http.MethodPost, "/v1/articles", "", "user-1"))
	// GET avec header → l'idempotence ne s'applique qu'aux mutations.
	h.ServeHTTP(httptest.NewRecorder(), idemRequest(http.MethodGet, "/v1/articles/art_1", "abc", "user-1"))
	h.ServeHTTP(httptest.NewRecorder(), idemRequest(http.MethodGet, "/v1/articles/art_1", "abc", "user-1"))

	if calls != 4 {
		t.Fatalf("handler exécuté %d fois, attendu 4", calls)
	}
}

func TestIdempotency_5xxNotCached(t *testing.T) {
	rc := idemRedis(t)
	var calls int
	inner := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		calls++
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte(`{"error":"boom"}`))
	})
	h := Idempotency(rc, time.Hour)(inner)

	for i := 0; i < 2; i++ {
		h.ServeHTTP(httptest.NewRecorder(), idemRequest(http.MethodPost, "/v1/articles", "k", "user-1"))
	}
	if calls != 2 {
		t.Fatalf("handler exécuté %d fois, attendu 2 (5xx non mis en cache)", calls)
	}
}

func TestIdempotency_ConcurrentProcessing409(t *testing.T) {
	rc := idemRedis(t)
	inner := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	h := Idempotency(rc, time.Hour)(inner)

	// Simule une requête identique en cours : verrou « processing » posé.
	raw := "user:user-1\nPOST\n/v1/articles\nabc"
	sum := sha256.Sum256([]byte(raw))
	lockKey := "idem:" + hex.EncodeToString(sum[:]) + ":lock"
	if err := rc.Set(context.Background(), lockKey, idempotencyProcessing, 0).Err(); err != nil {
		t.Fatalf("set verrou: %v", err)
	}

	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, idemRequest(http.MethodPost, "/v1/articles", "abc", "user-1"))
	if rr.Code != http.StatusConflict {
		t.Fatalf("code = %d, attendu 409 (requête en cours)", rr.Code)
	}
}

func TestIdempotency_NilRedisPasses(t *testing.T) {
	var calls int
	inner := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		calls++
		w.WriteHeader(http.StatusOK)
	})
	h := Idempotency(nil, time.Hour)(inner)
	h.ServeHTTP(httptest.NewRecorder(), idemRequest(http.MethodPost, "/v1/articles", "k", "user-1"))
	if calls != 1 {
		t.Fatal("Redis nil doit laisser passer sans cacher")
	}
}
