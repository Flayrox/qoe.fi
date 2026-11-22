package posts

// Tests de non-régression de l'audit L29h : faux succès d'engagement, créations
// partielles, sondages morts, erreurs de base masquées, compteurs qui dérivent.

import (
	"context"
	"errors"
	"net/http"
	"testing"

	db "github.com/qoefi/api/internal/database"
)

func TestPosts_InvalidCursorRejected(t *testing.T) {
	fx := seedPosts(t)
	r := newTestRouter(t, fx.ViewerID)
	// Un curseur illisible renvoyait la première page avec 200 : le client
	// croyait avoir tout lu.
	rr := doJSON(t, r, "GET", "/v1/posts/"+fx.PostID+"/likes?cursor=abc", "")
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("curseur illisible code = %d (body=%s), attendu 400", rr.Code, rr.Body.String())
	}
	rr = doJSON(t, r, "GET", "/v1/posts/"+fx.PostID+"/likes?cursor=-5", "")
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("curseur négatif code = %d, attendu 400", rr.Code)
	}
	if rr := doJSON(t, r, "GET", "/v1/posts/"+fx.PostID+"/likes?cursor=0", ""); rr.Code != http.StatusOK {
		t.Fatalf("curseur 0 code = %d, attendu 200", rr.Code)
	}
}

func TestPosts_HideReplyUnknownIsNotFound(t *testing.T) {
	fx := seedPosts(t)
	r := newTestRouter(t, fx.ViewerID)
	rr := doJSON(t, r, "POST", "/v1/posts/00000000-0000-0000-0000-00000000dead/hide", "")
	if rr.Code != http.StatusNotFound {
		t.Fatalf("hide inconnu code = %d (body=%s), attendu 404", rr.Code, rr.Body.String())
	}
}

func seedArticleRow(t *testing.T, id string, published bool, authorID string) {
	t.Helper()
	requirePool(t)
	ctx := context.Background()
	if _, err := poolTest.Exec(ctx, `DELETE FROM "Article" WHERE id = $1`, id); err != nil {
		t.Fatalf("clean article: %v", err)
	}
	status := "DRAFT"
	if published {
		status = "PUBLISHED"
	}
	if _, err := poolTest.Exec(ctx, `
		INSERT INTO "Article" (id, title, slug, "shortCode", content, published, visibility, status,
		  "publisherId", "authorId", "createdAt", "updatedAt")
		VALUES ($1, 'Titre test', $1, $2, '<p>corps</p>', $3, 'PUBLIC', $4, 'pub_post_001', $5, now(), now())`,
		id, "sc"+id[len(id)-4:], published, status, authorID); err != nil {
		t.Fatalf("insert article: %v", err)
	}
}

// ─── Création : aucune pensée vide, aucun acte partiel ────────────────

func TestPosts_EmptyContentRejected(t *testing.T) {
	fx := seedPosts(t)
	r := newTestRouter(t, fx.ViewerID)

	rr := doJSON(t, r, http.MethodPost, "/v1/posts", `{"content":"   "}`)
	if rr.Code == http.StatusCreated {
		t.Fatalf("pensée vide créée = 201 (%s), attendu un refus", rr.Body.String())
	}
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("pensée vide = %d, attendu 400", rr.Code)
	}
}

func TestPosts_ReplyRestrictionValidated(t *testing.T) {
	fx := seedPosts(t)
	r := newTestRouter(t, fx.ViewerID)

	rr := doJSON(t, r, http.MethodPost, "/v1/posts",
		`{"content":"bonjour","replyRestriction":"n-importe-quoi"}`)
	if rr.Code == http.StatusCreated {
		t.Fatalf("restriction inconnue acceptée = 201 (%s)", rr.Body.String())
	}
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("restriction inconnue = %d, attendu 400", rr.Code)
	}
}

func TestPosts_CreateRollsBackOnAttachmentFailure(t *testing.T) {
	requirePool(t)
	fx := seedPosts(t)
	svc := faultService(t, map[string]error{"CreateAttachment": errBoom})
	ctx := context.Background()
	marker := "pensée partielle l29h"

	_, err := svc.CreateFull(ctx, fx.ViewerID, CreateFullInput{
		Content: marker,
		Attachments: []AttachmentInput{
			{URL: "/storage/v1/object/public/media/x.jpg", Type: "IMAGE"},
		},
	})
	if err == nil {
		t.Fatal("échec de pièce jointe non remonté")
	}
	var n int
	if err := poolTest.QueryRow(ctx, `SELECT COUNT(*) FROM "Post" WHERE content = $1`, marker).Scan(&n); err != nil {
		t.Fatalf("count: %v", err)
	}
	if n != 0 {
		t.Fatalf("%d pensée(s) partielle(s) persistée(s) malgré l'échec de pièce jointe", n)
	}
}

