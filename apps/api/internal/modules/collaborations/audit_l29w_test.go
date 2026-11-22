package collaborations

// Lot L29W — les gardes anti-spam avalaient leurs erreurs de lecture (compteur
// à 0 → invitation autorisée) et une panne DB devenait « lien introuvable ».

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

func unreachablePool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	pool, err := pgxpool.New(ctx, "postgres://qoe:qoe@127.0.0.1:1/qoe?connect_timeout=1")
	if err != nil {
		t.Fatalf("pool: %v", err)
	}
	t.Cleanup(pool.Close)
	return pool
}

const auditUUID = "00000000-0000-0000-0000-0000000000aa"

func TestAuditL29W_AntiSpamOutageIsNotAPass(t *testing.T) {
	svc := NewService(unreachablePool(t))
	if err := svc.checkAntiSpamInvite(context.Background(), auditUUID, auditUUID, "art-1"); err == nil {
		t.Fatal("base injoignable → garde anti-spam laisse passer l'invitation (err = nil)")
	}
}

func TestAuditL29W_RevokeLinkOutageIsNotNotFound(t *testing.T) {
	svc := NewService(unreachablePool(t))
	err := svc.RevokeInviteLink(context.Background(), auditUUID, "link_inexistant")
	if err == nil {
		t.Fatal("base injoignable → révocation annoncée réussie")
	}
	var ce *ErrorCollab
	if errors.As(err, &ce) {
		t.Fatalf("panne DB rendue en erreur métier (400) : %v", err)
	}
}
