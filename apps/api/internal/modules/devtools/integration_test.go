package devtools

import (
	"context"
	"log"
	"os"
	"strings"
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

// vector512Literal renvoie un littéral vector(512) pour les inserts de test.
func vector512Literal() string {
	parts := make([]string, 512)
	for i := range parts {
		parts[i] = "0.1"
	}
	return "[" + strings.Join(parts, ",") + "]"
}

// insertDiagPost insère une pensée avec ou sans vecteur (WITH embedding ou non,
// pour distinguer les pensées qui servent au profil de celles qui n'y comptent
// pas — lb contract du worker). created il y a 10 jours (fraîcheur contrôlée).
func insertDiagPost(t *testing.T, id, author string, withEmbedding bool) {
	t.Helper()
	if withEmbedding {
		if _, err := poolTest.Exec(context.Background(), `
			INSERT INTO "Post" (id, content, "authorId", embedding, "isDraft", "isHiddenByAuthor", "createdAt", "updatedAt")
			VALUES ($1, 'contenu', $2, $3::vector, false, false, now() - interval '10 days', now())`,
			id, author, vector512Literal()); err != nil {
			t.Fatalf("post(emb) %s: %v", id, err)
		}
		return
	}
	if _, err := poolTest.Exec(context.Background(), `
		INSERT INTO "Post" (id, content, "authorId", "isDraft", "isHiddenByAuthor", "createdAt", "updatedAt")
		VALUES ($1, 'contenu', $2, false, false, now() - interval '10 days', now())`,
		id, author); err != nil {
		t.Fatalf("post %s: %v", id, err)
	}
}

// insertDiagRead insère une ReadingSession (article art_diag, créé par le test).
func insertDiagRead(t *testing.T, sessID, user, status string) {
	t.Helper()
	if _, err := poolTest.Exec(context.Background(), `
		INSERT INTO "ReadingSession" (id, "articleId", "userId", source, status, "createdAt")
		VALUES ($1, 'art_diag', $2, 'feed', $3, now() - interval '2 days')`,
		sessID, user, status); err != nil {
		t.Fatalf("session %s: %v", sessID, err)
	}
}

func TestDevtoolsEmbeddingDiagnostic(t *testing.T) {
	adminID, _ := seedDevtools(t)
	ctx := context.Background()

	// Publication + article de base (FK des ReadingSessions).
	if _, err := poolTest.Exec(ctx, `
		INSERT INTO "Publication" (id, type, name, slug, "updatedAt")
		VALUES ('pub_diag', 'PERSONAL', 'Diag Pub', 'diag-pub', now())`); err != nil {
		t.Fatalf("publication: %v", err)
	}
	if _, err := poolTest.Exec(ctx, `
		INSERT INTO "Article" (id, title, content, slug, published, "publicationId", "authorId", "createdAt", "updatedAt")
		VALUES ('art_diag', 'Titre', '<p>corps</p>', 'diagnostic', true, 'pub_diag', $1, now(), now())`,
		adminID); err != nil {
		t.Fatalf("article: %v", err)
	}

	// Profils variés : riche (3 pensées), correct (1 pensée), faible (lectures
	// positives < 10, pas de pensée), cold start (aucun signal).
	users := map[string]string{
		"00000000-0000-0000-0000-0000000000f1": "rich",
		"00000000-0000-0000-0000-0000000000f2": "decent",
		"00000000-0000-0000-0000-0000000000f3": "weak",
		"00000000-0000-0000-0000-0000000000f4": "cold",
	}
	for id, uname := range users {
		if _, err := poolTest.Exec(ctx, `
			INSERT INTO "User" (id, email, username, name, role, "createdAt", "updatedAt")
			VALUES ($1, $2, $3, $3, 'user', now(), now())`,
			id, uname+"@t.dev", uname); err != nil {
			t.Fatalf("user: %v", err)
		}

	}

	// Embeddings utilisateur posés pour les profils non froids (le diagnostic
	// classe le degré de personnalisation, pas la dérivation du vecteur).
	for _, id := range []string{"00000000-0000-0000-0000-0000000000f1", "00000000-0000-0000-0000-0000000000f2", "00000000-0000-0000-0000-0000000000f3"} {
		if _, err := poolTest.Exec(ctx, `UPDATE "User" SET embedding = $2::vector WHERE id = $1`,
			id, vector512Literal()); err != nil {
			t.Fatalf("user embed %s: %v", id, err)
		}
	}

	// rich : 3 pensées. decent : 1 pensée. weak : 0 pensée, 5 lectures SKIM.
	insertDiagPost(t, "post_f1_1", "00000000-0000-0000-0000-0000000000f1", true)
	insertDiagPost(t, "post_f1_2", "00000000-0000-0000-0000-0000000000f1", true)
	insertDiagPost(t, "post_f1_3", "00000000-0000-0000-0000-0000000000f1", true)
	insertDiagPost(t, "post_f2_1", "00000000-0000-0000-0000-0000000000f2", true)
	for i := 0; i < 5; i++ {
		insertDiagRead(t, "sess_f3_"+string(rune('a'+i)), "00000000-0000-0000-0000-0000000000f3", "SKIM")
	}

	diag, err := NewService(poolTest, Options{DevOnly: true}).EmbeddingDiagnostic(ctx, adminID)
	if err != nil {
		t.Fatalf("EmbeddingDiagnostic: %v", err)
	}

	// synthèse (seedDevtools: admin + regular froids, + f4 froid → 3 cold).
	if diag.Total != 6 || diag.Rich != 1 || diag.Decent != 1 || diag.Weak != 1 || diag.ColdStart != 3 {
		t.Fatalf("synthèse = total(%d) rich(%d) decent(%d) weak(%d) cold(%d), attendu 6/1/1/1/3",
			diag.Total, diag.Rich, diag.Decent, diag.Weak, diag.ColdStart)
	}

	// Tri : le profil le plus riche (3 pensées) doit être en tête ; chaque ligne
	// porte ses signaux (HasEmbedding + Thoughts + PositiveReads + tier).
	first := diag.Rows[0]
	if first.ID != "00000000-0000-0000-0000-0000000000f1" || !first.HasEmbedding || first.Thoughts != 3 || first.Tier != TierRich {
		t.Fatalf("première ligne = %+v, attendu rich (3 pensées, tier riche)", first)
	}
	if first.Quality <= 0 || first.FreshnessDays == nil || *first.FreshnessDays < 0 {
		t.Fatalf("rich: quality=%v freshness=%v, attendu score>0 et fraîcheur connue", first.Quality, first.FreshnessDays)
	}

	// RBAC : un non-superadmin est refusé.
	if _, err := NewService(poolTest).EmbeddingDiagnostic(ctx, "00000000-0000-0000-0000-0000000000f1"); err == nil {
		t.Fatal("EmbeddingDiagnostic non-superadmin attendu errForbidden")
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
