// Package search — recherche publique des articles via Meilisearch.
// Parité avec l'ancien endpoint Hono GET /search/articles (apps/api).
package search

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/meilisearch/meilisearch-go"
	"github.com/qoefi/api/internal/response"
)

const searchIndex = "articles"

// maxSearchQueryLength borne la taille d'une requête de recherche : rejette
// les entrées adverses (payloads géants) avant tout appel au moteur
// Meilisearch ou au SQL (ILIKE), indépendamment de leur disponibilité.
const maxSearchQueryLength = 512

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

// Handler expose la recherche publique : lexicale (Meilisearch, /search/articles)
// et sémantique (pgvector + jina, /search/semantic).
type Handler struct {
	searcher Searcher
	semantic *SemanticService
}

func NewHandler(semantic *SemanticService) *Handler {
	host := envOr("MEILISEARCH_HOST", "http://localhost:7700")
	key := envOr("MEILI_MASTER_KEY", "qoe_master_key_123")
	return &Handler{
		searcher: meiliSearcher{client: meilisearch.New(host, meilisearch.WithAPIKey(key))},
		semantic: semantic,
	}
}

// RegisterPublic enregistre les routes publiques de recherche.
func (h *Handler) RegisterPublic(r chi.Router) {
	r.Get("/search/articles", h.searchArticles)
	r.Get("/search/semantic", h.searchSemantic)
	r.Get("/search/thoughts", h.searchThoughts)
}

// searchThoughts cherche les pensées publiques (contenu + tags, ILIKE).
// Réponse : { thoughts: [...], nextCursor: null } — parité web.
func (h *Handler) searchThoughts(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query().Get("q")
	if query == "" {
		response.OK(w, map[string]any{"thoughts": []any{}, "nextCursor": nil})
		return
	}
	if len(query) > maxSearchQueryLength {
		response.Error(w, http.StatusBadRequest, "Recherche trop longue")
		return
	}
	// Le `#` d'un hashtag est un marqueur d'intention : on cherche le terme nu
	// (le tag comme le contenu), parité searchThoughts TS.
	query = strings.TrimPrefix(strings.TrimSpace(query), "#")
	limit := 20
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 50 {
			limit = n
		}
	}

	items, err := h.semantic.SearchThoughts(r.Context(), query, limit)
	if err != nil {
		log.Printf("[search] thoughts: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, map[string]any{"thoughts": items, "nextCursor": nil})
}

// searchArticles cherche dans l'index Meilisearch des articles (limit 10).
// Réponse : { hits: [...], estimatedTotalHits: number } — parité Hono.
func (h *Handler) searchArticles(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query().Get("q")
	if query == "" {
		response.OK(w, map[string]any{"hits": []any{}, "estimatedTotalHits": 0})
		return
	}
	if len(query) > maxSearchQueryLength {
		response.Error(w, http.StatusBadRequest, "Recherche trop longue")
		return
	}

	// Filtre optionnel par publication (scope « mine » du Cmd+K studio).
	req := &meilisearch.SearchRequest{Limit: 10}
	if pubID := r.URL.Query().Get("publicationId"); pubID != "" {
		req.Filter = "publicationId = '" + strings.ReplaceAll(pubID, "'", "''") + "'"
	}

	results, err := h.searcher.Search(query, req)
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

// searchSemantic cherche par similarité sémantique (jina + pgvector).
// Réponse : { items: [...] } — ou 503 si le service d'embedding n'est pas
// configuré (le fallback lexical /search/articles reste disponible).
func (h *Handler) searchSemantic(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query().Get("q")
	if query == "" {
		response.OK(w, map[string]any{"items": []any{}})
		return
	}
	limit := 10
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			limit = n
		}
	}

	items, err := h.semantic.Search(r.Context(), query, limit)
	if err != nil {
		if errors.Is(err, ErrNoEmbeddingService) {
			response.Error(w, http.StatusServiceUnavailable, "Recherche sémantique indisponible (embedding non configuré)")
			return
		}
		log.Printf("[search] semantic: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, map[string]any{"items": items})
}

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
