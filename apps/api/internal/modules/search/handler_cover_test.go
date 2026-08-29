package search

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/meilisearch/meilisearch-go"
	db "github.com/qoefi/api/internal/database"
)

// ─── Fakes ───────────────────────────────────────────────────────────

type fakeQuerier struct {
	thoughts []db.SearchThoughtsRow
	thoughtsErr error
	semantic []db.SearchSemanticArticlesRow
	semanticErr error
}

func (f fakeQuerier) SearchThoughts(_ context.Context, _ db.SearchThoughtsParams) ([]db.SearchThoughtsRow, error) {
	return f.thoughts, f.thoughtsErr
}

func (f fakeQuerier) SearchSemanticArticles(_ context.Context, _ db.SearchSemanticArticlesParams) ([]db.SearchSemanticArticlesRow, error) {
	return f.semantic, f.semanticErr
}

type fakeEmbedder struct {
	vec []float32
	err error
}

func (f fakeEmbedder) Embed(_ context.Context, _ string) ([]float32, error) {
	return f.vec, f.err
}

// ─── searchThoughts ──────────────────────────────────────────────────

func doThoughts(h *Handler, query string) *httptest.ResponseRecorder {
	r := chi.NewRouter()
	h.RegisterPublic(r)
	req := httptest.NewRequest(http.MethodGet, "/search/thoughts?q="+query, nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func TestSearchThoughtsEmptyQuery(t *testing.T) {
	h := &Handler{semantic: &SemanticService{}}
	w := doThoughts(h, "")
	if w.Code != http.StatusOK {
		t.Fatalf("code = %d, attendu 200", w.Code)
	}
	if !strings.Contains(w.Body.String(), `"thoughts":[]`) {
		t.Fatalf("body = %s, attendu thoughts:[]", w.Body.String())
	}
}

func TestSearchThoughtsTooLong(t *testing.T) {
	h := &Handler{semantic: &SemanticService{}}
	w := doThoughts(h, strings.Repeat("a", maxSearchQueryLength+1))
	if w.Code != http.StatusBadRequest {
		t.Fatalf("code = %d, attendu 400", w.Code)
	}
}

func TestSearchThoughtsHits(t *testing.T) {
	row := db.SearchThoughtsRow{
		ID:          "post_1",
		Content:     "Pensée foot",
		Tags:        []string{"foot"},
		ImageUrl:    pgtype.Text{String: "https://img/x.jpg", Valid: true},
		CreatedAt:   pgtype.Timestamp{Time: time.Date(2026, 8, 1, 12, 0, 0, 0, time.UTC), Valid: true},
		AuthorID:    "user_1",
		AuthorName:  pgtype.Text{String: "Alice", Valid: true},
		AuthorUsername: pgtype.Text{String: "alice", Valid: true},
		AuthorLogo:  pgtype.Text{String: "https://img/logo.png", Valid: true},
		AuthorCertified: true,
		LikeCount:   12,
		RepostCount: 3,
		ReplyCount:  1,
	}
	h := &Handler{semantic: &SemanticService{q: fakeQuerier{thoughts: []db.SearchThoughtsRow{row}}}}
	w := doThoughts(h, "#foot")
	if w.Code != http.StatusOK {
		t.Fatalf("code = %d, attendu 200", w.Code)
	}
	var out struct {
		Thoughts []ThoughtHit `json:"thoughts"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
		t.Fatalf("json invalide: %v", err)
	}
	if len(out.Thoughts) != 1 {
		t.Fatalf("thoughts = %d, attendu 1", len(out.Thoughts))
	}
	th := out.Thoughts[0]
	if th.ID != "post_1" || th.AuthorUser == nil || *th.AuthorUser != "alice" || !th.IsCertified {
		t.Fatalf("thought = %+v, attendu post_1/alice/certified", th)
	}
	if th.ImageURL == nil || th.LikeCount != 12 {
		t.Fatalf("image/likes = %v/%d", th.ImageURL, th.LikeCount)
	}
}

func TestSearchThoughtsNullFields(t *testing.T) {
	row := db.SearchThoughtsRow{
		ID:        "post_2",
		Content:   "Pensée nue",
		Tags:      []string{},
		CreatedAt: pgtype.Timestamp{Time: time.Now(), Valid: true},
		AuthorID:  "user_2",
	}
	h := &Handler{semantic: &SemanticService{q: fakeQuerier{thoughts: []db.SearchThoughtsRow{row}}}}
	w := doThoughts(h, "pensée")
	if w.Code != http.StatusOK {
		t.Fatalf("code = %d, attendu 200", w.Code)
	}
	var out struct {
		Thoughts []ThoughtHit `json:"thoughts"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
		t.Fatalf("json invalide: %v", err)
	}
	if len(out.Thoughts) != 1 || out.Thoughts[0].ImageURL != nil || out.Thoughts[0].AuthorName != nil {
		t.Fatalf("thought = %+v, attendu champs null", out.Thoughts[0])
	}
}

func TestSearchThoughtsError(t *testing.T) {
	h := &Handler{semantic: &SemanticService{q: fakeQuerier{thoughtsErr: errors.New("db down")}}}
	w := doThoughts(h, "foot")
	if w.Code != http.StatusInternalServerError {
		t.Fatalf("code = %d, attendu 500", w.Code)
	}
}

func TestSearchThoughtsLimitBounds(t *testing.T) {
	// limit > 50 → clampé à 20 ; limit invalide → 20.
	for _, q := range []string{"foot&limit=99", "foot&limit=abc"} {
		h := &Handler{semantic: &SemanticService{q: fakeQuerier{}}}
		w := doThoughts(h, q)
		if w.Code != http.StatusOK {
			t.Fatalf("code = %d, attendu 200 (%s)", w.Code, q)
		}
	}
}

// ─── searchSemantic ──────────────────────────────────────────────────

func doSemantic(h *Handler, query string) *httptest.ResponseRecorder {
	r := chi.NewRouter()
	h.RegisterPublic(r)
	req := httptest.NewRequest(http.MethodGet, "/search/semantic?q="+query, nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func TestSearchSemanticSuccess(t *testing.T) {
	t.Setenv("EMBEDDING_URL", "http://embed:8081")
	t.Setenv("EMBEDDING_DIMS", "")
	vec := make([]float32, 512)
	row := db.SearchSemanticArticlesRow{
		ID:              "art_1",
		Title:           "Climat",
		Slug:            "climat",
		IsPremium:       true,
		ReadingTime:     4,
		CreatedAt:       pgtype.Timestamp{Time: time.Now(), Valid: true},
		PublicationId:   "pub_1",
		AuthorId:        pgtype.UUID{Valid: true, Bytes: [16]byte{0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15}},
		AuthorName:      pgtype.Text{String: "Alice", Valid: true},
		AuthorLogo:      pgtype.Text{String: "https://img/logo.png", Valid: true},
		PublicationName: "Le Monde",
		Score:           0.87,
	}
	h := &Handler{semantic: &SemanticService{
		embedder: fakeEmbedder{vec: vec},
		q:        fakeQuerier{semantic: []db.SearchSemanticArticlesRow{row}},
	}}
	w := doSemantic(h, "climat")
	if w.Code != http.StatusOK {
		t.Fatalf("code = %d, attendu 200 (body %s)", w.Code, w.Body.String())
	}
	var out struct {
		Items []SemanticHit `json:"items"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
		t.Fatalf("json invalide: %v", err)
	}
	if len(out.Items) != 1 || out.Items[0].ID != "art_1" || out.Items[0].Score != 0.87 {
		t.Fatalf("items = %+v", out.Items)
	}
	if out.Items[0].AuthorName == nil || *out.Items[0].AuthorName != "Alice" {
		t.Fatalf("authorName = %v", out.Items[0].AuthorName)
	}
}

func TestSearchSemanticEmbedderErrorHandler(t *testing.T) {
	t.Setenv("EMBEDDING_URL", "http://embed:8081")
	h := &Handler{semantic: &SemanticService{embedder: fakeEmbedder{err: errors.New("inference down")}}}
	w := doSemantic(h, "climat")
	if w.Code != http.StatusInternalServerError {
		t.Fatalf("code = %d, attendu 500", w.Code)
	}
}

// ─── searchArticles branches manquantes ──────────────────────────────

func TestSearchArticlesTooLong(t *testing.T) {
	h := &Handler{searcher: stubSearcher{}}
	w := doSearch(h, strings.Repeat("a", maxSearchQueryLength+1))
	if w.Code != http.StatusBadRequest {
		t.Fatalf("code = %d, attendu 400", w.Code)
	}
}

// captureSearcher mémorise la requête transmise à Meilisearch.
type captureSearcher struct {
	lastReq *meilisearch.SearchRequest
}

func (c *captureSearcher) Search(_ string, req *meilisearch.SearchRequest) (*meilisearch.SearchResponse, error) {
	c.lastReq = req
	return &meilisearch.SearchResponse{Hits: nil, EstimatedTotalHits: 0}, nil
}

func TestSearchArticlesPublicationFilter(t *testing.T) {
	c := &captureSearcher{}
	h := &Handler{searcher: c}
	r := chi.NewRouter()
	h.RegisterPublic(r)
	req := httptest.NewRequest(http.MethodGet, "/search/articles?q=foot&publicationId=pub'1", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("code = %d, attendu 200", w.Code)
	}
	if c.lastReq == nil || c.lastReq.Filter == nil {
		t.Fatalf("filter attendu, req = %+v", c.lastReq)
	}
	want := "publicationId = 'pub''1'"
	if c.lastReq.Filter != want {
		t.Fatalf("filter = %v, attendu %q", c.lastReq.Filter, want)
	}
	// hits nil → sérialisé en [] et non null.
	if !strings.Contains(w.Body.String(), `"hits":[]`) {
		t.Fatalf("body = %s, attendu hits:[]", w.Body.String())
	}
}

// ─── meiliSearcher (vrai client, serveur HTTP factice) ───────────────

func TestMeiliSearcherSearch(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/indexes/articles/search" {
			t.Errorf("requête inattendue: %s %s", r.Method, r.URL.Path)
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"hits":[{"id":"art_1"}],"estimatedTotalHits":7}`))
	}))
	defer srv.Close()

	m := meiliSearcher{client: meilisearch.New(srv.URL, meilisearch.WithAPIKey("test"))}
	resp, err := m.Search("climat", &meilisearch.SearchRequest{Limit: 10})
	if err != nil {
		t.Fatalf("Search: %v", err)
	}
	if resp.EstimatedTotalHits != 7 || len(resp.Hits) != 1 {
		t.Fatalf("resp = %+v", resp)
	}
}

