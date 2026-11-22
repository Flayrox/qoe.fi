package home

// Tests du lot d'audit L29m : chaque cas reproduit un défaut constaté sur le
// code d'avant correction (worktree à HEAD) et doit y échouer.

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// F600 : `/v1/home/config` (public) servait **toutes** les clés SystemConfig.
func TestAuditL29M_ConfigExposesOnlyPublicKeys(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	seedHomeWidgets(t, ctx)
	seeds := map[string]string{
		"AUTH_METHODS":        `{"email":true}`,
		"hero_editor_title":   "Titre public",
		"OPS_SECRET_TOKEN":    "ne-doit-jamais-sortir",
		"INTERNAL_KILLSWITCH": "on",
	}
	for k, v := range seeds {
		if _, err := poolTest.Exec(ctx,
			`INSERT INTO "SystemConfig" (key, value, description, "updatedAt")
			 VALUES ($1, $2, 'test L29m', now())
			 ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, k, v); err != nil {
			t.Fatalf("config %s: %v", k, err)
		}
	}
	t.Cleanup(func() {
		_, _ = poolTest.Exec(context.Background(),
			`DELETE FROM "SystemConfig" WHERE key = ANY($1)`,
			[]string{"AUTH_METHODS", "hero_editor_title", "OPS_SECRET_TOKEN", "INTERNAL_KILLSWITCH"})
	})

	cfg, err := newTestService().GetSystemConfig(ctx)
	if err != nil {
		t.Fatalf("GetSystemConfig: %v", err)
	}
	if cfg["hero_editor_title"] != "Titre public" {
		t.Fatalf("clé publique absente: %v", cfg)
	}
	for _, forbidden := range []string{"OPS_SECRET_TOKEN", "INTERNAL_KILLSWITCH"} {
		if _, ok := cfg[forbidden]; ok {
			t.Fatalf("clé interne %q exposée publiquement: %v", forbidden, cfg)
		}
	}
}

// F601 : une panne de base rendait un 200 avec un onboarding vide.
func TestAuditL29M_OnboardingFailureIs500(t *testing.T) {
	seedHome(t)
	r := faultRouter(&faultPool{pooler: poolTest, failQuery: true})
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/v1/home/onboarding", nil))
	if w.Code != http.StatusInternalServerError {
		t.Fatalf("onboarding sur panne = %d (%s), attendu 500", w.Code, w.Body.String())
	}
}

// F602 : `limit` client non borné sur /trends.
func TestAuditL29M_TrendsAreBounded(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	seedHomeWidgets(t, ctx)
	for i := 0; i < 60; i++ {
		if _, err := poolTest.Exec(ctx,
			`INSERT INTO "Trend" (id, hashtag, count, "createdAt", "updatedAt")
			 VALUES ($1, $2, $3, now(), now())`,
			"trend_"+itoa(i), "tag"+itoa(i), 100-i); err != nil {
			t.Fatalf("trend %d: %v", i, err)
		}
	}
	trends, err := newTestService().GetTrends(ctx, 500)
	if err != nil {
		t.Fatalf("GetTrends: %v", err)
	}
	if len(trends) > 50 {
		t.Fatalf("%d tendances retournées, borne 50 non appliquée", len(trends))
	}
}

// F602 : promos non bornées (`limit` client arbitraire).
func TestAuditL29M_PromosAreBounded(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	seedHomeWidgets(t, ctx)
	for i := 0; i < 25; i++ {
		if _, err := poolTest.Exec(ctx,
			`INSERT INTO "PartnerPromo" (id, title, description, "ctaText", "ctaUrl", "imageUrl", "isActive", "createdAt", "updatedAt")
			 VALUES ($1, $2, 'd', 'Voir', 'https://x.fr', 'https://img.fr', true, now(), now())`,
			"promo_"+itoa(i), "Promo "+itoa(i)); err != nil {
			t.Fatalf("promo %d: %v", i, err)
		}
	}
	promos, err := newTestService().GetPromos(ctx, 500)
	if err != nil {
		t.Fatalf("GetPromos: %v", err)
	}
	if len(promos) > 20 {
		t.Fatalf("%d promos retournées, borne 20 non appliquée", len(promos))
	}
}

// F603 : CTA/f image d'une promo servis sans validation (`javascript:` sur la
// home publique).
func TestAuditL29M_PromosRejectUnsafeUrls(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	seedHomeWidgets(t, ctx)
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "PartnerPromo" (id, title, description, "ctaText", "ctaUrl", "imageUrl", "isActive", "createdAt", "updatedAt")
		 VALUES ('promo_unsafe', 'Promo', 'd', 'Voir', 'javascript:alert(1)', 'javascript:alert(2)', true, now(), now())`); err != nil {
		t.Fatalf("promo: %v", err)
	}
	promos, err := newTestService().GetPromos(ctx, 10)
	if err != nil {
		t.Fatalf("GetPromos: %v", err)
	}
	for _, p := range promos {
		if p.ID == "promo_unsafe" && (p.CtaUrl != nil || p.ImageUrl != nil) {
			t.Fatalf("URL non sûre servie: cta=%v image=%v", p.CtaUrl, p.ImageUrl)
		}
	}
}

// F604 : publication inconnue à l'inscription → 500 générique au lieu de 404.
func TestAuditL29M_SubscribeUnknownPublisherIs404(t *testing.T) {
	requirePool(t)
	seedHomeWidgets(t, context.Background())
	r := newHTTPRouter()
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/v1/home/subscribe",
		strings.NewReader(`{"email":"audit@test.dev","publisherId":"pub_absent"}`)))
	if w.Code != http.StatusNotFound {
		t.Fatalf("publication inconnue = %d (%s), attendu 404", w.Code, w.Body.String())
	}
}

