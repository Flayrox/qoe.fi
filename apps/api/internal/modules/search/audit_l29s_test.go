package search

// Tests du lot d'audit L29s : chaque cas reproduit un défaut constaté sur le
// code d'avant correction (worktree à HEAD) et doit y échouer.

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/meilisearch/meilisearch-go"
	"github.com/pgvector/pgvector-go"
	db "github.com/qoefi/api/internal/database"
)

func closedPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	requirePool(t)
	cfg := poolTest.Config().Copy()
	p, err := pgxpool.NewWithConfig(context.Background(), cfg)
	if err != nil {
		t.Fatalf("pool jetable: %v", err)
	}
	p.Close()
	return p
}

func hitWithPublisher(pubID string) meilisearch.Hits {
	return meilisearch.Hits{
		{"id": json.RawMessage(`"art_1"`), "publisherId": json.RawMessage(`"` + pubID + `"`)},
	}
}

// F670 : une requête composée uniquement d'espaces n'était pas vide pour le
// handler — elle partait au moteur (ou au SQL) et renvoyait le corpus entier.
func TestAuditL29S_WhitespaceQueryReturnsNothing(t *testing.T) {
	t.Setenv("EMBEDDING_URL", "http://localhost:8081")
	t.Setenv("EMBEDDING_DIMS", "512")

	articles := &Handler{searcher: stubSearcher{resp: &meilisearch.SearchResponse{Hits: hitWithPublisher("pub_x")}}}
	w := doSearchURL(articles, "/search/articles?q=%20%20%20")
	if w.Code != http.StatusOK {
		t.Fatalf("articles = %d", w.Code)
	}
	var body struct {
		Hits meilisearch.Hits `json:"hits"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("json: %v", err)
	}
	if len(body.Hits) != 0 {
		t.Fatalf("q=%q renvoie %d hits : une requête d'espaces sert tout le corpus", "   ", len(body.Hits))
	}

	thoughts := &Handler{semantic: &SemanticService{q: fakeQuerier{thoughts: []db.SearchThoughtsRow{{ID: "p_l29s"}}}}}
	w = doThoughtsQuery(thoughts, "q=%20%20")
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"thoughts":[]`) {
		t.Fatalf("thoughts q=espaces = %d %s", w.Code, w.Body.String())
	}

	semantic := &Handler{semantic: &SemanticService{
		q:        fakeQuerier{semantic: []db.SearchSemanticArticlesRow{{ID: "art_l29s"}}},
		embedder: fakeEmbedder{vec: vec512(0, 0.01)},
	}}
	w = doSearchURL(semantic, "/search/semantic?q=%20%20")
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"items":[]`) {
		t.Fatalf("semantic q=espaces = %d %s", w.Code, w.Body.String())
	}
}

// F671 : une panne de la base de visibilité renvoyait les hits NON filtrés
// (comptes privés, blocages) en 200.
func TestAuditL29S_VisibilityFilterFailsClosed(t *testing.T) {
	h := &Handler{
		searcher: stubSearcher{resp: &meilisearch.SearchResponse{Hits: hitWithPublisher("pub_wh_001")}},
		pool:     closedPool(t),
	}
	w := doSearchURL(h, "/search/articles?q=climat")
	if w.Code != http.StatusInternalServerError {
		t.Fatalf("panne du filtre de visibilité = %d (%s), attendu 500", w.Code, w.Body.String())
	}
}

// F672 : la recherche sémantique ne filtrait ni les comptes privés ni les
// blocages — elle servait les articles d'un compte privé à tout le monde.
func TestAuditL29S_SemanticSearchRespectsPrivateAccounts(t *testing.T) {
	fx := seedSearchArticles(t)
	ctx := context.Background()
	if _, err := poolTest.Exec(ctx, `
		INSERT INTO "UserSettings" (id, "userId", "profileVisibility", "updatedAt")
		VALUES ('us_l29s', $1::uuid, 'PRIVATE', now())
		ON CONFLICT ("userId") DO UPDATE SET "profileVisibility" = 'PRIVATE'`, fx.AuthorID); err != nil {
		t.Fatalf("settings privés: %v", err)
	}

	rows, err := db.New(poolTest).SearchSemanticArticles(ctx, db.SearchSemanticArticlesParams{
		Column1: pgvector.NewVector(vec512(0, 0.01)),
		Limit:   10,
	})
	if err != nil {
		t.Fatalf("SearchSemanticArticles: %v", err)
	}
	if len(rows) != 0 {
		t.Fatalf("%d articles d'un compte privé servis à un visiteur anonyme", len(rows))
	}
}

// F673 : le propriétaire ne voyait pas ses propres pensées quand son compte
// est privé, alors que le commentaire du SQL promet « le propriétaire et ses
// abonnés ». La règle locale ignorait le propriétaire.
func TestAuditL29S_ThoughtsOwnerSeesOwnPrivateThoughts(t *testing.T) {
	fx := seedSearchArticles(t)
	ctx := context.Background()
	if _, err := poolTest.Exec(ctx, `
		INSERT INTO "Post" (id, content, "authorId", "visibility", "isDraft", "updatedAt")
		VALUES ('post_l29s_private', 'audit-l29s-pensee', $1::uuid, 'public', false, now())`,
		fx.AuthorID); err != nil {
		t.Fatalf("post: %v", err)
	}
	if _, err := poolTest.Exec(ctx, `
		INSERT INTO "UserSettings" (id, "userId", "profileVisibility", "updatedAt")
		VALUES ('us_l29s_own', $1::uuid, 'PRIVATE', now())
		ON CONFLICT ("userId") DO UPDATE SET "profileVisibility" = 'PRIVATE'`, fx.AuthorID); err != nil {
		t.Fatalf("settings privés: %v", err)
	}

	svc := &SemanticService{pool: poolTest, q: db.New(poolTest)}
	rows, _, err := svc.SearchThoughts(ctx, "audit-l29s-pensee", 20, 0, fx.AuthorID)
	if err != nil {
		t.Fatalf("SearchThoughts: %v", err)
	}
	if len(rows) != 1 {
		t.Fatalf("le propriétaire voit %d de ses pensées privées, attendu 1", len(rows))
	}
}

// F674 : les filtres publisherId/categoryId n'étaient pas bornés et partaient
// tels quels dans le filtre Meilisearch.
func TestAuditL29S_SearchFiltersAreBounded(t *testing.T) {
	got := &meilisearch.SearchRequest{}
	h := &Handler{searcher: stubSearcher{resp: &meilisearch.SearchResponse{}, got: got}}
	w := doSearchURL(h, "/search/articles?q=climat&publisherId="+strings.Repeat("x", 200))
	if w.Code != http.StatusBadRequest {
		t.Fatalf("filtre de 200 caractères = %d (%s), attendu 400", w.Code, w.Body.String())
	}
}

// F675 : un offset de service hors bornes débordait l'int32 du paramètre SQL.
func TestAuditL29S_ThoughtsOffsetIsClamped(t *testing.T) {
	got := &db.SearchThoughtsParams{}
	svc := &SemanticService{q: fakeQuerier{thoughtsGot: got}}
	if _, _, err := svc.SearchThoughts(context.Background(), "climat", 20, 3_000_000_000, ""); err != nil {
		t.Fatalf("SearchThoughts: %v", err)
	}
	if got.Offset < 0 || got.Offset > maxSearchCursor {
		t.Fatalf("offset transmis = %d, attendu borné à [0, %d]", got.Offset, maxSearchCursor)
	}
}
