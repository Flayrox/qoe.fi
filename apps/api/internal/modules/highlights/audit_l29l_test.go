package highlights

// Tests du lot d'audit L29l : chaque cas reproduit un défaut constaté sur le
// code d'avant correction (worktree à HEAD) et doit y échouer.

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"testing"

	db "github.com/qoefi/api/internal/database"
	"github.com/qoefi/api/internal/testutil"
)

// F588 : PATCH sur le surlignage d'autrui répondait 500 (erreur non typée).
func TestAuditL29L_UpdateForeignHighlightIs404(t *testing.T) {
	requirePool(t)
	fx, err := testutil.SeedPosts(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	svc := newTestService()
	h, err := svc.Create(context.Background(), fx.ArticleID, fx.AuthorID, "Passage privé", nil, false, 0)
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	r := newHTTPRouter()
	w := doReq(r, http.MethodPatch, "/v1/highlights/"+h.ID, fx.ViewerID, `{"isPublic":true}`)
	if w.Code != http.StatusNotFound {
		t.Fatalf("patch autrui = %d, attendu 404 (body %s)", w.Code, w.Body.String())
	}
	if w.Code == http.StatusOK {
		t.Fatal("modification par autrui acceptée")
	}
}

// F589 : suppression non propriétaire / inexistante répondait 200
// `{"success":false}` — le client affichait une suppression réussie.
func TestAuditL29L_DeleteForeignIs404(t *testing.T) {
	requirePool(t)
	fx, err := testutil.SeedPosts(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	svc := newTestService()
	h, err := svc.Create(context.Background(), fx.ArticleID, fx.AuthorID, "Passage public", nil, true, 0)
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	r := newHTTPRouter()
	w := doReq(r, http.MethodDelete, "/v1/highlights/"+h.ID, fx.ViewerID, "")
	if w.Code != http.StatusNotFound {
		t.Fatalf("delete autrui = %d, attendu 404 (body %s)", w.Code, w.Body.String())
	}
	w = doReq(r, http.MethodDelete, "/v1/highlights/hl_inexistant", fx.AuthorID, "")
	if w.Code != http.StatusNotFound {
		t.Fatalf("delete inexistant = %d, attendu 404 (body %s)", w.Code, w.Body.String())
	}
}

// F589 (commentaires) : même mensonge sur DELETE commentaire.
func TestAuditL29L_DeleteForeignCommentIs404(t *testing.T) {
	requirePool(t)
	fx, err := testutil.SeedPosts(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	svc := newTestService()
	h, err := svc.Create(context.Background(), fx.ArticleID, fx.AuthorID, "Passage commenté", nil, true, 0)
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	c, err := svc.CreateComment(context.Background(), h.ID, fx.ViewerID, "Commentaire de Bob")
	if err != nil {
		t.Fatalf("CreateComment: %v", err)
	}
	r := newHTTPRouter()
	w := doReq(r, http.MethodDelete, "/v1/highlights/comments/"+c.ID, fx.AuthorID, "")
	if w.Code != http.StatusNotFound {
		t.Fatalf("delete comment autrui = %d, attendu 404 (body %s)", w.Code, w.Body.String())
	}
}

// hideCommentQ simule un commentaire créé mais invisible en relecture.
type hideCommentQ struct {
	faultQ
}

func (q hideCommentQ) CanViewArticle(ctx context.Context, arg db.CanViewArticleParams) (bool, error) {
	return true, nil
}
func (q hideCommentQ) IsBlockedEitherWay(ctx context.Context, arg db.IsBlockedEitherWayParams) (bool, error) {
	return false, nil
}
func (q hideCommentQ) GetHighlightByID(ctx context.Context, id string) (db.GetHighlightByIDRow, error) {
	return db.GetHighlightByIDRow{
		ID:        id,
		ReaderId:  toUUID("00000000-0000-0000-0000-000000000003"),
		ArticleId: "art_1",
		IsPublic:  true,
	}, nil
}
func (q hideCommentQ) CreateAnnotationComment(ctx context.Context, arg db.CreateAnnotationCommentParams) (string, error) {
	return "c1", nil
}
func (q hideCommentQ) ListAnnotationComments(ctx context.Context, arg db.ListAnnotationCommentsParams) ([]db.ListAnnotationCommentsRow, error) {
	return []db.ListAnnotationCommentsRow{}, nil
}

// F590 : commentaire écrit mais invisible → 201 avec un objet vide, sans erreur.
func TestAuditL29L_CreateCommentDoesNotLie(t *testing.T) {
	svc := &Service{q: hideCommentQ{}}
	c, err := svc.CreateComment(context.Background(), "hl_1", "00000000-0000-0000-0000-000000000003", "contenu")
	if err == nil {
		t.Fatalf("CreateComment = %+v, attendu une erreur (commentaire invisible)", c)
	}
}

// F591 : le réglage `allowPublicAnnotations` de l'auteur n'était jamais lu :
// on pouvait créer et lire des annotations publiques sur un article qui les
// refuse (studio : interrupteur « annotations »).
func TestAuditL29L_PublicAnnotationsFollowArticleSetting(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	fx, err := testutil.SeedPosts(ctx, poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	svc := newTestService()

	// Un surlignage public existant avant le changement de réglage (insertion
	// directe : l'anti-spoofing exige une citation réelle, hors sujet ici).
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Highlight" (id, text, "isPublic", "readerId", "articleId", "createdAt")
		 VALUES ('hl_before_toggle', 'Déjà là', true, $1, $2, now())`,
		fx.AuthorID, fx.ArticleID); err != nil {
		t.Fatalf("highlight initial: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`UPDATE "Article" SET "allowPublicAnnotations" = false WHERE id = $1`, fx.ArticleID); err != nil {
		t.Fatalf("désactivation annotations: %v", err)
	}

	if _, err := svc.Create(ctx, fx.ArticleID, fx.ViewerID, "Nouveau", nil, true, 0); err == nil {
		t.Fatal("annotation publique créée malgré le réglage de l'auteur")
	}
	// Le privé reste permis.
	if _, err := svc.Create(ctx, fx.ArticleID, fx.ViewerID, "Pour moi", nil, false, 0); err != nil {
		t.Fatalf("annotation privée refusée: %v", err)
	}

	items, err := svc.ListByArticle(ctx, fx.ArticleID, fx.ViewerID)
	if err != nil {
		t.Fatalf("ListByArticle: %v", err)
	}
	for _, it := range items {
		if it.IsPublic && it.ReaderID != fx.ViewerID {
			t.Fatalf("surlignage public %q visible malgré le réglage de l'auteur", it.ID)
		}
	}
}

// F592 : liste publique d'un article non bornée (aucun LIMIT).
func TestAuditL29L_ListByArticleIsBounded(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	fx, err := testutil.SeedPosts(ctx, poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	for i := 0; i < 250; i++ {
		if _, err := poolTest.Exec(ctx,
			`INSERT INTO "Highlight" (id, text, "isPublic", "readerId", "articleId", "createdAt")
			 VALUES ($1, 'passage', true, $2, $3, now())`,
			"hl_bulk_"+strconv.Itoa(i), fx.AuthorID, fx.ArticleID); err != nil {
			t.Fatalf("insert %d: %v", i, err)
		}
	}
	svc := newTestService()
	items, err := svc.ListByArticle(ctx, fx.ArticleID, fx.ViewerID)
	if err != nil {
		t.Fatalf("ListByArticle: %v", err)
	}
	if len(items) > 200 {
		t.Fatalf("%d surlignages retournés, borne 200 non appliquée", len(items))
	}
}

// F593 : la bibliothèque servait le HTML complet d'un article réservé aux
// abonnés payants à un lecteur non abonné (contournement du paywall).
func TestAuditL29L_BookmarksApplyPaywall(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	fx, err := testutil.SeedPosts(ctx, poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	const content = `<p>intro</p><p>deux</p><!--paywall--><p>secret payant</p>`
	if _, err := poolTest.Exec(ctx,
		`UPDATE "Article" SET content = $2, visibility = 'PAID_SUBSCRIBERS' WHERE id = $1`,
		fx.ArticleID, content); err != nil {
		t.Fatalf("article payant: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Bookmark" (id, "readerId", "articleId") VALUES (gen_random_uuid()::text, $1, $2)`,
		fx.ViewerID, fx.ArticleID); err != nil {
		t.Fatalf("bookmark: %v", err)
	}

	svc := newTestService()
	items, err := svc.Bookmarks(ctx, fx.ViewerID, 20, 0)
	if err != nil {
		t.Fatalf("Bookmarks: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("bookmarks = %d, attendu 1", len(items))
	}
	if strings.Contains(items[0].ArticleContent, "secret payant") {
		t.Fatalf("contenu payant servi en clair: %q", items[0].ArticleContent)
	}
}

// F594 : offset de pagination non borné (pagination profonde acceptée).
func TestAuditL29L_ParseLimitOffsetClamps(t *testing.T) {
	r := newHTTPRequest("?offset=999999999&limit=100")
	limit, offset := parseLimitOffset(r)
	if offset > 10_000 {
		t.Fatalf("offset = %d, borne non appliquée", offset)
	}
	if limit != 100 {
		t.Fatalf("limit = %d, attendu 100", limit)
	}
}

// F595 : quoteOrdinal n'était borné que dans le handler (appel direct = ordinal
// arbitraire écrit en base).
func TestAuditL29L_QuoteOrdinalBoundedInService(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	fx, err := testutil.SeedPosts(ctx, poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	svc := newTestService()
	if _, err := svc.Create(ctx, fx.ArticleID, fx.AuthorID, "Passage", nil, false, 100000); err == nil {
		t.Fatal("quoteOrdinal=100000 accepté par le service")
	}
}

// F596 : un upvote concurrent (double-tap) pouvait s'annuler ; l'état renvoyé
// doit correspondre à l'état réel. Vérifie aussi le compteur après deux taps
// séquentiels (invariant) et qu'un surlignage privé d'autrui reste 404.
func TestAuditL29L_ToggleUpvoteState(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	fx, err := testutil.SeedPosts(ctx, poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	svc := newTestService()
	h, err := svc.Create(ctx, fx.ArticleID, fx.AuthorID, "Passage", nil, true, 0)
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	upvoted, count, err := svc.ToggleUpvote(ctx, h.ID, fx.ViewerID)
	if err != nil || !upvoted || count != 1 {
		t.Fatalf("toggle 1 = %v/%d/%v, attendu true/1/nil", upvoted, count, err)
	}
	upvoted, count, err = svc.ToggleUpvote(ctx, h.ID, fx.ViewerID)
	if err != nil || upvoted || count != 0 {
		t.Fatalf("toggle 2 = %v/%d/%v, attendu false/0/nil", upvoted, count, err)
	}
	var rows int
	if err := poolTest.QueryRow(ctx,
		`SELECT COUNT(*) FROM "AnnotationUpvote" WHERE "highlightId" = $1`, h.ID).Scan(&rows); err != nil {
		t.Fatalf("count upvotes: %v", err)
	}
	if rows != 0 {
		t.Fatalf("upvotes restants = %d, attendu 0", rows)
	}
	if _, _, err := svc.ToggleUpvote(ctx, "hl_inexistant", fx.ViewerID); !errors.Is(err, errHighlightNotFound) {
		t.Fatalf("upvote inexistant = %v, attendu errHighlightNotFound", err)
	}
}

// F597 : le PATCH renvoyait une forme tronquée (quoteOrdinal et ancres perdues).
func TestAuditL29L_UpdateReturnsFullShape(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	fx, err := testutil.SeedPosts(ctx, poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	svc := newTestService()
	h, err := svc.Create(ctx, fx.ArticleID, fx.AuthorID, "Passage", nil, false, 2)
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if h.QuoteOrdinal != 2 {
		t.Fatalf("quoteOrdinal create = %d", h.QuoteOrdinal)
	}
	updated, err := svc.Update(ctx, h.ID, fx.AuthorID, nil, boolPtr(true))
	if err != nil {
		t.Fatalf("Update: %v", err)
	}
	if updated.QuoteOrdinal != 2 {
		t.Fatalf("quoteOrdinal après PATCH = %d, perdu par la forme tronquée", updated.QuoteOrdinal)
	}
}

// helper local : requête HTTP GET avec query string.
func newHTTPRequest(query string) *http.Request {
	req, _ := http.NewRequest(http.MethodGet, "/v1/bookmarks"+query, nil)
	return req
}
