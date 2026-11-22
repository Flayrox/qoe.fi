package placements

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/qoefi/api/internal/middleware"
)

// unreachablePool pointe sur un port fermé : aucune connexion possible, sans
// dépendre de Docker.
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

// TestAuditL29W_UnknownAudienceIsNotBroadcast : une audience inconnue (faute de
// frappe « plus_onyl ») tombait dans le `default` permissif et la bannière
// était diffusée à tout le monde. La création doit la refuser, et la lecture
// ignorer une ligne héritée.
func TestAuditL29W_UnknownAudienceIsNotBroadcast(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	svc := NewService(poolTest)

	// Ligne héritée en base (hors service) : ne doit jamais être diffusée.
	slot := "test.slot.audit-l29w"
	if _, err := poolTest.Exec(ctx, `DELETE FROM in_app_placements WHERE slot = $1`, slot); err != nil {
		t.Fatalf("cleanup: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO in_app_placements
		 (id, slot, format, type, title, body, target_audience, priority, is_active, dismissible, created_at, updated_at)
		 VALUES (gen_random_uuid()::text, $1, 'card', 'promo', 'Audience inconnue', 'Corps',
		         'plus_onyl', 10, true, true, now(), now())`, slot); err != nil {
		t.Fatalf("insert legacy: %v", err)
	}
	got, err := svc.GetActivePlacementForSlot(ctx, slot, "", time.Now().UTC())
	if err != nil {
		t.Fatalf("GetActivePlacementForSlot: %v", err)
	}
	if got != nil {
		t.Fatalf("audience inconnue diffusée à un visiteur : %+v", got.TargetAudience)
	}

	// La création refuse l'audience hors vocabulaire.
	if _, err := svc.CreatePlacement(ctx, &Placement{
		Slot: slot + ".new", Format: "card", Type: "promo",
		Title: "T", Body: "B", TargetAudience: "plus_onyl",
	}); !errors.Is(err, ErrInvalidPlacement) {
		t.Fatalf("CreatePlacement(audience inconnue) = %v, attendu ErrInvalidPlacement", err)
	}
}

// TestAuditL29W_SuperadminOutageIsNotForbidden : toute erreur de lecture du
// rôle devenait `ErrForbidden` (403) — une base injoignable passait pour un
// refus d'autorisation.
func TestAuditL29W_SuperadminOutageIsNotForbidden(t *testing.T) {
	svc := NewService(unreachablePool(t))
	err := svc.CheckSuperadmin(context.Background(), "00000000-0000-0000-0000-0000000000aa")
	if err == nil {
		t.Fatal("panne DB avalée par CheckSuperadmin")
	}
	if errors.Is(err, ErrForbidden) {
		t.Fatalf("panne DB rendue en ErrForbidden (403) : %v", err)
	}

	// Le handler doit répondre 500, pas 403.
	h := NewHandler(svc)
	req := httptest.NewRequest(http.MethodGet, "/v1/admin/placements", nil)
	req = req.WithContext(context.WithValue(req.Context(), middleware.UserIDKey,
		"00000000-0000-0000-0000-0000000000aa"))
	w := httptest.NewRecorder()
	if _, ok := h.requireSuperadmin(w, req); ok {
		t.Fatal("requireSuperadmin a autorisé malgré la panne")
	}
	if w.Code != http.StatusInternalServerError {
		t.Fatalf("panne DB du rôle → %d, attendu 500", w.Code)
	}
}

// TestAuditL29W_NilPoolDoesNotPanic : un service sans pool doit renvoyer une
// erreur, jamais paniquer sur le chemin de lecture.
func TestAuditL29W_NilPoolDoesNotPanic(t *testing.T) {
	defer func() {
		if rec := recover(); rec != nil {
			t.Fatalf("service sans pool : panique %v au lieu d'une erreur", rec)
		}
	}()
	if _, err := NewService(nil).GetActivePlacementForSlot(
		context.Background(), "slot", "", time.Now().UTC()); err == nil {
		t.Fatal("service sans pool : err = nil")
	}
}
