package domainevents

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/qoefi/api/internal/testutil"
)

// Vérification statique à la compilation que pgx.Tx implémente DB.
var _ DB = (pgx.Tx)(nil)

// mockExec enregistre un appel Exec.
type mockExec struct {
	sql  string
	args []any
}

// mockDB implémente l'interface DB pour tester les dispatchers d'événements sans dépendre de Postgres.
type mockDB struct {
	execs       []mockExec
	queries     []mockExec
	execErr     error
	queryErr    error
	queryRows   *mockRows
	queryRowVal any
	queryRowErr error
}

func (m *mockDB) Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error) {
	m.execs = append(m.execs, mockExec{sql: sql, args: args})
	if m.execErr != nil {
		return pgconn.CommandTag{}, m.execErr
	}
	return pgconn.CommandTag{}, nil
}

func (m *mockDB) Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error) {
	m.queries = append(m.queries, mockExec{sql: sql, args: args})
	if m.queryErr != nil {
		return nil, m.queryErr
	}
	if m.queryRows != nil {
		return m.queryRows, nil
	}
	return &mockRows{}, nil
}

func (m *mockDB) QueryRow(ctx context.Context, sql string, args ...any) pgx.Row {
	return &mockRow{val: m.queryRowVal, err: m.queryRowErr}
}

type mockRow struct {
	val any
	err error
}

func (r *mockRow) Scan(dest ...any) error {
	if r.err != nil {
		return r.err
	}
	if len(dest) > 0 && r.val != nil {
		switch d := dest[0].(type) {
		case *pgtype.Text:
			if s, ok := r.val.(string); ok {
				*d = pgtype.Text{String: s, Valid: true}
			}
		case *string:
			if s, ok := r.val.(string); ok {
				*d = s
			}
		}
	}
	return nil
}

type mockRows struct {
	rows [][]any
	idx  int
	err  error
}

func (r *mockRows) Close() {}
func (r *mockRows) Err() error { return r.err }
func (r *mockRows) CommandTag() pgconn.CommandTag { return pgconn.CommandTag{} }
func (r *mockRows) FieldDescriptions() []pgconn.FieldDescription { return nil }
func (r *mockRows) Next() bool {
	if r.idx < len(r.rows) {
		r.idx++
		return true
	}
	return false
}

func (r *mockRows) Scan(dest ...any) error {
	if r.idx-1 < 0 || r.idx-1 >= len(r.rows) {
		return errors.New("index hors limites")
	}
	row := r.rows[r.idx-1]
	for i, d := range dest {
		if i < len(row) {
			switch target := d.(type) {
			case *string:
				if s, ok := row[i].(string); ok {
					*target = s
				}
			case *pgtype.Text:
				if s, ok := row[i].(string); ok {
					*target = pgtype.Text{String: s, Valid: true}
				}
			}
		}
	}
	return nil
}
func (r *mockRows) Values() ([]any, error) { return nil, nil }
func (r *mockRows) RawValues() [][]byte { return nil }
func (r *mockRows) Conn() *pgx.Conn { return nil }

func TestDispatch_UserBlockedEvent(t *testing.T) {
	ctx := context.Background()
	blocker := "11111111-1111-1111-1111-111111111111"
	blocked := "22222222-2222-2222-2222-222222222222"

	t.Run("Succès avec 5 suppressions", func(t *testing.T) {
		db := &mockDB{}
		evt := UserBlockedEvent{
			BlockerID: blocker,
			BlockedID: blocked,
		}
		if err := Dispatch(ctx, db, evt); err != nil {
			t.Fatalf("Dispatch a échoué: %v", err)
		}

		if len(db.execs) != 5 {
			t.Fatalf("attendu 5 requêtes Exec, obtenu %d", len(db.execs))
		}

		// Vérification de chaque requête
		queriesExpected := []string{
			`DELETE FROM "Follows"`,
			`DELETE FROM "FollowRequest"`,
			`DELETE FROM "Notification"`,
			`DELETE FROM "CollaborationRequest"`,
			`DELETE FROM "Notification"`,
		}
		for i, expected := range queriesExpected {
			if !strings.Contains(db.execs[i].sql, expected) {
				t.Errorf("requête %d: attendu '%s', obtenu '%s'", i, expected, db.execs[i].sql)
			}
		}
	})

	t.Run("Auto-blocage ignoré", func(t *testing.T) {
		db := &mockDB{}
		evt := UserBlockedEvent{
			BlockerID: blocker,
			BlockedID: blocker,
		}
		if err := Dispatch(ctx, db, evt); err != nil {
			t.Fatalf("Dispatch a échoué: %v", err)
		}
		if len(db.execs) != 0 {
			t.Fatalf("attendu 0 requête, obtenu %d", len(db.execs))
		}
	})

	t.Run("Identifiants vides ignorés", func(t *testing.T) {
		db := &mockDB{}
		if err := Dispatch(ctx, db, UserBlockedEvent{BlockerID: "", BlockedID: blocked}); err != nil {
			t.Fatalf("Dispatch a échoué: %v", err)
		}
		if len(db.execs) != 0 {
			t.Fatalf("attendu 0 requête, obtenu %d", len(db.execs))
		}
	})

	t.Run("Erreur Exec propagée", func(t *testing.T) {
		db := &mockDB{execErr: errors.New("db error")}
		evt := UserBlockedEvent{
			BlockerID: blocker,
			BlockedID: blocked,
		}
		if err := Dispatch(ctx, db, evt); err == nil {
			t.Fatalf("attendu une erreur, obtenu nil")
		}
	})
}

