package search

import (
	"context"
	"fmt"
	"log"
	"os"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pgvector/pgvector-go"
	db "github.com/qoefi/api-go/internal/database"
	"github.com/qoefi/api-go/internal/testutil"
)

// poolTest est le pool Postgres de test (Testcontainers, pgvector, vector 512).
var poolTest *pgxpool.Pool

func TestMain(m *testing.M) {
	p, err := testutil.Pool(context.Background())
	if err != nil {
		log.Fatalf("testcontainers: %v", err)
	}
	poolTest = p
	code := m.Run()
	testutil.Cleanup()
	os.Exit(code)
}

// stubEmbedder implémente embedClient : retourne un vecteur fixe.
type stubEmbedder struct {
	vec []float32
	err error
}

func (s stubEmbedder) Embed(_ context.Context, _ string) ([]float32, error) {
	return s.vec, s.err
}

// vec512 construit un vecteur de 512 dimensions avec une signature donnée :
// toutes les valeurs valent `fill`, sauf l'index `signatureIndex` qui vaut 1.
// Deux vecteurs avec des indices différents sont très éloignés en cosinus.
func vec512(signatureIndex int, fill float32) []float32 {
	v := make([]float32, 512)
	for i := range v {
		v[i] = fill
	}
	v[signatureIndex] = 1
	return v
}

// seedSearchArticles rejoue le seed d'articles puis fixe des embeddings :
//   - premier-article (publié)  : signature 0
//   - article-payant (publié)   : signature 1
//   - recette-pates (publié)    : signature 2
//   - brouillon (non publié)    : embedding NULL (jamais indexé)
func seedSearchArticles(t *testing.T) *testutil.Fixtures {
	t.Helper()
	fx, err := testutil.SeedArticles(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}

	// Le seed insère les articles avec les slugs dans l'ordre :
	// art_test_000 = premier-article, _001 = article-payant, _002 = recette-pates.
	embeddings := map[string]int{
		"art_test_000": 0,
		"art_test_001": 1,
		"art_test_002": 2,
	}
	q := db.New(poolTest)
	for id, idx := range embeddings {
		if err := q.UpsertArticleEmbedding(context.Background(), db.UpsertArticleEmbeddingParams{
			ID:        id,
			Embedding: pgvector.NewVector(vec512(idx, 0.01)),
		}); err != nil {
			t.Fatalf("upsert embedding %s: %v", id, err)
		}
	}
	return fx
}

func TestSearchSemanticRanksBySimilarity(t *testing.T) {
	fx := seedSearchArticles(t)
	_ = fx

	// EMBEDDING_URL doit être non vide pour passer la garde de Search
	// (l'embedder est un stub, aucun appel réseau n'est fait).
	t.Setenv("EMBEDDING_URL", "http://localhost:8081")
	t.Setenv("EMBEDDING_DIMS", "512")

	s := &SemanticService{
		pool:     poolTest,
		q:        db.New(poolTest),
		embedder: stubEmbedder{vec: vec512(1, 0.01)}, // proche de article-payant
	}

	hits, err := s.Search(context.Background(), "requête quelconque", 10)
	if err != nil {
		t.Fatalf("Search: %v", err)
	}
	if len(hits) != 3 {
		t.Fatalf("len(hits) = %d, attendu 3 (brouillon exclu)", len(hits))
	}
	// Le plus proche (même signature) doit être premier.
	if hits[0].Slug != "article-payant" {
		t.Fatalf("hits[0] = %q, attendu article-payant (classement %v)", hits[0].Slug, slugsOf(hits))
	}
	// Ordre décroissant des scores.
	for i := 1; i < len(hits); i++ {
		if hits[i].Score > hits[i-1].Score {
			t.Fatalf("scores non décroissants: %v > %v (index %d)", hits[i].Score, hits[i-1].Score, i)
		}
	}
	// Métadonnées embarquées.
	if hits[0].AuthorName == nil || *hits[0].AuthorName != "Auteur Test" {
		t.Fatalf("authorName = %v, attendu Auteur Test", hits[0].AuthorName)
	}
	if hits[0].Publication == nil || *hits[0].Publication != "Journal Test" {
		t.Fatalf("publication = %v, attendu Journal Test", hits[0].Publication)
	}
	if hits[0].AuthorID == "" {
		t.Fatal("authorId doit être formaté (uuidString)")
	}
}

func TestSearchSemanticLimitClamp(t *testing.T) {
	seedSearchArticles(t)
	t.Setenv("EMBEDDING_URL", "http://localhost:8081")
	t.Setenv("EMBEDDING_DIMS", "512")

	s := &SemanticService{
		pool:     poolTest,
		q:        db.New(poolTest),
		embedder: stubEmbedder{vec: vec512(0, 0.01)},
	}

	// limit <= 0 → clampé à 10 (3 résultats disponibles, pas d'erreur).
	hits, err := s.Search(context.Background(), "x", 0)
	if err != nil {
		t.Fatalf("Search(limit=0): %v", err)
	}
	if len(hits) != 3 {
		t.Fatalf("len(hits) = %d, attendu 3", len(hits))
	}

	// limit > 50 → clampé à 10.
	hits, err = s.Search(context.Background(), "x", 999)
	if err != nil {
		t.Fatalf("Search(limit=999): %v", err)
	}
	if len(hits) != 3 {
		t.Fatalf("len(hits) = %d, attendu 3", len(hits))
	}

	// limit normal respecté.
	hits, err = s.Search(context.Background(), "x", 2)
	if err != nil {
		t.Fatalf("Search(limit=2): %v", err)
	}
	if len(hits) != 2 {
		t.Fatalf("len(hits) = %d, attendu 2", len(hits))
	}
}

func TestSearchSemanticShortVector(t *testing.T) {
	seedSearchArticles(t)
	t.Setenv("EMBEDDING_URL", "http://localhost:8081")
	t.Setenv("EMBEDDING_DIMS", "512")

	// Vecteur trop court (128 < 512) → erreur de dimension, pas de requête.
	s := &SemanticService{
		pool:     poolTest,
		q:        db.New(poolTest),
		embedder: stubEmbedder{vec: make([]float32, 128)},
	}
	_, err := s.Search(context.Background(), "x", 10)
	if err == nil {
		t.Fatal("Search doit échouer sur un vecteur de 128 dims (< 512)")
	}
	if !fmtErrContains(err, "128") {
		t.Fatalf("err = %v, attendu mention de la dimension", err)
	}
}

func TestSearchSemanticEmbedderError(t *testing.T) {
	seedSearchArticles(t)
	t.Setenv("EMBEDDING_URL", "http://localhost:8081")
	t.Setenv("EMBEDDING_DIMS", "512")

	s := &SemanticService{
		pool:     poolTest,
		q:        db.New(poolTest),
		embedder: stubEmbedder{err: fmt.Errorf("service d'inférence down")},
	}
	if _, err := s.Search(context.Background(), "x", 10); err == nil {
		t.Fatal("Search doit propager l'erreur de l'embedder")
	}
}

func slugsOf(hits []SemanticHit) []string {
	out := make([]string, 0, len(hits))
	for _, h := range hits {
		out = append(out, h.Slug)
	}
	return out
}

func fmtErrContains(err error, sub string) bool {
	return err != nil && strings.Contains(err.Error(), sub)
}
