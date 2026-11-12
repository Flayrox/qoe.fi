package secguard

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/qoefi/api/internal/antispam"
	"github.com/qoefi/api/internal/trust"
	"github.com/redis/go-redis/v9"
)

func newTestGuard(t *testing.T) (*Guard, *miniredis.Miniredis) {
	t.Helper()
	mr := miniredis.RunT(t)
	rc := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	t.Cleanup(func() { _ = rc.Close() })
	return New(nil, rc), mr
}

func TestEnforceRateLimit_TierModulationAndStrikeFreeze(t *testing.T) {
	g, _ := newTestGuard(t)
	ctx := context.Background()
	req := httptest.NewRequest(http.MethodPost, "/v1/posts", nil)
	req.RemoteAddr = "198.51.100.42:1234"

	// Tier Low : 5 / heure. Les 5 premiers passent, le 6e est bloqué en 429 + strike.
	for i := 0; i < 5; i++ {
		w := httptest.NewRecorder()
		if !g.EnforceRateLimit(ctx, w, req, "thoughts", "user-low", trust.TierLow, QuotasThoughts) {
			t.Fatalf("requête %d doit passer sous le quota Low", i+1)
		}
	}

	w := httptest.NewRecorder()
	if g.EnforceRateLimit(ctx, w, req, "thoughts", "user-low", trust.TierLow, QuotasThoughts) {
		t.Fatal("la 6e requête Low doit être bloquée")
	}
	if w.Code != http.StatusTooManyRequests || w.Header().Get("Retry-After") == "" {
		t.Fatalf("attendu 429 avec Retry-After, obtenu %d (%q)", w.Code, w.Header().Get("Retry-After"))
	}
}

func TestEnforceContentWrite_NewAccountLinkDowngradeAndSimHash(t *testing.T) {
	g, _ := newTestGuard(t)
	ctx := context.Background()

	// Compte âgé de 2 minutes avec 2 liens : rétrogradé en LOW (1 lien max).
	newAcct := trust.Profile{
		UserID:     "newbie",
		Tier:       trust.TierStandard,
		AccountAge: 2 * time.Minute,
	}
	w := httptest.NewRecorder()
	ok := g.EnforceContentWrite(ctx, w, "newbie", "thoughts", "Regarde https://a.test et https://b.test vite", newAcct, func(tier trust.Tier) error {
		return antispam.ValidateThought("Regarde https://a.test et https://b.test vite", nil, tier)
	})
	if ok || w.Code != http.StatusBadRequest {
		t.Fatalf("compte <5m avec 2 liens doit être bloqué en 400, obtenu ok=%v code=%d", ok, w.Code)
	}

	// Même texte légitime répété avec une légère mutation → SimHash 429 au second essai.
	stdAcct := trust.Profile{
		UserID:     "std-user",
		Tier:       trust.TierStandard,
		AccountAge: 15 * 24 * time.Hour,
	}
	msg1 := "Voici mon analyse détaillée sur l'économie numérique européenne en 2026."
	msg2 := "Voici mon analyse détaillée sur l'économie numérique européenne en 2027!"
	w1 := httptest.NewRecorder()
	if !g.EnforceContentWrite(ctx, w1, "std-user", "thoughts", msg1, stdAcct, func(tier trust.Tier) error {
		return antispam.ValidateThought(msg1, nil, tier)
	}) {
		t.Fatalf("premier post doit passer, obtenu %d", w1.Code)
	}
	w2 := httptest.NewRecorder()
	if g.EnforceContentWrite(ctx, w2, "std-user", "thoughts", msg2, stdAcct, func(tier trust.Tier) error {
		return antispam.ValidateThought(msg2, nil, tier)
	}) {
		t.Fatal("quasi-doublon SimHash doit être bloqué")
	}
	if w2.Code != http.StatusTooManyRequests {
		t.Fatalf("attendu 429, obtenu %d", w2.Code)
	}
}
