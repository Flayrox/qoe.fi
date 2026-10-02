package admin

// =====================================================================
// 🧪 Audit lisible et journal des refus (Phase 4)
// =====================================================================
// Ce que ces tests verrouillent :
//   - un mouvement d'accès écrit une trace ENRICHIE (capacité, motif, après) et
//     se relit par filtre — « qui a fait quoi » sans fouiller les logs ;
//   - le filtre ne ment pas : une capacité sans trace ne rend rien, une période
//     illisible est refusée (on ne devine pas une date) ;
//   - l'export CSV sort du serveur, échappé, avec la même autorisation que la
//     lecture ;
//   - le journal des décisions distingue le REFUS APPLIQUÉ du refus seulement
//     OBSERVÉ, et sait ne rendre que les refus — la lecture qui prépare le
//     passage en `authz-enforce`.
// =====================================================================

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/qoefi/api/internal/adminauthz"
)

// seedDecision écrit une décision d'autorisation (ce que fait le Recorder en
// production) : le test exerce ainsi la même forme de ligne.
func seedDecision(t *testing.T, ctx context.Context, capability string, allowed bool, code, mode, userID string) {
	t.Helper()
	requirePool(t)
	var uid any
	if userID != "" {
		uid = userID
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "AdminAuthzDecision"
		   ("id", "userId", "capability", "allowed", "code", "mode", "method", "path", "ip", "requestId")
		 VALUES (gen_random_uuid()::text, $1::uuid, $2, $3, $4, $5, 'PATCH', '/v1/admin/users/x', '203.0.113.9', 'req-1')`,
		uid, capability, allowed, code, mode); err != nil {
		t.Fatalf("seed décision %s: %v", capability, err)
	}
}

func TestAuditEntries_EnrichedAndFiltered(t *testing.T) {
	ctx := context.Background()
	seedAdmin(t, ctx)
	svc := newTestService()

	// Le journal n'a pas de FK vers "User" (une trace doit survivre à la
	// suppression d'un compte) — et seedAdmin ne le vide pas. On part donc d'un
	// journal vide pour que les comptes aient un sens.
	if _, err := poolTest.Exec(ctx, `DELETE FROM "AdminAuditLog"`); err != nil {
		t.Fatalf("purge audit: %v", err)
	}

	if _, err := svc.GrantAccess(ctx, adminAdminID, GrantAccessInput{
		UserID: adminReaderID, RoleKey: adminauthz.RoleAnalyst,
		ExpiresAt: "2030-12-31", Reason: "renfort modération ; besoin d'audit",
	}); err != nil {
		t.Fatalf("attribution: %v", err)
	}

	entries, err := svc.ListAuditEntries(ctx, AuditFilter{
		Capability: string(adminauthz.AccessGrant), Limit: 10,
	})
	if err != nil {
		t.Fatalf("lecture filtrée: %v", err)
	}
	if len(entries) != 1 {
		t.Fatalf("entrées = %d, attendu 1 (%+v)", len(entries), entries)
	}
	entry := entries[0]
	if entry.ActorID != adminAdminID {
		t.Errorf("acteur = %q", entry.ActorID)
	}
	if entry.ActorEmail == "" {
		t.Error("email de l'acteur non résolu")
	}
	if entry.Capability == nil || *entry.Capability != string(adminauthz.AccessGrant) {
		t.Errorf("capacité = %v", entry.Capability)
	}
	if entry.Reason == nil || !strings.Contains(*entry.Reason, "renfort modération") {
		t.Errorf("motif = %v", entry.Reason)
	}
	if len(entry.After) == 0 || !strings.Contains(string(entry.After), adminauthz.RoleAnalyst) {
		t.Errorf("diff après = %s", entry.After)
	}
	if entry.TargetID == nil || *entry.TargetID != adminReaderID {
		t.Errorf("cible = %v", entry.TargetID)
	}

	// Un filtre qui ne correspond à rien ne rend rien (jamais « tout » par
	// défaut : un filtre silencieusement ignoré ferait croire à un historique).
	none, err := svc.ListAuditEntries(ctx, AuditFilter{Capability: string(adminauthz.AuditRead), Limit: 10})
	if err != nil {
		t.Fatalf("lecture filtrée (autre capacité): %v", err)
	}
	if len(none) != 0 {
		t.Fatalf("entrées inattendues : %+v", none)
	}

	// Filtre par acteur (email) : l'acteur est bien retrouvé.
	byActor, err := svc.ListAuditEntries(ctx, AuditFilter{Actor: "admin-adm@test.dev", Limit: 10})
	if err != nil {
		t.Fatalf("lecture par acteur: %v", err)
	}
	if len(byActor) != 1 {
		t.Fatalf("entrées par acteur = %d, attendu 1", len(byActor))
	}

	// Période illisible : refus explicite, jamais une période devinée.
	if _, err := svc.ListAuditEntries(ctx, AuditFilter{Since: "hier", Limit: 10}); !errors.Is(err, errInvalidAccess) {
		t.Fatalf("période illisible : err = %v, attendu errInvalidAccess", err)
	}

	// CSV : en-tête + ligne, motif échappé (le « ; » du motif reste une donnée,
	// pas un séparateur).
	csvBody, err := AuditCSV(entries)
	if err != nil {
		t.Fatalf("csv: %v", err)
	}
	if !strings.HasPrefix(csvBody, "createdAt;actorId;actorEmail;") {
		t.Fatalf("en-tête CSV inattendu : %s", strings.SplitN(csvBody, "\n", 2)[0])
	}
	if !strings.Contains(csvBody, "admin-adm@test.dev") {
		t.Error("CSV sans l'acteur")
	}
	if !strings.Contains(csvBody, `"renfort modération ; besoin d'audit"`) {
		t.Errorf("motif non échappé dans le CSV : %s", csvBody)
	}
	if !strings.Contains(csvBody, adminauthz.RoleAnalyst) {
		t.Error("CSV sans le diff après")
	}
}

func TestAuthzDecisions_DenyIsReadable(t *testing.T) {
	ctx := context.Background()
	seedAdmin(t, ctx)
	svc := newTestService()

	if _, err := poolTest.Exec(ctx, `DELETE FROM "AdminAuthzDecision"`); err != nil {
		t.Fatalf("purge décisions: %v", err)
	}

	seedDecision(t, ctx, string(adminauthz.UsersModerate), true, "allow", "enforce", adminAdminID)
	seedDecision(t, ctx, string(adminauthz.UsersModerate), false, "deny_missing_capability", "observe", adminReaderID)
	seedDecision(t, ctx, string(adminauthz.UsersModerate), false, "deny_missing_capability", "enforce", adminReaderID)
	seedDecision(t, ctx, string(adminauthz.ConfigWrite), false, "deny_missing_capability", "observe", adminReaderID)

	groups, err := svc.ListAuthzDecisionGroups(ctx, 0)
	if err != nil {
		t.Fatalf("groupes: %v", err)
	}
	// Quatre groupes : (modération, accordé, enforce), (modération, refusé,
	// enforce), (modération, refusé, observe) et (config, refusé, observe).
	if len(groups) != 4 {
		t.Fatalf("groupes = %d, attendu 4 (%+v)", len(groups), groups)
	}
	// Le refus OBSERVÉ est distingué du refus APPLIQUÉ : c'est toute la
	// différence entre « serait bloqué » et « est bloqué ».
	var observed, enforced int64
	for _, group := range groups {
		if group.Capability != string(adminauthz.UsersModerate) || group.Allowed {
			continue
		}
		switch group.Mode {
		case "observe":
			observed = group.Total
		case "enforce":
			enforced = group.Total
		}
		if group.LastAt == "" {
			t.Errorf("groupe %+v sans horodatage", group)
		}
	}
	if observed != 1 || enforced != 1 {
		t.Fatalf("refus observés=%d appliqués=%d, attendu 1 et 1", observed, enforced)
	}

	denied, err := svc.ListAuthzDecisions(ctx, AuthzDecisionFilter{OnlyDenied: true, Limit: 10})
	if err != nil {
		t.Fatalf("refus: %v", err)
	}
	if len(denied) != 3 {
		t.Fatalf("refus listés = %d, attendu 3 : %+v", len(denied), denied)
	}
	for _, item := range denied {
		if item.Allowed {
			t.Errorf("un accord dans la liste des refus : %+v", item)
		}
	}
	if denied[0].Email == "" || denied[0].UserID == nil {
		t.Errorf("décision sans personne résolue : %+v", denied[0])
	}
	if denied[0].IP == nil || *denied[0].IP != "203.0.113.9" {
		t.Errorf("IP = %v", denied[0].IP)
	}

	filtered, err := svc.ListAuthzDecisions(ctx, AuthzDecisionFilter{
		Capability: string(adminauthz.ConfigWrite), Window: time.Hour, Limit: 10,
	})
	if err != nil {
		t.Fatalf("filtre capacité: %v", err)
	}
	if len(filtered) != 1 || filtered[0].Capability != string(adminauthz.ConfigWrite) {
		t.Fatalf("filtre inopérant : %+v", filtered)
	}
}
