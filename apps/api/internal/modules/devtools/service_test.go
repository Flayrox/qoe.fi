package devtools

import (
	"context"
	"strings"
	"testing"

	"github.com/alicebob/miniredis/v2"
)

// TestDevtools_CheckSuperadmin_UnknownUser : lookup DB en échec (utilisateur
// inexistant) → errForbidden même hors mode dev.
func TestDevtools_CheckSuperadmin_UnknownUser(t *testing.T) {
	seedDevtools(t)
	svc := NewService(poolTest) // devOnly = false
	if _, err := svc.Data(context.Background(), "00000000-0000-0000-0000-0000000000f9"); err == nil {
		t.Fatal("utilisateur inconnu attendu errForbidden")
	}
}

// TestDevtools_DevOnlySentinel : en mode dev, le sentinel est accepté sans
// ligne superadmin en base.
func TestDevtools_DevOnlySentinel(t *testing.T) {
	seedDevtools(t)
	svc := NewService(poolTest, Options{DevOnly: true})
	if _, err := svc.Data(context.Background(), DevSecretUserID); err != nil {
		t.Fatalf("sentinel dev: %v", err)
	}
}

func TestDevtools_CreateUser_ValidationAndPlainRole(t *testing.T) {
	seedDevtools(t)
	svc := NewService(poolTest, Options{DevOnly: true})
	ctx := context.Background()

	if err := svc.CreateUser(ctx, DevSecretUserID, CreateUserParams{Email: "x@t.dev"}); err == nil {
		t.Fatal("id manquant attendu erreur")
	}
	if err := svc.CreateUser(ctx, DevSecretUserID, CreateUserParams{ID: "00000000-0000-0000-0000-0000000000e3"}); err == nil {
		t.Fatal("email manquant attendu erreur")
	}

	// Rôle par défaut « user » → pas de pack de départ (0 article).
	if err := svc.CreateUser(ctx, DevSecretUserID, CreateUserParams{
		ID: "00000000-0000-0000-0000-0000000000e3", Email: "plain@t.dev", Username: "plain",
	}); err != nil {
		t.Fatalf("CreateUser(plain): %v", err)
	}
	var n int
	if err := poolTest.QueryRow(ctx,
		`SELECT COUNT(*) FROM "Article" WHERE "authorId" = '00000000-0000-0000-0000-0000000000e3'`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 0 {
		t.Fatalf("articles = %d, attendu 0 pour un rôle user", n)
	}

	// RBAC hors mode dev : le sentinel dev n'est accepté qu'en mode dev.
	prodSvc := NewService(poolTest) // devOnly = false
	if err := prodSvc.CreateUser(ctx, DevSecretUserID, CreateUserParams{ID: "x", Email: "y"}); err == nil {
		t.Fatal("CreateUser(sentinel hors dev) attendu erreur")
	}
}

func TestDevtools_SimulateSubscriber_ValidationAndWalletPaths(t *testing.T) {
	_, regularID := seedDevtools(t)
	svc := NewService(poolTest, Options{DevOnly: true})
	ctx := context.Background()

	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Publication" (id, type, name, slug, "updatedAt")
		 VALUES ('pub_dev_svc', 'PERSONAL', 'Svc Pub', 'svc-pub', now())`); err != nil {
		t.Fatalf("publication: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`UPDATE "User" SET "publicationId" = 'pub_dev_svc' WHERE id = $1`, regularID); err != nil {
		t.Fatalf("link: %v", err)
	}

	// Validation : email vide / publication vide.
	if err := svc.SimulateSubscriber(ctx, DevSecretUserID, SimulateSubscriberParams{PublicationID: "p"}); err == nil {
		t.Fatal("email vide attendu erreur")
	}
	if err := svc.SimulateSubscriber(ctx, DevSecretUserID, SimulateSubscriberParams{Email: "a@b.c"}); err == nil {
		t.Fatal("publication vide attendu erreur")
	}

	// Lecteur existant (même email qu'un user) → transaction wallet négative.
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "User" (id, email, username, name, role, "createdAt", "updatedAt")
		 VALUES ('00000000-0000-0000-0000-0000000000e4', 'reader-wallet@t.dev', 'rwallet', 'RW', 'user', now(), now())`); err != nil {
		t.Fatalf("reader: %v", err)
	}
	if err := svc.SimulateSubscriber(ctx, DevSecretUserID, SimulateSubscriberParams{
		Email: "reader-wallet@t.dev", PublicationID: "pub_dev_svc", IsPremium: true, LtvCents: 700,
	}); err != nil {
		t.Fatalf("SimulateSubscriber(reader wallet): %v", err)
	}
	var readerTx int
	if err := poolTest.QueryRow(ctx,
		`SELECT COUNT(*) FROM "WalletTransaction" WHERE "userId" = '00000000-0000-0000-0000-0000000000e4' AND "amountCents" = -700`).Scan(&readerTx); err != nil {
		t.Fatal(err)
	}
	if readerTx != 1 {
		t.Fatalf("tx reader = %d, attendu 1", readerTx)
	}
	var balance int
	if err := poolTest.QueryRow(ctx,
		`SELECT "walletBalanceCents" FROM "User" WHERE id = $1`, regularID).Scan(&balance); err != nil {
		t.Fatal(err)
	}
	if balance != 700 {
		t.Fatalf("balance owner = %d, attendu 700", balance)
	}

	// Validation simulateurs.
	if err := svc.SimulateFollow(ctx, DevSecretUserID, "", "p"); err == nil {
		t.Fatal("SimulateFollow(reader vide) attendu erreur")
	}
	if _, err := svc.SimulateLike(ctx, DevSecretUserID, "", "u"); err == nil {
		t.Fatal("SimulateLike(post vide) attendu erreur")
	}
	if _, err := svc.SimulateLike(ctx, DevSecretUserID, "p", ""); err == nil {
		t.Fatal("SimulateLike(user vide) attendu erreur")
	}
	if _, err := svc.AddFunds(ctx, DevSecretUserID, "", 100); err == nil {
		t.Fatal("AddFunds(user vide) attendu erreur")
	}
}

