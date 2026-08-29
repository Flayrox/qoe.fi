package collaborations

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/qoefi/api/internal/middleware"
)

func doCollab(t *testing.T, svc *Service, method, path, userID string, body any) *httptest.ResponseRecorder {
	t.Helper()
	h := NewHandler(svc)
	r := chi.NewRouter()
	h.Register(r)
	var buf bytes.Buffer
	if body != nil {
		_ = json.NewEncoder(&buf).Encode(body)
	}
	req := httptest.NewRequest(method, path, &buf)
	req.Header.Set("Content-Type", "application/json")
	if userID != "" {
		req = req.WithContext(context.WithValue(req.Context(), middleware.UserIDKey, userID))
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func TestCollabList(t *testing.T) {
	ctx := context.Background()
	seedCollab(t, ctx)
	svc := newTestService()
	w := doCollab(t, svc, http.MethodGet, "/v1/collaborations/", authorID, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("code = %d, attendu 200 (body %s)", w.Code, w.Body.String())
	}
	if !bytes.Contains(w.Body.Bytes(), []byte("received")) {
		t.Fatalf("body = %s", w.Body.String())
	}
}

func TestCollabInviteByEmail(t *testing.T) {
	ctx := context.Background()
	seedCollab(t, ctx)
	svc := newTestService()

	// JSON invalide.
	w := doCollab(t, svc, http.MethodPost, "/v1/collaborations/invite-by-email", authorID, "{bad")
	if w.Code != http.StatusBadRequest {
		t.Fatalf("code = %d, attendu 400", w.Code)
	}
	// Champs requis.
	w2 := doCollab(t, svc, http.MethodPost, "/v1/collaborations/invite-by-email", authorID, map[string]any{})
	if w2.Code != http.StatusBadRequest {
		t.Fatalf("code = %d, attendu 400", w2.Code)
	}
	// Succès : l'auteur invite par email un user existant.
	w3 := doCollab(t, svc, http.MethodPost, "/v1/collaborations/invite-by-email", authorID, map[string]any{
		"articleId": "art_adv_01", "inviteeEmail": "invitee-adv@test.dev",
	})
	if w3.Code != http.StatusCreated {
		t.Fatalf("code = %d, attendu 201 (body %s)", w3.Code, w3.Body.String())
	}
	// L'auteur n'a pas le droit sur l'article du média → ErrorCollab (400).
	w4 := doCollab(t, svc, http.MethodPost, "/v1/collaborations/invite-by-email", authorID, map[string]any{
		"articleId": "art_adv_02", "inviteeEmail": "invitee-adv@test.dev",
	})
	if w4.Code != http.StatusBadRequest {
		t.Fatalf("code = %d, attendu 400 (body %s)", w4.Code, w4.Body.String())
	}
}

func TestCollabInvite(t *testing.T) {
	ctx := context.Background()
	seedCollab(t, ctx)
	svc := newTestService()
	w := doCollab(t, svc, http.MethodPost, "/v1/collaborations/invite", authorID, map[string]any{
		"articleId": "art_adv_01", "inviteeId": inviteeID, "role": "CO_AUTHOR",
	})
	if w.Code != http.StatusCreated {
		t.Fatalf("code = %d, attendu 201 (body %s)", w.Code, w.Body.String())
	}
	w2 := doCollab(t, svc, http.MethodPost, "/v1/collaborations/invite", authorID, map[string]any{})
	if w2.Code != http.StatusBadRequest {
		t.Fatalf("code = %d, attendu 400", w2.Code)
	}
}

func TestCollabRespondAndErrors(t *testing.T) {
	ctx := context.Background()
	seedCollab(t, ctx)
	svc := newTestService()

	// Crée une demande via le service pour avoir un requestId.
	req, err := svc.InviteByEmail(ctx, authorID, "art_adv_01", "invitee-adv@test.dev")
	if err != nil {
		t.Fatalf("InviteByEmail: %v", err)
	}
	// L'invité accepte.
	w := doCollab(t, svc, http.MethodPost, "/v1/collaborations/"+req.ID+"/respond", inviteeID, map[string]any{
		"accept": true, "showOnPublicProfile": true,
	})
	if w.Code != http.StatusOK {
		t.Fatalf("respond = %d, attendu 200 (body %s)", w.Code, w.Body.String())
	}
	// RequestId inconnu → ErrorCollab (400).
	w2 := doCollab(t, svc, http.MethodPost, "/v1/collaborations/introuvable/respond", inviteeID, map[string]any{
		"accept": true,
	})
	if w2.Code != http.StatusBadRequest {
		t.Fatalf("respond inconnu = %d, attendu 400", w2.Code)
	}
	// JSON invalide → 400.
	w3 := doCollab(t, svc, http.MethodPost, "/v1/collaborations/"+req.ID+"/respond", inviteeID, "{bad")
	if w3.Code != http.StatusBadRequest {
		t.Fatalf("respond bad json = %d, attendu 400", w3.Code)
	}

	// Retrait de consentement par le contributeur accepté.
	w4 := doCollab(t, svc, http.MethodPost, "/v1/collaborations/art_adv_01/withdraw", inviteeID, nil)
	if w4.Code != http.StatusOK {
		t.Fatalf("withdraw = %d, attendu 200 (body %s)", w4.Code, w4.Body.String())
	}
	// Retrait d'un non-contributeur → no-op idempotent (200).
	w5 := doCollab(t, svc, http.MethodPost, "/v1/collaborations/art_adv_01/withdraw", strangerID, nil)
	if w5.Code != http.StatusOK {
		t.Fatalf("withdraw étranger = %d, attendu 200 (no-op)", w5.Code)
	}
}

func TestCollabRemoveContributor(t *testing.T) {
	ctx := context.Background()
	seedCollab(t, ctx)
	svc := newTestService()
	req, err := svc.InviteByEmail(ctx, authorID, "art_adv_01", "invitee-adv@test.dev")
	if err != nil {
		t.Fatalf("InviteByEmail: %v", err)
	}
	if err := svc.Respond(ctx, inviteeID, req.ID, true, true); err != nil {
		t.Fatalf("Respond: %v", err)
	}
	// L'auteur retire le contributeur.
	w := doCollab(t, svc, http.MethodDelete, "/v1/collaborations/art_adv_01/contributors/"+inviteeID, authorID, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("remove = %d, attendu 200 (body %s)", w.Code, w.Body.String())
	}
	// Le stranger n'a pas le droit → ErrorCollab (400).
	w2 := doCollab(t, svc, http.MethodDelete, "/v1/collaborations/art_adv_01/contributors/"+inviteeID, strangerID, nil)
	if w2.Code != http.StatusBadRequest {
		t.Fatalf("remove stranger = %d, attendu 400", w2.Code)
	}
}
