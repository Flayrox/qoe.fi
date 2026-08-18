// Package search — recherche sémantique (pgvector + jina-embeddings-v3).
package search

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pgvector/pgvector-go"
	db "github.com/qoefi/api-go/internal/database"
)

// uuidString formate un pgtype.UUID en chaîne canonique.
func uuidString(u pgtype.UUID) string {
	if !u.Valid {
		return ""
	}
	return fmt.Sprintf("%x-%x-%x-%x-%x", u.Bytes[0:4], u.Bytes[4:6], u.Bytes[6:8], u.Bytes[8:10], u.Bytes[10:16])
}

// SemanticService effectue la recherche sémantique plein corpus : la requête
// est vectorisée par le service d'inférence (TEI, OpenAI-compatible), puis les
// articles publiés sont classés par similarité cosinus (index HNSW).
type SemanticService struct {
	pool     *pgxpool.Pool
	q        *db.Queries
	embedder embedClient
}

type embedClient interface {
	Embed(ctx context.Context, text string) ([]float32, error)
}

func NewSemanticService(pool *pgxpool.Pool) *SemanticService {
	return &SemanticService{
		pool: pool,
		q:    db.New(pool),
		embedder: &httpEmbedClient{
			base:  envOr("EMBEDDING_URL", "http://localhost:8081"),
			model: envOr("EMBEDDING_MODEL", "jina-embeddings-v3"),
			// Tâche typée jina pour les requêtes (retrieval.query). Vide =
			// champ omis (llama.cpp crashe sur ce champ ; TEI s'en passe).
			task: os.Getenv("EMBEDDING_QUERY_TASK"),
			http: &http.Client{Timeout: 60 * time.Second},
		},
	}
}

// embeddingDims retourne la dimension cible (MRL) : EMBEDDING_DIMS, défaut 512.
// Doit correspondre à la colonne vector(512) en base.
func embeddingDims() int {
	d, _ := strconv.Atoi(os.Getenv("EMBEDDING_DIMS"))
	if d < 64 || d > 4096 {
		d = 512
	}
	return d
}

// httpEmbedClient appelle le service d'inférence (API OpenAI-compatible).
type httpEmbedClient struct {
	base  string
	model string
	// task est la tâche jina-embeddings-v3 (retrieval.query etc.). Vide =
	// champ omis (compatibilité llama.cpp / services sans tâches typées).
	task string
	http *http.Client
}

func (c *httpEmbedClient) Embed(ctx context.Context, text string) ([]float32, error) {
	payload := map[string]any{
		"model": c.model,
		"input": text,
	}
	if c.task != "" {
		// Tâche de récupération (recherche), pas d'indexation.
		payload["task"] = c.task
	}
	body, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(
		ctx, http.MethodPost,
		strings.TrimSuffix(c.base, "/")+"/v1/embeddings",
		bytes.NewReader(body),
	)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("embedding service unreachable: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("embedding service status %d", resp.StatusCode)
	}

	var out struct {
		Data []struct {
			Embedding []float32 `json:"embedding"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, fmt.Errorf("embedding response decode: %w", err)
	}
	if len(out.Data) == 0 || len(out.Data[0].Embedding) == 0 {
		return nil, fmt.Errorf("embedding response vide")
	}
	return out.Data[0].Embedding, nil
}

// SemanticHit est un article retourné par la recherche sémantique.
type SemanticHit struct {
	ID            string  `json:"id"`
	Title         string  `json:"title"`
	Slug          string  `json:"slug"`
	IsPremium     bool    `json:"isPremium"`
	ReadingTime   int     `json:"readingTime"`
	CreatedAt     string  `json:"createdAt"`
	PublicationID string  `json:"publicationId"`
	AuthorID      string  `json:"authorId"`
	AuthorName    *string `json:"authorName"`
	AuthorLogo    *string `json:"authorLogo"`
	Publication   *string `json:"publicationName"`
	Score         float64 `json:"score"`
}

// Search vectorise la requête et retourne les articles les plus proches.
// Erreur sentinelle ErrNoEmbeddingService si l'inférence n'est pas branchée.
var ErrNoEmbeddingService = fmt.Errorf("service d'embedding non configuré")

func (s *SemanticService) Search(ctx context.Context, query string, limit int) ([]SemanticHit, error) {
	if os.Getenv("EMBEDDING_URL") == "" {
		return nil, ErrNoEmbeddingService
	}
	if limit <= 0 || limit > 50 {
		limit = 10
	}

	vec, err := s.embedder.Embed(ctx, query)
	if err != nil {
		return nil, err
	}
	// MRL : tronque à la dimension stockée (512) et refuse un vecteur trop court.
	dims := embeddingDims()
	if len(vec) < dims {
		return nil, fmt.Errorf("dimension %d < %d", len(vec), dims)
	}
	vec = vec[:dims]

	rows, err := s.q.SearchSemanticArticles(ctx, db.SearchSemanticArticlesParams{
		Column1: pgvector.NewVector(vec),
		Limit:   int32(limit),
	})
	if err != nil {
		return nil, err
	}

	out := make([]SemanticHit, 0, len(rows))
	for _, r := range rows {
		var authorName, authorLogo *string
		if r.AuthorName.Valid {
			v := r.AuthorName.String
			authorName = &v
		}
		if r.AuthorLogo.Valid {
			v := r.AuthorLogo.String
			authorLogo = &v
		}
		var pubName *string
		v := r.PublicationName
		pubName = &v
		out = append(out, SemanticHit{
			ID:            r.ID,
			Title:         r.Title,
			Slug:          r.Slug,
			IsPremium:     r.IsPremium,
			ReadingTime:   int(r.ReadingTime),
			CreatedAt:     r.CreatedAt.Time.Format(time.RFC3339),
			PublicationID: r.PublicationId,
			AuthorID:      uuidString(r.AuthorId),
			AuthorName:    authorName,
			AuthorLogo:    authorLogo,
			Publication:   pubName,
			Score:         r.Score,
		})
	}
	return out, nil
}