// F605 : les créateurs déjà suivis étaient quand même suggérés (l'id
// utilisateur était comparé à une liste d'ids de publication).
func TestAuditL29M_SuggestionsExcludeFollowed(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	seedHomeWidgets(t, ctx)

	const otherPub = "pub_home_other"
	const otherUser = "00000000-0000-0000-0000-0000000000bb"
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Publisher" (id, type, name, slug, "isCertified", "createdAt", "updatedAt")
		 VALUES ($1, 'PERSONAL', 'Autre', 'autre-home', false, now(), now())`, otherPub); err != nil {
		t.Fatalf("publisher: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "User" (id, email, username, name, role, "publisherId", "createdAt", "updatedAt",
		                     embedding)
		 VALUES ($1, 'autre@test.dev', 'autrehome', 'Autre', 'creator', $2, now(), now(),
		         ('[' || array_to_string(array_fill(0.1::float8, ARRAY[512]), ',') || ']')::vector)`,
		otherUser, otherPub); err != nil {
		t.Fatalf("user autre: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Article" (id, title, slug, content, published, "isPremium", visibility,
		                        "readingTime", status, "publisherId", "authorId", "createdAt", "updatedAt")
		 VALUES ('art_home_other', 'Chez Autre', 'chez-autre', '<p>x</p>', true, false, 'PUBLIC',
		         4, 'PUBLISHED', $1, $2, now(), now())`, otherPub, otherUser); err != nil {
		t.Fatalf("article autre: %v", err)
	}

	const authorID = "00000000-0000-0000-0000-0000000000aa"
	if _, err := poolTest.Exec(ctx,
		`UPDATE "User" SET embedding = ('[' || array_to_string(array_fill(0.1::float8, ARRAY[512]), ',') || ']')::vector
		 WHERE id = $1`, authorID); err != nil {
		t.Fatalf("embedding auteur: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Follows" (id, "readerId", "publisherId", "createdAt")
		 VALUES ('follow_audit_l29m', $1, $2, now())`, authorID, otherPub); err != nil {
		t.Fatalf("follow: %v", err)
	}

	creators, err := newTestService().GetSuggestedCreators(ctx, authorID, 10)
	if err != nil {
		t.Fatalf("GetSuggestedCreators: %v", err)
	}
	for _, c := range creators {
		if c.ID == otherPub || c.ID == otherUser {
			t.Fatalf("créateur déjà suivi suggéré: %+v", c)
		}
	}
}
