package users

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

// Fiche 01 §4 : changer d'adresse ne déplace AUCUN envoi vers une adresse non
// vérifiée. La migration passe par un endpoint dédié qui vérifie d'abord
// auprès du fournisseur d'identité — jamais par bascule silencieuse.

// fakeGoTrue répond comme GET /auth/v1/admin/users/{id} avec l'adresse et
// l'état de confirmation configurés par test.
func fakeGoTrue(t *testing.T, email, confirmedAt string) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"id":                 "u_migrate_1",
			"email":              email,
			"email_confirmed_at": confirmedAt,
		})
	}))
}

func seedMigrateAccount(t *testing.T, ctx context.Context, userID, email string) {
	t.Helper()
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "User" (id, email, username, name, role, "createdAt", "updatedAt")
		 VALUES ($1, $2, 'migr_', 'Migr', 'user', now(), now())
		 ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email`, userID, email); err != nil {
		t.Fatalf("seed user: %v", err)
	}
	t.Cleanup(func() {
		_, _ = poolTest.Exec(ctx, `DELETE FROM "Subscriber" WHERE "userId" = $1`, userID)
		_, _ = poolTest.Exec(ctx, `DELETE FROM "User" WHERE id = $1`, userID)
	})
}

// seedMigratePublication pose la publication visée par les abonnements :
// "Subscriber"."publicationId" est une vraie clé étrangère — un abonné dont la
// publication n'existe pas n'est pas un cas de test, c'est une donnée corrompue.
func seedMigratePublication(t *testing.T, ctx context.Context, id string) {
	t.Helper()
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Publication" (id, type, name, slug, "createdAt", "updatedAt")
		 VALUES ($1, 'PERSONAL', 'Publication migration', $1, now(), now())
		 ON CONFLICT (id) DO NOTHING`, id); err != nil {
		t.Fatalf("seed publication %s: %v", id, err)
	}
	t.Cleanup(func() {
		_, _ = poolTest.Exec(ctx, `DELETE FROM "Publication" WHERE id = $1`, id)
	})
}

func TestMigrateSubscriptions_RequiresConfirmedEmail(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	const uid = "00000000-0000-0000-0000-00000000aa01"
	seedMigrateAccount(t, ctx, uid, "nouvelle@test.dev")

	// Adresse NON confirmée côté fournisseur → refus, rien ne bouge.
	server := fakeGoTrue(t, "nouvelle@test.dev", "")
	defer server.Close()
	svc := NewServiceWithGoTrue(poolTest, server.URL, "service-role-test")

	if _, err := svc.MigrateSubscriptionsToVerifiedEmail(ctx, uid); err == nil {
		t.Fatal("migration acceptée sans adresse vérifiée")
	}
}

