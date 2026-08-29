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
	"strconv"
	"strings"
	"time"

	"github.com/hibiken/asynq"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pgvector/pgvector-go"
	db "github.com/qoefi/api/internal/database"
	"github.com/qoefi/api/internal/vectorfeed"
	"github.com/qoefi/api/internal/queue"
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
	// Tâche typée jina-embeddings-v3 (ex: "retrieval.passage" pour indexer).
	// VIDE = champ omis : requis pour llama.cpp (crash sur ce champ), et
	// compatible TEI qui retombe sur la tâche par défaut du modèle.
	envEmbeddingTask = "EMBEDDING_INDEX_TASK"
	// MRL (Matryoshka) : jina-embeddings-v3 peut être tronqué à 512 dims
	// avec une perte de qualité négligeable — la colonne est vector(512).
	envEmbeddingDims = "EMBEDDING_DIMS"
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

// embeddingDims retourne la dimension cible (MRL) : EMBEDDING_DIMS, défaut 512.
func (s *EmbeddingWorker) embeddingDims() int {
	d, _ := strconv.Atoi(os.Getenv(envEmbeddingDims))
	if d < 64 || d > 4096 {
		d = 512
	}
	return d
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
			task:  os.Getenv(envEmbeddingTask),
			http:  &http.Client{Timeout: 60 * time.Second},
		},
	}
}

// httpEmbedClient appelle le service d'inférence (API OpenAI-compatible).
type httpEmbedClient struct {
	base  string
	model string
	// task est la tâche jina-embeddings-v3 (retrieval.passage etc.). Vide =
	// champ omis (compatibilité llama.cpp / services sans tâches typées).
	task string
	http *http.Client
}

// embedURL accepte deux formes pour EMBEDDING_URL : une base
// (http://host:8081 → http://host:8081/v1/embeddings) ou l'URL complète
// déjà terminée par /v1/embeddings (celle de l'ancien embed-all.ts) — dans
// ce cas on ne ré-ajoute pas le suffixe.
func (c *httpEmbedClient) embedURL() string {
	base := strings.TrimSuffix(c.base, "/")
	if strings.HasSuffix(base, "/v1/embeddings") {
		return base
	}
	return base + "/v1/embeddings"
}

