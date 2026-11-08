package notifications

import (
	"context"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

type mockDispatcherDB struct {
	isBlocked bool
	isMuted   bool
	execCalls int
}

func (m *mockDispatcherDB) Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error) {
	m.execCalls++
	return pgconn.CommandTag{}, nil
}

func (m *mockDispatcherDB) Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error) {
	return nil, nil
}

func (m *mockDispatcherDB) QueryRow(ctx context.Context, sql string, args ...any) pgx.Row {
	if strings.Contains(sql, "is_blocked_bidirectional") {
		return &mockBoolRow{val: m.isBlocked}
	}
	if strings.Contains(sql, "is_muted_by") {
		return &mockBoolRow{val: m.isMuted}
	}
	return &mockBoolRow{}
}

type mockBoolRow struct {
	val bool
}

func (r *mockBoolRow) Scan(dest ...any) error {
	if len(dest) > 0 {
		if b, ok := dest[0].(*bool); ok {
			*b = r.val
		}
	}
	return nil
}

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

func TestDispatch_Guard2_BlockedAndMuted(t *testing.T) {
	ctx := context.Background()
	recID := uuid.New().String()
	senderID := uuid.New().String()

	// 1. Sender bloqué
	dbBlocked := &mockDispatcherDB{isBlocked: true}
	err := Dispatch(ctx, dbBlocked, DispatchInput{
		RecipientID: recID,
		SenderID:    senderID,
		Type:        "FOLLOW",
	})
	if err != nil {
		t.Fatalf("attendu nil pour sender bloqué, obtenu %v", err)
	}
	if dbBlocked.execCalls != 0 {
		t.Fatalf("attendu 0 insertions pour sender bloqué, obtenu %d", dbBlocked.execCalls)
	}

	// 2. Sender masqué (muted)
	dbMuted := &mockDispatcherDB{isMuted: true}
	err = Dispatch(ctx, dbMuted, DispatchInput{
		RecipientID: recID,
		SenderID:    senderID,
		Type:        "FOLLOW",
	})
	if err != nil {
		t.Fatalf("attendu nil pour sender masqué, obtenu %v", err)
	}
	if dbMuted.execCalls != 0 {
		t.Fatalf("attendu 0 insertions pour sender masqué, obtenu %d", dbMuted.execCalls)
	}
}
