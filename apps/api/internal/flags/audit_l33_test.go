package flags

// Audit L33 — rouge de reproduction (exécuté à f51e63e0 avant correctif).

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Une panne de base vidait le cache AVANT de relire la table : le commentaire
// de reload promet de « garder le cache précédent », le code le remettait à
// zéro. Tous les arrêts d'urgence (inscriptions, e-mails, PoW) retombaient donc
// à leur défaut `false` — désarmés — au moment précis où la base vacille.
func TestAuditL33_FlagCacheSurvivesDBOutage(t *testing.T) {
	ctx := context.Background()
	// Pool volontairement injoignable : toute relecture échoue (panne DB).
	pool, err := pgxpool.New(ctx, "postgres://audit:audit@127.0.0.1:1/audit?sslmode=disable&connect_timeout=1")
	if err != nil {
		t.Fatalf("pool de test : %v", err)
	}
	t.Cleanup(pool.Close)

	svc := NewService(pool)
	// Cache déjà chargé, arrêt d'urgence ARMÉ (état réel d'une attaque en cours).
	svc.cached = map[string]bool{AbuseSignupKill: true}
	svc.at = time.Now().Add(-time.Minute)

	oldTTL := cacheTTL
	cacheTTL = 0
	t.Cleanup(func() { cacheTTL = oldTTL })

	if !svc.IsOn(ctx, AbuseSignupKill) {
		t.Fatal("panne DB : le coupe-feu inscriptions est retombé à son défaut (désarmé)")
	}
}

// NewService(nil) est documenté comme dégradation gracieuse (« table absente,
// DB down ou clé inconnue → valeur par défaut, zéro crash ») : le service doit
// répondre, pas paniquer.
func TestAuditL33_NilPoolDoesNotPanic(t *testing.T) {
	svc := NewService(nil)
	if !svc.IsOn(context.Background(), FeedRecommendations) {
		t.Fatal("défaut du registre attendu sans base")
	}
}

// GET /v1/flags est public : il ne doit pas annoncer l'état des coupe-feux
// (inscriptions, e-mails, support, autorisation). Un attaquant apprenait sinon
// en une requête non authentifiée si les protections étaient armées.
func TestAuditL33_PublicFlagsDoNotLeakSwitches(t *testing.T) {
	requirePool(t)
	r := chi.NewRouter()
	NewHandler(NewService(poolTest)).RegisterPublic(r)
	req := httptest.NewRequest(http.MethodGet, "/v1/flags", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("GET /v1/flags = %d", w.Code)
	}
	var body map[string]bool
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("JSON invalide: %v", err)
	}
	for _, key := range []string{AuthzEnforce, WorkersEmailKill, AbuseSignupKill, SupportPublicKill, AdminAuditLog} {
		if _, ok := body[key]; ok {
			t.Fatalf("état du coupe-feu %q exposé publiquement par /v1/flags", key)
		}
	}
}
