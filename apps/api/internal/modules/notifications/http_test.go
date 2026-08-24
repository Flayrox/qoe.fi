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
	fx, err := testutil.SeedPosts(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	insertNotification(t, fx.ViewerID, fx.AuthorID, "FOLLOW", "", false)
	r := newHTTPRouter()

	// Anonyme : userID vide → liste vide mais 200 (auth optionnelle côté
	// middleware réel ; le handler dégrade proprement).
	w := doReq(r, http.MethodGet, "/v1/notifications/", "", "")
	if w.Code != http.StatusOK {
		t.Fatalf("liste anonyme = %d %s", w.Code, w.Body.String())
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

func TestHTTP_MediaNotifications(t *testing.T) {
	fx, err := testutil.SeedPosts(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	var pubID string
	if err := poolTest.QueryRow(context.Background(),
		`SELECT "publicationId" FROM "User" WHERE id = $1`, fx.AuthorID).Scan(&pubID); err != nil {
		t.Fatalf("pub: %v", err)
	}
	r := newHTTPRouter()

	// Champs manquants → 400.
	w := doReq(r, http.MethodPost, "/v1/notifications/media-invite", fx.AuthorID, `{}`)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("champs manquants = %d, attendu 400", w.Code)
	}

	// Nominal invite + member joined.
	for _, path := range []string{"/v1/notifications/media-invite", "/v1/notifications/media-member-joined"} {
		body := `{"recipientId":"` + fx.ViewerID + `","publicationId":"` + pubID + `"}`
		w = doReq(r, http.MethodPost, path, fx.AuthorID, body)
		if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"success":true`) {
			t.Fatalf("%s = %d %s", path, w.Code, w.Body.String())
		}
	}
}
