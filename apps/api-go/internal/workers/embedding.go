// Package workers — handlers de tâches asynq (embedding IA jina-embeddings-v3).
package workers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"regexp"
	"strings"
	"time"

	"github.com/hibiken/asynq"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pgvector/pgvector-go"
	db "github.com/qoefi/api-go/internal/database"
	"github.com/qoefi/api-go/internal/queue"
)

// ---------------------------------------------------------------------
// Service d'inférence : text-embeddings-inference (Hugging Face) sert
// jina-embeddings-v3 avec une API compatible OpenAI (/v1/embeddings).
//   EMBEDDING_URL  : base du service (défaut http://localhost:8081)
//   EMBEDDING_MODEL: id du modèle (défaut jina-embeddings-v3)
// Le worker est tolérant à l'absence du service : si l'appel échoue, la
// tâche est retentée par asynq (MaxRetry) ; sans EMBEDDING_URL, on skip.
// ---------------------------------------------------------------------

const (
	envEmbeddingURL   = "EMBEDDING_URL"
	envEmbeddingModel = "EMBEDDING_MODEL"
)

var (
	htmlTagRe     = regexp.MustCompile(`<[^>]+>`)
	htmlSpaceRe   = regexp.MustCompile(`\s+`)
	htmlPaywallRe = regexp.MustCompile(`(?is)data-type="paywall-divider".*`)
)

// EmbeddingWorker génère et persiste les vecteurs sémantiques des articles.
type EmbeddingWorker struct {
	pool *pgxpool.Pool
	q    *db.Queries
	// embedder est l'implémentation HTTP ; overrideable en test.
	embedder embedClient
}

type embedClient interface {
	Embed(ctx context.Context, text string) ([]float32, error)
}

func NewEmbeddingWorker(pool *pgxpool.Pool) *EmbeddingWorker {
	return &EmbeddingWorker{
		pool: pool,
		q:    db.New(pool),
		embedder: &httpEmbedClient{
			base:  envOr(envEmbeddingURL, "http://localhost:8081"),
			model: envOr(envEmbeddingModel, "jina-embeddings-v3"),
			http:  &http.Client{Timeout: 60 * time.Second},
		},
	}
}

// httpEmbedClient appelle le service d'inférence (API OpenAI-compatible).
type httpEmbedClient struct {
	base  string
	model string
	http  *http.Client
}

func (c *httpEmbedClient) Embed(ctx context.Context, text string) ([]float32, error) {
	payload, _ := json.Marshal(map[string]any{
		"model": c.model,
		"input": text,
		// jina-embeddings-v3 : tâches typées (retrieval.passage pour indexer).
		"task": "retrieval.passage",
	})
	req, err := http.NewRequestWithContext(
		ctx, http.MethodPost,
		strings.TrimSuffix(c.base, "/")+"/v1/embeddings",
		bytes.NewReader(payload),
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

// HandleArticleEmbedding traite TaskArticleEmbedding : récupère l'article,
// normalise le texte (HTML → plain, tronqué au paywall), calcule le vecteur
// et le persiste. Idempotent : ré-embedder est sans danger.
func (s *EmbeddingWorker) HandleArticleEmbedding(ctx context.Context, t *asynq.Task) error {
	var p queue.EmbeddingPayload
	if err := json.Unmarshal(t.Payload(), &p); err != nil {
		return err
	}

	// Sans service d'inférence configuré, on skip proprement (pas de retry).
	if os.Getenv(envEmbeddingURL) == "" {
		log.Printf("[embedding] EMBEDDING_URL non défini — skip %s", p.ArticleID)
		return nil
	}

	article, err := s.q.GetArticleForSearch(ctx, p.ArticleID)
	if err != nil {
		return err
	}

	text := normalizeForEmbedding(article.Title, article.Content)
	if strings.TrimSpace(text) == "" {
		return nil
	}

	vector, err := s.embedder.Embed(ctx, text)
	if err != nil {
		// Erreur d'inférence → retry asynq (le service peut être down).
		return fmt.Errorf("embed %s: %w", p.ArticleID, err)
	}

	// Vérifie la dimension attendue (jina = 1024) — évite d'écrire un
	// vecteur mal dimensionné dans une colonne vector(1024).
	if len(vector) != 1024 {
		return fmt.Errorf("embed %s: dimension %d != 1024 (modèle inattendu)", p.ArticleID, len(vector))
	}

	if err := s.q.UpsertArticleEmbedding(ctx, db.UpsertArticleEmbeddingParams{
		ID:        p.ArticleID,
		Embedding: pgvector.NewVector(vector),
	}); err != nil {
		return err
	}
	log.Printf("[embedding] article %s indexé (%d dims)", p.ArticleID, len(vector))
	return nil
}

// normalizeForEmbedding produit un texte sémantique propre : titre + corps
// sans HTML, contenu premium retiré (aucun leak au-delà du paywall), espaces
// normalisés et longueur bornée (fenêtre contextuelle ~8k tokens).
func normalizeForEmbedding(title, contentHTML string) string {
	// Retire tout ce qui suit le marqueur paywall (jamais d'embedding du
	// contenu premium non acheté — la similarité ne doit pas le révéler).
	cut := htmlPaywallRe.Split(contentHTML, 2)[0]
	plain := htmlTagRe.ReplaceAllString(cut, " ")
	plain = htmlSpaceRe.ReplaceAllString(plain, " ")
	plain = strings.TrimSpace(plain)

	text := strings.TrimSpace(title)
	if plain != "" {
		text = text + "\n\n" + plain
	}
	// ~32k caractères ≈ 8k tokens — suffisant pour un article complet.
	const maxLen = 32000
	if len(text) > maxLen {
		text = text[:maxLen]
	}
	return text
}
