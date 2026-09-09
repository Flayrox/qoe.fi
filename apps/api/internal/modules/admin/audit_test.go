package admin

// Tests du journal d'audit superadmin : le flag admin-audit-log (table
// feature_flags partagée) active les écritures ; chaque bascule de permissions
// API / contrôle d'accès est tracée (qui, quand, quoi) et lisible via
// ListAuditLogs.

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/qoefi/api/internal/flags"
)

func setAuditFlag(t *testing.T, ctx context.Context, enabled bool) {
	t.Helper()
	if _, err := poolTest.Exec(ctx, `
		INSERT INTO feature_flags (key, is_enabled, description, target_roles)
		VALUES ('admin-audit-log', $1, 'test', '{admin}')
		ON CONFLICT (key) DO UPDATE SET is_enabled = EXCLUDED.is_enabled`, enabled); err != nil {
		t.Fatalf("set audit flag: %v", err)
	}
}

func countAuditEntries(t *testing.T, ctx context.Context) int {
	t.Helper()
	var n int
	if err := poolTest.QueryRow(ctx, `SELECT COUNT(*) FROM "AdminAuditLog"`).Scan(&n); err != nil {
		t.Fatalf("count audit: %v", err)
	}
	return n
}

func TestAuditLog_TracesPermissionChanges(t *testing.T) {
	ctx := context.Background()
	seedAdmin(t, ctx)
	setAuditFlag(t, ctx, true)
	defer setAuditFlag(t, ctx, false)
	if _, err := poolTest.Exec(ctx, `DELETE FROM "AdminAuditLog"`); err != nil {
		t.Fatalf("clean audit: %v", err)
	}

	svc := NewService(poolTest)
	svc.SetFlags(flags.NewService(poolTest))

	// Approbation modulable → entrée tracée.
	if err := svc.UpdateApiAccessStatus(ctx, adminAdminID, adminCreator, "approved", []string{"api:read", "webhooks"}); err != nil {
		t.Fatalf("UpdateApiAccessStatus: %v", err)
	}
	// Ajustement des permissions → entrée tracée.
	if err := svc.UpdateApiGrants(ctx, adminAdminID, adminCreator, []string{"api:read"}); err != nil {
		t.Fatalf("UpdateApiGrants: %v", err)
	}
	// Bascule de la coupure générale (via la config) → entrée tracée.
	if err := svc.UpsertSystemConfigs(ctx, adminAdminID, []SystemConfigItem{
		{Key: "API_ACCESS_DISABLED", Value: "true"},
	}); err != nil {
		t.Fatalf("UpsertSystemConfigs: %v", err)
	}

	entries, err := svc.ListAuditLogs(ctx, adminAdminID, 50)
	if err != nil {
		t.Fatalf("ListAuditLogs: %v", err)
	}
	if len(entries) != 3 {
		t.Fatalf("entries = %d, attendu 3 (%+v)", len(entries), entries)
	}

	actions := map[string]AdminAuditEntry{}
	for _, e := range entries {
		actions[e.Action] = e
	}
	if e, ok := actions["api.access.status"]; !ok {
		t.Fatal("entrée api.access.status absente")
	} else if e.TargetID == nil || *e.TargetID != adminCreator || e.ActorID != adminAdminID {
		t.Fatalf("api.access.status cible/acteur = %+v", e)
	} else {
		var meta struct {
			Status string   `json:"status"`
			Grants []string `json:"grants"`
		}
		if err := json.Unmarshal(e.Metadata, &meta); err != nil || meta.Status != "approved" || len(meta.Grants) != 2 {
			t.Fatalf("metadata api.access.status = %s (err %v)", e.Metadata, err)
		}
	}
	if e, ok := actions["api.access.grants"]; !ok {
		t.Fatal("entrée api.access.grants absente")
	} else {
		var meta struct {
			Grants []string `json:"grants"`
		}
		if err := json.Unmarshal(e.Metadata, &meta); err != nil || len(meta.Grants) != 1 || meta.Grants[0] != "api:read" {
			t.Fatalf("metadata api.access.grants = %s (err %v)", e.Metadata, err)
		}
	}
	if e, ok := actions["access.control.config"]; !ok {
		t.Fatal("entrée access.control.config absente")
	} else if e.TargetType != "platform" {
		t.Fatalf("access.control.config targetType = %s, attendu platform", e.TargetType)
	} else {
		var meta struct {
			Key   string `json:"key"`
			Value string `json:"value"`
		}
		if err := json.Unmarshal(e.Metadata, &meta); err != nil || meta.Key != "API_ACCESS_DISABLED" || meta.Value != "true" {
			t.Fatalf("metadata access.control.config = %s (err %v)", e.Metadata, err)
		}
	}

	// Le nom de l'acteur est joint (qui).
	if e := actions["api.access.status"]; e.ActorEmail != "admin-adm@test.dev" || e.ActorName == nil || *e.ActorName != "Admin" {
		t.Fatalf("acteur = %+v", e)
	}

	// Modération suspend → tracée aussi.
	if _, err := svc.UpdateModeration(ctx, adminAdminID, adminCreator, ModerationInput{IsSuspended: boolPtr(true)}); err != nil {
		t.Fatalf("UpdateModeration: %v", err)
	}
	entries, _ = svc.ListAuditLogs(ctx, adminAdminID, 50)
	if len(entries) != 4 {
		t.Fatalf("entries après modération = %d, attendu 4", len(entries))
	}
	if entries[0].Action != "moderation.update" {
		t.Fatalf("dernière action = %s, attendu moderation.update", entries[0].Action)
	}
}