func (c *httpEmbedClient) Embed(ctx context.Context, text string) ([]float32, error) {
	payload := map[string]any{
		"model": c.model,
		"input": text,
	}
	if c.task != "" {
		// jina-embeddings-v3 : tâches typées (retrieval.passage pour indexer).
		payload["task"] = c.task
	}
	body, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(
		ctx, http.MethodPost,
		c.embedURL(),
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

	// MRL : tronque le vecteur à la dimension stockée (512) et refuse un
	// vecteur trop court — évite d'écrire un vecteur mal dimensionné.
	dims := s.embeddingDims()
	if len(vector) < dims {
		return fmt.Errorf("embed %s: dimension %d < %d (modèle inattendu)", p.ArticleID, len(vector), dims)
	}
	vector = vector[:dims]

	if err := s.q.UpsertArticleEmbedding(ctx, db.UpsertArticleEmbeddingParams{
		ID:        p.ArticleID,
		Embedding: pgvector.NewVector(vector),
	}); err != nil {
		return err
	}
	log.Printf("[embedding] article %s indexé (%d dims)", p.ArticleID, len(vector))
	return nil
}

// HandleUserEmbedding traite TaskUserEmbedding : embedding d'un user à
// partir de SON CONTENU publié (ses pensées), jamais de sa bio. En prod,
// le profil d'un user reflète ce qu'il publie/lit/like (construit par
// l'EMA vectorfeed), pas son autodescription — la bio n'est qu'une entrée
// de cold-start de démo (seed). Un user sans contenu reste sans vecteur
// (cold start) : le feed classique le sert par fraîcheur/engagement et les
// interactions construisent le vecteur au fil de l'eau. Idempotent ; skip
// propre si le service d'inférence n'est pas configuré.
func (s *EmbeddingWorker) HandleUserEmbedding(ctx context.Context, t *asynq.Task) error {
	var p queue.EmbeddingPayload
	if err := json.Unmarshal(t.Payload(), &p); err != nil {
		return err
	}
	if p.UserID == "" {
		return fmt.Errorf("userId manquant")
	}
	if os.Getenv(envEmbeddingURL) == "" {
		log.Printf("[embedding] EMBEDDING_URL non défini — skip %s", p.UserID)
		return nil
	}

	// Contenu publié de l'utilisateur (pensées racines + réponses), les plus
	// récentes d'abord, borné à 50 pour borner le coût d'inférence.
	rows, err := s.pool.Query(ctx, `
		SELECT content, tags
		FROM "Post"
		WHERE "authorId" = $1 AND "deletedAt" IS NULL
		  AND "isDraft" = false AND "isHiddenByAuthor" = false
		ORDER BY "createdAt" DESC
		LIMIT 50`, p.UserID)
	if err != nil {
		return err
	}
	var parts []string
	for rows.Next() {
		var content string
		var tags []string
		if err := rows.Scan(&content, &tags); err != nil {
			rows.Close()
			return err
		}
		content = strings.TrimSpace(content)
		if content == "" {
			continue
		}
		if len(tags) > 0 {
			content += "\n\nTags : " + strings.Join(tags, ", ")
		}
		parts = append(parts, content)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return err
	}
	rows.Close()
	if len(parts) == 0 {
		log.Printf("[embedding] user %s sans contenu publié — cold start (pas de vecteur)", p.UserID)
		return nil
	}

	// Même borne que les articles : le service local (llama.cpp) rejette les
	// entrées trop longues (>~2k chars, contexte court).
	text := strings.Join(parts, "\n\n")
	if len(text) > 1800 {
		text = text[:1800]
	}
	vector, err := s.embedder.Embed(ctx, text)
	if err != nil {
		return fmt.Errorf("embed user %s: %w", p.UserID, err)
	}
	dims := s.embeddingDims()
	if len(vector) < dims {
		return fmt.Errorf("embed user %s: dimension %d < %d", p.UserID, len(vector), dims)
	}
	vector = vector[:dims]

	if _, err := s.pool.Exec(ctx, `UPDATE "User" SET embedding = $2, "updatedAt" = now() WHERE id = $1`,
		p.UserID, pgvector.NewVector(vector)); err != nil {
		return err
	}
	log.Printf("[embedding] user %s indexé (%d dims, %d pensées)", p.UserID, len(vector), len(parts))
	return nil
}

// HandlePostEmbedding traite TaskPostEmbedding : embedding d'une pensée
// (contenu + tags) pour le feed « Pour vous » (ANN sur Post.embedding).
// Idempotent ; skip propre si le service d'inférence n'est pas configuré.
func (s *EmbeddingWorker) HandlePostEmbedding(ctx context.Context, t *asynq.Task) error {
	var p queue.EmbeddingPayload
	if err := json.Unmarshal(t.Payload(), &p); err != nil {
		return err
	}
	if p.PostID == "" {
		return fmt.Errorf("postId manquant")
	}
	if os.Getenv(envEmbeddingURL) == "" {
		log.Printf("[embedding] EMBEDDING_URL non défini — skip %s", p.PostID)
		return nil
	}

	post, err := s.q.GetPostForEmbedding(ctx, p.PostID)
	if err != nil {
		return err
	}

	// Contenu + tags, sans HTML. Les pensées sont courtes (≤500 car.) mais on
	// passe par normalizeForEmbedding pour la robustesse (balises, espaces).
	text := strings.TrimSpace(post.Content)
	if text == "" {
		return nil
	}
	if len(post.Tags) > 0 {
		text = text + "\n\nTags : " + strings.Join(post.Tags, ", ")
	}
	text = normalizeForEmbedding("", text)
	if strings.TrimSpace(text) == "" {
		return nil
	}

	vector, err := s.embedder.Embed(ctx, text)
	if err != nil {
		return fmt.Errorf("embed post %s: %w", p.PostID, err)
	}
	dims := s.embeddingDims()
	if len(vector) < dims {
		return fmt.Errorf("embed post %s: dimension %d < %d", p.PostID, len(vector), dims)
	}
	vector = vector[:dims]

	if err := s.q.UpsertPostEmbedding(ctx, db.UpsertPostEmbeddingParams{
		ID:        p.PostID,
		Embedding: pgvector.NewVector(vector),
	}); err != nil {
		return err
	}
	log.Printf("[embedding] post %s indexé (%d dims)", p.PostID, len(vector))

	// 🧠 EMA : l'auteur « est » ce qu'il publie — son vecteur se rapproche
	// du contenu qu'il a écrit (fire-and-forget).
	if post.AuthorId != "" {
		_ = vectorfeed.ApplyInteraction(ctx, s.pool, post.AuthorId, vector, vectorfeed.InteractionCreatePost)
	}
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
