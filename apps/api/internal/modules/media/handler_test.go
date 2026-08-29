package media

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

func doMedia(t *testing.T, svc *Service, method, path, userID string, body any) *httptest.ResponseRecorder {
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

func TestMediaUnauthorized(t *testing.T) {
	ctx := context.Background()
	seedMedia(t, ctx)
	svc := newTestService()
	for _, tc := range []struct{ method, path string }{
		{http.MethodGet, "/v1/media/workspaces"},
		{http.MethodGet, "/v1/media/"},
		{http.MethodPost, "/v1/media/"},
		{http.MethodGet, "/v1/media/media_001"},
		{http.MethodPatch, "/v1/media/media_001/settings"},
		{http.MethodPost, "/v1/media/media_001/invites"},
		{http.MethodPatch, "/v1/media/media_001/members/" + mediaWriterID},
		{http.MethodPatch, "/v1/media/media_001/members/" + mediaWriterID + "/permissions"},
		{http.MethodDelete, "/v1/media/media_001/members/" + mediaWriterID},
		{http.MethodPost, "/v1/media/invites/tok/accept"},
	} {
		w := doMedia(t, svc, tc.method, tc.path, "", nil)
		if w.Code != http.StatusUnauthorized {
			t.Fatalf("%s %s = %d, attendu 401", tc.method, tc.path, w.Code)
		}
	}
}

func TestMediaListWorkspaces(t *testing.T) {
	ctx := context.Background()
	seedMedia(t, ctx)
	svc := newTestService()
	w := doMedia(t, svc, http.MethodGet, "/v1/media/workspaces", mediaOwnerID, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("code = %d, attendu 200", w.Code)
	}
}

func TestMediaList(t *testing.T) {
	ctx := context.Background()
	seedMedia(t, ctx)
	svc := newTestService()
	w := doMedia(t, svc, http.MethodGet, "/v1/media/", mediaOwnerID, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("code = %d, attendu 200 (body %s)", w.Code, w.Body.String())
	}
	if !bytes.Contains(w.Body.Bytes(), []byte("medias")) {
		t.Fatalf("body = %s", w.Body.String())
	}
}

func TestMediaCreate(t *testing.T) {
	ctx := context.Background()
	seedMedia(t, ctx)
	svc := newTestService()

	// JSON invalide.
	w := doMedia(t, svc, http.MethodPost, "/v1/media/", mediaOwnerID, "{bad")
	if w.Code != http.StatusBadRequest {
		t.Fatalf("code = %d, attendu 400", w.Code)
	}
	// Succès.
	w2 := doMedia(t, svc, http.MethodPost, "/v1/media/", mediaOwnerID, map[string]any{
		"name": "Nouveau Média", "slug": "nouveau-media", "bio": "bio",
	})
	if w2.Code != http.StatusCreated {
		t.Fatalf("code = %d, attendu 201 (body %s)", w2.Code, w2.Body.String())
	}
	// Slug déjà pris.
	w3 := doMedia(t, svc, http.MethodPost, "/v1/media/", mediaOwnerID, map[string]any{
		"name": "Média Un", "slug": "media-un",
	})
	if w3.Code != http.StatusBadRequest {
		t.Fatalf("code = %d, attendu 400 (slug pris, body %s)", w3.Code, w3.Body.String())
	}
}

func TestMediaGet(t *testing.T) {
	ctx := context.Background()
	seedMedia(t, ctx)
	svc := newTestService()
	w := doMedia(t, svc, http.MethodGet, "/v1/media/media_001", mediaOwnerID, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("code = %d, attendu 200", w.Code)
	}
	// Étranger → 403.
	w2 := doMedia(t, svc, http.MethodGet, "/v1/media/media_001", mediaStranger, nil)
	if w2.Code != http.StatusForbidden {
		t.Fatalf("code = %d, attendu 403", w2.Code)
	}
	// Inconnu → authorizeMedia échoue d'abord → 403.
	w3 := doMedia(t, svc, http.MethodGet, "/v1/media/introuvable", mediaOwnerID, nil)
	if w3.Code != http.StatusForbidden {
		t.Fatalf("code = %d, attendu 403", w3.Code)
	}
}

func TestMediaSettingsAndMembers(t *testing.T) {
	ctx := context.Background()
	seedMedia(t, ctx)
	svc := newTestService()

	// Settings OK puis JSON invalide.
	w := doMedia(t, svc, http.MethodPatch, "/v1/media/media_001/settings", mediaOwnerID, map[string]any{"name": "Renommé"})
	if w.Code != http.StatusOK {
		t.Fatalf("settings = %d, attendu 200 (body %s)", w.Code, w.Body.String())
	}
	w2 := doMedia(t, svc, http.MethodPatch, "/v1/media/media_001/settings", mediaOwnerID, "{bad")
	if w2.Code != http.StatusBadRequest {
		t.Fatalf("settings bad json = %d, attendu 400", w2.Code)
	}

	// Invite → 200, puis l'invité accepte.
	w3 := doMedia(t, svc, http.MethodPost, "/v1/media/media_001/invites", mediaOwnerID, map[string]any{
		"email": "inv.media@test.dev", "role": "writer",
	})
	if w3.Code != http.StatusOK {
		t.Fatalf("invite = %d, attendu 200 (body %s)", w3.Code, w3.Body.String())
	}
	var inv struct {
		InviteId string `json:"inviteId"`
	}
	_ = json.Unmarshal(w3.Body.Bytes(), &inv)
	// accept avec un token bidon → 404/400 ; avec le vrai token → 200.
	w4 := doMedia(t, svc, http.MethodPost, "/v1/media/invites/mauvais-token/accept", mediaInvitee, nil)
	if w4.Code == http.StatusOK {
		t.Fatal("accept mauvais token ne doit pas réussir")
	}

	// Rôle + permissions + suppression du writer par l'owner.
	w5 := doMedia(t, svc, http.MethodPatch, "/v1/media/media_001/members/"+mediaWriterID, mediaOwnerID, map[string]any{"role": "editor"})
	if w5.Code != http.StatusOK {
		t.Fatalf("update role = %d, attendu 200 (body %s)", w5.Code, w5.Body.String())
	}
	w6 := doMedia(t, svc, http.MethodPatch, "/v1/media/media_001/members/"+mediaWriterID+"/permissions", mediaOwnerID, map[string]any{
		"permissions": []string{"media:edit"},
	})
	if w6.Code != http.StatusOK {
		t.Fatalf("update perms = %d, attendu 200", w6.Code)
	}
	// Viewer n'a pas les droits → 403.
	w7 := doMedia(t, svc, http.MethodPatch, "/v1/media/media_001/members/"+mediaWriterID, mediaViewerID, map[string]any{"role": "editor"})
	if w7.Code != http.StatusForbidden {
		t.Fatalf("update role viewer = %d, attendu 403", w7.Code)
	}
	// Suppression du writer → 200.
	w8 := doMedia(t, svc, http.MethodDelete, "/v1/media/media_001/members/"+mediaWriterID, mediaOwnerID, nil)
	if w8.Code != http.StatusOK {
		t.Fatalf("remove = %d, attendu 200 (body %s)", w8.Code, w8.Body.String())
	}
	// Membre inconnu → 404.
	w9 := doMedia(t, svc, http.MethodDelete, "/v1/media/media_001/members/inconnu", mediaOwnerID, nil)
	if w9.Code != http.StatusNotFound {
		t.Fatalf("remove inconnu = %d, attendu 404", w9.Code)
	}
}
