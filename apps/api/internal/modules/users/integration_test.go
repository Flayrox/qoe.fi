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
