package creator

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	db "github.com/qoefi/api/internal/database"
)

func TestTextVal(t *testing.T) {
	if tv := textVal(nil); tv.Valid {
		t.Fatalf("nil → %+v, attendu invalid", tv)
	}
	empty := ""
	if tv := textVal(&empty); tv.Valid {
		t.Fatalf("chaîne vide → %+v, attendu invalid", tv)
	}
	ok := "abc"
	if tv := textVal(&ok); !tv.Valid || tv.String != "abc" {
		t.Fatalf("abc → %+v", tv)
	}
}

// notifyFollow/deleteFollowNotification : erreurs DB internes propagées.
func TestFault_NotifyFollow(t *testing.T) {
	alicePubID, aliceUserID, _, bobUserID := seedFollows(t)
	ctx := context.Background()

	for _, m := range []string{"GetPublicationOwner", "GetFollowPrefs", "ExistsUnreadFollowNotification", "InsertFollowNotification"} {
		fq := &faultQ{Queries: db.New(poolTest), fail: map[string]error{m: errBoom}}
		if err := notifyFollow(ctx, fq, alicePubID, bobUserID); err == nil {
			t.Errorf("notifyFollow %s: err = nil", m)
		}
	}

	// Même auteur (owner == sender) → nil sans requête de notification.
	fq := &faultQ{Queries: db.New(poolTest), fail: map[string]error{"InsertFollowNotification": errBoom}}
	if err := notifyFollow(ctx, fq, alicePubID, aliceUserID); err != nil {
		t.Fatalf("owner==sender → %v, attendu nil", err)
	}

	// GetPublicationOwner en ErrNoRows → nil (pas d'owner à notifier).
	fq = &faultQ{Queries: db.New(poolTest), fail: map[string]error{"GetPublicationOwner": pgx.ErrNoRows}}
	if err := notifyFollow(ctx, fq, alicePubID, bobUserID); err != nil {
		t.Fatalf("owner NoRows → %v, attendu nil", err)
	}
}

func TestFault_DeleteFollowNotification(t *testing.T) {
	alicePubID, aliceUserID, _, bobUserID := seedFollows(t)
	ctx := context.Background()

	for _, m := range []string{"GetPublicationOwner", "DeleteFollowNotification"} {
		fq := &faultQ{Queries: db.New(poolTest), fail: map[string]error{m: errBoom}}
		if err := deleteFollowNotification(ctx, fq, alicePubID, bobUserID); err == nil {
			t.Errorf("deleteFollowNotification %s: err = nil", m)
		}
	}
	if err := deleteFollowNotification(ctx, &faultQ{Queries: db.New(poolTest)}, alicePubID, aliceUserID); err != nil {
		t.Fatalf("owner==sender → %v, attendu nil", err)
	}
}

func TestFault_AuthorizeCategories(t *testing.T) {
	alicePubID, aliceUserID, _, _ := seedFollows(t)
	ctx := context.Background()

	h, fq, _ := newFaultHandler(nil)
	// publication personnelle → autorisé.
	if err := h.authorizeCategories(ctx, aliceUserID, alicePubID); err != nil {
		t.Fatalf("personnelle → %v", err)
	}
	// GetMediaMemberContext en erreur → errForbidden.
	fq.fail = map[string]error{"GetMediaMemberContext": errBoom}
	if err := h.authorizeCategories(ctx, aliceUserID, "pub_inconnue"); !errors.Is(err, errForbidden) {
		t.Fatalf("média en erreur → %v, attendu errForbidden", err)
	}
}

// TestFault_ApiArticleUpdate_CategoryBranch couvre le refus de catégorie
// inconnue (QueryRow réel → 400) sur un article appartenant au créateur.
func TestFault_ApiArticleUpdate_CategoryBranch(t *testing.T) {
	fx := seedPostsFx(t)
	h := &Handler{pool: poolTest, q: db.New(poolTest)}

	req := httptest.NewRequest(http.MethodPatch, "/v1/creator/articles/art_post_001", strings.NewReader(`{"categoryId":"cat_inexistante"}`))
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "art_post_001")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	req = reqCtx(req, fx.AuthorID, "pub_post_001")
	w := httptest.NewRecorder()
	h.apiArticleUpdate(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("category inconnue → %d (%s), attendu 400", w.Code, w.Body.String())
	}
}