func TestDispatch_UserUnblockedEvent(t *testing.T) {
	ctx := context.Background()
	db := &mockDB{}
	evt := UserUnblockedEvent{
		BlockerID: "11111111-1111-1111-1111-111111111111",
		BlockedID: "22222222-2222-2222-2222-222222222222",
	}
	if err := Dispatch(ctx, db, evt); err != nil {
		t.Fatalf("Dispatch a échoué: %v", err)
	}
	if len(db.execs) != 0 {
		t.Fatalf("attendu 0 requête pour unblock, obtenu %d", len(db.execs))
	}
}

func TestDispatch_ProfileVisibilityChangedEvent(t *testing.T) {
	ctx := context.Background()
	userID := "33333333-3333-3333-3333-333333333333"
	pubID := "pub-123"
	requester1 := "44444444-4444-4444-4444-444444444444"
	requester2 := "55555555-5555-5555-5555-555555555555"

	t.Run("Transition PRIVATE vers PUBLIC avec pending requests", func(t *testing.T) {
		db := &mockDB{
			queryRows: &mockRows{
				rows: [][]any{
					{requester1, pubID},
					{requester2, pubID},
				},
			},
		}

		evt := ProfileVisibilityChangedEvent{
			UserID:        userID,
			PublicationID: pubID,
			OldVisibility: "PRIVATE",
			NewVisibility: "PUBLIC",
		}

		if err := Dispatch(ctx, db, evt); err != nil {
			t.Fatalf("Dispatch a échoué: %v", err)
		}

		if len(db.queries) != 1 {
			t.Fatalf("attendu 1 query pour lire les pending, obtenu %d", len(db.queries))
		}

		// Requêtes attendues :
		// 1. INSERT INTO "Follows"
		// 2. UPDATE "FollowRequest" (ACCEPTED)
		// 3. DELETE FROM "Notification" (FOLLOW_REQUEST)
		// + 2 Dispatch de notifications (InsertNotification via notifications.Dispatch)
		if len(db.execs) < 3 {
			t.Fatalf("attendu au moins 3 requêtes Exec, obtenu %d", len(db.execs))
		}

		if !strings.Contains(db.execs[0].sql, `INSERT INTO "Follows"`) {
			t.Errorf("exec[0]: attendu INSERT INTO Follows, obtenu: %s", db.execs[0].sql)
		}
		if !strings.Contains(db.execs[1].sql, `UPDATE "FollowRequest"`) {
			t.Errorf("exec[1]: attendu UPDATE FollowRequest, obtenu: %s", db.execs[1].sql)
		}
		if !strings.Contains(db.execs[2].sql, `DELETE FROM "Notification"`) {
			t.Errorf("exec[2]: attendu DELETE Notification, obtenu: %s", db.execs[2].sql)
		}
	})

	t.Run("Transition FOLLOWERS vers PUBLIC", func(t *testing.T) {
		db := &mockDB{
			queryRows: &mockRows{
				rows: [][]any{
					{requester1, pubID},
				},
			},
		}

		evt := ProfileVisibilityChangedEvent{
			UserID:        userID,
			PublicationID: pubID,
			OldVisibility: "FOLLOWERS",
			NewVisibility: "PUBLIC",
		}

		if err := Dispatch(ctx, db, evt); err != nil {
			t.Fatalf("Dispatch a échoué: %v", err)
		}
		if len(db.execs) < 3 {
			t.Fatalf("attendu au moins 3 requêtes Exec, obtenu %d", len(db.execs))
		}
	})

	t.Run("Pas de transition vers PUBLIC (ex: PUBLIC -> PRIVATE)", func(t *testing.T) {
		db := &mockDB{}
		evt := ProfileVisibilityChangedEvent{
			UserID:        userID,
			PublicationID: pubID,
			OldVisibility: "PUBLIC",
			NewVisibility: "PRIVATE",
		}

		if err := Dispatch(ctx, db, evt); err != nil {
			t.Fatalf("Dispatch a échoué: %v", err)
		}
		if len(db.execs) != 0 || len(db.queries) != 0 {
			t.Fatalf("attendu aucune requête, obtenu %d execs, %d queries", len(db.execs), len(db.queries))
		}
	})

	t.Run("OldVisibility déjà PUBLIC", func(t *testing.T) {
		db := &mockDB{}
		evt := ProfileVisibilityChangedEvent{
			UserID:        userID,
			PublicationID: pubID,
			OldVisibility: "PUBLIC",
			NewVisibility: "PUBLIC",
		}

		if err := Dispatch(ctx, db, evt); err != nil {
			t.Fatalf("Dispatch a échoué: %v", err)
		}
		if len(db.execs) != 0 || len(db.queries) != 0 {
			t.Fatalf("attendu aucune requête, obtenu %d execs, %d queries", len(db.execs), len(db.queries))
		}
	})

	t.Run("UserID vide", func(t *testing.T) {
		db := &mockDB{}
		evt := ProfileVisibilityChangedEvent{
			UserID:        "",
			OldVisibility: "PRIVATE",
			NewVisibility: "PUBLIC",
		}

		if err := Dispatch(ctx, db, evt); err != nil {
			t.Fatalf("Dispatch a échoué: %v", err)
		}
		if len(db.execs) != 0 || len(db.queries) != 0 {
			t.Fatalf("attendu aucune requête, obtenu %d execs, %d queries", len(db.execs), len(db.queries))
		}
	})

	t.Run("Aucune demande en attente (pending vide)", func(t *testing.T) {
		db := &mockDB{
			queryRows: &mockRows{rows: [][]any{}},
		}

		evt := ProfileVisibilityChangedEvent{
			UserID:        userID,
			PublicationID: pubID,
			OldVisibility: "PRIVATE",
			NewVisibility: "PUBLIC",
		}

		if err := Dispatch(ctx, db, evt); err != nil {
			t.Fatalf("Dispatch a échoué: %v", err)
		}
		if len(db.queries) != 1 {
			t.Fatalf("attendu 1 query pour sonder pending, obtenu %d", len(db.queries))
		}
		if len(db.execs) != 0 {
			t.Fatalf("attendu 0 exec car aucun pending, obtenu %d", len(db.execs))
		}
	})
}

