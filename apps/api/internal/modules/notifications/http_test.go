package notifications

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/qoefi/api/internal/middleware"
	"github.com/qoefi/api/internal/testutil"
)

// Tests HTTP du handler : routage, auth, contrats JSON (le service est
// couvert par integration_test.go).

func newHTTPRouter() http.Handler {
	h := NewHandler(NewService(poolTest))
	r := chi.NewRouter()
	h.Register(r)
	return r
}

func doReq(r http.Handler, method, path, userID, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	if userID != "" {
		ctx := context.WithValue(req.Context(), middleware.UserIDKey, userID)
		req = req.WithContext(ctx)
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func TestHTTP_ListUnreadAndMarkRead(t *testing.T) {
	requirePool(t)
	fx, err := testutil.SeedPosts(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	insertNotification(t, fx.ViewerID, fx.AuthorID, "FOLLOW", "", false)
	r := newHTTPRouter()

	// Anonyme : la route est montée derrière le middleware protégé ; sans
	// identité le handler doit refuser, pas dégrader en liste vide.
	w := doReq(r, http.MethodGet, "/v1/notifications/", "", "")
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("liste anonyme = %d %s, attendu 401", w.Code, w.Body.String())
	}

	// Liste authentifiée avec filtre et pagination.
	w = doReq(r, http.MethodGet, "/v1/notifications/?filter=likes&limit=10&cursor=0",
		fx.ViewerID, "")
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), "notifications") {
		t.Fatalf("liste = %d %s", w.Code, w.Body.String())
	}

	// Unread count.
	w = doReq(r, http.MethodGet, "/v1/notifications/unread-count", fx.ViewerID, "")
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"count":`) {
		t.Fatalf("unread = %d %s", w.Code, w.Body.String())
	}

	// Mark read : JSON invalide → 400.
	w = doReq(r, http.MethodPost, "/v1/notifications/read", fx.ViewerID, "{oops")
	if w.Code != http.StatusBadRequest {
		t.Fatalf("mark read json = %d, attendu 400", w.Code)
	}
	// Mark read nominal.
	w = doReq(r, http.MethodPost, "/v1/notifications/read", fx.ViewerID,
		`{"notificationIds":[]}`)
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"success":true`) {
		t.Fatalf("mark read = %d %s", w.Code, w.Body.String())
	}
}

func TestHTTP_Preferences(t *testing.T) {
	requirePool(t)
	fx, err := testutil.SeedPosts(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	r := newHTTPRouter()

	// GET préférences (défauts).
	w := doReq(r, http.MethodGet, "/v1/notifications/preferences", fx.AuthorID, "")
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), "preferences") {
		t.Fatalf("get prefs = %d %s", w.Code, w.Body.String())
	}

	// PATCH JSON invalide → 400.
	w = doReq(r, http.MethodPatch, "/v1/notifications/preferences", fx.AuthorID, "{nope")
	if w.Code != http.StatusBadRequest {
		t.Fatalf("patch prefs json = %d, attendu 400", w.Code)
	}

	// PATCH nominal.
	w = doReq(r, http.MethodPatch, "/v1/notifications/preferences", fx.AuthorID,
		`{"emailLikes":false}`)
	if w.Code != http.StatusOK {
		t.Fatalf("patch prefs = %d %s", w.Code, w.Body.String())
	}
}

// Les créations de notifications média ne sont plus exposées par ce module :
// elles appartiennent à media (rôle + tenant), qui écrit la ligne en base.
func TestHTTP_MediaNotificationRoutesRemoved(t *testing.T) {
	r := newHTTPRouter()
	for _, path := range []string{"/v1/notifications/media-invite", "/v1/notifications/media-member-joined"} {
		w := doReq(r, http.MethodPost, path, "00000000-0000-0000-0000-0000000000aa",
			`{"recipientId":"00000000-0000-0000-0000-0000000000bb","publisherId":"pub_x"}`)
		if w.Code != http.StatusNotFound {
			t.Fatalf("%s = %d, attendu 404 (route supprimée)", path, w.Code)
		}
	}
}
