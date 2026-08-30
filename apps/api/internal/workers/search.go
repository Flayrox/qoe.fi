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

// ClearAll vide entièrement l'index Meilisearch et ATTEND la fin de la tâche
// de suppression (le DELETE est asynchrone chez Meili ; sans attente, un
// ReindexAll lancé juste après verrait encore les anciens IDs et ne
// remplacerait rien → index vide ou périmé). Nécessaire avant un reindex
// après régénération de la DB : le seed est déterministe, les IDs d'articles
// sont identiques à l'ancienne base, et ReindexAll (idempotent par ID) ne
// mettrait à jour aucun document.
func (s *SearchWorker) ClearAll(ctx context.Context) {
	host := strings.TrimSuffix(envOr("MEILISEARCH_HOST", "http://localhost:7700"), "/")
	taskUID := s.doJSONTask(ctx, http.MethodDelete, host+"/indexes/"+searchIndex+"/documents", nil)
	if taskUID <= 0 {
		return
	}
	// Poll /tasks/{uid} jusqu'à succès (timeout 30 s).
	deadline := time.Now().Add(30 * time.Second)
	for time.Now().Before(deadline) {
		status := s.taskStatus(ctx, host, taskUID)
		if status == "succeeded" {
			return
		}
		if status == "failed" || status == "canceled" {
			log.Printf("[search] clear index: tâche %d %s", taskUID, status)
			return
		}
		time.Sleep(500 * time.Millisecond)
	}
	log.Printf("[search] clear index: tâche %d toujours en cours après 30 s", taskUID)
}

// doJSONTask est identique à doJSON mais renvoie le taskUid Meilisearch
// (0 si la requête échoue ou que la réponse n'en contient pas).
func (s *SearchWorker) doJSONTask(ctx context.Context, method, url string, body any) int64 {
	raw, _ := json.Marshal(body)
	req, err := http.NewRequestWithContext(ctx, method, url, bytes.NewReader(raw))
	if err != nil {
		return 0
	}
	req.Header.Set("Authorization", "Bearer "+s.apiKey())
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		log.Printf("[search] %s %s: %v", method, url, err)
		return 0
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		log.Printf("[search] %s %s: status %d", method, url, resp.StatusCode)
		return 0
	}
	var out struct {
		TaskUID int64 `json:"taskUid"`
	}
	_ = json.NewDecoder(resp.Body).Decode(&out)
	return out.TaskUID
}

// taskStatus interroge l'état d'une tâche Meilisearch ("enqueued",
// "processing", "succeeded", "failed"…).
func (s *SearchWorker) taskStatus(ctx context.Context, host string, taskUID int64) string {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet,
		fmt.Sprintf("%s/tasks/%d", host, taskUID), nil)
	if err != nil {
		return ""
	}
	req.Header.Set("Authorization", "Bearer "+s.apiKey())
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return ""
	}
	defer resp.Body.Close()
	var out struct {
		Status string `json:"status"`
	}
	_ = json.NewDecoder(resp.Body).Decode(&out)
	return out.Status
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
	doc := searchDocMap(article.ID, article.Title, article.Content, article.Slug,
		appendVariantSlugs(article.Slug, variantSlugs),
		uuidStr(article.AuthorId), article.CategoryId, article.PublicationId,
		article.Published, article.IsPremium, article.SeoTitle, article.SeoDescription,
		article.CreatedAt.Time, article.UpdatedAt.Time)
	if _, err := s.idx.AddDocuments([]any{doc}, nil); err != nil {
		return err
	}
	log.Printf("[search] document upserté %s", p.ArticleID)
	return nil
}

