package flags

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/qoefi/api/internal/testutil"
)

var poolTest *pgxpool.Pool

func TestMain(m *testing.M) {
	p, err := testutil.Pool(context.Background())
	if err != nil {
		log.Fatalf("testcontainers: %v", err)
	}
	poolTest = p
	code := m.Run()
	testutil.Cleanup()
	os.Exit(code)
}

func setFlag(t *testing.T, ctx context.Context, key string, enabled bool) {
	t.Helper()
	if _, err := poolTest.Exec(ctx, `
		INSERT INTO feature_flags (key, is_enabled, description, target_roles)
		VALUES ($1, $2, 'test', '{all}')
		ON CONFLICT (key) DO UPDATE SET is_enabled = EXCLUDED.is_enabled`, key, enabled); err != nil {
		t.Fatalf("set flag %s: %v", key, err)
	}
}

func resetFlagsTable(t *testing.T, ctx context.Context) {
	t.Helper()
	if _, err := poolTest.Exec(ctx, `DELETE FROM feature_flags`); err != nil {
		t.Fatalf("reset flags: %v", err)
	}
}

// TestDefaults_TableAbsent vérifie la dégradation gracieuse : aucune ligne
// (ou table vidée) → les défauts du registre s'appliquent, zéro crash.
func TestDefaults_TableEmpty(t *testing.T) {
	ctx := context.Background()
	resetFlagsTable(t, ctx)
	defer resetFlagsTable(t, ctx)

	svc := NewService(poolTest)
	all := svc.All(ctx)
	if !all[WorkersNewsletter] {
		t.Fatal("workers-newsletter-dispatch défaut = false, attendu true")
	}
	if all[AdminAuditLog] {
		t.Fatal("admin-audit-log défaut = true, attendu false")
	}
	// Clé inconnue → faux, jamais de panique.
	if svc.IsOn(ctx, "clé-inconnue") {
		t.Fatal("IsOn(clé-inconnue) = true, attendu false")
	}
}

// TestOverrides_FromTable vérifie que la table feature_flags (pilotée par la
// console admin / @qoe/flags) surcharge les défauts — l'unification UI + Go.
func TestOverrides_FromTable(t *testing.T) {
	ctx := context.Background()
	resetFlagsTable(t, ctx)
	defer resetFlagsTable(t, ctx)

	setFlag(t, ctx, WebNewsletterBanner, true)
	setFlag(t, ctx, WorkersNewsletter, false)

	svc := NewService(poolTest)
	all := svc.All(ctx)
	if !all[WebNewsletterBanner] {
		t.Fatal("web-newsletter-banner = false, attendu true (surcharge table)")
	}
	if all[WorkersNewsletter] {
		t.Fatal("workers-newsletter-dispatch = true, attendu false (surcharge table)")
	}
	if !svc.IsOn(ctx, WebNewsletterBanner) {
		t.Fatal("IsOn(web-newsletter-banner) = false, attendu true")
	}
}

// TestCacheTTL vérifie que le cache TTL est respecté : une bascule console est
// vue après expiration, pas avant.
func TestCacheTTL(t *testing.T) {
	ctx := context.Background()
	resetFlagsTable(t, ctx)
	defer resetFlagsTable(t, ctx)

	old := cacheTTL
	cacheTTL = 0 // chaque appel recharge immédiatement
	defer func() { cacheTTL = old }()

	setFlag(t, ctx, WorkersNewsletter, false)
	svc := NewService(poolTest)
	if svc.IsOn(ctx, WorkersNewsletter) {
		t.Fatal("workers-newsletter-dispatch = true, attendu false")
	}
	setFlag(t, ctx, WorkersNewsletter, true)
	if !svc.IsOn(ctx, WorkersNewsletter) {
		t.Fatal("bascule non vue après expiration du cache")
	}
}

// TestHandler_GetFlags vérifie GET /v1/flags (public, JSON de tous les flags).
func TestHandler_GetFlags(t *testing.T) {
	ctx := context.Background()
	resetFlagsTable(t, ctx)
	defer resetFlagsTable(t, ctx)

	setFlag(t, ctx, WorkersNewsletter, false)

	r := chi.NewRouter()
	NewHandler(NewService(poolTest)).RegisterPublic(r)

	req := httptest.NewRequest(http.MethodGet, "/v1/flags", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("GET /v1/flags = %d, body=%s", w.Code, w.Body.String())
	}
	var body map[string]bool
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("JSON invalide: %v", err)
	}
	if _, ok := body[WorkersNewsletter]; !ok {
		t.Fatalf("réponse sans la clé %s: %v", WorkersNewsletter, body)
	}
	if body[WorkersNewsletter] {
		t.Fatal("workers-newsletter-dispatch = true dans la réponse, attendu false")
	}
}
