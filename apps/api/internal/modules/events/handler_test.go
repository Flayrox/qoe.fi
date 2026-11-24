package events

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/alicebob/miniredis/v2"
	"github.com/go-chi/chi/v5"
	"github.com/hibiken/asynq"
)

// newRouter monte le handler SANS file d'attente : les routes protégées
// répondent 503 après validation (l'enqueue ne doit jamais être simulé).
func newRouter(secret string) http.Handler {
	h := NewHandler(nil, secret)
	r := chi.NewRouter()
	h.Register(r)
	return r
}

// newQueueRouter monte le handler sur un miniredis : chemin nominal réel
// (l'événement est bien mis en file).
func newQueueRouter(t *testing.T, secret string) http.Handler {
	t.Helper()
	mr := miniredis.RunT(t)
	client := asynq.NewClient(asynq.RedisClientOpt{Addr: mr.Addr()})
	t.Cleanup(func() { _ = client.Close() })
	h := NewHandler(client, secret)
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
		t.Fatalf("publisherId manquant = %d, attendu 400", w.Code)
	}

	// Nominal : file réelle (miniredis), l'événement doit partir.
	r = newQueueRouter(t, "s3cret")
	w = post(r, "/internal/events/article-published", "s3cret",
		`{"articleId":"a1","publisherId":"p1"}`)
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
		t.Fatalf("publisherId manquant = %d, attendu 400", w.Code)
	}

	r = newQueueRouter(t, "s3cret")
	w = post(r, "/internal/events/subscriber-created", "s3cret", `{"email":"a@b.c","publisherId":"p1"}`)
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"queued":true`) {
		t.Fatalf("nominal = %d %s, attendu 200 queued:true", w.Code, w.Body.String())
	}
}

func TestMailEvents(t *testing.T) {
	r := newRouter("s3cret")

	// Secret absent → 403.
	if w := post(r, "/internal/events/mail-events", "", `{}`); w.Code != http.StatusForbidden {
		t.Fatalf("sans secret = %d, attendu 403", w.Code)
	}
	// JSON invalide → 400.
	if w := post(r, "/internal/events/mail-events", "s3cret", `{bad`); w.Code != http.StatusBadRequest {
		t.Fatalf("json invalide = %d, attendu 400", w.Code)
	}
	// Email invalide → 400.
	if w := post(r, "/internal/events/mail-events", "s3cret", `{"event":"hard_bounce","email":"pas-un-email"}`); w.Code != http.StatusBadRequest {
		t.Fatalf("email invalide = %d, attendu 400", w.Code)
	}
	// Event inconnu → 400.
	if w := post(r, "/internal/events/mail-events", "s3cret", `{"event":"unknown","email":"a@b.c"}`); w.Code != http.StatusBadRequest {
		t.Fatalf("event inconnu = %d, attendu 400", w.Code)
	}
	// Pool nil sur bounce → 503.
	if w := post(r, "/internal/events/mail-events", "s3cret", `{"event":"hard_bounce","email":"a@b.c"}`); w.Code != http.StatusServiceUnavailable {
		t.Fatalf("sans pool = %d, attendu 503", w.Code)
	}

	// Handler instrumenté sans DB pour vérifier le routage complet des cas.
	type recordedCall struct {
		email, scope, pubID, reason, source string
	}
	var calls []recordedCall
	h := NewHandler(nil, "s3cret")
	h.recordSuppressionFn = func(_ context.Context, email, scope string, pubID *string, reason, source string) error {
		pid := ""
		if pubID != nil {
			pid = *pubID
		}
		calls = append(calls, recordedCall{email, scope, pid, reason, source})
		return nil
	}
	mux := chi.NewRouter()
	h.Register(mux)

	// soft_bounce ignoré sans insertion.
	if w := post(mux, "/internal/events/mail-events", "s3cret", `{"event":"soft_bounce","email":"a@b.c"}`); w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"suppressed":false`) {
		t.Fatalf("soft_bounce = %d %s", w.Code, w.Body.String())
	}
	// hard_bounce → global / hard_bounce.
	if w := post(mux, "/internal/events/mail-events", "s3cret", `{"event":"hard_bounce","recipient":"bounce@example.com"}`); w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"reason":"hard_bounce"`) {
		t.Fatalf("hard_bounce = %d %s", w.Code, w.Body.String())
	}
	// complaint → global / complaint.
	if w := post(mux, "/internal/events/mail-events", "s3cret", `{"event":"spam_complaint","email":"spam@example.com","source":"stalwart"}`); w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"reason":"complaint"`) {
		t.Fatalf("complaint = %d %s", w.Code, w.Body.String())
	}
	// unsubscribe avec publisherId → publisher / unsubscribe.
	if w := post(mux, "/internal/events/mail-events", "s3cret", `{"event":"unsubscribe","email":"unsub@example.com","publisherId":"pub-99"}`); w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"reason":"unsubscribe"`) {
		t.Fatalf("unsubscribe = %d %s", w.Code, w.Body.String())
	}

	if len(calls) != 3 {
		t.Fatalf("calls = %d, attendu 3: %+v", len(calls), calls)
	}
	if calls[0].scope != "global" || calls[0].reason != "hard_bounce" || calls[0].source != "stalwart_webhook" {
		t.Errorf("call 0 = %+v", calls[0])
	}
	if calls[1].scope != "global" || calls[1].reason != "complaint" || calls[1].source != "stalwart" {
		t.Errorf("call 1 = %+v", calls[1])
	}
	if calls[2].scope != "publisher" || calls[2].pubID != "pub-99" || calls[2].reason != "unsubscribe" {
		t.Errorf("call 2 = %+v", calls[2])
	}
}
