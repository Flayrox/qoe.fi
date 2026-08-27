package users

import (
	"context"
	"errors"
	"log"
	"os"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/qoefi/api/internal/testutil"
)

var poolTest *pgxpool.Pool

func TestMain(m *testing.M) {
	p, err := testutil.Pool(context.Background())
	if err != nil {
		log.Fatalf("testcontainers: %v", err)
	}
	poolTest = p
	code := m.Run()
	testutil.Cleanup()
	os.Exit(code)
}

const (
	userID  = "00000000-0000-0000-0000-000000000040"
	pubID   = "pub_me_test"
	otherID = "00000000-0000-0000-0000-000000000041"
)

func seedMe(t *testing.T) {
	t.Helper()
	ctx := context.Background()
	if _, err := poolTest.Exec(ctx, `TRUNCATE TABLE
		"UserSettings", "AccountDeletionRequest", "Follows", "MutedWord",
		"Publication", "User" CASCADE`); err != nil {
		t.Fatalf("truncate: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "User" (id, email, username, name, role, pronouns, "walletBalanceCents", "hasCompletedOnboarding", "createdAt", "updatedAt")
		 VALUES ($1, 'reader.me@test.dev', 'readerme', 'Lectrice Me', 'user', 'iel', 250, true, now(), now())`,
		userID); err != nil {
		t.Fatalf("user: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "User" (id, email, username, name, role, "createdAt", "updatedAt")
		 VALUES ($1, 'other.me@test.dev', 'otherme', 'Autre', 'user', now(), now())`,
		otherID); err != nil {
		t.Fatalf("user other: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Publication" (id, type, name, slug, "createdAt", "updatedAt")
		 VALUES ($1, 'PERSONAL', 'Pub Me', 'pub-me', now(), now())`, pubID); err != nil {
		t.Fatalf("publication: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Follows" (id, "readerId", "publicationId", "createdAt")
		 VALUES (gen_random_uuid()::text, $1, $2, now())`, userID, pubID); err != nil {
		t.Fatalf("follow: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "MutedWord" (id, word, "userId", "createdAt")
		 VALUES (gen_random_uuid()::text, 'buzzword', $1, now())`, userID); err != nil {
		t.Fatalf("muted: %v", err)
	}
}

// TestMe vérifie GET /v1/me : identité + compteurs (suivis, mots masqués).
func TestMe(t *testing.T) {
	seedMe(t)
	svc := NewService(poolTest)
	ctx := context.Background()

	p, err := svc.Profile(ctx, userID)
	if err != nil {
		t.Fatalf("Profile: %v", err)
	}
	if p.ID != userID || p.Email != "reader.me@test.dev" {
		t.Fatalf("profil = %s/%s", p.ID, p.Email)
	}
	if p.Username == nil || *p.Username != "readerme" {
		t.Fatalf("username = %v", p.Username)
	}
	if p.Pronouns == nil || *p.Pronouns != "iel" {
		t.Fatalf("pronouns = %v", p.Pronouns)
	}
	if p.Role != "user" || !p.HasCompletedOnboarding {
		t.Fatalf("role/onboarding = %s/%v", p.Role, p.HasCompletedOnboarding)
	}
	if p.WalletBalanceCents != 250 {
		t.Fatalf("wallet = %d", p.WalletBalanceCents)
	}
	if p.FollowsCount != 1 || p.MutedWordsCount != 1 {
		t.Fatalf("compteurs = follows %d / muted %d, attendu 1/1", p.FollowsCount, p.MutedWordsCount)
	}
	if p.IsMediaMember {
		t.Fatal("isMediaMember = true, attendu false (aucun membership seedé)")
	}
	if p.CreatedAt == "" {
		t.Fatalf("createdAt vide")
	}
}

// TestUpdateProfile vérifie PATCH /v1/me/profile : mise à jour, validation
// du username (format + unicité).
func TestUpdateProfile(t *testing.T) {
	seedMe(t)
	svc := NewService(poolTest)
	ctx := context.Background()

	// Mise à jour valide (username en @… est normalisé, name tronqué).
	p, err := svc.UpdateProfile(ctx, userID, "Nouveau Nom", "@nouveau_nom", "Bio mise à jour", "", "il")
	if err != nil {
		t.Fatalf("UpdateProfile: %v", err)
	}
	if p.Name == nil || *p.Name != "Nouveau Nom" {
		t.Fatalf("name = %v", *p.Name)
	}
	if p.Username == nil || *p.Username != "nouveau_nom" {
		t.Fatalf("username = %v", p.Username)
	}
	if p.OnboardingText == nil || *p.OnboardingText != "Bio mise à jour" {
		t.Fatalf("onboardingText = %v", p.OnboardingText)
	}
	if p.Pronouns == nil || *p.Pronouns != "il" {
		t.Fatalf("pronouns = %v", p.Pronouns)
	}

	// Username invalide (trop court / caractères interdits).
	if _, err := svc.UpdateProfile(ctx, userID, "X", "ab", "", "", ""); err == nil {
		t.Fatalf("username trop court accepté")
	}
	if _, err := svc.UpdateProfile(ctx, userID, "X", "avec espaces", "", "", ""); err == nil {
		t.Fatalf("username avec espaces accepté")
	}

	// Username déjà pris par un autre utilisateur.
	if _, err := svc.UpdateProfile(ctx, userID, "X", "otherme", "", "", ""); err == nil {
		t.Fatalf("username déjà pris accepté")
	}
	// La valeur n'a pas bougé après les échecs.
	p2, err := svc.Profile(ctx, userID)
	if err != nil {
		t.Fatalf("Profile: %v", err)
	}
	if *p2.Username != "nouveau_nom" {
		t.Fatalf("username après échecs = %v", *p2.Username)
	}
}

// TestBilling vérifie GET /v1/me/billing : portefeuille + transactions
// récentes (tri DESC, limit 10) + abonnements premium actifs (par email).
func TestBilling(t *testing.T) {
	seedMe(t)
	ctx := context.Background()
	// Publications + abonnements du lecteur.
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Publication" (id, type, name, slug, "logoUrl", "createdAt", "updatedAt")
		 VALUES ('pub_bill_001', 'PERSONAL', 'Journal Billing', 'journal-billing', 'https://x/logo.png', now(), now()),
		        ('pub_bill_002', 'PERSONAL', 'Journal Inactif', 'journal-inactif', NULL, now(), now())`); err != nil {
		t.Fatalf("publication: %v", err)
	}
	// (email, publicationId) est UNIQUE → l'abonné inactif porte une autre publication.
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Subscriber" (id, email, "publicationId", "isActive", "isPremium", "receiveArticles", "createdAt", "updatedAt")
		 VALUES (gen_random_uuid()::text, 'reader.me@test.dev', 'pub_bill_001', true, true, true, now(), now()),
		        (gen_random_uuid()::text, 'reader.me@test.dev', 'pub_bill_002', false, true, true, now(), now()),
		        (gen_random_uuid()::text, 'other.me@test.dev', 'pub_bill_001', true, true, true, now(), now())`); err != nil {
		t.Fatalf("subscribers: %v", err)
	}
	// 2 transactions (1 crédit + 1 débit) — on vérifie le tri DESC.
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "WalletTransaction" (id, "userId", "amountCents", type, "createdAt")
		 VALUES ('tx_bill_01', $1, 500, 'DEPOSIT', now() - interval '2 days'),
		        ('tx_bill_02', $1, -200, 'SUBSCRIPTION_PAYMENT', now() - interval '1 day')`, userID); err != nil {
		t.Fatalf("transactions: %v", err)
	}

	svc := NewService(poolTest)
	data, err := svc.Billing(ctx, userID)
	if err != nil {
		t.Fatalf("Billing: %v", err)
	}
	if data.WalletBalanceCents != 250 {
		t.Fatalf("balance = %d, attendu 250", data.WalletBalanceCents)
	}
	// Tri createdAt DESC → tx_bill_02 (1j) avant tx_bill_01 (2j).
	if len(data.WalletTransactions) != 2 || data.WalletTransactions[0].ID != "tx_bill_02" {
		t.Fatalf("transactions = %+v", data.WalletTransactions)
	}
	if data.WalletTransactions[1].AmountCents != 500 || data.WalletTransactions[1].Type != "DEPOSIT" {
		t.Fatalf("transactions[1] = %+v", data.WalletTransactions[1])
	}
	if data.WalletTransactions[0].CreatedAt == "" {
		t.Fatal("createdAt transaction vide")
	}
	// Seul l'abonnement premium ET actif du lecteur est listé (inactif exclu,
	// email d'un autre utilisateur exclu).
	if len(data.Subscriptions) != 1 {
		t.Fatalf("subscriptions = %d, attendu 1", len(data.Subscriptions))
	}
	sub := data.Subscriptions[0]
	if sub.Publication == nil || sub.Publication.Name == nil || *sub.Publication.Name != "Journal Billing" {
		t.Fatalf("subscription = %+v", sub)
	}
	if sub.Publication.Slug != "journal-billing" || sub.Publication.LogoURL == nil ||
		*sub.Publication.LogoURL != "https://x/logo.png" {
		t.Fatalf("publication = %+v", sub.Publication)
	}

	// otherID voit SON abonnement (filtrage par email) et aucune transaction.
	other, err := svc.Billing(ctx, otherID)
	if err != nil {
		t.Fatalf("Billing(other): %v", err)
	}
	if len(other.WalletTransactions) != 0 || len(other.Subscriptions) != 1 ||
		other.Subscriptions[0].Publication == nil {
		t.Fatalf("other = %+v, attendu 0 transaction / 1 abonnement", other)
	}

	// Utilisateur inconnu → pgx.ErrNoRows.
	if _, err := svc.Billing(ctx, "00000000-0000-0000-0000-00000000dead"); !errors.Is(err, pgx.ErrNoRows) {
		t.Fatalf("Billing(inconnu) = %v, attendu pgx.ErrNoRows", err)
	}
}

// TestOnboardingComplete vérifie POST /v1/me/onboarding-complete : marque le
// profil, enregistre les mots masqués et les suivis (dédup inclus), et écrit
// un embedding (fallback déterministe, le service d'inférence n'existant pas).
func TestOnboardingComplete(t *testing.T) {
	seedMe(t)
	ctx := context.Background()
	svc := NewService(poolTest)

	if err := svc.OnboardingComplete(ctx, userID, OnboardingCompleteInput{
		Interests:        []string{"tech", "ecologie"},
		Subtopics:        []string{"llm"},
		OnboardingText:   "Lire et penser",
		MutedWords:       []string{"  BuzzWord ", "buzzword", "autre"},
		CreatorsToFollow: []string{pubID, pubID},
		Gender:           "NON_BINARY",
		AgeRange:         "AGE_25_34",
		Pronouns:         "iel",
	}); err != nil {
		t.Fatalf("OnboardingComplete: %v", err)
	}

	// Profil marqué + démographie.
	var done bool
	var gender, pronouns string
	if err := poolTest.QueryRow(ctx,
		`SELECT "hasCompletedOnboarding", COALESCE(gender::text, ''), COALESCE(pronouns, '')
		 FROM "User" WHERE id = $1`, userID).Scan(&done, &gender, &pronouns); err != nil || !done || gender != "NON_BINARY" || pronouns != "iel" {
		t.Fatalf("user = %v/%q/%q (err %v)", done, gender, pronouns, err)
	}
	// Embedding écrit (fallback déterministe 512 dims).
	var emb string
	if err := poolTest.QueryRow(ctx,
		`SELECT COALESCE(embedding::text, '') FROM "User" WHERE id = $1`, userID).Scan(&emb); err != nil || emb == "" {
		t.Fatalf("embedding vide (err %v)", err)
	}
	// Mots masqués dédupliqués (buzzword en minuscules ×2 → 1).
	var mutedCount int
	if err := poolTest.QueryRow(ctx,
		`SELECT COUNT(*) FROM "MutedWord" WHERE "userId" = $1`, userID).Scan(&mutedCount); err != nil || mutedCount != 2 {
		t.Fatalf("muted = %d (err %v), attendu 2", mutedCount, err)
	}
	// Suivis dédupliqués (pubID ×2 → 1).
	var followsCount int
	if err := poolTest.QueryRow(ctx,
		`SELECT COUNT(*) FROM "Follows" WHERE "readerId" = $1`, userID).Scan(&followsCount); err != nil || followsCount != 1 {
		t.Fatalf("follows = %d (err %v), attendu 1", followsCount, err)
	}

	// Gender invalide → ignoré (pas d'erreur), re-run idempotent.
	if err := svc.OnboardingComplete(ctx, userID, OnboardingCompleteInput{
		Interests: []string{"tech"}, MutedWords: []string{"buzzword"},
		CreatorsToFollow: []string{pubID}, Gender: "ALIEN",
	}); err != nil {
		t.Fatalf("OnboardingComplete(2): %v", err)
	}
	if err := poolTest.QueryRow(ctx,
		`SELECT COUNT(*) FROM "MutedWord" WHERE "userId" = $1`, userID).Scan(&mutedCount); err != nil || mutedCount != 2 {
		t.Fatalf("muted après re-run = %d (err %v), attendu 2 (idempotent)", mutedCount, err)
	}
}

// TestDataExport vérifie GET /v1/me/data-export : toutes les sections
// présentes, dates normalisées, valeurs null → nil.
func TestDataExport(t *testing.T) {
	seedMe(t)
	ctx := context.Background()
	svc := NewService(poolTest)

	// Quelques données de l'utilisateur.
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Post" (id, content, "authorId", "createdAt", "updatedAt")
		 VALUES ('post_exp_01', 'pensée export', $1, now(), now())`, userID); err != nil {
		t.Fatalf("post: %v", err)
	}

	data, err := svc.DataExport(ctx, userID)
	if err != nil {
		t.Fatalf("DataExport: %v", err)
	}
	if data["exportedAt"] == nil || data["account"] == nil {
		t.Fatalf("data = %v", data)
	}
	account := data["account"].(map[string]any)
	if account["email"] != "reader.me@test.dev" || account["createdAt"] == nil {
		t.Fatalf("account = %v", account)
	}
	if account["name"] == nil {
		t.Fatalf("name null alors que seedé")
	}
	thoughts := data["thoughts"].([]map[string]any)
	if len(thoughts) != 1 || thoughts[0]["content"] != "pensée export" || thoughts[0]["createdAt"] == nil {
		t.Fatalf("thoughts = %v", thoughts)
	}
	if len(data["articles"].([]map[string]any)) != 0 || len(data["follows"].([]map[string]any)) != 1 {
		t.Fatalf("articles/follows = %v/%v", data["articles"], data["follows"])
	}
}

// TestProfileNotFound — GET /v1/me sur un user inconnu → pgx.ErrNoRows (404).
func TestProfileNotFound(t *testing.T) {
	seedMe(t)
	svc := NewService(poolTest)
	ctx := context.Background()
	_, err := svc.Profile(ctx, "00000000-0000-0000-0000-00000000dead")
	if !errors.Is(err, pgx.ErrNoRows) {
		t.Fatalf("err = %v, attendu pgx.ErrNoRows", err)
	}
}

// TestMediaPublication vérifie GET /v1/me/media/{mediaId} : résolution de la
// publication d'un média pour un membre actif, et "" pour un non-membre.
func TestMediaPublication(t *testing.T) {
	ctx := context.Background()
	seedMe(t)
	svc := NewService(poolTest)

	// Média lié à une publication + membership actif.
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Publication" (id, type, name, slug, "createdAt", "updatedAt")
		 VALUES ('pub_media_test', 'MEDIA', 'Media Test', 'media-test', now(), now())`); err != nil {
		t.Fatalf("pub media: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Media" (id, "publicationId", "createdAt", "updatedAt")
		 VALUES ('media_test_001', 'pub_media_test', now(), now())`); err != nil {
		t.Fatalf("media: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "MediaMember" (id, "mediaId", "userId", role, status, "createdAt", "updatedAt")
		 VALUES (gen_random_uuid()::text, 'media_test_001', $1, 'owner', 'active', now(), now())`,
		userID); err != nil {
		t.Fatalf("member: %v", err)
	}

	pubID, err := svc.MediaPublicationForUser(ctx, userID, "media_test_001")
	if err != nil {
		t.Fatalf("MediaPublicationForUser: %v", err)
	}
	if pubID != "pub_media_test" {
		t.Fatalf("publicationId = %q, attendu pub_media_test", pubID)
	}

	// Non-membre → chaîne vide.
	empty, err := svc.MediaPublicationForUser(ctx, otherID, "media_test_001")
	if err != nil {
		t.Fatalf("non-member: %v", err)
	}
	if empty != "" {
		t.Fatalf("publicationId non-membre = %q, attendu vide", empty)
	}

	// Profil : isMediaMember = true pour le membre.
	p, err := svc.Profile(ctx, userID)
	if err != nil {
		t.Fatalf("Profile: %v", err)
	}
	if !p.IsMediaMember {
		t.Fatal("isMediaMember = false, attendu true pour le membre actif")
	}
}


// TestSyncUserAdoptsEmailConflict — session Supabase dont l'id JWT ne
// correspond plus à la ligne User (même email, id différent : base reseedée,
// backup restauré, compte recréé) : SyncUserFromAuth doit ADOPTER la ligne
// existante (re-pointer son id vers le JWT) au lieu de crasher sur
// l'unicité d'email. Les FKs ON UPDATE CASCADE font suivre le contenu.
func TestSyncUserAdoptsEmailConflict(t *testing.T) {
	seedMe(t) // crée userID (reader.me@test.dev) + follow + muted word
	ctx := context.Background()
	svc := NewService(poolTest)

	// Contenu du user (pensée) avant adoption.
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Post" (id, content, "authorId", "createdAt", "updatedAt")
		 VALUES ('post_adopt_01', 'pensée à conserver', $1, now(), now())`, userID); err != nil {
		t.Fatalf("post: %v", err)
	}

	// Nouvel id JWT (session recréée), même email.
	newJWTID := "00000000-0000-0000-0000-000000000042"
	claims := map[string]any{"email": "reader.me@test.dev", "user_metadata": map[string]any{}}

	created, needsOnboarding, err := svc.SyncUserFromAuth(ctx, newJWTID, claims)
	if err != nil {
		t.Fatalf("SyncUserFromAuth: %v", err)
	}
	if created {
		t.Fatal("created = true, attendu false (ligne adoptée)")
	}
	if needsOnboarding {
		t.Fatal("needsOnboarding = true, attendu false (profil seedé avec hasCompletedOnboarding=true)")
	}

	// La ligne porte le nouvel id, l'ancien n'existe plus.
	var email string
	if err := poolTest.QueryRow(ctx,
		`SELECT email FROM "User" WHERE id = $1`, newJWTID).Scan(&email); err != nil || email != "reader.me@test.dev" {
		t.Fatalf("user adopté = %s/%q (err %v)", newJWTID, email, err)
	}
	var n int
	if err := poolTest.QueryRow(ctx,
		`SELECT COUNT(*) FROM "User" WHERE id = $1`, userID).Scan(&n); err != nil || n != 0 {
		t.Fatalf("ancien id toujours présent (n=%d, err %v)", n, err)
	}

	// Le contenu a suivi via ON UPDATE CASCADE (post + follow + muted word).
	var authorID string
	if err := poolTest.QueryRow(ctx,
		`SELECT "authorId" FROM "Post" WHERE id = 'post_adopt_01'`).Scan(&authorID); err != nil || authorID != newJWTID {
		t.Fatalf("post.authorId = %q (err %v), attendu %s", authorID, err, newJWTID)
	}
	if err := poolTest.QueryRow(ctx,
		`SELECT COUNT(*) FROM "Follows" WHERE "readerId" = $1`, newJWTID).Scan(&n); err != nil || n != 1 {
		t.Fatalf("follows après adoption = %d (err %v)", n, err)
	}
	if err := poolTest.QueryRow(ctx,
		`SELECT COUNT(*) FROM "MutedWord" WHERE "userId" = $1`, newJWTID).Scan(&n); err != nil || n != 1 {
		t.Fatalf("muted après adoption = %d (err %v)", n, err)
	}
}