func TestDispatch_UnsupportedEvent(t *testing.T) {
	ctx := context.Background()
	db := &mockDB{}
	err := Dispatch(ctx, db, "inconnu")
	if err == nil {
		t.Fatalf("attendu une erreur pour événement non supporté, obtenu nil")
	}
}

type mockTx struct {
	mockDB
	committed  bool
	rolledBack bool
}

func (m *mockTx) Begin(ctx context.Context) (pgx.Tx, error) { return m, nil }
func (m *mockTx) Commit(ctx context.Context) error {
	m.committed = true
	return nil
}
func (m *mockTx) Rollback(ctx context.Context) error {
	m.rolledBack = true
	return nil
}
func (m *mockTx) CopyFrom(ctx context.Context, tableName pgx.Identifier, columnNames []string, rowSrc pgx.CopyFromSource) (int64, error) {
	return 0, nil
}
func (m *mockTx) SendBatch(ctx context.Context, b *pgx.Batch) pgx.BatchResults { return nil }
func (m *mockTx) LargeObjects() pgx.LargeObjects                              { return pgx.LargeObjects{} }
func (m *mockTx) Prepare(ctx context.Context, name, sql string) (*pgconn.StatementDescription, error) {
	return nil, nil
}
func (m *mockTx) Conn() *pgx.Conn { return nil }

var _ pgx.Tx = (*mockTx)(nil)

func TestDispatch_WithTx_Mock(t *testing.T) {
	ctx := context.Background()
	tx := &mockTx{}

	// Test que Dispatch s'exécute correctement sur une transaction pgx.Tx
	err := Dispatch(ctx, tx, UserBlockedEvent{
		BlockerID: "11111111-1111-1111-1111-111111111111",
		BlockedID: "22222222-2222-2222-2222-222222222222",
	})
	if err != nil {
		t.Fatalf("Dispatch sur tx a échoué: %v", err)
	}
	if len(tx.execs) != 5 {
		t.Fatalf("attendu 5 requêtes sur tx, obtenu %d", len(tx.execs))
	}
}

func TestWithTx_NilPool(t *testing.T) {
	ctx := context.Background()
	err := WithTx(ctx, nil, func(tx pgx.Tx) error {
		return nil
	})
	if err == nil {
		t.Fatalf("attendu une erreur pour pool nil, obtenu nil")
	}
}

func TestWithTx_Integration(t *testing.T) {
	ctx := context.Background()
	p, err := testutil.TryPool(ctx)
	if err != nil || p == nil {
		t.Skip("DB indisponible")
	}

	t.Run("Commit réussi", func(t *testing.T) {
		err := WithTx(ctx, p, func(tx pgx.Tx) error {
			var one int
			return tx.QueryRow(ctx, "SELECT 1").Scan(&one)
		})
		if err != nil {
			t.Fatalf("WithTx commit a échoué: %v", err)
		}
	})

	t.Run("Rollback sur erreur", func(t *testing.T) {
		customErr := errors.New("custom error")
		err := WithTx(ctx, p, func(tx pgx.Tx) error {
			return customErr
		})
		if !errors.Is(err, customErr) {
			t.Fatalf("attendu customErr, obtenu %v", err)
		}
	})

	t.Run("Rollback sur panic", func(t *testing.T) {
		defer func() {
			if r := recover(); r == nil {
				t.Fatalf("attendu un panic")
			}
		}()
		_ = WithTx(ctx, p, func(tx pgx.Tx) error {
			panic("boom")
		})
	})
}
