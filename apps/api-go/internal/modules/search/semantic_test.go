package search

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgtype"
)

// ─── uuidString ──────────────────────────────────────────────────────

func TestUUIDStringValid(t *testing.T) {
	// 16 octets 0x00..0x0F → forme canonique 8-4-4-4-12.
	u := pgtype.UUID{Valid: true, Bytes: [16]byte{
		0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07,
		0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f,
	}}
	got := uuidString(u)
	want := "00010203-0405-0607-0809-0a0b0c0d0e0f"
	if got != want {
		t.Fatalf("uuidString = %q, attendu %q", got, want)
	}
}

func TestUUIDStringInvalid(t *testing.T) {
	if got := uuidString(pgtype.UUID{}); got != "" {
		t.Fatalf("uuidString(invalid) = %q, attendu \"\"", got)
	}
}

// ─── embeddingDims ───────────────────────────────────────────────────

func TestEmbeddingDimsDefault(t *testing.T) {
	t.Setenv("EMBEDDING_DIMS", "")
	if got := embeddingDims(); got != 512 {
		t.Fatalf("embeddingDims = %d, attendu 512 (défaut)", got)
	}
}

func TestEmbeddingDimsEnv(t *testing.T) {
	t.Setenv("EMBEDDING_DIMS", "1024")
	if got := embeddingDims(); got != 1024 {
		t.Fatalf("embeddingDims = %d, attendu 1024", got)
	}
}

func TestEmbeddingDimsOutOfRange(t *testing.T) {
	t.Setenv("EMBEDDING_DIMS", "16") // trop petit → défaut 512
	if got := embeddingDims(); got != 512 {
		t.Fatalf("embeddingDims(16) = %d, attendu 512", got)
	}
	t.Setenv("EMBEDDING_DIMS", "99999") // trop grand → défaut 512
	if got := embeddingDims(); got != 512 {
		t.Fatalf("embeddingDims(99999) = %d, attendu 512", got)
	}
}

func TestEmbeddingDimsNonNumeric(t *testing.T) {
	t.Setenv("EMBEDDING_DIMS", "abc")
	if got := embeddingDims(); got != 512 {
		t.Fatalf("embeddingDims(abc) = %d, attendu 512", got)
	}
}

// ─── httpEmbedClient.Embed (API OpenAI-compatible) ───────────────────

// embedServer simule le service d'inférence (TEI / llama.cpp, API
// OpenAI-compatible) et capture la requête reçue.
func embedServer(t *testing.T, status int, dims int, capture *map[string]any) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Errorf("décodage requête: %v", err)
		}
		if capture != nil {
			*capture = body
		}
		if status != http.StatusOK {
			w.WriteHeader(status)
			return
		}
		emb := make([]float32, dims)
		for i := range emb {
			emb[i] = float32(i) * 0.01
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"data": []map[string]any{{"embedding": emb}},
		})
	}))
}

func TestEmbedSuccess(t *testing.T) {
	srv := embedServer(t, http.StatusOK, 512, nil)
	defer srv.Close()

	c := &httpEmbedClient{base: srv.URL, model: "jina-embeddings-v3", http: srv.Client()}
	vec, err := c.Embed(context.Background(), "la liberté")
	if err != nil {
		t.Fatalf("Embed: %v", err)
	}
	if len(vec) != 512 {
		t.Fatalf("len(vec) = %d, attendu 512", len(vec))
	}
	if vec[0] != 0 {
		t.Fatalf("vecteur inattendu: first=%v, attendu 0", vec[0])
	}
	if diff := vec[511] - 5.11; diff < -0.001 || diff > 0.001 {
		t.Fatalf("vecteur inattendu: last=%v, attendu ~5.11", vec[511])
	}
}

func TestEmbedSendsTaskAndModel(t *testing.T) {
	var got map[string]any
	srv := embedServer(t, http.StatusOK, 512, &got)
	defer srv.Close()

	c := &httpEmbedClient{base: srv.URL, model: "jina-embeddings-v3", task: "retrieval.query", http: srv.Client()}
	if _, err := c.Embed(context.Background(), "liberté"); err != nil {
		t.Fatalf("Embed: %v", err)
	}
	if got["model"] != "jina-embeddings-v3" {
		t.Fatalf("model = %v", got["model"])
	}
	if got["task"] != "retrieval.query" {
		t.Fatalf("task = %v, attendu retrieval.query", got["task"])
	}
	if got["input"] != "liberté" {
		t.Fatalf("input = %v", got["input"])
	}
}

