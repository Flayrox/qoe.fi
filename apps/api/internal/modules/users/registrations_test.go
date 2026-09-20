package users

import (
	"context"
	"errors"
	"testing"
)

// TestSyncUserRegistrationsClosed — la clé SystemConfig ALLOW_NEW_REGISTRATIONS
// (toggle admin) ferme la création de NOUVELLES lignes User : SyncUserFromAuth
// refuse sans créer de ligne (ErrEmailNotInvited pour un email non invité,
// ErrRegistrationsClosed sans email), puis recrée dès que la clé repasse à
// true. Les comptes existants ne sont jamais touchés.
func TestSyncUserRegistrationsClosed(t *testing.T) {
	requirePool(t)
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
	if !errors.Is(err, ErrEmailNotInvited) {
		t.Fatalf("err = %v, attendu ErrEmailNotInvited (email non invité)", err)
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

	// Sans email : erreur générique de fermeture (pas de fuite d'allowlist).
	claimsEmpty := map[string]any{"user_metadata": map[string]any{}}
	if _, _, err := svc.SyncUserFromAuth(ctx, freshID, claimsEmpty); !errors.Is(err, ErrRegistrationsClosed) {
		t.Fatalf("err = %v, attendu ErrRegistrationsClosed (sans email)", err)
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

// TestSyncUserAllowlist — en accès privé (ALLOW_NEW_REGISTRATIONS=false),
// un email invité (allowlist, insensible à la casse) peut s'inscrire et
// consomme son invitation (usage unique) ; un email inconnu reçoit
// ErrEmailNotInvited sans création de ligne.
func TestSyncUserAllowlist(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	svc := NewService(poolTest)

	if _, err := poolTest.Exec(ctx, `DELETE FROM "SystemConfig" WHERE key = 'ALLOW_NEW_REGISTRATIONS'`); err != nil {
		t.Fatalf("cleanup config: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "SystemConfig" (key, value, "updatedAt") VALUES ('ALLOW_NEW_REGISTRATIONS', 'false', now())`); err != nil {
		t.Fatalf("set config: %v", err)
	}
	t.Cleanup(func() {
		_, _ = poolTest.Exec(ctx, `DELETE FROM "SystemConfig" WHERE key = 'ALLOW_NEW_REGISTRATIONS'`)
		_, _ = poolTest.Exec(ctx, `DELETE FROM "RegistrationAllowlist"`)
	})
	if _, err := poolTest.Exec(ctx, `DELETE FROM "RegistrationAllowlist" WHERE email IN ('invite@test.dev', 'used@test.dev')`); err != nil {
		t.Fatalf("cleanup allowlist: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "RegistrationAllowlist" (email, note) VALUES ('invite@test.dev', 'beta')`); err != nil {
		t.Fatalf("invite: %v", err)
	}
	// Invitation déjà consommée.
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "RegistrationAllowlist" (email, "usedAt", "usedBy") VALUES ('used@test.dev', now(), 'x')`); err != nil {
		t.Fatalf("used invite: %v", err)
	}

	// 1. Email inconnu → ErrEmailNotInvited, rien créé.
	claims := map[string]any{"email": "stranger@test.dev", "user_metadata": map[string]any{}}
	if _, _, err := svc.SyncUserFromAuth(ctx, "00000000-0000-0000-0000-000000000091", claims); !errors.Is(err, ErrEmailNotInvited) {
		t.Fatalf("err = %v, attendu ErrEmailNotInvited", err)
	}

	// 2. Invitation déjà utilisée → ErrEmailNotInvited.
	claimsUsed := map[string]any{"email": "used@test.dev", "user_metadata": map[string]any{}}
	if _, _, err := svc.SyncUserFromAuth(ctx, "00000000-0000-0000-0000-000000000092", claimsUsed); !errors.Is(err, ErrEmailNotInvited) {
		t.Fatalf("err = %v, attendu ErrEmailNotInvited (rejouée)", err)
	}

	// 3. Email invité (casse différente) → créé + invitation consommée.
	claimsInvited := map[string]any{"email": "Invite@Test.Dev", "user_metadata": map[string]any{}}
	created, _, err := svc.SyncUserFromAuth(ctx, "00000000-0000-0000-0000-000000000093", claimsInvited)
	if err != nil {
		t.Fatalf("invité: %v", err)
	}
	if !created {
		t.Fatal("created = false, attendu true pour un invité")
	}
	var usedCount int
	if err := poolTest.QueryRow(ctx,
		`SELECT COUNT(*) FROM "RegistrationAllowlist" WHERE email = 'invite@test.dev' AND "usedAt" IS NOT NULL`).Scan(&usedCount); err != nil {
		t.Fatalf("used check: %v", err)
	}
	if usedCount != 1 {
		t.Fatal("invitation non marquée utilisée après inscription")
	}

	// 4. Même invitation rejouée par un autre compte → refusée (usage unique).
	if _, _, err := svc.SyncUserFromAuth(ctx, "00000000-0000-0000-0000-000000000094", claimsInvited); !errors.Is(err, ErrEmailNotInvited) {
		t.Fatalf("err = %v, attendu ErrEmailNotInvited (usage unique)", err)
	}

	// 5. Statut public : ouvert=false, allowed selon l'email.
	open, allowed, err := svc.RegistrationStatus(ctx, "stranger@test.dev")
	if err != nil || open || allowed {
		t.Fatalf("status stranger = (%v, %v, %v), attendu (false, false, nil)", open, allowed, err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "RegistrationAllowlist" (email) VALUES ('late@test.dev')`); err != nil {
		t.Fatalf("late invite: %v", err)
	}
	open, allowed, err = svc.RegistrationStatus(ctx, " Late@Test.Dev ")
	if err != nil || open || !allowed {
		t.Fatalf("status invité = (%v, %v, %v), attendu (false, true, nil)", open, allowed, err)
	}

	// 6. Inscriptions ouvertes → tout le monde autorisé.
	if _, err := poolTest.Exec(ctx,
		`UPDATE "SystemConfig" SET value = 'true' WHERE key = 'ALLOW_NEW_REGISTRATIONS'`); err != nil {
		t.Fatalf("reopen: %v", err)
	}
	open, allowed, err = svc.RegistrationStatus(ctx, "anyone@test.dev")
	if err != nil || !open || !allowed {
		t.Fatalf("status ouvert = (%v, %v, %v), attendu (true, true, nil)", open, allowed, err)
	}
}