func TestPosts_PollWithOnlyEmptyOptionsRejected(t *testing.T) {
	requirePool(t)
	fx := seedPosts(t)
	svc := newTestService()
	ctx := context.Background()
	marker := "sondage vide l29h"

	if _, err := svc.CreateFull(ctx, fx.ViewerID, CreateFullInput{
		Content: marker,
		Poll:    &PollInput{Options: []string{"  ", ""}},
	}); err == nil {
		t.Fatal("sondage sans option réelle accepté")
	}
	var n int
	if err := poolTest.QueryRow(ctx, `SELECT COUNT(*) FROM "Post" WHERE content = $1`, marker).Scan(&n); err != nil {
		t.Fatalf("count: %v", err)
	}
	if n != 0 {
		t.Fatalf("pensée persistée alors que son sondage était invalide")
	}
}

func TestPosts_RootResolutionErrorPropagated(t *testing.T) {
	requirePool(t)
	fx := seedPosts(t)
	svc := faultService(t, map[string]error{"GetThreadRootID": errBoom})
	ctx := context.Background()
	marker := "réponse sans racine l29h"

	_, err := svc.CreateFull(ctx, fx.ViewerID, CreateFullInput{Content: marker, ParentID: &fx.PostID})
	if err == nil {
		t.Fatal("échec de résolution de la racine avalé : réponse créée sans rootId")
	}
	var n int
	if err := poolTest.QueryRow(ctx, `SELECT COUNT(*) FROM "Post" WHERE content = $1`, marker).Scan(&n); err != nil {
		t.Fatalf("count: %v", err)
	}
	if n != 0 {
		t.Fatalf("réponse créée malgré l'échec de résolution de la racine")
	}
}

// ─── Engagement sur article : existence, état, écritures réelles ─────

func TestPosts_LikeUnknownArticleIsNotFound(t *testing.T) {
	fx := seedPosts(t)
	r := newTestRouter(t, fx.ViewerID)

	rr := doJSON(t, r, http.MethodPost, "/v1/posts/artc_inconnu/like", "")
	if rr.Code != http.StatusNotFound {
		t.Fatalf("like d'un article inexistant = %d (%s), attendu 404", rr.Code, rr.Body.String())
	}
}

func TestPosts_LikeDraftArticleRejected(t *testing.T) {
	fx := seedPosts(t)
	articleID := "artc_l29h_draft"
	seedArticleRow(t, articleID, false, fx.AuthorID)
	svc := newTestService()

	if _, err := svc.ToggleLike(context.Background(), articleID, fx.ViewerID); err == nil {
		t.Fatal("like d'un article non publié accepté (et notification envoyée à l'auteur)")
	}
}

func TestPosts_BookmarkUnknownArticleIsNotFound(t *testing.T) {
	fx := seedPosts(t)
	r := newTestRouter(t, fx.ViewerID)

	rr := doJSON(t, r, http.MethodPost, "/v1/posts/artc_inconnu/bookmark", "")
	if rr.Code != http.StatusNotFound {
		t.Fatalf("bookmark d'un article inexistant = %d (%s), attendu 404", rr.Code, rr.Body.String())
	}
}

// ─── Sondages : état mort et erreurs masquées ────────────────────────

