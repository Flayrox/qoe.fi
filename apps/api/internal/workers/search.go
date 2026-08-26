// Package workers — handlers de tâches asynq (sync Meilisearch).
package workers

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/hibiken/asynq"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/meilisearch/meilisearch-go"
	db "github.com/qoefi/api/internal/database"
	"github.com/qoefi/api/internal/queue"
)

const searchIndex = "articles"

// documentSyncer est la surface minimale de Meilisearch utilisée par le
// worker (upsert/delete). Interface étroite → mockable en test.
type documentSyncer interface {
	DeleteDocument(identifier string, opts *meilisearch.DocumentOptions) (*meilisearch.TaskInfo, error)
	AddDocuments(documentsPtr interface{}, opts *meilisearch.DocumentOptions) (*meilisearch.TaskInfo, error)
}

// SearchWorker synchronise les articles vers Meilisearch.
type SearchWorker struct {
	pool *pgxpool.Pool
	q    *db.Queries
	// idx est le client d'index réel ; overrideable en test via newTestSearchWorker.
	idx documentSyncer
}

func NewSearchWorker(pool *pgxpool.Pool) *SearchWorker {
	host := envOr("MEILISEARCH_HOST", "http://localhost:7700")
	key := envOr("MEILI_MASTER_KEY", "qoe_master_key_123")
	return &SearchWorker{
		pool: pool,
		q:    db.New(pool),
		idx:  meilisearch.New(host, meilisearch.WithAPIKey(key)).Index(searchIndex),
	}
}

// Setup configure l'index Meilisearch (miroir de setupMeilisearch TS).
// PATCH brut : le struct TypoTolerance de la lib envoie `disableOnNumbers`
// (inconnu des versions Meilisearch < v1.13) → on contrôle le JSON nous-mêmes.
func (s *SearchWorker) Setup(ctx context.Context) {
	host := envOr("MEILISEARCH_HOST", "http://localhost:7700")

	settings := map[string]any{
		"searchableAttributes": []string{"title", "content", "seoTitle", "seoDescription", "slug", "slugs"},
		"filterableAttributes": []string{"authorId", "categoryId", "isPremium", "published", "publicationId"},
		"sortableAttributes":   []string{"createdAt", "updatedAt"},
		"typoTolerance": map[string]any{
			"enabled":             true,
			"minWordSizeForTypos": map[string]int{"oneTypo": 5, "twoTypos": 9},
		},
	}

	base := strings.TrimSuffix(host, "/")
	s.ensureIndex(ctx, base)
	s.doJSON(ctx, http.MethodPatch, base+"/indexes/"+searchIndex+"/settings", settings)
}

// ensureIndex crée l'index avec primaryKey "id" (re-créé si la clé est absente).
func (s *SearchWorker) ensureIndex(ctx context.Context, base string) {
	client := &http.Client{Timeout: 5 * time.Second}

	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, base+"/indexes/"+searchIndex, nil)
	req.Header.Set("Authorization", "Bearer "+s.apiKey())
	resp, err := client.Do(req)
	if err != nil {
		log.Printf("[search] check index: %v", err)
		return
	}
	var info struct {
		UID        string `json:"uid"`
		PrimaryKey string `json:"primaryKey"`
	}
	_ = json.NewDecoder(resp.Body).Decode(&info)
	resp.Body.Close()

	if resp.StatusCode == http.StatusOK && info.PrimaryKey == "id" {
		// Filterable attributes (best-effort) : nécessaire pour le scope « mine »
		// du Cmd+K studio (publicationId = publication active).
		s.doJSON(ctx, http.MethodPatch, base+"/indexes/"+searchIndex+"/settings/filterable-attributes", []string{"publicationId"})
		return
	}
	if resp.StatusCode == http.StatusOK {
		log.Printf("[search] primaryKey '%s' incohérente → recréation de l'index", info.PrimaryKey)
		s.doJSON(ctx, http.MethodDelete, base+"/indexes/"+searchIndex, nil)
	}
	s.doJSON(ctx, http.MethodPost, base+"/indexes", map[string]any{
		"uid": searchIndex, "primaryKey": "id",
	})
	s.doJSON(ctx, http.MethodPatch, base+"/indexes/"+searchIndex+"/settings/filterable-attributes", []string{"publicationId"})
}

// doJSON envoie une requête HTTP JSON avec le Bearer key (best-effort).
func (s *SearchWorker) doJSON(ctx context.Context, method, url string, body any) {
	raw, _ := json.Marshal(body)
	req, err := http.NewRequestWithContext(ctx, method, url, bytes.NewReader(raw))
	if err != nil {
		return
	}
	req.Header.Set("Authorization", "Bearer "+s.apiKey())
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		log.Printf("[search] %s %s: %v", method, url, err)
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		log.Printf("[search] %s %s: status %d", method, url, resp.StatusCode)
	}
}

func (s *SearchWorker) apiKey() string {
	return envOr("MEILI_MASTER_KEY", "qoe_master_key_123")
}

// HandleSearchSync traite TaskSearchSync (upsert/delete d'un article).
func (s *SearchWorker) HandleSearchSync(ctx context.Context, t *asynq.Task) error {
	var p queue.SearchSyncPayload
	if err := json.Unmarshal(t.Payload(), &p); err != nil {
		return err
	}
	if p.Action == "delete" || p.Action == "" {
		if _, err := s.idx.DeleteDocument(p.ArticleID, nil); err != nil {
			return err
		}
		log.Printf("[search] document supprimé %s", p.ArticleID)
		return nil
	}

	article, err := s.q.GetArticleForSearch(ctx, p.ArticleID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			_, _ = s.idx.DeleteDocument(p.ArticleID, nil)
			return nil
		}
		return err
	}

	// Slugs per auteur : indexe base + variants pour que la recherche
	// retrouve l'article quel que soit le slug partagé (id = technique).
	variantSlugs, _ := s.q.ListArticleSlugs(ctx, p.ArticleID)
	slugs := []string{article.Slug}
	seen := map[string]bool{article.Slug: true}
	for _, v := range variantSlugs {
		if !seen[v] {
			slugs = append(slugs, v)
			seen[v] = true
		}
	}
	doc := map[string]any{
		"id":             article.ID,
		"title":          article.Title,
		"content":        article.Content,
		"slug":           article.Slug,
		"slugs":          slugs,
		"authorId":       uuidStr(article.AuthorId),
		"categoryId":     textOrNil(article.CategoryId),
		"publicationId":  article.PublicationId,
		"published":      article.Published,
		"isPremium":      article.IsPremium,
		"seoTitle":       textOrNil(article.SeoTitle),
		"seoDescription": textOrNil(article.SeoDescription),
		"createdAt":      article.CreatedAt.Time.UnixMilli(),
		"updatedAt":      article.UpdatedAt.Time.UnixMilli(),
	}
	if _, err := s.idx.AddDocuments([]any{doc}, nil); err != nil {
		return err
	}
	log.Printf("[search] document upserté %s", p.ArticleID)
	return nil
}

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func textOrNil(t pgtype.Text) any {
	if !t.Valid {
		return nil
	}
	return t.String
}

func uuidStr(u pgtype.UUID) string {
	if !u.Valid {
		return ""
	}
	return fmt.Sprintf("%x-%x-%x-%x-%x", u.Bytes[0:4], u.Bytes[4:6], u.Bytes[6:8], u.Bytes[8:10], u.Bytes[10:16])
}
