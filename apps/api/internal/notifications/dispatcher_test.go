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
	isBlocked   bool
	isMuted     bool
	isDuplicate bool
	prefsRow    bool
	prefsErr    error
	execCalls   int
	lastSQL     string
	lastArgs    []any
}

func (m *mockDispatcherDB) Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error) {
	m.execCalls++
	m.lastSQL = sql
	m.lastArgs = args
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
	if strings.Contains(sql, "NotificationPreference") {
		if m.prefsErr != nil {
			return &mockPrefsRow{err: m.prefsErr}
		}
		if m.prefsRow {
			return &mockPrefsRow{allowAll: false}
		}
		return &mockPrefsRow{err: pgx.ErrNoRows}
	}
	if strings.Contains(sql, "SELECT EXISTS") {
		return &mockBoolRow{val: m.isDuplicate}
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

type mockPrefsRow struct {
	allowAll bool
	err      error
}

func (r *mockPrefsRow) Scan(dest ...any) error {
	if r.err != nil {
		return r.err
	}
	for _, d := range dest {
		if b, ok := d.(*bool); ok {
			*b = r.allowAll
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

func TestDispatch_AllowSelfAndBypassPreferences(t *testing.T) {
	ctx := context.Background()
	uid := uuid.New().String()

	// Préférences refusées sur FOLLOW -> filtré sans BypassPreferences
	dbRefused := &mockDispatcherDB{prefsRow: true}
	id, err := DispatchWithID(ctx, dbRefused, DispatchInput{
		RecipientID: uid,
		SenderID:    uuid.New().String(),
		Type:        "FOLLOW",
	})
	if err != nil || id != "" || dbRefused.execCalls != 0 {
		t.Fatalf("préférence désactivée doit filtrer: id=%q err=%v calls=%d", id, err, dbRefused.execCalls)
	}

	// Alerte self + BypassPreferences -> insérée avec ID généré
	dbSelf := &mockDispatcherDB{prefsRow: true}
	id, err = DispatchWithID(ctx, dbSelf, DispatchInput{
		RecipientID:       uid,
		SenderID:          uid,
		Type:              "SYSTEM_ALERT",
		AllowSelf:         true,
		BypassPreferences: true,
		Metadata:          map[string]any{"kind": "WEBHOOK_DISABLED"},
	})
	if err != nil {
		t.Fatalf("DispatchWithID AllowSelf: %v", err)
	}
	if !strings.HasPrefix(id, "notif_") || dbSelf.execCalls != 1 {
		t.Fatalf("attendu insertion notif_* (calls=%d, id=%q)", dbSelf.execCalls, id)
	}

	// Déduplication non-lue -> ignoré sans erreur
	dbDup := &mockDispatcherDB{isDuplicate: true}
	id, err = DispatchWithID(ctx, dbDup, DispatchInput{
		RecipientID: uid,
		SenderID:    uuid.New().String(),
		Type:        "LIKE",
	})
	if err != nil || id != "" || dbDup.execCalls != 0 {
		t.Fatalf("doublon non lu doit filtrer: id=%q err=%v calls=%d", id, err, dbDup.execCalls)
	}
}

func TestDispatchMediaFanouts(t *testing.T) {
	ctx := context.Background()
	m := &mockDispatcherDB{}
	senderID := uuid.New().String()

	if err := DispatchMediaArticlePublishedFanout(ctx, m, "pub_1", "art_1", senderID); err != nil {
		t.Fatalf("DispatchMediaArticlePublishedFanout: %v", err)
	}
	if m.execCalls != 1 || !strings.Contains(m.lastSQL, "MEDIA_ARTICLE_PUBLISHED") || !strings.Contains(m.lastSQL, "is_blocked_bidirectional") {
		t.Fatalf("fanout published inattendu: calls=%d sql=%s", m.execCalls, m.lastSQL)
	}

	if err := DispatchMediaArticleSubmittedFanout(ctx, m, "pub_1", "art_1", senderID); err != nil {
		t.Fatalf("DispatchMediaArticleSubmittedFanout: %v", err)
	}
	if m.execCalls != 2 || !strings.Contains(m.lastSQL, "MEDIA_ARTICLE_SUBMITTED") || !strings.Contains(m.lastSQL, "is_blocked_bidirectional") {
		t.Fatalf("fanout submitted inattendu: calls=%d sql=%s", m.execCalls, m.lastSQL)
	}

	// Entrées vides ou UUID invalide : no-op sûr
	if err := DispatchMediaArticlePublishedFanout(ctx, m, "pub_1", "art_1", "not-a-uuid"); err != nil {
		t.Fatalf("attendu nil pour UUID invalide: %v", err)
	}
	if m.execCalls != 2 {
		t.Fatalf("attendu aucune requête pour UUID invalide, calls=%d", m.execCalls)
	}
}
