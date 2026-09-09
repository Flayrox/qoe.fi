package settings

// Tests du journal d'audit superadmin étendu aux clés API : création,
// rotation et révocation tracées quand le flag admin-audit-log est actif.

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/qoefi/api/internal/flags"
)

func setAuditFlagSettings(t *testing.T, ctx context.Context, enabled bool) {
	t.Helper()
	if _, err := poolTest.Exec(ctx, `
		INSERT INTO feature_flags (key, is_enabled, description, target_roles)
		VALUES ('admin-audit-log', $1, 'test', '{admin}')
		ON CONFLICT (key) DO UPDATE SET is_enabled = EXCLUDED.is_enabled`, enabled); err != nil {
		t.Fatalf("set audit flag: %v", err)
	}
}

func TestApiKeyAuditLog_TracesCreateRotateRevoke(t *testing.T) {
	ctx := context.Background()
	fx := seedSettings(t)
	setAuditFlagSettings(t, ctx, true)
	defer setAuditFlagSettings(t, ctx, false)
	if _, err := poolTest.Exec(ctx, `DELETE FROM "AdminAuditLog"`); err != nil {
		t.Fatalf("clean audit: %v", err)
	}

	svc := NewService(poolTest)
	svc.SetFlags(flags.NewService(poolTest))

	// Création.
	token, err := svc.GenerateApiKey(ctx, fx.OwnerID, "Clé prod", []string{"READ"})
	if err != nil {
		t.Fatalf("GenerateApiKey: %v", err)
	}
	var keyID string
	if err := poolTest.QueryRow(ctx,
		`SELECT id FROM "ApiKey" WHERE "userId" = $1`, fx.OwnerID).Scan(&keyID); err != nil {
		t.Fatalf("key id: %v", err)
	}

	// Rotation : l'ancien token devient invalide, un nouveau est émis.
	rotated, err := svc.RotateApiKey(ctx, fx.OwnerID, keyID)
	if err != nil {
		t.Fatalf("RotateApiKey: %v", err)
	}
	if rotated == token || rotated == "" {
		t.Fatalf("rotation n'a pas changé le secret (token=%q rotated=%q)", token, rotated)
	}

	// Révocation.
	if err := svc.RevokeApiKey(ctx, fx.OwnerID, keyID); err != nil {
		t.Fatalf("RevokeApiKey: %v", err)
	}

	var count int
	if err := poolTest.QueryRow(ctx, `SELECT COUNT(*) FROM "AdminAuditLog"`).Scan(&count); err != nil {
		t.Fatalf("count: %v", err)
	}
	if count != 3 {
		t.Fatalf("entries = %d, attendu 3 (created/rotated/revoked)", count)
	}

	rows, err := poolTest.Query(ctx, `SELECT action, "actorId", metadata FROM "AdminAuditLog" ORDER BY "createdAt"`)
	if err != nil {
		t.Fatalf("query: %v", err)
	}
	defer rows.Close()
	actions := map[string]map[string]any{}
	for rows.Next() {
		var action, actor string
		var meta []byte
		if err := rows.Scan(&action, &actor, &meta); err != nil {
			t.Fatalf("scan: %v", err)
		}
		if actor != fx.OwnerID {
			t.Fatalf("actor = %s, attendu owner %s", actor, fx.OwnerID)
		}
		var m map[string]any
		_ = json.Unmarshal(meta, &m)
		actions[action] = m
	}

	created, ok := actions["api.key.created"]
	if !ok || created["name"] != "Clé prod" {
		t.Fatalf("api.key.created = %+v", created)
	}
	rot, ok := actions["api.key.rotated"]
	if !ok || rot["keyId"] != keyID {
		t.Fatalf("api.key.rotated = %+v", rot)
	}
	rev, ok := actions["api.key.revoked"]
	if !ok || rev["keyId"] != keyID {
		t.Fatalf("api.key.revoked = %+v", rev)
	}
}

func TestApiKeyAuditLog_FlagOff_NoWrites(t *testing.T) {
	ctx := context.Background()
	fx := seedSettings(t)
	setAuditFlagSettings(t, ctx, false)
	if _, err := poolTest.Exec(ctx, `DELETE FROM "AdminAuditLog"`); err != nil {
		t.Fatalf("clean audit: %v", err)
	}

	svc := NewService(poolTest)
	if _, err := svc.GenerateApiKey(ctx, fx.OwnerID, "Clé", []string{"READ"}); err != nil {
		t.Fatalf("GenerateApiKey: %v", err)
	}
	var count int
	if err := poolTest.QueryRow(ctx, `SELECT COUNT(*) FROM "AdminAuditLog"`).Scan(&count); err != nil {
		t.Fatalf("count: %v", err)
	}
	if count != 0 {
		t.Fatalf("entries = %d avec flag off, attendu 0", count)
	}
}
