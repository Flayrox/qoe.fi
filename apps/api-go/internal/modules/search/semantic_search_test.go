package search

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	db "github.com/qoefi/api-go/internal/database"
)

// stubQuerier implémente semanticQuerier pour tester SemanticService.Search
// sans base de données. gotParams capture les paramètres reçus.
type stubQuerier struct {
	rows      []db.SearchSemanticArticlesRow
	err       error
	gotParams *db.SearchSemanticArticlesParams
}

func (m *stubQuerier) SearchSemanticArticles(_ context.Context, params db.SearchSemanticArticlesParams) ([]db.SearchSemanticArticlesRow, error) {
	if m.gotParams != nil {
		*m.gotParams = params
	}
	return m.rows, m.err
}

// newSearchService construit un SemanticService avec embedding activé
// (EMBEDDING_URL défini), un embedder stub et un querier stub.
func newSearchService(t *testing.T, embedVec []float32, embedErr error, q *stubQuerier) *SemanticService {
	t.Helper()
	t.Setenv("EMBEDDING_URL", "http://embedding:80")
	t.Setenv("EMBEDDING_DIMS", "512")
	return &SemanticService{
		q:        q,
		embedder: stubEmbedder{vec: embedVec, err: embedErr},
	}
}

func TestSearchLimitClamp(t *testing.T) {
	q := &stubQuerier{gotParams: &db.SearchSemanticArticlesParams{}}
	s := newSearchService(t, vec512(0, 1), nil, q)

	// limit <= 0 → 10
	if _, err := s.Search(context.Background(), "liberté", 0); err != nil {

		t.Fatalf("Search(0): %v", err)
	}
	if q.gotParams.Limit != 10 {
		t.Fatalf("Limit = %d, attendu 10 (limit=0)", q.gotParams.Limit)
	}
	// limit > 50 → 10
	if _, err := s.Search(context.Background(), "liberté", 100); err != nil {
		t.Fatalf("Search(100): %v", err)
	}
	if q.gotParams.Limit != 10 {
		t.Fatalf("Limit = %d, attendu 10 (limit=100)", q.gotParams.Limit)
	}
	// limit dans la plage → conservé
	if _, err := s.Search(context.Background(), "liberté", 5); err != nil {
		t.Fatalf("Search(5): %v", err)
	}
	if q.gotParams.Limit != 5 {
		t.Fatalf("Limit = %d, attendu 5", q.gotParams.Limit)
	}
}

func TestSearchEmbedderErrorPropagated(t *testing.T) {
	q := &stubQuerier{}
	s := newSearchService(t, nil, errors.New("inférence down"), q)

	_, err := s.Search(context.Background(), "liberté", 10)
	if err == nil || !strings.Contains(err.Error(), "inférence down") {
		t.Fatalf("err = %v, attendu erreur embedder propagée", err)
	}
}

func TestSearchVectorTooShort(t *testing.T) {
	q := &stubQuerier{}
	// 100 dims < 512 requis par MRL → erreur dimension.
	s := newSearchService(t, make([]float32, 100), nil, q)

	_, err := s.Search(context.Background(), "liberté", 10)
	if err == nil || !strings.Contains(err.Error(), "dimension 100 < 512") {
		t.Fatalf("err = %v, attendu erreur dimension", err)
	}
}

func TestSearchTruncatesVectorToDims(t *testing.T) {
	q := &stubQuerier{gotParams: &db.SearchSemanticArticlesParams{}}
	// 1024 dims retournées par l'inférence → tronquées à 512 (MRL).
	s := newSearchService(t, make([]float32, 1024), nil, q)

	if _, err := s.Search(context.Background(), "liberté", 10); err != nil {
		t.Fatalf("Search: %v", err)
	}
	if len(q.gotParams.Column1.Slice()) != 512 {
		t.Fatalf("vecteur envoyé en DB = %d dims, attendu 512", len(q.gotParams.Column1.Slice()))
	}
}

func TestSearchQueryErrorPropagated(t *testing.T) {
	q := &stubQuerier{err: errors.New("pg down")}
	s := newSearchService(t, vec512(0, 1), nil, q)

	_, err := s.Search(context.Background(), "liberté", 10)
	if err == nil || !strings.Contains(err.Error(), "pg down") {
		t.Fatalf("err = %v, attendu erreur requête propagée", err)
	}
}

