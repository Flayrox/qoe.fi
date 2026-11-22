package auditlog

// Audit L33 — rouge de reproduction (exécuté à f51e63e0 avant correctif).

import (
	"bytes"
	"context"
	"log"
	"strings"
	"testing"

	db "github.com/qoefi/api/internal/database"
)

type fakeInserter struct{}

func (fakeInserter) InsertAdminAuditLog(context.Context, db.InsertAdminAuditLogParams) error {
	return nil
}

// Un acteur non-UUID (claims dégradés, identifiant technique) faisait
// `return` sec : la trace d'audit n'était pas écrite ET rien n'était
// journalisé. L'appelant croyait l'action tracée ; personne ne pouvait le
// constater — ni le support, ni une alerte.
func TestAuditL33_InvalidActorIsNotSilent(t *testing.T) {
	var buf bytes.Buffer
	old := log.Writer()
	log.SetOutput(&buf)
	t.Cleanup(func() { log.SetOutput(old) })

	Write(context.Background(), fakeInserter{}, "pas-un-uuid", "admin.config.write", "config", "k", map[string]any{"k": "v"})
	if !strings.Contains(buf.String(), "admin-audit") {
		t.Fatal("acteur invalide : trace perdue sans une seule ligne de journal")
	}
}

// Des métadonnées non sérialisables (canal, fonction) perdaient la trace de la
// même façon, en silence.
func TestAuditL33_UnmarshalableMetadataIsNotSilent(t *testing.T) {
	var buf bytes.Buffer
	old := log.Writer()
	log.SetOutput(&buf)
	t.Cleanup(func() { log.SetOutput(old) })

	Write(context.Background(), fakeInserter{}, "00000000-0000-0000-0000-000000000000", "admin.config.write", "config", "k", make(chan int))
	if !strings.Contains(buf.String(), "admin-audit") {
		t.Fatal("métadonnées non sérialisables : trace perdue sans une seule ligne de journal")
	}
}
