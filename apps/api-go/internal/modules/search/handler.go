// Package search — recherche publique des articles via Meilisearch.
// Parité avec l'ancien endpoint Hono GET /search/articles (apps/api).
package search

import (
	"encoding/json"
	"log"
	"net/http"
	"os"

	"github.com/go-chi/chi/v5"
	"github.com/meilisearch/meilisearch-go"
	"github.com/qoefi/api-go/internal/response"
)

const searchIndex = "articles"

// Searcher est la surface minimale utilisée par la route (mockable en test).
type Searcher interface {
	Search(query string, request *meilisearch.SearchRequest) (*meilisearch.SearchResponse, error)
}

// meiliSearcher adapte le client meilisearch à l'interface Searcher.
type meiliSearcher struct {
	client meilisearch.ServiceManager
}

func (m meiliSearcher) Search(query string, request *meilisearch.SearchRequest) (*meilisearch.SearchResponse, error) {
	return m.client.Index(searchIndex).Search(query, request)
}

// Handler expose la recherche publique (articles indexés dans Meilisearch).
type Handler struct {
	searcher Searcher
}

func NewHandler() *Handler {
	host := envOr("MEILISEARCH_HOST", "http://localhost:7700")
	key := envOr("MEILI_MASTER_KEY", "qoe_master_key_123")
	return &Handler{
		searcher: meiliSearcher{client: meilisearch.New(host, meilisearch.WithAPIKey(key))},
	}
}

// RegisterPublic enregistre la route publique de recherche.
func (h *Handler) RegisterPublic(r chi.Router) {
	r.Get("/search/articles", h.searchArticles)
}

// searchArticles cherche dans l'index Meilisearch des articles (limit 10).
// Réponse : { hits: [...], estimatedTotalHits: number } — parité Hono.
func (h *Handler) searchArticles(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query().Get("q")
	if query == "" {
		response.OK(w, map[string]any{"hits": []any{}, "estimatedTotalHits": 0})
		return
	}

	results, err := h.searcher.Search(query, &meilisearch.SearchRequest{Limit: 10})
	if err != nil {
		log.Printf("[search] meilisearch: %v", err)
		response.Internal(w)
		return
	}

	hits := results.Hits
	if hits == nil {
		hits = meilisearch.Hits{}
	}

	// Sérialisation explicite : les hits meilisearch sont des maps de
	// json.RawMessage, stables en sortie.
	out, err := json.Marshal(map[string]any{
		"hits":               hits,
		"estimatedTotalHits": results.EstimatedTotalHits,
	})
	if err != nil {
		response.Internal(w)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write(out)
}

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
