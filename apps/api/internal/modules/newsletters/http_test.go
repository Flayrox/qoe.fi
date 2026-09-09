package newsletters

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	db "github.com/qoefi/api/internal/database"
	"github.com/qoefi/api/internal/middleware"
)

// Tests HTTP du handler newsletters : auth requise, CRUD brouillon, envoi
// (avec erreur claire hors DRAFT), désabonnement public, et rate-limit
// anti-spam sur /send quand un limiteur Redis est branché.

func newHTTPRouter(t *testing.T, withSendLimit bool) http.Handler {
	t.Helper()
	h := NewHandler(NewService(db.New(poolTest), nil))
	if withSendLimit {
		h.SetSendRateLimit(nil, time.Hour, 2) // rc nil → middleware no-op
	}
	r := chi.NewRouter()
	h.Register(r)
	h.RegisterPublic(r)
	return r
}

func nlReq(r http.Handler, method, path, userID, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	if userID != "" {
		ctx := context.WithValue(req.Context(), middleware.UserIDKey, userID)
		req = req.WithContext(ctx)
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func TestHTTP_NewsletterAuthRequired(t *testing.T) {
	ctx := context.Background()
	seedNewsletterEnv(t, ctx)
	r := newHTTPRouter(t, false)

	// Sans userID dans le contexte → 401 sur toutes les routes créateur.
	for _, tc := range []struct{ method, path string }{
		{http.MethodGet, "/v1/newsletters"},
		{http.MethodPost, "/v1/newsletters"},
		{http.MethodPost, "/v1/newsletters/x/send"},
	} {
		w := nlReq(r, tc.method, tc.path, "", `{}`)
		if w.Code != http.StatusUnauthorized {
			t.Fatalf("%s %s = %d, attendu 401", tc.method, tc.path, w.Code)
		}
	}

	// Le désabonnement public reste accessible sans auth.
	w := nlReq(r, http.MethodGet, "/v1/newsletters/unsubscribe?publicationId="+pubID+"&email=reader@test.dev", "", "")
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), "désabonné") {
		t.Fatalf("unsubscribe = %d %s", w.Code, w.Body.String())
	}
}

func TestHTTP_NewsletterCrudAndSend(t *testing.T) {
	ctx := context.Background()
	seedNewsletterEnv(t, ctx)
	r := newHTTPRouter(t, false)

	// JSON invalide → 400.
	w := nlReq(r, http.MethodPost, "/v1/newsletters", ownerID, "{oops")
	if w.Code != http.StatusBadRequest {
		t.Fatalf("create json = %d, attendu 400", w.Code)
	}

	// Création d'un brouillon.
	w = nlReq(r, http.MethodPost, "/v1/newsletters", ownerID,
		`{"publicationId":"`+pubID+`","subject":"Sujet","previewText":"Aperçu","html":"<p>Bonjour</p>"}`)
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"status":"DRAFT"`) {
		t.Fatalf("create = %d %s", w.Code, w.Body.String())
	}
	var id string
	_ = poolTest.QueryRow(ctx, `SELECT id FROM "NewsletterIssue" LIMIT 1`).Scan(&id)

	// Liste.
	w = nlReq(r, http.MethodGet, "/v1/newsletters?publicationId="+pubID, ownerID, "")
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), "Sujet") {
		t.Fatalf("list = %d %s", w.Code, w.Body.String())
	}

	// Mise à jour du brouillon.
	w = nlReq(r, http.MethodPatch, "/v1/newsletters/"+id, ownerID,
		`{"publicationId":"`+pubID+`","subject":"Sujet 2","html":"<p>MàJ</p>"}`)
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), "Sujet 2") {
		t.Fatalf("update = %d %s", w.Code, w.Body.String())
	}

	// Envoi → SENDING.
	w = nlReq(r, http.MethodPost, "/v1/newsletters/"+id+"/send", ownerID, "")
	if w.Code != http.StatusOK {
		t.Fatalf("send = %d %s", w.Code, w.Body.String())
	}

	// Second envoi (issue plus DRAFT) → 400 avec message clair (anti-spam).
	w = nlReq(r, http.MethodPost, "/v1/newsletters/"+id+"/send", ownerID, "")
	if w.Code != http.StatusBadRequest || !strings.Contains(w.Body.String(), "brouillons") {
		t.Fatalf("second send = %d %s, attendu 400 errNotDraft", w.Code, w.Body.String())
	}

	// Suppression d'un brouillon (en créer un autre d'abord).
	w = nlReq(r, http.MethodPost, "/v1/newsletters", ownerID,
		`{"publicationId":"`+pubID+`","subject":"À supprimer","html":"<p>x</p>"}`)
	if w.Code != http.StatusOK {
		t.Fatalf("create 2 = %d", w.Code)
	}
	var id2 string
	_ = poolTest.QueryRow(ctx, `SELECT id FROM "NewsletterIssue" WHERE subject = 'À supprimer'`).Scan(&id2)
	w = nlReq(r, http.MethodDelete, "/v1/newsletters/"+id2, ownerID, "")
	if w.Code != http.StatusOK {
		t.Fatalf("delete = %d %s", w.Code, w.Body.String())
	}
	var remain int
	_ = poolTest.QueryRow(ctx, `SELECT COUNT(*) FROM "NewsletterIssue"`).Scan(&remain)
	if remain != 1 {
		t.Fatalf("issues restantes = %d, attendu 1", remain)
	}
}

func TestHTTP_NewsletterForbiddenForStranger(t *testing.T) {
	ctx := context.Background()
	seedNewsletterEnv(t, ctx)
	r := newHTTPRouter(t, false)

	// L'étranger (pas owner de la publication) ne peut pas lister la
	// publication de l'owner → 403.
	w := nlReq(r, http.MethodGet, "/v1/newsletters?publicationId="+pubID, stranger, "")
	if w.Code != http.StatusForbidden {
		t.Fatalf("list étranger = %d, attendu 403", w.Code)
	}
}

func TestHTTP_NewsletterSendRateLimited(t *testing.T) {
	ctx := context.Background()
	seedNewsletterEnv(t, ctx)

	// rc nil → le middleware est no-op : le rate-limit ne bloque rien, mais
	// le chemin de montage (route avec middleware) est exercé.
	r := newHTTPRouter(t, true)
	w := nlReq(r, http.MethodPost, "/v1/newsletters/nonexistent/send", ownerID, "")
	// Issue inexistante → 404 (pas 401/500) : le routeur a bien atteint le handler.
	if w.Code != http.StatusNotFound {
		t.Fatalf("send route limitée = %d %s, attendu 404 (issue inconnue)", w.Code, w.Body.String())
	}
}