func TestPosts_ExpiredPollRejected(t *testing.T) {
	requirePool(t)
	fx := seedPosts(t)
	ctx := context.Background()
	if _, err := poolTest.Exec(ctx, `DELETE FROM "Poll" WHERE "thoughtId" = $1`, fx.PostID); err != nil {
		t.Fatalf("clean poll: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Poll" (id, "thoughtId", "expiresAt") VALUES ('poll_l29h', $1, now() - interval '1 day')`,
		fx.PostID); err != nil {
		t.Fatalf("insert poll: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "PollOption" (id, "pollId", text, "order") VALUES ('po_l29h', 'poll_l29h', 'oui', 0)`); err != nil {
		t.Fatalf("insert option: %v", err)
	}

	svc := newTestService()
	if _, err := svc.VotePoll(ctx, fx.PostID, "po_l29h", fx.ViewerID); err == nil {
		t.Fatal("vote accepté sur un sondage expiré")
	}
}

func TestPosts_VotePollDatabaseErrorNotMasked(t *testing.T) {
	fx := seedPosts(t)
	svc := faultService(t, map[string]error{"GetPollByThoughtID": errBoom})
	_, err := svc.VotePoll(context.Background(), fx.PostID, "po_x", fx.ViewerID)
	if err == nil {
		t.Fatal("erreur avalée")
	}
	if !errors.Is(err, errBoom) {
		t.Fatalf("erreur de base convertie en erreur métier : %v", err)
	}
}

// ─── Threadgate : panne ≠ refus ──────────────────────────────────────

func TestPosts_CanReplySubscriberLookupErrorPropagated(t *testing.T) {
	requirePool(t)
	fx := seedPosts(t)
	ctx := context.Background()
	if _, err := poolTest.Exec(ctx,
		`UPDATE "Post" SET "replyRestriction" = 'subscribers' WHERE id = $1`, fx.PostID); err != nil {
		t.Fatalf("set restriction: %v", err)
	}
	// Service en faute construit sans reseed (qui écraserait la restriction).
	svc := &Service{pool: poolTest, q: &faultQ{Queries: db.New(poolTest), fail: map[string]error{"GetPersonalPublisherID": errBoom}}}

	if _, err := svc.CanReply(ctx, fx.PostID, fx.ViewerID); !errors.Is(err, errBoom) {
		t.Fatalf("erreur de base convertie en refus métier : err = %v", err)
	}
}

// ─── Suppression : compteurs et cache ───────────────────────────��────

func TestPosts_DeleteReplyDecrementsParentCount(t *testing.T) {
	requirePool(t)
	fx := seedPosts(t)
	svc := newTestService()
	ctx := context.Background()

	reply, err := svc.Reply(ctx, fx.PostID, fx.ViewerID, "réponse à supprimer l29h")
	if err != nil {
		t.Fatalf("reply: %v", err)
	}
	var before int
	if err := poolTest.QueryRow(ctx, `SELECT "replyCount" FROM "Post" WHERE id = $1`, fx.PostID).Scan(&before); err != nil {
		t.Fatalf("read replyCount: %v", err)
	}
	if err := svc.Delete(ctx, reply.ID, fx.ViewerID); err != nil {
		t.Fatalf("delete: %v", err)
	}
	var after int
	if err := poolTest.QueryRow(ctx, `SELECT "replyCount" FROM "Post" WHERE id = $1`, fx.PostID).Scan(&after); err != nil {
		t.Fatalf("read replyCount: %v", err)
	}
	if after != before-1 {
		t.Fatalf("replyCount du parent = %d après suppression (avant %d) : compteur qui dérive", after, before)
	}
}

// ─── Fonctions pures ─────────────────────────────────────────────────

func TestPosts_ContainsMentionUnicodeBoundary(t *testing.T) {
	if !ContainsMention("coucou @jean😀 ça va", "jean") {
		t.Fatal("mention suivie d'un emoji non reconnue (frontière de mot calculée en octets)")
	}
	if ContainsMention("coucou @jeanne", "jean") {
		t.Fatal("@jeanne ne doit pas matcher @jean")
	}
}

// ─── Statuts ─────────────────────────────────────────────────────────

func TestPosts_PinUnknownPostIsNotFound(t *testing.T) {
	fx := seedPosts(t)
	r := newTestRouter(t, fx.ViewerID)
	rr := doJSON(t, r, http.MethodPost, "/v1/posts/introuvable/pin", "")
	if rr.Code != http.StatusNotFound {
		t.Fatalf("pin d'un post inexistant = %d (%s), attendu 404", rr.Code, rr.Body.String())
	}
}

func TestPosts_ReportRejectsUnknownTargetType(t *testing.T) {
	fx := seedPosts(t)
	r := newTestRouter(t, fx.ViewerID)
	rr := doJSON(t, r, http.MethodPost, "/v1/reports",
		`{"targetId":"x","targetType":"n-importe-quoi","reason":"spam"}`)
	if rr.Code == http.StatusOK {
		t.Fatalf("signalement d'un type inconnu accepté (%s)", rr.Body.String())
	}
}
