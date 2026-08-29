package seed

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestPickAgeRangeAndTopic(t *testing.T) {
	rng := newPRNG(11)
	// Pondération valide → toujours une tranche connue.
	valid := []float64{0.03, 0.25, 0.3, 0.2, 0.12, 0.06, 0.02, 0.02}
	for i := 0; i < 30; i++ {
		got := pickAgeRange(rng, valid)
		found := false
		for _, r := range topAgeRanges {
			if r == got {
				found = true
			}
		}
		if !found {
			t.Fatalf("pickAgeRange = %q hors topAgeRanges", got)
		}
	}
	// Pondération de mauvaise taille → fallback.
	if got := pickAgeRange(rng, []float64{1, 2}); got == "" {
		t.Fatal("pickAgeRange fallback vide")
	}

	// topicForTags.
	if got := topicForTags(nil); got != nil {
		t.Fatal("topicForTags(nil) attendu nil")
	}
	if got := topicForTags([]string{"inconnu-tag"}); got != nil {
		t.Fatal("topicForTags(sans match) attendu nil")
	}
	if got := topicForTags([]string{"foot"}); got == nil {
		t.Fatal("topicForTags(foot) attendu un topic")
	}
}

func TestUnaccent(t *testing.T) {
	cases := map[rune]rune{
		'é': 'e', 'è': 'e', 'ê': 'e', 'à': 'a', 'ç': 'c', 'œ': 'o',
		'É': 'e', 'ñ': 'n', 'ÿ': 'y', 'x': 'x', 'Z': 'Z',
	}
	for in, want := range cases {
		if got := unaccent(in); got != want {
			t.Fatalf("unaccent(%c) = %c, attendu %c", in, got, want)
		}
	}
}

func TestEmbedTop(t *testing.T) {
	ctx := context.Background()

	// Serveur d'inférence factice : renvoie un vecteur 512d.
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		vec := make([]float64, 512)
		for i := range vec {
			vec[i] = 0.05
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"data": []any{map[string]any{"embedding": vec}},
		})
	}))
	defer srv.Close()

	res, err := RunTop(ctx, poolTest, TopOptions{
		Users: 4, Articles: 2, Posts: 4, ReadingSessions: 0,
		CreatorsRatio: 0.5, PremiumRatio: 0.1,
	})
	if err != nil {
		t.Fatalf("RunTop: %v", err)
	}

	articles, users, err := EmbedTop(ctx, poolTest, res, srv.URL)
	if err != nil {
		t.Fatalf("EmbedTop: %v", err)
	}
	// EmbedTop est base-wide (embedding IS NULL) : il couvre res.* + les
	// articles canoniques et le cast « monde vivant » ajoutés par RunTop/
	// RunWorld en dehors de res.Articles/res.Users.
	if articles < len(res.Articles) {
		t.Fatalf("articles embeddés = %d, attendu >= %d (res + canoniques + monde vivant)", articles, len(res.Articles))
	}
	// Chaque article du top a un vecteur en base.
	for _, a := range res.Articles {
		if n := count(t, `SELECT COUNT(*) FROM "Article" WHERE "embedding" IS NOT NULL AND id = $1`,
			a.ID); n != 1 {
			t.Fatalf("article %s sans embedding après EmbedTop", a.ID)
		}
	}
	// Contrat users : un user a un vecteur ssi il a du contenu — pensées
	// publiées OU lectures à signal positif (ReadingSessions: 0 retombe sur
	// le défaut 5700 dans defaults()). Plus de repli bio : un compte sans
	// aucune activité reste en cold start, comme en prod.
	withSignal := count(t, `SELECT COUNT(*) FROM "User" u WHERE (
		EXISTS (SELECT 1 FROM "Post" p WHERE p."authorId" = u.id
		  AND p."embedding" IS NOT NULL AND p."deletedAt" IS NULL
		  AND p."isDraft" = false AND p."isHiddenByAuthor" = false)
		OR EXISTS (SELECT 1 FROM "ReadingSession" rs WHERE rs."userId" = u.id
		  AND rs.status IN ('READ_COMPLETE','READ_PARTIAL','SKIM'))
	)`)
	if users != withSignal {
		t.Fatalf("users embeddés = %d, attendu %d (comptes avec pensées ou lectures)", users, withSignal)
	}
	for _, u := range res.Users {
		posts := count(t, `SELECT COUNT(*) FROM "Post" WHERE "authorId" = $1 AND "deletedAt" IS NULL AND "isDraft" = false`, u.ID)
		reads := count(t, `SELECT COUNT(*) FROM "ReadingSession" WHERE "userId" = $1 AND status IN ('READ_COMPLETE','READ_PARTIAL','SKIM')`, u.ID)
		has := count(t, `SELECT COUNT(*) FROM "User" WHERE "embedding" IS NOT NULL AND id = $1`, u.ID)
		if (posts > 0 || reads > 0) != (has == 1) {
			t.Fatalf("user %s : posts=%d reads=%d embedding=%d — attendu vecteur ssi (pensées ou lecture)", u.ID, posts, reads, has)
		}
	}

	// URL vide → skip silencieux.
	a2, u2, err := EmbedTop(ctx, poolTest, res, "")
	if err != nil || a2 != 0 || u2 != 0 {
		t.Fatalf("EmbedTop(sans url) = %d/%d/%v, attendu 0/0/nil", a2, u2, err)
	}

	// Serveur en erreur → best-effort (0 succès, pas d'erreur fatale).
	bad := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "down", http.StatusBadGateway)
	}))
	defer bad.Close()
	a3, u3, err := EmbedTop(ctx, poolTest, res, bad.URL)
	if err != nil {
		t.Fatalf("EmbedTop(bad server) = %v", err)
	}
	_ = fmt.Sprint(a3, u3)
}

