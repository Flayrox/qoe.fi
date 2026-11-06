package auditlog

import (
	"context"
	"testing"

	db "github.com/qoefi/api/internal/database"
)

type recordingInserter struct {
	args []db.InsertAdminAuditLogParams
}

func (r *recordingInserter) InsertAdminAuditLog(_ context.Context, arg db.InsertAdminAuditLogParams) error {
	r.args = append(r.args, arg)
	return nil
}

type flagOff struct{}

func (flagOff) IsOn(context.Context, string) bool { return false }

func TestWrite_WritesEvenWhenFlagOff(t *testing.T) {
	var q recordingInserter
	Write(context.Background(), &q, flagOff{}, "00000000-0000-0000-0000-000000000001",
		"test.action", "user", "target-1", map[string]any{"key": "value"})

	if len(q.args) != 1 {
		t.Fatalf("écritures = %d avec flag off, attendu 1", len(q.args))
	}
	if q.args[0].Action != "test.action" {
		t.Fatalf("action = %q", q.args[0].Action)
	}
	if !q.args[0].TargetId.Valid || q.args[0].TargetId.String != "target-1" {
		t.Fatalf("cible = %+v", q.args[0].TargetId)
	}
	if q.args[0].Column5 == "" {
		t.Fatal("métadonnées vides")
	}
}

func TestWrite_WritesWithNilFlag(t *testing.T) {
	var q recordingInserter
	Write(context.Background(), &q, nil, "00000000-0000-0000-0000-000000000001",
		"test.action", "platform", "", nil)

	if len(q.args) != 1 {
		t.Fatalf("écritures = %d sans flag branché, attendu 1", len(q.args))
	}
	if q.args[0].TargetId.Valid {
		t.Fatalf("cible vide devrait être NULL : %+v", q.args[0].TargetId)
	}
}
