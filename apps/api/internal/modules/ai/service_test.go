package ai

// IA de lecture (fiche Plus P1) : gates (compte, Plus, quotas), 503 sans
// provider, paywall respecté. Le provider réel n'est jamais appelé en test
// (fake) ; les cas DB sont skippés sans Docker.

import (
	"context"
	"errors"
	"log"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	goai "github.com/qoefi/api/internal/ai"
	"github.com/qoefi/api/internal/subscriptions"
	"github.com/qoefi/api/internal/testutil"
)

var poolTest *pgxpool.Pool

func TestMain(m *testing.M) {
	p, err := testutil.TryPool(context.Background())
	if err != nil {
		log.Printf("testcontainers indisponible, tests DB skippes: %v", err)
		poolTest = nil
	} else {
		poolTest = p
	}
	code := m.Run()
	if poolTest != nil {
		testutil.Cleanup()
	}
	os.Exit(code)
}

func requirePool(t *testing.T) {
	t.Helper()
	if poolTest == nil {
		t.Skip("DB indisponible (Docker/testcontainers requis)")
	}
}

// fakeProvider répond un texte fixe (jamais d'appel réseau en test).
type fakeProvider struct{ text string }

func (f fakeProvider) Generate(context.Context, goai.Request) (string, error) {
	return f.text, nil
}
func (fakeProvider) Name() string { return "fake-test" }

func TestCheckGate_NoAccount(t *testing.T) {
	// Seul cas testable sans base : userID vide (aucun accès pool — les
	// interfaces à pointeur nil ne sont pas détectées par `pool == nil`,
	// on ne s'appuie donc jamais dessus ; le reste exige Docker).
	svc := NewService(nil, fakeProvider{text: "x"})
	if _, err := svc.Summarize(context.Background(), "", "art-x", "fr"); err == nil {
		t.Fatal("sans compte : erreur attendue")
	}
	if _, err := svc.Explain(context.Background(), "", "un extrait", "fr"); err == nil {
		t.Fatal("sans compte : erreur attendue")
	}
	u := svc.UsageOf(context.Background(), "")
	if u.Limit != MonthlyCapPerUser {
		t.Fatalf("usage : %+v", u)
	}
}

func TestCheckGate_NoPlus(t *testing.T) {
	requirePool(t)
	svc := NewService(poolTest, fakeProvider{text: "x"})
	if _, err := svc.Summarize(context.Background(), "user-sans-plus", "art-x", "fr"); !errors.Is(err, ErrPlusRequired) {
		t.Fatalf("sans Plus : attendu ErrPlusRequired, obtenu %v", err)
	}
	if _, err := svc.Explain(context.Background(), "user-sans-plus", "un extrait", "fr"); !errors.Is(err, ErrPlusRequired) {
		t.Fatalf("sans Plus : attendu ErrPlusRequired, obtenu %v", err)
	}
}

func TestSummarize_FullCycle(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	now := time.Now()
	svc := NewService(poolTest, fakeProvider{text: "Résumé fixe."})

	var uid string
	if err := poolTest.QueryRow(ctx, `INSERT INTO "User" (id, email, username, name, role, "createdAt", "updatedAt") VALUES (gen_random_uuid(), 'ai@t.dev', 'ai', 'A', 'user', now(), now()) RETURNING id::text`).Scan(&uid); err != nil {
		t.Fatalf("user: %v", err)
	}
	pub := "ai_pub_cycle"
	poolTest.Exec(ctx, `INSERT INTO "Publication" (id, type, name, slug, "createdAt", "updatedAt") VALUES ($1, 'PERSONAL', 'A', 'a', now(), now())`, pub)
	art := "ai_art_cycle"
	poolTest.Exec(ctx, `INSERT INTO "Article" (id, title, slug, content, published, visibility, "readingTime", status, "publicationId", "authorId", "createdAt", "updatedAt") VALUES ($1, 'Titre', 'titre', '<p>Contenu à résumer, assez long pour compter.</p>', true, 'PUBLIC', 2, 'PUBLISHED', $2, $3::uuid, now(), now())`, art, pub, uid)
	cleanup := func() {
		poolTest.Exec(ctx, `DELETE FROM "CapabilityBudget" WHERE "scopeId" = $1`, uid)
		poolTest.Exec(ctx, `DELETE FROM "SubscriptionGrant" WHERE "subjectId" = $1`, uid)
		poolTest.Exec(ctx, `DELETE FROM "Article" WHERE id = $1`, art)
		poolTest.Exec(ctx, `DELETE FROM "Publication" WHERE id = $1`, pub)
		poolTest.Exec(ctx, `DELETE FROM "User" WHERE id = $1::uuid`, uid)
	}
	defer cleanup()

	if _, err := subscriptions.GrantPlan(ctx, poolTest, subscriptions.SubjectUser, uid,
		subscriptions.PlanPlus, now, nil, "staff-test", "test", now); err != nil {
		t.Fatalf("octroi : %v", err)
	}
	out, err := svc.Summarize(ctx, uid, art, "fr")
	if err != nil {
		t.Fatalf("résumé : %v", err)
	}
	if out.Summary != "Résumé fixe." || out.Usage.Remaining != MonthlyCapPerUser-1 {
		t.Fatalf("résumé + compteur (49) attendus, obtenu %+v", out)
	}
	// Quota épuisé (compteur poussé à 50 en SQL) : le 51e est refusé AVANT
	// tout appel provider (le fake compterait sinon — ici l'erreur suffit).
	poolTest.Exec(ctx, `UPDATE "CapabilityBudget" SET "consumed" = 50 WHERE "scopeType" = 'user_month' AND "scopeId" = $1`, uid)
	if _, err := svc.Explain(ctx, uid, "un extrait", "fr"); !errors.Is(err, ErrAIQuota) {
		t.Fatalf("quota épuisé : attendu ErrAIQuota, obtenu %v", err)
	}
	// UsageOf reflète l'épuisement sans consommer.
	if u := svc.UsageOf(ctx, uid); u.Remaining != 0 {
		t.Fatalf("usage épuisé : %+v", u)
	}
}