func TestEmbedOmitsTaskWhenEmpty(t *testing.T) {
	var got map[string]any
	srv := embedServer(t, http.StatusOK, 512, &got)
	defer srv.Close()

	c := &httpEmbedClient{base: srv.URL, model: "m", http: srv.Client()}
	if _, err := c.Embed(context.Background(), "x"); err != nil {
		t.Fatalf("Embed: %v", err)
	}
	if _, present := got["task"]; present {
		t.Fatal("le champ task ne doit pas être envoyé quand il est vide (llama.cpp)")
	}
}

func TestEmbedHTTPErrorStatus(t *testing.T) {
	srv := embedServer(t, http.StatusBadGateway, 512, nil)
	defer srv.Close()

	c := &httpEmbedClient{base: srv.URL, http: srv.Client()}
	_, err := c.Embed(context.Background(), "x")
	if err == nil || !strings.Contains(err.Error(), "status 502") {
		t.Fatalf("err = %v, attendu status 502", err)
	}
}

func TestEmbedEmptyResponse(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":[]}`))
	}))
	defer srv.Close()

	c := &httpEmbedClient{base: srv.URL, http: srv.Client()}
	if _, err := c.Embed(context.Background(), "x"); err == nil {
		t.Fatal("Embed doit échouer sur une réponse vide")
	}
}

func TestEmbedServiceUnreachable(t *testing.T) {
	// Serveur fermé immédiatement → connexion refusée.
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	url := srv.URL
	srv.Close()

	c := &httpEmbedClient{base: url, http: srv.Client()}
	_, err := c.Embed(context.Background(), "x")
	if err == nil {
		t.Fatal("Embed doit échouer quand le service est injoignable")
	}
}

// ─── NewSemanticService ──────────────────────────────────────────────

func TestNewSemanticService(t *testing.T) {
	t.Setenv("EMBEDDING_URL", "http://infra:8081")
	t.Setenv("EMBEDDING_MODEL", "jina-embeddings-v3")
	s := NewSemanticService(nil) // pool nil : on ne teste que la construction
	if s == nil {
		t.Fatal("NewSemanticService = nil")
	}
	ec, ok := s.embedder.(*httpEmbedClient)
	if !ok {
		t.Fatalf("embedder de type %T, attendu *httpEmbedClient", s.embedder)
	}
	if ec.base != "http://infra:8081" {
		t.Fatalf("base = %q", ec.base)
	}
	if ec.model != "jina-embeddings-v3" {
		t.Fatalf("model = %q", ec.model)
	}
}

// ─── envOr (handler.go) ──────────────────────────────────────────────

func TestEnvOr(t *testing.T) {
	t.Setenv("SEARCH_TEST_VAR", "valeur")
	if got := envOr("SEARCH_TEST_VAR", "défaut"); got != "valeur" {
		t.Fatalf("envOr = %q, attendu valeur", got)
	}
	if got := envOr("SEARCH_TEST_VAR_INEXISTANTE", "défaut"); got != "défaut" {
		t.Fatalf("envOr = %q, attendu défaut", got)
	}
}

// ─── NewHandler ──────────────────────────────────────────────────────

func TestNewHandler(t *testing.T) {
	t.Setenv("MEILISEARCH_HOST", "http://meili:7700")
	t.Setenv("MEILI_MASTER_KEY", "clef_test")
	h := NewHandler(nil)
	if h == nil {
		t.Fatal("NewHandler = nil")
	}
	if h.semantic != nil {
		t.Fatal("semantic doit être nil (passé en argument)")
	}
}

// ─── SemanticService.Search — garde EMBEDDING_URL ────────────────────

func TestSearchNoEmbeddingService(t *testing.T) {
	t.Setenv("EMBEDDING_URL", "")
	s := &SemanticService{embedder: stubEmbedder{}}
	_, err := s.Search(context.Background(), "liberté", 10)
	if !errors.Is(err, ErrNoEmbeddingService) {
		t.Fatalf("err = %v, attendu ErrNoEmbeddingService", err)
	}
}