func TestMeiliSearcherSearchError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "down", http.StatusBadGateway)
	}))
	defer srv.Close()

	m := meiliSearcher{client: meilisearch.New(srv.URL, meilisearch.WithAPIKey("test"))}
	if _, err := m.Search("climat", nil); err == nil {
		t.Fatal("attendu une erreur HTTP")
	}
}

// ─── SemanticService.Search via fakes (sans DB) ──────────────────────

func TestSemanticSearchFakePath(t *testing.T) {
	t.Setenv("EMBEDDING_URL", "http://embed:8081")
	t.Setenv("EMBEDDING_DIMS", "")
	row := db.SearchSemanticArticlesRow{
		ID:              "art_9",
		Title:           "Gaming",
		Slug:            "gaming",
		CreatedAt:       pgtype.Timestamp{Time: time.Now(), Valid: true},
		PublicationId:   "pub_9",
		PublicationName: "GamePub",
		Score:           0.5,
	}
	svc := &SemanticService{
		embedder: fakeEmbedder{vec: make([]float32, 512)},
		q:        fakeQuerier{semantic: []db.SearchSemanticArticlesRow{row}},
	}
	items, err := svc.Search(context.Background(), "gaming", 10)
	if err != nil {
		t.Fatalf("Search: %v", err)
	}
	if len(items) != 1 || items[0].ID != "art_9" || items[0].Publication == nil {
		t.Fatalf("items = %+v", items)
	}
	// Vector trop court → erreur (dimension < 512).
	svc2 := &SemanticService{embedder: fakeEmbedder{vec: make([]float32, 8)}, q: fakeQuerier{}}
	if _, err := svc2.Search(context.Background(), "x", 10); err == nil {
		t.Fatal("attendu erreur de dimension")
	}
	// Erreur du queryer → propagation.
	svc3 := &SemanticService{embedder: fakeEmbedder{vec: make([]float32, 512)}, q: fakeQuerier{semanticErr: fmt.Errorf("db")}}
	if _, err := svc3.Search(context.Background(), "x", 10); err == nil {
		t.Fatal("attendu erreur db")
	}
}
