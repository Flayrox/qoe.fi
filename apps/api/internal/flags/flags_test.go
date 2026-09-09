package flags

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

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

// TestHandler_GetFlags_Signed vérifie le format signé : body `{flags, ts}` +
// header X-Flags-Signature (HMAC sur `ts + "." + body brut`), vérifiable
// octet-pour-octet par un widget, avec rejet de toute altération/rejeu.
func TestHandler_GetFlags_Signed(t *testing.T) {
	ctx := context.Background()
	resetFlagsTable(t, ctx)
	defer resetFlagsTable(t, ctx)

	setFlag(t, ctx, WorkersNewsletter, false)
	const key = "widget-secret-test"

	r := chi.NewRouter()
	NewHandler(NewService(poolTest)).WithSigningKey(key).RegisterPublic(r)

	req := httptest.NewRequest(http.MethodGet, "/v1/flags", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("GET /v1/flags = %d, body=%s", w.Code, w.Body.String())
	}

	var body struct {
		Flags map[string]bool `json:"flags"`
		Ts    int64           `json:"ts"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("JSON invalide: %v", err)
	}
	sig := w.Header().Get("X-Flags-Signature")
	if sig == "" || body.Ts == 0 {
		t.Fatalf("réponse non signée (header sig=%q ts=%d)", sig, body.Ts)
	}
	if body.Flags[WorkersNewsletter] {
		t.Fatal("workers-newsletter-dispatch = true, attendu false")
	}

	// Vérification exacte : octets bruts du body + timestamp extrait — c'est
	// exactement ce que fait un widget avec la clé (aucune ré-sérialisation).
	rawBody := w.Body.Bytes()
	if !VerifyFlagsPayload(rawBody, body.Ts, sig, key, 5*time.Minute) {
		t.Fatal("signature valide rejetée")
	}
	// Altération d'un octet du body → signature invalide (n'importe quel
	// bit modifié casse le HMAC).
	tampered := append([]byte{}, rawBody...)
	tampered[len(tampered)-1] ^= 0x01
	if VerifyFlagsPayload(tampered, body.Ts, sig, key, 5*time.Minute) {
		t.Fatal("signature acceptée sur un body altéré")
	}
	// Mauvaise clé → rejet.
	if VerifyFlagsPayload(rawBody, body.Ts, sig, "autre-cle", 5*time.Minute) {
		t.Fatal("signature acceptée avec une mauvaise clé")
	}
	// Timestamp périmé (fraîcheur) → rejet.
	if VerifyFlagsPayload(rawBody, body.Ts-3600, sig, key, 5*time.Minute) {
		t.Fatal("signature acceptée avec un timestamp périmé")
	}
	// Timestamp futur (rejeu anticipé) → rejet.
	if VerifyFlagsPayload(rawBody, body.Ts+3600, sig, key, 5*time.Minute) {
		t.Fatal("signature acceptée avec un timestamp futur")
	}
	// Sans clé (mode passif) : pas de header de signature, body = map simple.
	r2 := chi.NewRouter()
	NewHandler(NewService(poolTest)).RegisterPublic(r2)
	w2 := httptest.NewRecorder()
	r2.ServeHTTP(w2, httptest.NewRequest(http.MethodGet, "/v1/flags", nil))
	if w2.Header().Get("X-Flags-Signature") != "" {
		t.Fatal("header de signature présent sans clé configurée")
	}
	var plain map[string]bool
	if err := json.Unmarshal(w2.Body.Bytes(), &plain); err != nil {
		t.Fatalf("mode passif JSON invalide: %v", err)
	}
	if _, ok := plain[WorkersNewsletter]; !ok {
		t.Fatalf("mode passif sans la clé %s: %v", WorkersNewsletter, plain)
	}
}
