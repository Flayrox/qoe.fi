// Package workers — handlers de tâches asynq (embedding IA jina-embeddings-v3).
package workers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"html"
	"log"
	"net/http"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/hibiken/asynq"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pgvector/pgvector-go"
	db "github.com/qoefi/api/internal/database"
	"github.com/qoefi/api/internal/queue"
	"github.com/qoefi/api/internal/vectorfeed"
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

	// Bornes de découpage UTF-8 et de chunking pour les services d'inférence
	// (passe sous la limite -ub 512 de llama.cpp et TEI).
	maxArticleBytes   = 64000
	chunkMaxBytes     = 1500
	chunkOverlapBytes = 200
	maxArticleChunks  = 32
)

var (
	htmlBlockBreakRe   = regexp.MustCompile(`(?i)</(?:p|h[1-6]|li|blockquote|div)\s*>|<br\s*/?>`)
	htmlTagRe          = regexp.MustCompile(`<[^>]+>|<[^>]*$`)
	htmlHorizSpaceRe   = regexp.MustCompile(`[^\S\n]+`)
	htmlLineSpaceRe    = regexp.MustCompile(` *\n *`)
	htmlMultiNewlineRe = regexp.MustCompile(`\n{2,}`)
	htmlPaywallRe      = regexp.MustCompile(`(?is)data-type="paywall-divider".*`)
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

// embedChunks vectorise une liste de chunks, tronque chaque vecteur à la
// dimension cible (MRL), normalise L2 chaque chunk, combine les vecteurs par
// mean-pooling pondéré par longueur (bonus 1.5x sur le premier chunk qui
// porte le titre et le chapô) et normalise L2 le vecteur final.
func (s *EmbeddingWorker) embedChunks(ctx context.Context, label string, chunks []string) ([]float32, error) {
	dims := s.embeddingDims()
	pooled := make([]float64, dims)
	var totalWeight float64

	for i, chunk := range chunks {
		vec, err := s.embedder.Embed(ctx, chunk)
		if err != nil {
			return nil, fmt.Errorf("embed %s: %w", label, err)
		}
		if len(vec) < dims {
			return nil, fmt.Errorf("embed %s: dimension %d < %d (modèle inattendu)", label, len(vec), dims)
		}
		vec = vectorfeed.Normalize(vec[:dims])

		w := float64(len(chunk))
		if i == 0 {
			w *= 1.5
		}
		for d := 0; d < dims; d++ {
			pooled[d] += w * float64(vec[d])
		}
		totalWeight += w
	}

	out := make([]float32, dims)
	if totalWeight > 0 {
		for d := 0; d < dims; d++ {
			out[d] = float32(pooled[d] / totalWeight)
		}
	}
	return vectorfeed.Normalize(out), nil
}

// HandleArticleEmbedding traite TaskArticleEmbedding : récupère l'article,
// découpe le texte en chunks UTF-8 (HTML → plain, tronqué au paywall), calcule
// le vecteur par mean-pooling pondéré + normalisation L2 et le persiste.
// Idempotent : ré-embedder est sans danger.
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

	chunks := chunkArticleForEmbedding(article.Title, article.Content)
	if len(chunks) == 0 {
		return nil
	}

	finalVec, err := s.embedChunks(ctx, p.ArticleID, chunks)
	if err != nil {
		// Erreur d'inférence → retry asynq (le service peut être down).
		return err
	}

	if err := s.q.UpsertArticleEmbedding(ctx, db.UpsertArticleEmbeddingParams{
		ID:        p.ArticleID,
		Embedding: pgvector.NewVector(finalVec),
	}); err != nil {
		return err
	}
	log.Printf("[embedding] article %s indexé (%d dims, %d chunks)", p.ArticleID, len(finalVec), len(chunks))
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

	// Même borne que les chunks d'articles : le service local (llama.cpp)
	// rejette les entrées trop longues, troncature propre sur frontière UTF-8.
	text := truncateUTF8(strings.Join(parts, "\n\n"), chunkMaxBytes)
	vector, err := s.embedder.Embed(ctx, text)
	if err != nil {
		return fmt.Errorf("embed user %s: %w", p.UserID, err)
	}
	dims := s.embeddingDims()
	if len(vector) < dims {
		return fmt.Errorf("embed user %s: dimension %d < %d", p.UserID, len(vector), dims)
	}
	vector = vectorfeed.Normalize(vector[:dims])

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
	// passe par chunkArticleForEmbedding pour gérer proprement les posts longs.
	text := strings.TrimSpace(post.Content)
	if text == "" {
		return nil
	}
	if len(post.Tags) > 0 {
		text = text + "\n\nTags : " + strings.Join(post.Tags, ", ")
	}
	chunks := chunkArticleForEmbedding("", text)
	if len(chunks) == 0 {
		return nil
	}

	vector, err := s.embedChunks(ctx, "post "+p.PostID, chunks)
	if err != nil {
		return err
	}

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

// truncateUTF8 tronque une chaîne à au plus maxBytes octets sans jamais couper
// au milieu d'une rune UTF-8 multi-octets.
func truncateUTF8(s string, maxBytes int) string {
	if maxBytes <= 0 {
		return ""
	}
	if len(s) <= maxBytes {
		return s
	}
	for maxBytes > 0 && !utf8.RuneStart(s[maxBytes]) {
		maxBytes--
	}
	return s[:maxBytes]
}

// normalizeBodyForEmbedding nettoie un fragment HTML : coupe au marqueur
// paywall, convertit les balises de bloc en doubles sauts de ligne, retire les
// balises restantes, décode les entités HTML et compresse les espaces
// horizontaux tout en préservant les frontières de paragraphes ("\n\n").
func normalizeBodyForEmbedding(contentHTML string) string {
	cut := htmlPaywallRe.Split(contentHTML, 2)[0]
	withBreaks := htmlBlockBreakRe.ReplaceAllString(cut, "\n\n")
	plain := htmlTagRe.ReplaceAllString(withBreaks, " ")
	plain = html.UnescapeString(plain)
	plain = htmlHorizSpaceRe.ReplaceAllString(plain, " ")
	plain = htmlLineSpaceRe.ReplaceAllString(plain, "\n")
	plain = htmlMultiNewlineRe.ReplaceAllString(plain, "\n\n")
	plain = strings.TrimSpace(plain)
	return truncateUTF8(plain, maxArticleBytes)
}

// normalizeForEmbedding produit un texte sémantique propre : titre + corps
// sans HTML, contenu premium retiré (aucun leak au-delà du paywall), espaces
// horizontaux normalisés avec préservation des paragraphes ("\n\n") et
// troncature UTF-8 propre à maxArticleBytes.
func normalizeForEmbedding(title, contentHTML string) string {
	cleanTitle := normalizeBodyForEmbedding(title)
	plain := normalizeBodyForEmbedding(contentHTML)

	text := cleanTitle
	if plain != "" {
		if text != "" {
			text = text + "\n\n" + plain
		} else {
			text = plain
		}
	}
	return truncateUTF8(text, maxArticleBytes)
}

// chunkArticleForEmbedding découpe un article (titre + HTML) en segments UTF-8
// valides de taille <= chunkMaxBytes (1500 octets) avec recouvrement
// (chunkOverlapBytes = 200) et rappel du titre en tête de chaque chunk.
func chunkArticleForEmbedding(title, contentHTML string) []string {
	cleanTitle := strings.TrimSpace(truncateUTF8(normalizeBodyForEmbedding(title), chunkMaxBytes/3))
	body := normalizeBodyForEmbedding(contentHTML)

	fullText := cleanTitle
	if body != "" {
		if fullText != "" {
			fullText = fullText + "\n\n" + body
		} else {
			fullText = body
		}
	}
	if strings.TrimSpace(fullText) == "" {
		return nil
	}
	if len(fullText) <= chunkMaxBytes {
		return []string{fullText}
	}

	prefix := ""
	if cleanTitle != "" {
		prefix = cleanTitle + "\n\n"
	}
	avail := chunkMaxBytes - len(prefix)
	if avail <= chunkOverlapBytes {
		avail = chunkMaxBytes
		prefix = ""
	}

	var chunks []string
	start := 0
	for start < len(body) && len(chunks) < maxArticleChunks {
		for start < len(body) && (body[start] == ' ' || body[start] == '\n' || body[start] == '\t' || body[start] == '\r') {
			start++
		}
		if start >= len(body) {
			break
		}

		rem := body[start:]
		if len(rem) <= avail {
			seg := strings.TrimSpace(rem)
			if seg != "" {
				chunks = append(chunks, prefix+seg)
			}
			break
		}

		cutRel := findChunkCut(rem, avail)
		seg := strings.TrimSpace(rem[:cutRel])
		if seg != "" {
			chunks = append(chunks, prefix+seg)
		}

		end := start + cutRel
		nextStart := end - chunkOverlapBytes
		if nextStart <= start {
			nextStart = end
		} else {
			for nextStart < end && !utf8.RuneStart(body[nextStart]) {
				nextStart++
			}
			if sp := strings.IndexAny(body[nextStart:end], " \n\t"); sp >= 0 && nextStart+sp+1 < end {
				nextStart += sp + 1
			}
			if nextStart <= start {
				nextStart = end
			}
		}
		start = nextStart
	}

	return chunks
}

// findChunkCut cherche le meilleur point de coupure dans rem[:avail] en
// reculant depuis la limite max : double saut de ligne ("\n\n"), saut de ligne
// ("\n"), fin de phrase (". ", "! ", "? "), espace (" "), ou frontière UTF-8.
func findChunkCut(rem string, avail int) int {
	window := truncateUTF8(rem, avail)
	if len(window) == 0 {
		return avail
	}
	minCut := len(window) / 3
	if minCut <= chunkOverlapBytes {
		minCut = chunkOverlapBytes + 1
	}
	if minCut > len(window) {
		minCut = len(window) / 2
	}

	if idx := strings.LastIndex(window, "\n\n"); idx >= minCut {
		return idx
	}
	if idx := strings.LastIndex(window, "\n"); idx >= minCut {
		return idx
	}
	bestSent := -1
	for _, sep := range []string{". ", "! ", "? "} {
		if idx := strings.LastIndex(window, sep); idx > bestSent {
			bestSent = idx
		}
	}
	if bestSent >= minCut {
		return bestSent + 1
	}
	if idx := strings.LastIndex(window, " "); idx >= minCut {
		return idx
	}
	return len(window)
}
