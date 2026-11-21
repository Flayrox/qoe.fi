package secguard

import (
	"context"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/qoefi/api/internal/trust"
	"github.com/redis/go-redis/v9"
)

// Le commentaire du type Guard promet que « toutes ses méthodes sont
// nil-safe pour ne jamais gêner les tests isolés ». Deux chemins ne le sont
// pas : un garde nil avec validate nil, et un garde dont rc est posé mais
// spam absent (montage partiel en test).
func TestNilGuard_EnforceContentWriteSansValidate(t *testing.T) {
	var g *Guard
	ok := g.EnforceContentWrite(context.Background(), httptest.NewRecorder(),
		"user_1", "posts", "texte", trust.Profile{}, nil)
	if !ok {
		t.Fatal("garde nil avec validate nil doit laisser passer")
	}
}

func TestGuard_EnforceRateLimit_SansAntiSpam(t *testing.T) {
	rc := redis.NewClient(&redis.Options{Addr: "127.0.0.1:1", DialTimeout: 20 * time.Millisecond})
	defer func() { _ = rc.Close() }()

	g := &Guard{rc: rc} // spam volontairement absent
	req := httptest.NewRequest("POST", "/v1/thoughts", nil)
	ok := g.EnforceRateLimit(context.Background(), httptest.NewRecorder(), req,
		"thoughts", "user_1", trust.TierStandard, QuotasThoughts)
	if !ok {
		t.Fatal("Redis injoignable doit rester fail-open")
	}
}