// TestEmbedTop_UsersFromReading couvre la dérivation des users par la
// lecture : un compte sans pensée mais avec des sessions à signal positif
// (READ_PARTIAL/COMPLETE/SKIM) reçoit un vecteur issu de ce qu'il lit ; un
// compte 100% bounces reste en cold start (comme l'EMA prod).
func TestEmbedTop_UsersFromReading(t *testing.T) {
	ctx := context.Background()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		vec := make([]float64, 512)
		for i := range vec {
			vec[i] = 0.05
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"data": []any{map[string]any{"embedding": vec}},
		})
	}))
	defer srv.Close()

	res, err := RunTop(ctx, poolTest, TopOptions{
		Users: 10, Articles: 4, Posts: 2, ReadingSessions: 60,
		CreatorsRatio: 0.5, PremiumRatio: 0.1,
	})
	if err != nil {
		t.Fatalf("RunTop: %v", err)
	}
	if _, _, err := EmbedTop(ctx, poolTest, res, srv.URL); err != nil {
		t.Fatalf("EmbedTop: %v", err)
	}

	// Contrat : vecteur ⟺ (≥1 pensée) OU (≥1 session à signal positif).
	checked := 0
	for _, u := range res.Users {
		posts := count(t, `SELECT COUNT(*) FROM "Post" WHERE "authorId" = $1 AND "deletedAt" IS NULL AND "isDraft" = false`, u.ID)
		reads := count(t, `SELECT COUNT(*) FROM "ReadingSession" WHERE "userId" = $1 AND status IN ('READ_COMPLETE','READ_PARTIAL','SKIM')`, u.ID)
		has := count(t, `SELECT COUNT(*) FROM "User" WHERE "embedding" IS NOT NULL AND id = $1`, u.ID)
		want := posts > 0 || reads > 0
		if (has == 1) != want {
			t.Fatalf("user %s : posts=%d reads=%d has=%d — attendu vecteur ssi (pensées ou lecture)", u.ID, posts, reads, has)
		}
		checked++
	}
	if checked == 0 {
		t.Fatal("aucun user vérifié")
	}
}

func TestVectorLiteralInDB(t *testing.T) {
	// Le littéral doit être accepté par la colonne vector(512).
	lit := vectorLiteral(make([]float64, 512))
	if !strings.HasPrefix(lit, "[") || !strings.HasSuffix(lit, "]") {
		t.Fatalf("littéral mal formé")
	}
}

// TestRunTopUmami génère 30 jours de sessions/events sur le schéma Umami
// minimal créé dans le pool de test.
func TestRunTopUmami(t *testing.T) {
	ctx := context.Background()
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
		`INSERT INTO website (website_id, domain, deleted_at) VALUES ($1, 'qoe-fi-test.example', NULL)`,
		"11111111-1111-1111-1111-111111111111"); err != nil {
		t.Fatalf("website: %v", err)
	}

	res := &TopResult{
		Articles: []TopArticle{{Slug: "article-un"}, {Slug: "article-deux"}},
		Users:    []TopUser{{Username: "alice"}, {Username: "bob"}},
	}
	if err := RunTopUmami(ctx, poolTest, res, TopOptions{}); err != nil {
		t.Fatalf("RunTopUmami: %v", err)
	}
	if n := count(t, `SELECT COUNT(*) FROM session`); n == 0 {
		t.Fatal("aucune session générée")
	}
	if n := count(t, `SELECT COUNT(*) FROM website_event`); n == 0 {
		t.Fatal("aucun event généré")
	}

	// Sans website → erreur explicite.
	if _, err := poolTest.Exec(ctx, `DELETE FROM website`); err != nil {
		t.Fatal(err)
	}
	if err := RunTopUmami(ctx, poolTest, res, TopOptions{}); err == nil {
		t.Fatal("RunTopUmami sans website attendu erreur")
	}
}