func TestDevtools_SimulateSubscriber_MediaOwner(t *testing.T) {
	seedDevtools(t)
	svc := NewService(poolTest, Options{DevOnly: true})
	ctx := context.Background()

	// Publication média + Media + owner.
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Publication" (id, type, name, slug, "updatedAt")
		 VALUES ('pub_dev_media', 'MEDIA', 'Média Svc', 'media-svc', now())`); err != nil {
		t.Fatalf("publication: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Media" (id, "publicationId", "createdAt", "updatedAt")
		 VALUES ('media_dev_svc', 'pub_dev_media', now(), now())`); err != nil {
		t.Fatalf("media: %v", err)
	}
	ownerID := "00000000-0000-0000-0000-0000000000e5"
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "User" (id, email, username, name, role, "createdAt", "updatedAt")
		 VALUES ($1, 'media-owner@t.dev', 'mowner', 'MO', 'user', now(), now())`, ownerID); err != nil {
		t.Fatalf("owner: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "MediaMember" (id, "mediaId", "userId", role, status, "createdAt", "updatedAt")
		 VALUES (gen_random_uuid()::text, 'media_dev_svc', $1, 'owner', 'active', now(), now())`, ownerID); err != nil {
		t.Fatalf("member: %v", err)
	}

	if err := svc.SimulateSubscriber(ctx, DevSecretUserID, SimulateSubscriberParams{
		Email: "media-sub@t.dev", PublicationID: "pub_dev_media", IsPremium: true, LtvCents: 900,
	}); err != nil {
		t.Fatalf("SimulateSubscriber(media owner): %v", err)
	}
	var balance int
	if err := poolTest.QueryRow(ctx,
		`SELECT "walletBalanceCents" FROM "User" WHERE id = $1`, ownerID).Scan(&balance); err != nil {
		t.Fatal(err)
	}
	if balance != 900 {
		t.Fatalf("balance media owner = %d, attendu 900", balance)
	}
}

func TestDevtools_AddFunds_Withdrawal(t *testing.T) {
	_, regularID := seedDevtools(t)
	svc := NewService(poolTest, Options{DevOnly: true})
	ctx := context.Background()

	balance, err := svc.AddFunds(ctx, DevSecretUserID, regularID, -250)
	if err != nil {
		t.Fatalf("AddFunds(negatif): %v", err)
	}
	if balance != -250 {
		t.Fatalf("balance = %d, attendu -250", balance)
	}
	var txType string
	if err := poolTest.QueryRow(ctx,
		`SELECT type FROM "WalletTransaction" WHERE "userId" = $1 AND "amountCents" = -250`, regularID).Scan(&txType); err != nil {
		t.Fatal(err)
	}
	if txType != "WITHDRAWAL" {
		t.Fatalf("type = %q, attendu WITHDRAWAL", txType)
	}
}

func TestDevtools_ResetOnboarding_Targeted(t *testing.T) {
	_, regularID := seedDevtools(t)
	svc := NewService(poolTest, Options{DevOnly: true})
	ctx := context.Background()

	if _, err := poolTest.Exec(ctx,
		`UPDATE "User" SET "hasCompletedOnboarding" = true WHERE id = $1`, regularID); err != nil {
		t.Fatal(err)
	}
	// Cible par id.
	if err := svc.ResetOnboarding(ctx, DevSecretUserID, regularID); err != nil {
		t.Fatalf("ResetOnboarding(target): %v", err)
	}
	// Cible par email (lower).
	if _, err := poolTest.Exec(ctx,
		`UPDATE "User" SET "hasCompletedOnboarding" = true WHERE id = $1`, regularID); err != nil {
		t.Fatal(err)
	}
	if err := svc.ResetOnboarding(ctx, DevSecretUserID, "DEVTOOLS.USER@TEST.DEV"); err != nil {
		t.Fatalf("ResetOnboarding(email): %v", err)
	}
}