func TestMigrateSubscriptions_MovesOnlyActive(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	const uid = "00000000-0000-0000-0000-00000000aa02"
	seedMigrateAccount(t, ctx, uid, "arrivee@test.dev")
	seedMigratePublication(t, ctx, "pub_mig_001")
	seedMigratePublication(t, ctx, "pub_mig_002")

	// Un abonnement actif lié au compte (ancienne adresse) + un désabonné lié
	// au compte : seul l'actif doit migrer.
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Subscriber" (id, email, "publicationId", "userId", locale, "isActive", "receiveArticles", "confirmedAt", "createdAt", "updatedAt")
		 VALUES (gen_random_uuid()::text, 'ancienne@test.dev', 'pub_mig_001', $1, 'fr', true, true, now(), now(), now()),
		        (gen_random_uuid()::text, 'ancienne@test.dev', 'pub_mig_002', $1, 'fr', false, false, now() - interval '10 days', now(), now())`,
		uid); err != nil {
		t.Fatalf("seed subscribers: %v", err)
	}
	t.Cleanup(func() {
		_, _ = poolTest.Exec(ctx, `DELETE FROM "Subscriber" WHERE "publicationId" IN ('pub_mig_001', 'pub_mig_002')`)
	})

	server := fakeGoTrue(t, "arrivee@test.dev", "2026-09-28T10:00:00Z")
	defer server.Close()
	svc := NewServiceWithGoTrue(poolTest, server.URL, "service-role-test")

	migrated, err := svc.MigrateSubscriptionsToVerifiedEmail(ctx, uid)
	if err != nil {
		t.Fatalf("migrate: %v", err)
	}
	if migrated != 1 {
		t.Fatalf("migrés = %d, attendu 1 (l'actif seul)", migrated)
	}

	var activeAddr string
	var activeReceive bool
	if err := poolTest.QueryRow(ctx,
		`SELECT email, "receiveArticles" FROM "Subscriber" WHERE "userId" = $1 AND "publicationId" = 'pub_mig_001'`,
		uid).Scan(&activeAddr, &activeReceive); err != nil {
		t.Fatalf("read actif: %v", err)
	}
	if activeAddr != "arrivee@test.dev" || !activeReceive {
		t.Fatalf("actif = %s receive=%v, attendu arrivee@test.dev/true", activeAddr, activeReceive)
	}

	var offAddr string
	var offReceive bool
	if err := poolTest.QueryRow(ctx,
		`SELECT email, "receiveArticles" FROM "Subscriber" WHERE "userId" = $1 AND "publicationId" = 'pub_mig_002'`,
		uid).Scan(&offAddr, &offReceive); err != nil {
		t.Fatalf("read désabonné: %v", err)
	}
	if offAddr != "ancienne@test.dev" || offReceive {
		t.Fatalf("désabonné touché : %s receive=%v", offAddr, offReceive)
	}

	// Idempotent : rejouer ne change rien.
	migrated, err = svc.MigrateSubscriptionsToVerifiedEmail(ctx, uid)
	if err != nil {
		t.Fatalf("re-migrate: %v", err)
	}
	if migrated != 0 {
		t.Fatalf("re-migrate = %d, attendu 0", migrated)
	}
}

func TestMigrateSubscriptions_NoDuplicate(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	const uid = "00000000-0000-0000-0000-00000000aa03"
	seedMigrateAccount(t, ctx, uid, "double@test.dev")
	seedMigratePublication(t, ctx, "pub_mig_003")

	// L'ancienne adresse a un abonnement actif, et la nouvelle en a déjà un
	// (créé directement) : la migration ne doit pas fusionner ni doublonner.
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Subscriber" (id, email, "publicationId", "userId", locale, "isActive", "receiveArticles", "confirmedAt", "createdAt", "updatedAt")
		 VALUES (gen_random_uuid()::text, 'vieux@test.dev', 'pub_mig_003', $1, 'fr', true, true, now(), now(), now()),
		        (gen_random_uuid()::text, 'double@test.dev', 'pub_mig_003', NULL, 'fr', true, true, now(), now(), now())`,
		uid); err != nil {
		t.Fatalf("seed: %v", err)
	}
	t.Cleanup(func() {
		_, _ = poolTest.Exec(ctx, `DELETE FROM "Subscriber" WHERE "publicationId" = 'pub_mig_003'`)
	})

	server := fakeGoTrue(t, "double@test.dev", "2026-09-28T10:00:00Z")
	defer server.Close()
	svc := NewServiceWithGoTrue(poolTest, server.URL, "service-role-test")

	migrated, err := svc.MigrateSubscriptionsToVerifiedEmail(ctx, uid)
	if err != nil {
		t.Fatalf("migrate: %v", err)
	}
	if migrated != 0 {
		t.Fatalf("migrés = %d, attendu 0 (doublon évité)", migrated)
	}
	var count int
	if err := poolTest.QueryRow(ctx,
		`SELECT COUNT(*) FROM "Subscriber" WHERE "publicationId" = 'pub_mig_003'`).Scan(&count); err != nil {
		t.Fatalf("count: %v", err)
	}
	if count != 2 {
		t.Fatalf("lignes = %d, attendu 2 (aucune fusion, aucun doublon)", count)
	}
}
