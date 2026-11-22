package billing

// Lot L29W — une panne de lecture de la formule ne doit pas être servie comme
// « formule introuvable » (404) : le client croit que le catalogue a changé.

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/qoefi/api/internal/middleware"
)

func unreachablePool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	pool, err := pgxpool.New(ctx, "postgres://qoe:qoe@127.0.0.1:1/qoe?connect_timeout=1")
	if err != nil {
		t.Fatalf("pool: %v", err)
	}
	t.Cleanup(pool.Close)
	return pool
}

func TestAuditL29W_TierOutageIsNotNotFound(t *testing.T) {
	svc := NewService(unreachablePool(t))
	if _, err := svc.GetTier(context.Background(), "tier_1"); err == nil || err == ErrTierNotFound {
		t.Fatalf("panne DB rendue en ErrTierNotFound: %v", err)
	}

	// Le handler doit répondre 500, pas 404.
	stripeSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	t.Cleanup(stripeSrv.Close)

	h := NewHandler(nil, "whsec")
	h.SetBilling(svc, NewStripeClient("sk_test", stripeSrv.URL), "price_plus", "http://localhost:3000")

	body := `{"plan":"publication","publisherId":"pub_1","tierId":"tier_1"}`
	req := httptest.NewRequest(http.MethodPost, "/v1/billing/checkout", strings.NewReader(body))
	req = req.WithContext(context.WithValue(req.Context(), middleware.UserIDKey,
		"00000000-0000-0000-0000-0000000000aa"))
	w := httptest.NewRecorder()
	h.checkout(w, req)

	if w.Code == http.StatusNotFound {
		t.Fatalf("panne DB → 404 (formule introuvable), attendu 500")
	}
	if w.Code != http.StatusInternalServerError {
		t.Fatalf("panne DB → %d, attendu 500", w.Code)
	}
}
