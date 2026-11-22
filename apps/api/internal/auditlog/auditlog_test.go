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

// L'écriture a toujours lieu : aucun flag ne conditionne plus l'existence de la
// trace (le paramètre a été retiré de la signature — une action sensible ne
// doit pas devenir invisible parce qu'un interrupteur est éteint).
func TestWrite_AlwaysWrites(t *testing.T) {
	var q recordingInserter
	Write(context.Background(), &q, "00000000-0000-0000-0000-000000000001",
		"test.action", "user", "target-1", map[string]any{"key": "value"})

	if len(q.args) != 1 {
		t.Fatalf("écritures = %d, attendu 1", len(q.args))
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

func TestWrite_EmptyTargetIsNull(t *testing.T) {
	var q recordingInserter
	Write(context.Background(), &q, "00000000-0000-0000-0000-000000000001",
		"test.action", "platform", "", nil)

	if len(q.args) != 1 {
		t.Fatalf("écritures = %d, attendu 1", len(q.args))
	}
	if q.args[0].TargetId.Valid {
		t.Fatalf("cible vide devrait être NULL : %+v", q.args[0].TargetId)
	}
}
