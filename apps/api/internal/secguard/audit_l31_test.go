package secguard

// Audit L31 : sans identifiant d'utilisateur, `EnforceRateLimit` rend `true`
// sans consulter Redis — aucune fenêtre n'est appliquée. Une route montée
// avant l'authentification (ou un appelant qui oublie l'UID) perd donc tout
// plafond anti-flood.

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"

	"github.com/qoefi/api/internal/trust"
)

func TestAuditL31_RateLimitAppliesWithoutUserID(t *testing.T) {
	mr := miniredis.RunT(t)
	rc := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	t.Cleanup(func() { _ = rc.Close() })

	g := &Guard{rc: rc}
	quotas := TierQuotas{Standard: QuotaWindow{PerMin: 1}}
	req := httptest.NewRequest(http.MethodPost, "/v1/posts", nil)
	req.RemoteAddr = "203.0.113.7:53144"

	ctx := context.Background()
	if !g.EnforceRateLimit(ctx, httptest.NewRecorder(), req, "posts", "", trust.TierStandard, quotas) {
		t.Fatal("première requête bloquée")
	}
	if g.EnforceRateLimit(ctx, httptest.NewRecorder(), req, "posts", "", trust.TierStandard, quotas) {
		t.Fatal("sans identifiant, le plafond n'est jamais appliqué (fail-open)")
	}
}
