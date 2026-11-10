// Package search — recherche publique des articles via Meilisearch.
// Parité avec l'ancien endpoint Hono GET /search/articles (apps/api).
package search

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/meilisearch/meilisearch-go"
	"github.com/qoefi/api/internal/middleware"
	"github.com/qoefi/api/internal/modules/articles"
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
	pool     *pgxpool.Pool
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
// Monter de préférence sous auth.OptionalAuth : le userID éventuel sert à
// prouver la propriété d'une publication (contenu premium complet),
// sinon tout hit premium est retronqué (zéro-fuite).
func (h *Handler) RegisterPublic(r chi.Router) {
	r.Get("/search/articles", h.searchArticles)
	r.Get("/search/semantic", h.searchSemantic)
	r.Get("/search/thoughts", h.searchThoughts)
}

// SetPool fournit l'accès Postgres pour la vérification de propriété.
// Sans pool : repli fermé, tout hit premium est retronqué.
func (h *Handler) SetPool(pool *pgxpool.Pool) {
	h.pool = pool
}

// ownsPublication vérifie qu'un utilisateur détient une publication
// (publication personnelle ou membre owner/admin d'un média).
func (h *Handler) ownsPublisher(ctx context.Context, userID, publisherID string) bool {
	if h.pool == nil || userID == "" || publisherID == "" {
		return false
	}
	var ok bool
	err := h.pool.QueryRow(ctx, `SELECT EXISTS(
		SELECT 1 FROM "User" WHERE id::text = $1 AND "publisherId" = $2
		UNION
		SELECT 1 FROM "MediaMember" mm JOIN "Media" md ON md.id = mm."mediaId"
		WHERE md."publisherId" = $2 AND mm."userId"::text = $1
			AND mm.status = 'active' AND mm.role IN ('owner', 'admin')
	)`, userID, publisherID).Scan(&ok)
	return err == nil && ok
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

	userID, _ := middleware.UserID(r.Context())
	items, err := h.semantic.SearchThoughts(r.Context(), query, limit, userID)
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
	pubID := r.URL.Query().Get("publisherId")
	req := &meilisearch.SearchRequest{Limit: 10}
	if pubID != "" {
		req.Filter = "publisherId = '" + strings.ReplaceAll(pubID, "'", "''") + "'"
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

	// 🔒 Zéro-fuite : l'index Meilisearch stocke le contenu BRUT des articles et
	// les hits sont renvoyés tels quels. Le contenu premium complet n'est servi
	// que si l'appelant authentifié détient la publication (scope studio) ;
	// sinon (public, anonyme, ou publication d'un tiers) on retronque.
	userID, _ := middleware.UserID(r.Context())
	if !h.ownsPublisher(r.Context(), userID, pubID) {
		redactPremiumHitContents(hits)
	}

	// 🔒 Visibilité des comptes : l'index Meilisearch ne connaît pas
	// profileVisibility. On retire donc les hits des publications privées /
	// réservées aux abonnés, et ceux d'un compte bloqué dans un sens ou l'autre.
	before := len(hits)
	hits = h.filterVisibleArticleHits(r.Context(), hits, userID)
	estimatedTotal := results.EstimatedTotalHits - int64(before-len(hits))
	if estimatedTotal < 0 {
		estimatedTotal = 0
	}

	// Sérialisation explicite : les hits meilisearch sont des maps de
	// json.RawMessage, stables en sortie.
	out, err := json.Marshal(map[string]any{
		"hits":               hits,
		"estimatedTotalHits": estimatedTotal,
	})
	if err != nil {
		response.Internal(w)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write(out)
}

// filterVisibleArticleHits retire les hits dont la publication n'est pas
// visible par le viewer (compte privé / abonnés uniquement) ou dont l'auteur
// est bloqué dans un sens ou l'autre. Les hits sans publisherId sont
// conservés : on ne peut pas prouver qu'ils sont privés.
func (h *Handler) filterVisibleArticleHits(ctx context.Context, hits meilisearch.Hits, viewerID string) meilisearch.Hits {
	if h.pool == nil || len(hits) == 0 {
		return hits
	}

	pubIDs := make([]string, 0, len(hits))
	hitPub := make([]string, len(hits))
	for i, hit := range hits {
		var pubID string
		if raw, ok := hit["publisherId"]; ok {
			_ = json.Unmarshal(raw, &pubID)
		}
		hitPub[i] = pubID
		if pubID != "" {
			pubIDs = append(pubIDs, pubID)
		}
	}
	if len(pubIDs) == 0 {
		return hits
	}

	type access struct {
		visibility string
		own        bool
		follows    bool
		blocked    bool
	}
	byPub := make(map[string]access, len(pubIDs))
	rows, err := h.pool.Query(ctx, `
		SELECT p.id::text,
		       COALESCE(us."profileVisibility", 'PUBLIC'),
		       (u.id = $2) AS is_own,
		       EXISTS (SELECT 1 FROM "Follows" f WHERE f."readerId" = $2 AND f."publisherId" = p.id) AS follows,
		       EXISTS (SELECT 1 FROM "BlockedUser" bu
		               WHERE (bu."readerId" = $2 AND bu."creatorId" = u.id)
		                  OR (bu."readerId" = u.id AND bu."creatorId" = $2)) AS blocked
		FROM "Publisher" p
		JOIN "User" u ON u."publisherId" = p.id
		LEFT JOIN "UserSettings" us ON us."userId" = u.id
		WHERE p.id = ANY($1)`, pubIDs, toUUID(viewerID))
	if err != nil {
		log.Printf("[search] visibility filter: %v", err)
		return hits
	}
	defer rows.Close()
	for rows.Next() {
		var pubID string
		var a access
		if err := rows.Scan(&pubID, &a.visibility, &a.own, &a.follows, &a.blocked); err != nil {
			continue
		}
		byPub[pubID] = a
	}

	filtered := make(meilisearch.Hits, 0, len(hits))
	for i, hit := range hits {
		pubID := hitPub[i]
		if pubID == "" {
			filtered = append(filtered, hit)
			continue
		}
		a, ok := byPub[pubID]
		if !ok {
			// Publication supprimée entre l'indexation et la recherche.
			continue
		}
		if a.blocked {
			continue
		}
		if a.own || a.visibility == "PUBLIC" || a.follows {
			filtered = append(filtered, hit)
		}
	}
	return filtered
}

// redactPremiumHitContents remplace, dans les hits de recherche PUBLIQUE, le
// `content` d'un article premium par sa version tronquée au paywall. Les hits
// portent `isPremium` mais pas la visibilité complète : on tronque donc au
// niveau le plus restrictif (abonnés payants), jamais moins.
func redactPremiumHitContents(hits meilisearch.Hits) {
	for _, hit := range hits {
		var premium bool
		if raw, ok := hit["isPremium"]; ok {
			_ = json.Unmarshal(raw, &premium)
		}
		if !premium {
			continue
		}
		var content string
		if raw, ok := hit["content"]; ok {
			if err := json.Unmarshal(raw, &content); err != nil {
				continue
			}
		}
		cut := articles.SliceContentAtPaywall(
			content, articles.UserEntitlements{}, articles.VisPaidSubscribers, nil,
		)
		encoded, err := json.Marshal(cut.Content)
		if err != nil {
			continue
		}
		hit["content"] = json.RawMessage(encoded)
	}
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