// TestDevtools_SeedTop_RedisAndUmami couvre les branches optionnelles de
// SeedTop : enqueue des embeddings (REDIS_URL) et génération Umami.
func TestDevtools_SeedTop_RedisAndUmami(t *testing.T) {
	seedDevtools(t)
	ctx := context.Background()

	// Schéma Umami minimal dans le pool de test.
	ddl := []string{
		`CREATE TABLE IF NOT EXISTS website (
			website_id uuid PRIMARY KEY, domain varchar NOT NULL, deleted_at timestamptz)`,
		`CREATE TABLE IF NOT EXISTS website_event (
			event_id uuid PRIMARY KEY, website_id uuid NOT NULL, session_id uuid NOT NULL,
			created_at timestamptz NOT NULL, url_path text, referrer_domain text,
			page_title text, event_type integer, event_name text, hostname text, visit_id uuid)`,
		`CREATE TABLE IF NOT EXISTS session (
			session_id uuid PRIMARY KEY, website_id uuid NOT NULL, created_at timestamptz NOT NULL,
			browser text, os text, device text, screen text, language text, country text,
			region text, city text, distinct_id text)`,
	}
	for _, d := range ddl {
		if _, err := poolTest.Exec(ctx, d); err != nil {
			t.Fatalf("ddl umami: %v", err)
		}
	}
	if _, err := poolTest.Exec(ctx, `TRUNCATE TABLE website_event, session, website`); err != nil {
		t.Fatalf("truncate umami: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO website (website_id, domain, deleted_at) VALUES ($1, 'qoe-dev.example', NULL)`,
		"11111111-1111-1111-1111-111111111111"); err != nil {
		t.Fatalf("website: %v", err)
	}

	s := miniredis.RunT(t)
	t.Setenv("REDIS_URL", "redis://"+s.Addr())
	dsn := poolTest.Config().ConnConfig.ConnString()
	t.Setenv("UMAMI_DATABASE_URL", dsn)
	t.Setenv("MEILISEARCH_HOST", "http://127.0.0.1:1")

	svc := NewService(poolTest, Options{DevOnly: true})
	res, err := svc.SeedTop(ctx, DevSecretUserID)
	if err != nil {
		t.Fatalf("SeedTop: %v", err)
	}
	if res["success"] != true {
		t.Fatalf("res = %+v", res)
	}
	if n, ok := res["embeddingsEnqueued"].(int); !ok || n == 0 {
		t.Fatalf("embeddingsEnqueued = %v, attendu > 0", res["embeddingsEnqueued"])
	}
	if res["umami"] != "généré" {
		t.Fatalf("umami = %v, attendu généré", res["umami"])
	}
	var sessions int
	if err := poolTest.QueryRow(ctx, `SELECT COUNT(*) FROM session`).Scan(&sessions); err != nil {
		t.Fatal(err)
	}
	if sessions == 0 {
		t.Fatal("aucune session umami générée")
	}

	// enqueueMissingEmbeddings sur la base seedée (articles sans embedding).
	if err := enqueueMissingEmbeddings(ctx, poolTest); err != nil {
		t.Fatalf("enqueueMissingEmbeddings: %v", err)
	}
}

// TestDevtools_SeedTopComplete_Additive couvre les branches additives :
// AddTop + RunWorld + enqueue des embeddings manquants.
func TestDevtools_SeedTopComplete_Additive(t *testing.T) {
	seedDevtools(t)
	ctx := context.Background()

	s := miniredis.RunT(t)
	t.Setenv("REDIS_URL", "redis://"+s.Addr())
	t.Setenv("UMAMI_DATABASE_URL", "")
	t.Setenv("MEILISEARCH_HOST", "http://127.0.0.1:1")

	svc := NewService(poolTest, Options{DevOnly: true})
	res, err := svc.SeedTopComplete(ctx, DevSecretUserID)
	if err != nil {
		t.Fatalf("SeedTopComplete: %v", err)
	}
	if res["contentMode"] != "reset+additive" {
		t.Fatalf("res = %+v", res)
	}
	if n, ok := res["embeddingsEnqueued"].(int); !ok || n == 0 {
		t.Fatalf("embeddingsEnqueued = %v, attendu > 0", res["embeddingsEnqueued"])
	}
}

// TestDevtools_GeneratePosts_NoCreators couvre le chemin d'erreur métier.
func TestDevtools_GeneratePosts_NoCreators(t *testing.T) {
	seedDevtools(t)
	svc := NewService(poolTest, Options{DevOnly: true})
	err := svc.GeneratePosts(context.Background(), DevSecretUserID)
	if err == nil || !strings.Contains(err.Error(), "créer au moins un utilisateur") {
		t.Fatalf("GeneratePosts(sans créateur) = %v, attendu erreur métier", err)
	}
}
