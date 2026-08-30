package devtools

import (
	"context"
	"log"
	"os"
	"testing"

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

func seedDevtools(t *testing.T) (adminID, regularID string) {
	t.Helper()
	ctx := context.Background()
	if _, err := poolTest.Exec(ctx, `TRUNCATE TABLE
		"Follows", "Subscriber", "WalletTransaction", "User", "Publication", "Post",
		"Like", "SystemConfig", "NavigationItem", "SocialLink", "Category", "Article" CASCADE`); err != nil {
		t.Fatalf("truncate: %v", err)
	}
	adminID = "00000000-0000-0000-0000-0000000000d1"
	regularID = "00000000-0000-0000-0000-0000000000d2"
	for i, u := range []struct{ id, email, role string }{
		{adminID, "devtools.admin@test.dev", "superadmin"},
		{regularID, "devtools.user@test.dev", "user"},
	} {
		username := []string{"devadmin", "devuser"}[i]
		if _, err := poolTest.Exec(ctx,
			`INSERT INTO "User" (id, email, username, name, role, "createdAt", "updatedAt")
			 VALUES ($1, $2, $3, $3, $4, now(), now())`,
			u.id, u.email, username, u.role); err != nil {
			t.Fatalf("user: %v", err)
		}
	}
	return adminID, regularID
}

func newTestService(t *testing.T) *Service {
	t.Helper()
	svc := NewService(poolTest)
	t.Cleanup(func() {})
	return svc
}

func TestDevtoolsRBAC(t *testing.T) {
	_, regularID := seedDevtools(t)
	svc := newTestService(t)
	ctx := context.Background()

	// Un non-superadmin est refusé partout.
	if _, err := svc.Data(ctx, regularID); err == nil {
		t.Fatal("Data: attendu errForbidden pour un non-superadmin")
	}
	if err := svc.Reset(ctx, regularID); err == nil {
		t.Fatal("Reset: attendu errForbidden")
	}
	if err := svc.SimulateSubscriber(ctx, regularID, SimulateSubscriberParams{Email: "x@y.dev", PublicationID: "p"}); err == nil {
		t.Fatal("SimulateSubscriber: attendu errForbidden")
	}
	if err := svc.SimulateFollow(ctx, regularID, regularID, "p"); err == nil {
		t.Fatal("SimulateFollow: attendu errForbidden")
	}
	if _, err := svc.SimulateLike(ctx, regularID, "post", regularID); err == nil {
		t.Fatal("SimulateLike: attendu errForbidden")
	}
	if _, err := svc.AddFunds(ctx, regularID, regularID, 100); err == nil {
		t.Fatal("AddFunds: attendu errForbidden")
	}
	if err := svc.ResetOnboarding(ctx, regularID, ""); err == nil {
		t.Fatal("ResetOnboarding: attendu errForbidden")
	}
	if _, err := svc.UserByEmail(ctx, regularID, "devtools.user@test.dev"); err == nil {
		t.Fatal("UserByEmail: attendu errForbidden")
	}
}

func TestDevtoolsDataAndCreateUser(t *testing.T) {
	adminID, _ := seedDevtools(t)
	svc := newTestService(t)
	ctx := context.Background()

	data, err := svc.Data(ctx, adminID)
	if err != nil {
		t.Fatalf("Data: %v", err)
	}
	if data.Stats.Users < 2 {
		t.Fatalf("Stats.Users = %d, attendu >= 2", data.Stats.Users)
	}

	// Création d'un créateur + pack de départ.
	creatorID := "00000000-0000-0000-0000-0000000000d3"
	err = svc.CreateUser(ctx, adminID, CreateUserParams{
		ID:          creatorID,
		Name:        "Nouvelle Plume",
		Email:       "plume@test.dev",
		Username:    "nouvelleplume",
		Role:        "creator",
		Subdomain:   "plume",
		LayoutStyle: "magazine",
		AccentColor: "#123456",
	})
	if err != nil {
		t.Fatalf("CreateUser: %v", err)
	}

	var count int
	if err := poolTest.QueryRow(ctx,
		`SELECT COUNT(*) FROM "Article" WHERE "authorId" = $1`, creatorID).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 3 {
		t.Fatalf("articles créés = %d, attendu 3", count)
	}
	if err := poolTest.QueryRow(ctx,
		`SELECT COUNT(*) FROM "NavigationItem" n JOIN "Publication" p ON p.id = n."publicationId"
		 JOIN "User" u ON u."publicationId" = p.id WHERE u.id = $1`, creatorID).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 4 {
		t.Fatalf("nav items = %d, attendu 4", count)
	}

	// Idempotence : re-créer ne duplique pas les articles.
	if err := svc.CreateUser(ctx, adminID, CreateUserParams{
		ID: creatorID, Name: "Nouvelle Plume", Email: "plume@test.dev",
		Username: "nouvelleplume", Role: "creator", Subdomain: "plume",
	}); err != nil {
		t.Fatalf("CreateUser (2e): %v", err)
	}
	if err := poolTest.QueryRow(ctx,
		`SELECT COUNT(*) FROM "Article" WHERE "authorId" = $1`, creatorID).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 3 {
		t.Fatalf("articles après re-création = %d, attendu 3", count)
	}
}

func TestDevtoolsSimulators(t *testing.T) {
	adminID, regularID := seedDevtools(t)
	svc := newTestService(t)
	ctx := context.Background()

	// Publication personnelle du user régulier (cible des simulateurs).
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Publication" (id, type, name, slug, "updatedAt")
		 VALUES ('pub_devtools', 'PERSONAL', 'Dev Pub', 'dev-pub', now())`); err != nil {
		t.Fatalf("publication: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`UPDATE "User" SET "publicationId" = 'pub_devtools' WHERE id = $1`, regularID); err != nil {
		t.Fatalf("link: %v", err)
	}

	// Abonné premium → crédit le propriétaire.
	if err := svc.SimulateSubscriber(ctx, adminID, SimulateSubscriberParams{
		Email: "reader@test.dev", PublicationID: "pub_devtools", IsPremium: true, LtvCents: 1000,
	}); err != nil {
		t.Fatalf("SimulateSubscriber: %v", err)
	}
	var balance int
	if err := poolTest.QueryRow(ctx,
		`SELECT "walletBalanceCents" FROM "User" WHERE id = $1`, regularID).Scan(&balance); err != nil {
		t.Fatal(err)
	}
	if balance != 1000 {
		t.Fatalf("balance owner = %d, attendu 1000", balance)
	}

	// Follow + Like (toggle).
	if err := svc.SimulateFollow(ctx, adminID, adminID, "pub_devtools"); err != nil {
		t.Fatalf("SimulateFollow: %v", err)
	}
	var follows int
	if err := poolTest.QueryRow(ctx,
		`SELECT COUNT(*) FROM "Follows" WHERE "readerId" = $1`, adminID).Scan(&follows); err != nil {
		t.Fatal(err)
	}
	if follows != 1 {
		t.Fatalf("follows = %d, attendu 1", follows)
	}

	postID := "post_devtools_1"
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Post" (id, content, "authorId", visibility, "isDraft", "createdAt", "updatedAt")
		 VALUES ($1, 'hello', $2, 'public', false, now(), now())`,
		postID, regularID); err != nil {
		t.Fatalf("post: %v", err)
	}
	liked, err := svc.SimulateLike(ctx, adminID, postID, adminID)
	if err != nil || !liked {
		t.Fatalf("SimulateLike on = %v, %v", liked, err)
	}
	liked, err = svc.SimulateLike(ctx, adminID, postID, adminID)
	if err != nil || liked {
		t.Fatalf("SimulateLike off = %v, %v", liked, err)
	}

	// AddFunds retourne le nouveau solde.
	balance, err = svc.AddFunds(ctx, adminID, regularID, 2500)
	if err != nil {
		t.Fatalf("AddFunds: %v", err)
	}
	if balance != 3500 {
		t.Fatalf("balance après add = %d, attendu 3500", balance)
	}

	// ResetOnboarding ciblé.
	if _, err := poolTest.Exec(ctx,
		`UPDATE "User" SET "hasCompletedOnboarding" = true WHERE id = $1`, regularID); err != nil {
		t.Fatal(err)
	}
	if err := svc.ResetOnboarding(ctx, adminID, regularID); err != nil {
		t.Fatalf("ResetOnboarding: %v", err)
	}
	var onboarding bool
	if err := poolTest.QueryRow(ctx,
		`SELECT "hasCompletedOnboarding" FROM "User" WHERE id = $1`, regularID).Scan(&onboarding); err != nil {
		t.Fatal(err)
	}
	if onboarding {
		t.Fatal("onboarding attendu false après reset")
	}

	// UserByEmail.
	u, err := svc.UserByEmail(ctx, adminID, "devtools.user@test.dev")
	if err != nil {
		t.Fatalf("UserByEmail: %v", err)
	}
	if u.ID != regularID {
		t.Fatalf("UserByEmail = %s, attendu %s", u.ID, regularID)
	}
}

func TestDevtoolsReset(t *testing.T) {
	adminID, _ := seedDevtools(t)
	svc := newTestService(t)
	ctx := context.Background()

	if err := svc.Reset(ctx, adminID); err != nil {
		t.Fatalf("Reset: %v", err)
	}
	var configs int
	if err := poolTest.QueryRow(ctx, `SELECT COUNT(*) FROM "SystemConfig"`).Scan(&configs); err != nil {
		t.Fatal(err)
	}
	if configs < 10 {
		t.Fatalf("configs après reset = %d, attendu >= 10", configs)
	}
	var users int
	if err := poolTest.QueryRow(ctx, `SELECT COUNT(*) FROM "User"`).Scan(&users); err != nil {
		t.Fatal(err)
	}
	if users != 0 {
		t.Fatalf("users après reset = %d, attendu 0", users)
	}
}
