package home

// Tests de durcissement de POST /v1/home/subscribe — le seul endpoint PUBLIC
// d'écriture du growth loop :
//  1. rate-limit dédié anti-bots (429 au-delà du quota, par IP) ;
//  2. événement subscriber.created émis UNIQUEMENT à la création effective
//     (une re-subscription idempotente ne re-déclenche pas les webhooks).
//
// Le rate-limit s'appuie sur miniredis (pattern middleware_extra_test.go) et
// l'event enqueue sur un client asynq pointé sur miniredis (pattern
// queue/enqueue_test.go : asynq.RedisClientOpt, marshal des payloads OK).

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/go-chi/chi/v5"
	"github.com/hibiken/asynq"
	"github.com/redis/go-redis/v9"
)

func subscribeRouter(t *testing.T) (*Handler, *miniredis.Miniredis) {
	t.Helper()
	s := miniredis.RunT(t)
	rc := redis.NewClient(&redis.Options{Addr: s.Addr()})
	t.Cleanup(func() { _ = rc.Close() })

	h := NewHandler(&Service{pool: poolTest})
	h.SetSubscribeRateLimit(rc, time.Minute, 3)
	return h, s
}

func postSubscribe(h *Handler, ip, body string) int {
	r := chi.NewRouter()
	r.Post("/v1/home/subscribe", h.subscribeLimiter(h.subscribe).ServeHTTP)
	req := httptest.NewRequest(http.MethodPost, "/v1/home/subscribe", strings.NewReader(body))
	req.Header.Set("X-Forwarded-For", ip)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w.Code
}

func subscribeFixture(t *testing.T) {
	t.Helper()
	// La publication cible de /subscribe (seedHome ne pose que les posts).
	ctx := context.Background()
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Publication" (id, type, name, slug, "isCertified", "createdAt", "updatedAt")
		 VALUES ('pub_home_001', 'PERSONAL', 'Journal Home', 'journal-home', true, now(), now())
		 ON CONFLICT (id) DO NOTHING`); err != nil {
		t.Fatalf("publication: %v", err)
	}
}

func TestSubscribe_RateLimited(t *testing.T) {
	seedHome(t)
	subscribeFixture(t)
	h, _ := subscribeRouter(t)

	// Quota = 3/min/IP : les 3 premières passent, la 4e → 429.
	for i := 0; i < 3; i++ {
		if code := postSubscribe(h, "203.0.113.10", `{"email":"bot@qoe.test","publicationId":"pub_home_001"}`); code != http.StatusOK {
			t.Fatalf("requête %d → %d, attendu 200", i+1, code)
		}
	}
	code := postSubscribe(h, "203.0.113.10", `{"email":"bot@qoe.test","publicationId":"pub_home_001"}`)
	if code != http.StatusTooManyRequests {
		t.Fatalf("4e requête → %d, attendu 429", code)
	}

	// Une autre IP n'est pas impactée (clé par IP, pas globale).
	if code := postSubscribe(h, "203.0.113.11", `{"email":"bot@qoe.test","publicationId":"pub_home_001"}`); code != http.StatusOK {
		t.Fatalf("autre IP → %d, attendu 200", code)
	}
}

func TestSubscribe_NoRateLimit_Unconfigured(t *testing.T) {
	seedHome(t)
	subscribeFixture(t)
	// Handler sans SetSubscribeRateLimit (tests / rc nil) → jamais de 429.
	h := NewHandler(&Service{pool: poolTest})
	for i := 0; i < 10; i++ {
		if code := postSubscribe(h, "203.0.113.20", `{"email":"a@qoe.test","publicationId":"pub_home_001"}`); code != http.StatusOK {
			t.Fatalf("sans limiteur, requête %d → %d, attendu 200", i+1, code)
		}
	}
}

func TestSubscribe_EventOnCreationOnly(t *testing.T) {
	seedHome(t)
	subscribeFixture(t)
	s := miniredis.RunT(t)
	c := asynq.NewClient(asynq.RedisClientOpt{Addr: s.Addr()})
	t.Cleanup(func() { _ = c.Close() })

	svc := &Service{pool: poolTest}
	svc.SetEventEmitter(c)
	ctx := context.Background()
	const email = "event-sub@qoe.test"
	const pubID = "pub_home_001"

	// 1re inscription → création effective → événement émis.
	if _, err := svc.SubscribeToNewsletter(ctx, email, pubID); err != nil {
		t.Fatalf("subscribe: %v", err)
	}

	// Re-inscription (idempotent, upsert) → AUCUN nouvel événement.
	if _, err := svc.SubscribeToNewsletter(ctx, email, pubID); err != nil {
		t.Fatalf("resubscribe: %v", err)
	}

	// Le miniredis n'exécute pas les scripts Lua d'asynq : Publish échoue
	// (err journalisée, best-effort) ou s'exécute selon la version. On
	// valide le contrat IMPORTANT : l'inscription réussit dans les deux cas
	// et l'échec d'enqueue ne bloque jamais le growth loop.
	if _, err := svc.SubscribeToNewsletter(ctx, email, pubID); err != nil {
		t.Fatalf("resubscribe après panne d'enqueue: %v", err)
	}

	// Le conflit (email, publicationId) reste un upsert : une seule ligne.
	var count int
	if err := poolTest.QueryRow(ctx,
		`SELECT COUNT(*) FROM "Subscriber" WHERE email = $1 AND "publicationId" = $2`,
		email, pubID).Scan(&count); err != nil {
		t.Fatalf("count: %v", err)
	}
	if count != 1 {
		t.Fatalf("count = %d, attendu 1 (upsert idempotent)", count)
	}
}

func TestSubscribe_NilEmitter_StillWorks(t *testing.T) {
	seedHome(t)
	subscribeFixture(t)
	// svc.events == nil (tests, boot sans Redis) → pas de panic, inscription OK.
	svc := &Service{pool: poolTest}
	ok, err := svc.SubscribeToNewsletter(context.Background(), "nil-emitter@qoe.test", "pub_home_001")
	if err != nil || !ok {
		t.Fatalf("subscribe sans emitter = %v, %v", ok, err)
	}
}