// uuid16 construit un pgtype.UUID valide à partir d'octets.
func uuid16(b [16]byte) pgtype.UUID {
	return pgtype.UUID{Valid: true, Bytes: b}
}

func TestSearchMapsHits(t *testing.T) {
	created := time.Date(2026, 8, 19, 10, 30, 0, 0, time.UTC)
	row := db.SearchSemanticArticlesRow{
		ID:            "art_1",
		Title:         "Climat",
		Slug:          "climat",
		IsPremium:     true,
		ReadingTime:   4,
		CreatedAt:     pgtype.Timestamp{Valid: true, Time: created},
		PublicationId: "pub_1",
		AuthorId:      uuid16([16]byte{0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15}),
		AuthorName:    pgtype.Text{Valid: true, String: "Alice"},
		AuthorLogo:    pgtype.Text{Valid: true, String: "alice.png"},
		PublicationName: "Journal Test",
		Score:         0.87,
	}
	q := &stubQuerier{rows: []db.SearchSemanticArticlesRow{row}}
	s := newSearchService(t, vec512(0, 1), nil, q)

	items, err := s.Search(context.Background(), "liberté", 10)
	if err != nil {
		t.Fatalf("Search: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("items = %d, attendu 1", len(items))
	}
	it := items[0]
	if it.ID != "art_1" || it.Title != "Climat" || it.Slug != "climat" || !it.IsPremium {
		t.Fatalf("champs de base incorrects : %+v", it)
	}
	if it.ReadingTime != 4 {
		t.Fatalf("ReadingTime = %d, attendu 4", it.ReadingTime)
	}
	if it.CreatedAt != "2026-08-19T10:30:00Z" {
		t.Fatalf("CreatedAt = %q, attendu RFC3339 UTC", it.CreatedAt)
	}
	if it.PublicationID != "pub_1" {
		t.Fatalf("PublicationID = %q", it.PublicationID)
	}
	if it.AuthorID != "00010203-0405-0607-0809-0a0b0c0d0e0f" {
		t.Fatalf("AuthorID = %q, attendu forme canonique", it.AuthorID)
	}
	if it.AuthorName == nil || *it.AuthorName != "Alice" {
		t.Fatalf("AuthorName = %v, attendu *Alice", it.AuthorName)
	}
	if it.AuthorLogo == nil || *it.AuthorLogo != "alice.png" {
		t.Fatalf("AuthorLogo = %v, attendu *alice.png", it.AuthorLogo)
	}
	if it.Publication == nil || *it.Publication != "Journal Test" {
		t.Fatalf("Publication = %v, attendu *Journal Test", it.Publication)
	}
	if it.Score != 0.87 {
		t.Fatalf("Score = %v, attendu 0.87", it.Score)
	}
}

func TestSearchMapsNulls(t *testing.T) {
	row := db.SearchSemanticArticlesRow{
		ID: "art_2", Title: "Sans auteur", Slug: "sans-auteur",
		CreatedAt:     pgtype.Timestamp{Valid: true, Time: time.Now()},
		PublicationId: "pub_1",
		PublicationName: "Journal Test",
		// AuthorName / AuthorLogo invalides → pointeurs nil.
	}
	q := &stubQuerier{rows: []db.SearchSemanticArticlesRow{row}}
	s := newSearchService(t, vec512(0, 1), nil, q)

	items, err := s.Search(context.Background(), "liberté", 10)
	if err != nil {
		t.Fatalf("Search: %v", err)
	}
	it := items[0]
	if it.AuthorName != nil {
		t.Fatalf("AuthorName = %v, attendu nil", it.AuthorName)
	}
	if it.AuthorLogo != nil {
		t.Fatalf("AuthorLogo = %v, attendu nil", it.AuthorLogo)
	}
	if it.AuthorID != "" {
		t.Fatalf("AuthorID = %q, attendu vide (uuid invalide)", it.AuthorID)
	}
	if it.Publication == nil || *it.Publication != "Journal Test" {
		t.Fatalf("Publication = %v, attendu *Journal Test (string non null)", it.Publication)
	}
}