func TestAuditLog_DisabledFlagNoWrites(t *testing.T) {
	ctx := context.Background()
	seedAdmin(t, ctx)
	setAuditFlag(t, ctx, false)
	if _, err := poolTest.Exec(ctx, `DELETE FROM "AdminAuditLog"`); err != nil {
		t.Fatalf("clean audit: %v", err)
	}

	// Service sans flags branché → pas d'écriture non plus (défaut sûr).
	svc := NewService(poolTest)
	if err := svc.UpdateApiAccessStatus(ctx, adminAdminID, adminCreator, "approved", []string{"api:read"}); err != nil {
		t.Fatalf("UpdateApiAccessStatus: %v", err)
	}
	if n := countAuditEntries(t, ctx); n != 0 {
		t.Fatalf("audit entries = %d avec flag off, attendu 0", n)
	}

	// Flag activé → les écritures suivantes sont tracées.
	setAuditFlag(t, ctx, true)
	defer setAuditFlag(t, ctx, false)
	svc.SetFlags(flags.NewService(poolTest))
	if err := svc.UpdateApiAccessStatus(ctx, adminAdminID, adminCreator, "revoked", nil); err != nil {
		t.Fatalf("UpdateApiAccessStatus(revoked): %v", err)
	}
	if n := countAuditEntries(t, ctx); n != 1 {
		t.Fatalf("audit entries = %d avec flag on, attendu 1", n)
	}

	// Les configs non-sensibles ne sont pas tracées (pas de bruit).
	if err := svc.UpsertSystemConfigs(ctx, adminAdminID, []SystemConfigItem{{Key: "hero_title_fr", Value: "Bonjour"}}); err != nil {
		t.Fatalf("UpsertSystemConfigs: %v", err)
	}
	if n := countAuditEntries(t, ctx); n != 1 {
		t.Fatalf("audit entries = %d après config banale, attendu 1", n)
	}
}

func TestAuditLog_ForbiddenForNonSuperadmin(t *testing.T) {
	ctx := context.Background()
	seedAdmin(t, ctx)
	svc := NewService(poolTest)

	if _, err := svc.ListAuditLogs(ctx, adminCreator, 10); err != errForbidden {
		t.Fatalf("ListAuditLogs(creator) = %v, attendu errForbidden", err)
	}
}
