package devtools

// Lot L29X — panneau de dev : panne du rôle rendue en 403, JSON tronqué qui
// déclenche un reset global, et portefeuille débité sans mouvement.

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

func TestAuditL29X_SuperadminOutageIsNotForbidden(t *testing.T) {
	svc := NewService(unreachablePool(t))
	_, err := svc.Data(context.Background(), "00000000-0000-0000-0000-0000000000aa")
	if err == nil {
		t.Fatal("panne DB ignorée")
	}
	if err == errForbidden {
		t.Fatal("panne DB rendue en 403 (réservé au superadmin)")
	}
}

func TestAuditL29X_TruncatedResetOnboardingIsRejected(t *testing.T) {
	h := NewHandler(nil) // service nil : toute atteinte du service panique
	req := httptest.NewRequest(http.MethodPost, "/v1/devtools/reset-onboarding",
		strings.NewReader(`{"target":`))
	req = req.WithContext(context.WithValue(req.Context(), middleware.UserIDKey,
		"00000000-0000-0000-0000-0000000000aa"))
	w := httptest.NewRecorder()

	func() {
		defer func() {
			if rec := recover(); rec != nil {
				t.Fatalf("JSON tronqué → panique %v : le service est atteint (reset de TOUS les onboardings)", rec)
			}
		}()
		h.resetOnboarding(w, req)
	}()

	if w.Code != http.StatusBadRequest {
		t.Fatalf("JSON tronqué → %d, attendu 400", w.Code)
	}
}

func TestAuditL29X_SubscriberPaymentDebitsReaderWallet(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	adminID, _ := seedDevtools(t)

	readerID := "00000000-0000-0000-0000-00000000a1a1"
	pubID := "audit_l29x_pub"
	if _, err := poolTest.Exec(ctx, `INSERT INTO "User" (id, email, name, role, "walletBalanceCents", "createdAt", "updatedAt")
		VALUES ($1, 'audit-l29x@test.dev', 'Lecteur', 'user', 10000, now(), now())`, readerID); err != nil {
		t.Fatalf("user: %v", err)
	}
	if _, err := poolTest.Exec(ctx, `INSERT INTO "Publisher" (id, type, name, slug, "createdAt", "updatedAt")
		VALUES ($1, 'PERSONAL', 'Pub L29X', 'pub-l29x', now(), now())`, pubID); err != nil {
		t.Fatalf("publisher: %v", err)
	}

	svc := newTestService(t)
	if err := svc.SimulateSubscriber(ctx, adminID, SimulateSubscriberParams{
		Email: "audit-l29x@test.dev", PublisherID: pubID, IsPremium: true, LtvCents: 500,
	}); err != nil {
		t.Fatalf("SimulateSubscriber: %v", err)
	}

	var balance int
	if err := poolTest.QueryRow(ctx,
		`SELECT "walletBalanceCents" FROM "User" WHERE id::text = $1`, readerID).Scan(&balance); err != nil {
		t.Fatalf("solde: %v", err)
	}
	if balance != 9500 {
		var txCount int
		_ = poolTest.QueryRow(ctx,
			`SELECT COUNT(*) FROM "WalletTransaction" WHERE "userId"::text = $1 AND "amountCents" = -500`,
			readerID).Scan(&txCount)
		t.Fatalf("solde du lecteur = %d après un débit de 500 (%d mouvement(s) -500 écrit(s)), attendu 9500", balance, txCount)
	}
}
