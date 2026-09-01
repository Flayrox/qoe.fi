package users

import (
	"context"
	"errors"
	"testing"
)

// TestSyncUserRegistrationsClosed — la clé SystemConfig ALLOW_NEW_REGISTRATIONS
// (toggle admin) ferme la création de NOUVELLES lignes User : SyncUserFromAuth
// doit renvoyer ErrRegistrationsClosed sans créer de ligne, puis recréer dès
// que la clé repasse à true. Les comptes existants ne sont jamais touchés.
func TestSyncUserRegistrationsClosed(t *testing.T) {
	ctx := context.Background()
	svc := NewService(poolTest)
	freshID := "00000000-0000-0000-0000-000000000099"

	if _, err := poolTest.Exec(ctx, `DELETE FROM "User" WHERE id = $1`, freshID); err != nil {
		t.Fatalf("cleanup user: %v", err)
	}
	if _, err := poolTest.Exec(ctx, `DELETE FROM "SystemConfig" WHERE key = 'ALLOW_NEW_REGISTRATIONS'`); err != nil {
		t.Fatalf("cleanup config: %v", err)
	}

	// 🔒 Inscriptions fermées.
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "SystemConfig" (key, value, "updatedAt") VALUES ('ALLOW_NEW_REGISTRATIONS', 'false', now())`); err != nil {
		t.Fatalf("set config: %v", err)
	}
	t.Cleanup(func() {
		_, _ = poolTest.Exec(ctx, `DELETE FROM "SystemConfig" WHERE key = 'ALLOW_NEW_REGISTRATIONS'`)
	})

	claims := map[string]any{"email": "closed@test.dev", "user_metadata": map[string]any{}}
	created, _, err := svc.SyncUserFromAuth(ctx, freshID, claims)
	if !errors.Is(err, ErrRegistrationsClosed) {
		t.Fatalf("err = %v, attendu ErrRegistrationsClosed", err)
	}
	if created {
		t.Fatal("created = true, attendu false")
	}
	var n int
	if err := poolTest.QueryRow(ctx, `SELECT COUNT(*) FROM "User" WHERE id = $1`, freshID).Scan(&n); err != nil {
		t.Fatalf("count: %v", err)
	}
	if n != 0 {
		t.Fatal("ligne User créée alors que les inscriptions sont fermées")
	}

	// 🔓 Inscriptions rouvertes : la création passe.
	if _, err := poolTest.Exec(ctx,
		`UPDATE "SystemConfig" SET value = 'true' WHERE key = 'ALLOW_NEW_REGISTRATIONS'`); err != nil {
		t.Fatalf("reopen config: %v", err)
	}
	created, needsOnboarding, err := svc.SyncUserFromAuth(ctx, freshID, claims)
	if err != nil {
		t.Fatalf("SyncUserFromAuth (ouvert): %v", err)
	}
	if !created {
		t.Fatal("created = false, attendu true")
	}
	if !needsOnboarding {
		t.Fatal("needsOnboarding = false, attendu true pour un nouveau compte")
	}
}
