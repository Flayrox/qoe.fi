package admin

// =====================================================================
// 🧪 Santé de la plateforme (Phase 7)
// =====================================================================
// Ce que ces tests verrouillent :
//   - la base répond et la latence est mesurée ;
//   - la version de migration APPLIQUÉE est lue (et pas devinée) : elle doit au
//     moins couvrir l'audit enrichi (00057) ;
//   - les compteurs de 24 h distinguent refus appliqué et refus observé ;
//   - un service sans base rend une santé DÉGRADÉE, jamais un panic.
// =====================================================================

import (
	"context"
	"testing"

	"github.com/qoefi/api/internal/adminauthz"
)

func TestPlatformHealth_ReportsBaseAndMigration(t *testing.T) {
	ctx := context.Background()
	seedAdmin(t, ctx)
	svc := newTestService()

	if _, err := poolTest.Exec(ctx, `DELETE FROM "AdminAuthzDecision"`); err != nil {
		t.Fatalf("purge décisions: %v", err)
	}
	seedDecision(t, ctx, string(adminauthz.ConfigWrite), true, "allow", "enforce", adminAdminID)
	seedDecision(t, ctx, string(adminauthz.ConfigWrite), false, "deny_missing_capability", "observe", adminReaderID)
	seedDecision(t, ctx, string(adminauthz.ConfigWrite), false, "deny_missing_capability", "enforce", adminReaderID)

	health := svc.GetPlatformHealth(ctx)
	if !health.Postgres.OK {
		t.Fatalf("postgres KO : %+v", health.Postgres)
	}
	if health.Postgres.LatencyMs < 0 {
		t.Errorf("latence négative : %d", health.Postgres.LatencyMs)
	}
	// La version appliquée doit couvrir la migration qui a créé la table lue.
	if health.Migration.Applied < 57 {
		t.Fatalf("migration appliquée = %d, attendu ≥ 57 (%s)", health.Migration.Applied, health.Migration.Error)
	}
	if health.Version == "" {
		t.Error("version vide : la santé doit nommer le binaire")
	}
	want := DecisionWindowCounts{Allowed: 1, DeniedObserved: 1, DeniedEnforced: 1}
	if health.Decisions.Last24h != want {
		t.Fatalf("compteurs 24 h = %+v, attendu %+v", health.Decisions.Last24h, want)
	}
}

func TestPlatformHealth_WithoutPoolIsDegraded(t *testing.T) {
	svc := NewService(nil)
	health := svc.GetPlatformHealth(context.Background())
	if health.Postgres.OK {
		t.Error("une base absente ne doit pas être annoncée en bonne santé")
	}
	if health.Postgres.Error == "" {
		t.Error("la dégradation doit être expliquée")
	}
	if health.Version == "" {
		t.Error("la version reste lisible même sans base")
	}
}
