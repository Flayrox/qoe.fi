package media

// Tests du journal d'audit superadmin étendu aux Médias : changement de rôle
// et de permissions d'un membre (MediaMember) tracés quand le flag
// admin-audit-log est actif — le journal media (MediaAuditLog) reste écrit
// indépendamment, le journal superadmin (AdminAuditLog) est gated par flag.

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/qoefi/api/internal/flags"
)

func setAuditFlagMedia(t *testing.T, ctx context.Context, enabled bool) {
	t.Helper()
	if _, err := poolTest.Exec(ctx, `
		INSERT INTO feature_flags (key, is_enabled, description, target_roles)
		VALUES ('admin-audit-log', $1, 'test', '{admin}')
		ON CONFLICT (key) DO UPDATE SET is_enabled = EXCLUDED.is_enabled`, enabled); err != nil {
		t.Fatalf("set audit flag: %v", err)
	}
}

func TestMediaAuditLog_TracesMemberChanges(t *testing.T) {
	ctx := context.Background()
	seedMedia(t, ctx)
	setAuditFlagMedia(t, ctx, true)
	defer setAuditFlagMedia(t, ctx, false)
	if _, err := poolTest.Exec(ctx, `DELETE FROM "AdminAuditLog"`); err != nil {
		t.Fatalf("clean audit: %v", err)
	}

	svc := newTestService()
	svc.SetFlags(flags.NewService(poolTest))

	// Changement de rôle writer → editor.
	if err := svc.UpdateMemberRole(ctx, mediaOwnerID, "media_001", mediaWriterID, "editor"); err != nil {
		t.Fatalf("UpdateMemberRole: %v", err)
	}
	// Permissions granulaires.
	if err := svc.UpdateMemberPermissions(ctx, mediaOwnerID, "media_001", mediaWriterID, []string{"media:review"}); err != nil {
		t.Fatalf("UpdateMemberPermissions: %v", err)
	}
	// Retrait d'un membre.
	if err := svc.RemoveMember(ctx, mediaOwnerID, "media_001", mediaViewerID); err != nil {
		t.Fatalf("RemoveMember: %v", err)
	}

	var count int
	if err := poolTest.QueryRow(ctx, `SELECT COUNT(*) FROM "AdminAuditLog"`).Scan(&count); err != nil {
		t.Fatalf("count: %v", err)
	}
	if count != 3 {
		t.Fatalf("entries = %d, attendu 3", count)
	}

	rows, err := poolTest.Query(ctx, `SELECT action, "targetType", "targetId", "actorId", metadata FROM "AdminAuditLog" ORDER BY "createdAt"`)
	if err != nil {
		t.Fatalf("query: %v", err)
	}
	defer rows.Close()
	got := map[string]struct {
		target string
		meta   map[string]any
	}{}
	for rows.Next() {
		var action, targetType, targetID, actor string
		var meta []byte
		if err := rows.Scan(&action, &targetType, &targetID, &actor, &meta); err != nil {
			t.Fatalf("scan: %v", err)
		}
		if actor != mediaOwnerID {
			t.Fatalf("actor = %s, attendu owner %s", actor, mediaOwnerID)
		}
		var m map[string]any
		_ = json.Unmarshal(meta, &m)
		got[action] = struct {
			target string
			meta   map[string]any
		}{target: targetType + ":" + targetID, meta: m}
	}

	role, ok := got["media.member.role_changed"]
	if !ok || role.target != "user:"+mediaWriterID || role.meta["role"] != "editor" {
		t.Fatalf("role_changed = %+v", role)
	}
	perms, ok := got["media.member.permissions_changed"]
	if !ok || perms.target != "user:"+mediaWriterID {
		t.Fatalf("permissions_changed = %+v", perms)
	}
	removed, ok := got["media.member.removed"]
	if !ok || removed.target != "user:"+mediaViewerID || removed.meta["mediaId"] != "media_001" {
		t.Fatalf("removed = %+v", removed)
	}
}

func TestMediaAuditLog_FlagOff_NoSuperadminWrites(t *testing.T) {
	ctx := context.Background()
	seedMedia(t, ctx)
	setAuditFlagMedia(t, ctx, false)
	if _, err := poolTest.Exec(ctx, `DELETE FROM "AdminAuditLog"`); err != nil {
		t.Fatalf("clean audit: %v", err)
	}

	// Service sans flags branché → pas d'écriture superadmin (défaut sûr).
	svc := newTestService()
	if err := svc.UpdateMemberRole(ctx, mediaOwnerID, "media_001", mediaWriterID, "editor"); err != nil {
		t.Fatalf("UpdateMemberRole: %v", err)
	}
	var count int
	if err := poolTest.QueryRow(ctx, `SELECT COUNT(*) FROM "AdminAuditLog"`).Scan(&count); err != nil {
		t.Fatalf("count: %v", err)
	}
	if count != 0 {
		t.Fatalf("entries = %d avec flag off, attendu 0", count)
	}
}
