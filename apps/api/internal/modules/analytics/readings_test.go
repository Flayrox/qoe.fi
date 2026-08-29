package analytics

import (
	"context"
	"testing"
	"time"

	db "github.com/qoefi/api/internal/database"
)

// seedReadingData : sessions de lecture variées (sources, hostnames, referrers,
// récentes et anciennes) + users avec démographie déclarée.
func seedReadingData(t *testing.T, ctx context.Context) {
	t.Helper()
	seedProductMetrics(t, ctx)

	// Users avec démographie (lecteurs de la publication).
	for _, u := range []struct {
		id, gender, age, country, lang string
	}{
		{"00000000-0000-0000-0000-0000000000aa", "FEMALE", "AGE_25_34", "FR", "fr"},
		{"00000000-0000-0000-0000-0000000000ab", "MALE", "AGE_25_34", "FR", "fr"},
		{"00000000-0000-0000-0000-0000000000ac", "FEMALE", "AGE_35_44", "BE", "fr"},
		{"00000000-0000-0000-0000-0000000000ad", "OTHER", "AGE_18_24", "CA", "en"},
	} {
		username := "r" + u.id[len(u.id)-4:]
		if _, err := poolTest.Exec(ctx,
			`INSERT INTO "User" (id, email, username, name, role, gender, "ageRange", "countryCode", "languageCode", "createdAt", "updatedAt")
			 VALUES ($1, $2, $3, $4, 'user', $5, $6, $7, $8, now(), now())`,
			u.id, u.id+"@test.dev", username, "Reader", u.gender, u.age, u.country, u.lang,
		); err != nil {
			t.Fatalf("user %s: %v", u.id, err)
		}
	}

	sessions := []struct {
		id, source, host, referrer string
		daysAgo                    int
	}{
		{"rs_1", "feed", "qoe.fi", "simone", 1},
		{"rs_2", "feed", "qoe.fi", "simone", 2},
		{"rs_3", "search", "google.com", "pierre", 3},
		{"rs_4", "direct", "", "", 4},
		{"rs_old", "feed", "qoe.fi", "", 40}, // hors période 30j
	}
	for _, s := range sessions {
		if _, err := poolTest.Exec(ctx,
			`INSERT INTO "ReadingSession" (id, "articleId", "userId", source, status, hostname, "referrerUsername", "createdAt")
			 VALUES ($1, 'art_an_01', $2, $3, 'completed', NULLIF($4,''), NULLIF($5,''), now() - $6::int * interval '1 day')`,
			s.id, "00000000-0000-0000-0000-0000000000aa", s.source, s.host, s.referrer, s.daysAgo,
		); err != nil {
			t.Fatalf("session %s: %v", s.id, err)
		}
	}
}

func TestArticleReadingStats_Full(t *testing.T) {
	ctx := context.Background()
	seedReadingData(t, ctx)
	svc := newTestService()
	since := time.Now().Add(-30 * 24 * time.Hour)

	stats, err := svc.GetArticleReadingStats(ctx, analyticsOwner, "art_an_01", &since)
	if err != nil {
		t.Fatalf("GetArticleReadingStats: %v", err)
	}
	// 4 sessions dans la période (rs_old hors 30j exclue).
	if stats.TotalViews != 4 {
		t.Fatalf("totalViews = %d, attendu 4", stats.TotalViews)
	}
	if len(stats.Timeseries) == 0 {
		t.Fatal("timeseries vide")
	}
	// Par hostname : qoe.fi (2) + google.com (1) ; direct n'a pas de hostname.
	if len(stats.ByHostname) != 2 {
		t.Fatalf("byHostname = %+v, attendu 2 buckets", stats.ByHostname)
	}
	// Par source : feed (2), search (1), direct (1).
	if len(stats.BySource) != 3 {
		t.Fatalf("bySource = %+v, attendu 3 buckets", stats.BySource)
	}

	// Sans since → même total (la plus ancienne est aussi dans l'absolu).
	stats2, err := svc.GetArticleReadingStats(ctx, analyticsOwner, "art_an_01", nil)
	if err != nil {
		t.Fatalf("GetArticleReadingStats(nil since): %v", err)
	}
	if stats2.TotalViews != 5 {
		t.Fatalf("totalViews(nil) = %d, attendu 5", stats2.TotalViews)
	}

	// Referrer groupé avec @.
	byRef, err := svc.GroupByReferrerUsername(ctx, []string{"art_an_01"}, &since)
	if err != nil {
		t.Fatalf("GroupByReferrerUsername: %v", err)
	}
	if len(byRef) != 2 || byRef[0].Key != "@simone" || byRef[0].Count != 2 {
		t.Fatalf("byReferrer = %+v, attendu @simone=2 en tête", byRef)
	}
}

func TestCreatorReadingStats_And_Provenance(t *testing.T) {
	ctx := context.Background()
	seedReadingData(t, ctx)
	svc := newTestService()
	since := time.Now().Add(-30 * 24 * time.Hour)

	cs, err := svc.GetCreatorReadingStats(ctx, analyticsOwner, analyticsPub, &since)
	if err != nil {
		t.Fatalf("GetCreatorReadingStats: %v", err)
	}
	if cs.TotalViews != 4 {
		t.Fatalf("creator totalViews = %d, attendu 4", cs.TotalViews)
	}

	prov, err := svc.GetProvenance(ctx, analyticsOwner, analyticsPub, &since)
	if err != nil {
		t.Fatalf("GetProvenance: %v", err)
	}
	if len(prov.BySource) == 0 || len(prov.ByHostname) == 0 {
		t.Fatalf("provenance = %+v, attendu bySource+byHostname non vides", prov)
	}
}

func TestAudienceInsights_Demographics(t *testing.T) {
	ctx := context.Background()
	seedReadingData(t, ctx)
	svc := newTestService()

	insights, err := svc.GetAudienceInsights(ctx, analyticsOwner, analyticsPub)
	if err != nil {
		t.Fatalf("GetAudienceInsights: %v", err)
	}
	if len(insights.Platform.Gender) == 0 || len(insights.Platform.AgeRange) == 0 {
		t.Fatalf("démographie plateforme vide : %+v", insights.Platform)
	}
	if len(insights.Platform.Countries) == 0 || len(insights.Platform.Languages) == 0 {
		t.Fatalf("pays/langues vides : %+v", insights.Platform)
	}
	// declared = nombre de valeurs distinctes de la colonne la plus riche :
	// gender → FEMALE/MALE/OTHER = 3 buckets ; pays FR/BE/CA = 3.
	if insights.Platform.Declared < 3 {
		t.Fatalf("declared = %d, attendu ≥ 3", insights.Platform.Declared)
	}

	// Article inexistant → pas de publication résolue → errForbidden.
	if _, err := svc.GetArticleReadingStats(ctx, analyticsOwner, "art_inexistant", nil); err != errForbidden {
		t.Fatalf("GetArticleReadingStats(inexistant) = %v, attendu errForbidden", err)
	}

	// Colonne invalide → erreur.
	if _, err := svc.groupUsersByColumn(ctx, "hack", nil); err == nil {
		t.Fatal("colonne invalide : err = nil")
	}
	// Pool en faute → erreur.
	fp := &faultPool{pooler: poolTest, failQuery: true}
	svc2 := &Service{pool: fp, q: db.New(poolTest)}
	if _, err := svc2.groupUsersByColumn(ctx, "gender", nil); err == nil {
		t.Fatal("groupUsersByColumn pool faute : err = nil")
	}
}