// ReindexAll re-synchronise l'index Meilisearch avec TOUS les articles de la
// base (backfill idempotent : seuls les documents manquants sont upsertés).
// Retourne (total en base, upsertés).
func (s *SearchWorker) ReindexAll(ctx context.Context) (total, upserted int, err error) {
	s.Setup(ctx)

	host := envOr("MEILISEARCH_HOST", "http://localhost:7700")
	key := envOr("MEILI_MASTER_KEY", "qoe_master_key_123")
	idx := meilisearch.New(host, meilisearch.WithAPIKey(key)).Index(searchIndex)

	// 1. IDs déjà présents dans l'index (pagination — limit max Meili = 1000).
	existing := map[string]bool{}
	for offset := 0; ; offset += 1000 {
		var resp meilisearch.DocumentsResult
		if err := idx.GetDocuments(&meilisearch.DocumentsQuery{
			Fields: []string{"id"}, Limit: 1000, Offset: int64(offset),
		}, &resp); err != nil {
			return 0, 0, fmt.Errorf("get documents existants: %w", err)
		}
		for _, d := range resp.Results {
			var id string
			if raw, ok := d["id"]; ok {
				_ = json.Unmarshal(raw, &id)
			}
			if id != "" {
				existing[id] = true
			}
		}
		if len(resp.Results) < 1000 {
			break
		}
	}

	// 2. Tous les articles (slug + variantes par auteur) en un seul passage.
	rows, err := s.pool.Query(ctx, `
		SELECT a.id, a.title, a.content, a.slug,
		       a."authorId"::text, a."categoryId", a."publicationId",
		       a.published, a."isPremium", a."seoTitle", a."seoDescription",
		       a."createdAt", a."updatedAt",
		       COALESCE(array_agg(s.slug) FILTER (WHERE s.slug IS NOT NULL), ARRAY[]::text[]) AS variant_slugs
		FROM "Article" a
		LEFT JOIN "ArticleSlug" s ON s."articleId" = a.id
		GROUP BY a.id`)
	if err != nil {
		return 0, 0, fmt.Errorf("requête articles: %w", err)
	}
	defer rows.Close()

	type row struct {
		ID             string
		Title          string
		Content        string
		Slug           string
		AuthorID       string
		CategoryID     pgtype.Text
		PublicationID  string
		Published      bool
		IsPremium      bool
		SeoTitle       pgtype.Text
		SeoDescription pgtype.Text
		CreatedAt      time.Time
		UpdatedAt      time.Time
		VariantSlugs   []string
	}
	var docs []any
	for rows.Next() {
		var r row
		if err := rows.Scan(&r.ID, &r.Title, &r.Content, &r.Slug, &r.AuthorID,
			&r.CategoryID, &r.PublicationID, &r.Published, &r.IsPremium,
			&r.SeoTitle, &r.SeoDescription, &r.CreatedAt, &r.UpdatedAt, &r.VariantSlugs); err != nil {
			return 0, 0, fmt.Errorf("scan article: %w", err)
		}
		total++
		if existing[r.ID] {
			continue
		}
		slugs := appendVariantSlugs(r.Slug, r.VariantSlugs)
		docs = append(docs, searchDocMap(r.ID, r.Title, r.Content, r.Slug, slugs,
			r.AuthorID, r.CategoryID, r.PublicationID, r.Published, r.IsPremium,
			r.SeoTitle, r.SeoDescription, r.CreatedAt, r.UpdatedAt))
	}
	if err := rows.Err(); err != nil {
		return 0, 0, fmt.Errorf("lecture articles: %w", err)
	}

	// 3. Upsert par lots de 100 (idempotent) + attente de fin de tâche.
	const batchSize = 100
	for i := 0; i < len(docs); i += batchSize {
		end := min(i+batchSize, len(docs))
		task, err := idx.AddDocuments(docs[i:end], nil)
		if err != nil {
			return 0, 0, fmt.Errorf("add documents: %w", err)
		}
		if _, err := idx.WaitForTask(task.TaskUID, time.Second); err != nil {
			log.Printf("[search] attente tâche %d: %v", task.TaskUID, err)
		}
		upserted += end - i
		log.Printf("[search] %d/%d documents upsertés…", upserted, len(docs))
	}
	log.Printf("[search] reindex terminé : %d en base, %d upsertés", total, upserted)
	return total, upserted, nil
}

// searchDocMap est la source unique de vérité de la forme d'un document
// Meilisearch (utilisée par le sync incrémental et le backfill).
func searchDocMap(id, title, content, slug string, slugs []string,
	authorID string, categoryID pgtype.Text,
	publicationID string, published, isPremium bool,
	seoTitle, seoDescription pgtype.Text,
	createdAt, updatedAt time.Time) map[string]any {
	return map[string]any{
		"id":             id,
		"title":          title,
		"content":        content,
		"slug":           slug,
		"slugs":          slugs,
		"authorId":       authorID,
		"categoryId":     textOrNil(categoryID),
		"publicationId":  publicationID,
		"published":      published,
		"isPremium":      isPremium,
		"seoTitle":       textOrNil(seoTitle),
		"seoDescription": textOrNil(seoDescription),
		"createdAt":      createdAt.UnixMilli(),
		"updatedAt":      updatedAt.UnixMilli(),
	}
}

// appendVariantSlugs agrège le slug canonique + les variantes par auteur
// (dédup, slug canonique en premier).
func appendVariantSlugs(slug string, variants []string) []string {
	slugs := []string{slug}
	seen := map[string]bool{slug: true}
	for _, v := range variants {
		if !seen[v] {
			slugs = append(slugs, v)
			seen[v] = true
		}
	}
	return slugs
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
