package secguard

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/qoefi/api/internal/trust"
)

// TestEvaluateRequestProfilIllisibleEstRestricted : quand le profil de confiance
// ne peut pas être lu (compte introuvable, base indisponible), le garde ne doit
// pas supposer un compte sain — il retombe sur RESTRICTED (quotas stricts).
// Avant le correctif, le repli était TierStandard, c'est-à-dire les quotas d'un
// compte vérifié.
func TestEvaluateRequestProfilIllisibleEstRestricted(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Pool pointant vers un port fermé : toute requête échoue (refus de
	// connexion), sans dépendre d'un service local.
	pool, err := pgxpool.New(ctx, "postgres://qoe:qoe@127.0.0.1:1/qoe?connect_timeout=1")
	if err != nil {
		t.Fatalf("pool : %v", err)
	}
	defer pool.Close()

	g := &Guard{pool: pool, trust: trust.NewService(pool, nil)}
	r := httptest.NewRequest(http.MethodPost, "/v1/thoughts", nil)
	r.RemoteAddr = "203.0.113.9:44321"
	r.Header.Set("X-Forwarded-For", "203.0.113.9")

	prof := g.EvaluateRequest(ctx, r, "00000000-0000-0000-0000-000000000001")
	if prof.Tier != trust.TierRestricted {
		t.Fatalf("tier = %s, attendu %s (fail-closed sur profil illisible)", prof.Tier, trust.TierRestricted)
	}
}
