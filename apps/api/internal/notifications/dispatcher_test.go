package notifications

import (
	"context"
	"testing"

	"github.com/google/uuid"
)

func TestDispatch_Guard1_EmptyOrSelf(t *testing.T) {
	ctx := context.Background()

	// Recipient vide
	if err := Dispatch(ctx, nil, DispatchInput{RecipientID: ""}); err != nil {
		t.Fatalf("attendu nil pour recipient vide, obtenu %v", err)
	}

	// Auto-notification
	uid := uuid.New().String()
	if err := Dispatch(ctx, nil, DispatchInput{RecipientID: uid, SenderID: uid, Type: "FOLLOW"}); err != nil {
		t.Fatalf("attendu nil pour auto-notification, obtenu %v", err)
	}
}

func TestDispatch_InvalidUUID(t *testing.T) {
	ctx := context.Background()

	// Destinataire non-UUID
	if err := Dispatch(ctx, nil, DispatchInput{RecipientID: "invalid-uuid", SenderID: uuid.New().String()}); err != nil {
		t.Fatalf("attendu nil pour UUID invalide, obtenu %v", err)
	}

	// Sender non-UUID
	if err := Dispatch(ctx, nil, DispatchInput{RecipientID: uuid.New().String(), SenderID: "invalid-uuid"}); err != nil {
		t.Fatalf("attendu nil pour Sender non-UUID, obtenu %v", err)
	}
}
