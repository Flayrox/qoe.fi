package search

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/meilisearch/meilisearch-go"
)

// stubSearcher implémente Searcher pour les tests.
type stubSearcher struct {
	resp *meilisearch.SearchResponse
	err  error
}

func (s stubSearcher) Search(_ string, _ *meilisearch.SearchRequest) (*meilisearch.SearchResponse, error) {
	return s.resp, s.err
}

func doSearch(h *Handler, query string) *httptest.ResponseRecorder {
	r := chi.NewRouter()
	h.RegisterPublic(r)
	req := httptest.NewRequest(http.MethodGet, "/search/articles?q="+query, nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func TestSearchArticlesEmptyQuery(t *testing.T) {
	h := &Handler{searcher: stubSearcher{err: errors.New("ne doit pas être appelé")}}
	w := doSearch(h, "")

	if w.Code != http.StatusOK {
		t.Fatalf("code = %d, attendu 200", w.Code)
	}
	var out struct {
		Hits               []any `json:"hits"`
		EstimatedTotalHits int64 `json:"estimatedTotalHits"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
		t.Fatalf("json invalide: %v", err)
	}
	if out.Hits == nil {
		t.Fatal("hits doit être [] et non null")
	}
	if out.EstimatedTotalHits != 0 {
		t.Fatalf("estimatedTotalHits = %d, attendu 0", out.EstimatedTotalHits)
	}
}

func TestSearchArticlesHits(t *testing.T) {
	hit := meilisearch.Hit{"id": json.RawMessage(`"art_1"`), "title": json.RawMessage(`"Climat"`)}
	h := &Handler{searcher: stubSearcher{
		resp: &meilisearch.SearchResponse{Hits: meilisearch.Hits{hit}, EstimatedTotalHits: 42},
	}}
	w := doSearch(h, "climat")

	if w.Code != http.StatusOK {
		t.Fatalf("code = %d, attendu 200", w.Code)
	}
	var out struct {
		Hits               []map[string]json.RawMessage `json:"hits"`
		EstimatedTotalHits int64                        `json:"estimatedTotalHits"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
		t.Fatalf("json invalide: %v", err)
	}
	if len(out.Hits) != 1 {
		t.Fatalf("hits = %d, attendu 1", len(out.Hits))
	}
	if out.EstimatedTotalHits != 42 {
		t.Fatalf("estimatedTotalHits = %d, attendu 42", out.EstimatedTotalHits)
	}
	var id string
	if err := json.Unmarshal(out.Hits[0]["id"], &id); err != nil || id != "art_1" {
		t.Fatalf("id hit = %q, attendu art_1 (err=%v)", id, err)
	}
}

func TestSearchArticlesMeiliError(t *testing.T) {
	h := &Handler{searcher: stubSearcher{err: errors.New("meili down")}}
	w := doSearch(h, "climat")

	if w.Code != http.StatusInternalServerError {
		t.Fatalf("code = %d, attendu 500", w.Code)
	}
}

// ─── Recherche sémantique (/search/semantic) ─────────────────────────

func TestSearchSemanticEmptyQuery(t *testing.T) {
	h := &Handler{semantic: nil}
	r := chi.NewRouter()
	h.RegisterPublic(r)
	req := httptest.NewRequest(http.MethodGet, "/search/semantic?q=", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("code = %d, attendu 200", w.Code)
	}
	var out struct {
		Items []any `json:"items"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
		t.Fatalf("json invalide: %v", err)
	}
	if out.Items == nil {
		t.Fatal("items doit être [] et non null")
	}
}

func TestSearchSemanticServiceUnavailable(t *testing.T) {
	// Sans EMBEDDING_URL → 503 (le fallback lexical reste disponible).
	t.Setenv("EMBEDDING_URL", "")
	// Le handler réel (semantic non nil) avec un vrai service → erreur 503.
	h := &Handler{semantic: &SemanticService{}}
	r := chi.NewRouter()
	h.RegisterPublic(r)
	req := httptest.NewRequest(http.MethodGet, "/search/semantic?q=climat", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("code = %d, attendu 503", w.Code)
	}
}
