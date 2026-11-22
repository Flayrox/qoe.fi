package conversations

// Lot L29W — le plafond anti-spam de création comptait AUSSI les conversations
// existantes : après 15 conversations dans l'heure, rouvrir un fil devenait
// impossible.

import (
	"context"
	"errors"
	"fmt"
	"testing"

	"github.com/qoefi/api/internal/testutil"
)

// TestAuditL29W_DuplicateMessageGuardIsLive : les deux gardes anti-spam de
// SendMessage interrogeaient la table "DirectMessage", qui n'existe pas —
// l'erreur était avalée, donc ni le doublon ni la limite de 30/min ne
// s'appliquaient.
func TestAuditL29W_DuplicateMessageGuardIsLive(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	fx, err := testutil.SeedPosts(ctx, poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	svc := newSvc()
	conv, err := svc.CreateDirect(ctx, fx.AuthorID, fx.ViewerID)
	if err != nil {
		t.Fatalf("CreateDirect: %v", err)
	}
	if _, err := svc.SendMessage(ctx, fx.AuthorID, conv.ID, "message identique"); err != nil {
		t.Fatalf("premier envoi: %v", err)
	}
	if _, err := svc.SendMessage(ctx, fx.AuthorID, conv.ID, "message identique"); !errors.Is(err, ErrDuplicateMessage) {
		t.Fatalf("doublon accepté: err = %v, attendu ErrDuplicateMessage", err)
	}
}

func TestAuditL29W_ExistingConversationIsNotRateLimited(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	fx, err := testutil.SeedPosts(ctx, poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	svc := newSvc()

	conv, err := svc.CreateDirect(ctx, fx.AuthorID, fx.ViewerID)
	if err != nil {
		t.Fatalf("CreateDirect: %v", err)
	}
	// 14 autres conversations rejointes dans l'heure (aucune créée par l'appel).
	for i := 0; i < 14; i++ {
		id := fmt.Sprintf("audit_l29w_conv_%02d", i)
		if _, err := poolTest.Exec(ctx,
			`INSERT INTO "Conversation" (id, "type", "directKey", "createdAt", "updatedAt")
			 VALUES ($1, 'direct', $2, now(), now())`, id, fmt.Sprintf("audit_l29w_key_%02d", i)); err != nil {
			t.Fatalf("conversation %d: %v", i, err)
		}
		if _, err := poolTest.Exec(ctx,
			`INSERT INTO "ConversationMember" ("conversationId", "userId") VALUES ($1, $2)`, id, fx.AuthorID); err != nil {
			t.Fatalf("membre %d: %v", i, err)
		}
	}

	again, err := svc.CreateDirect(ctx, fx.AuthorID, fx.ViewerID)
	if err != nil {
		t.Fatalf("réouverture d'une conversation existante → %v, attendu succès", err)
	}
	if again.ID != conv.ID {
		t.Fatalf("conversation rouverte = %s, attendu %s", again.ID, conv.ID)
	}
}
