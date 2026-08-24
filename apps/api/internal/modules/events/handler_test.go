package events

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
)

func newRouter(secret string) http.Handler {
	h := NewHandler(nil, secret) // client asynq nil : Publish* renvoie nil
	r := chi.NewRouter()
	h.Register(r)
	return r
}

func post(r http.Handler, path, secret, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, path, strings.NewReader(body))
	if secret != "" {
		req.Header.Set("x-qoe-internal-secret", secret)
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func TestRequireSecret(t *testing.T) {
	r := newRouter("s3cret")

	// Secret non fourni.
	if w := post(r, "/internal/events/article-published", "", `{}`); w.Code != http.StatusForbidden {
		t.Fatalf("sans header = %d, attendu 403", w.Code)
	}
	// Secret invalide.
	if w := post(r, "/internal/events/article-published", "mauvais", `{}`); w.Code != http.StatusForbidden {
		t.Fatalf("mauvais secret = %d, attendu 403", w.Code)
	}
}

func TestRequireSecret_EmptyConfigBlocksEverything(t *testing.T) {
	r := newRouter("")
	if w := post(r, "/internal/events/article-published", "peu-importe", `{}`); w.Code != http.StatusForbidden {
		t.Fatalf("secret vide côté serveur = %d, attendu 403 même avec un header", w.Code)
	}
}

func TestArticlePublished(t *testing.T) {
	r := newRouter("s3cret")

	// JSON invalide.
	w := post(r, "/internal/events/article-published", "s3cret", "{pas-du-json")
	if w.Code != http.StatusBadRequest {
		t.Fatalf("json invalide = %d, attendu 400", w.Code)
	}

	// Champs requis manquants.
	w = post(r, "/internal/events/article-published", "s3cret", `{"articleId":"a1"}`)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("publicationId manquant = %d, attendu 400", w.Code)
	}

	// Nominal (client asynq nil : enqueue simulé).
	w = post(r, "/internal/events/article-published", "s3cret",
		`{"articleId":"a1","publicationId":"p1"}`)
	if w.Code != http.StatusOK {
		t.Fatalf("nominal = %d body=%s, attendu 200", w.Code, w.Body.String())
	}
	if !strings.Contains(w.Body.String(), `"queued":true`) {
		t.Fatalf("body = %s, attendu queued:true", w.Body.String())
	}
}

func TestSubscriberCreated(t *testing.T) {
	r := newRouter("s3cret")

	w := post(r, "/internal/events/subscriber-created", "s3cret", `{invalide`)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("json invalide = %d, attendu 400", w.Code)
	}

	w = post(r, "/internal/events/subscriber-created", "s3cret", `{"email":"a@b.c"}`)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("publicationId manquant = %d, attendu 400", w.Code)
	}

	w = post(r, "/internal/events/subscriber-created", "s3cret",
		`{"email":"a@b.c","publicationId":"p1"}`)
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"queued":true`) {
		t.Fatalf("nominal = %d %s, attendu 200 queued:true", w.Code, w.Body.String())
	}
}
