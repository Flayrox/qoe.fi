package analytics

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	db "github.com/qoefi/api/internal/database"
	"github.com/qoefi/api/internal/testutil"
)

// selectivePool délègue au pool réel et n'échoue que sur les requêtes dont le
// SQL contient marker : permet de prouver qu'une lecture précise remonte son
// erreur au lieu d'être remplacée par des zéros.
type selectivePool struct {
	pooler
	marker string
	err    error
}

func (p *selectivePool) Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error) {
	if p.marker == "" || strings.Contains(sql, p.marker) {
		return nil, p.err
	}
	return p.pooler.Query(ctx, sql, args...)
}

func (p *selectivePool) QueryRow(ctx context.Context, sql string, args ...any) pgx.Row {
	if p.marker == "" || strings.Contains(sql, p.marker) {
		return errorRow{err: p.err}
	}
	return p.pooler.QueryRow(ctx, sql, args...)
}

// seedMediaWorkspace prépare un média actif avec un article publié, un
// brouillon, un article programmé et une lecture récente.
func seedMediaWorkspace(t *testing.T, ctx context.Context) (pubID, ownerID string) {
	t.Helper()
	fx, err := testutil.SeedMedia(ctx, poolTest)
	if err != nil {
		t.Fatalf("seed media: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Article" (id, title, slug, content, published, "isPremium", visibility,
		                        "readingTime", status, "scheduledAt", "publisherId", "authorId", "createdAt", "updatedAt")
		 VALUES ('art_media_01', 'Enquête média', 'enquete-media', '<p>Contenu</p>', true, false, 'PUBLIC',
		         7, 'PUBLISHED', NULL, $1, $2, now() - interval '2 hours', now()),
		        ('art_media_02', 'Brouillon média', 'brouillon-media', '<p>Brouillon</p>', false, false, 'PUBLIC',
		         3, 'DRAFT', NULL, $1, $2, now(), now()),
		        ('art_media_03', 'Programmé média', 'programme-media', '<p>Programmé</p>', false, false, 'PUBLIC',
		         4, 'SCHEDULED', now() + interval '1 day', $1, $2, now(), now())`,
		fx.PublisherID, fx.OwnerID); err != nil {
		t.Fatalf("articles média: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "ReadingSession" (id, "articleId", "userId", source, status, "createdAt")
		 VALUES (gen_random_uuid()::text, 'art_media_01', $1, 'feed', 'completed', now())`,
		fx.OwnerID); err != nil {
		t.Fatalf("lecture média: %v", err)
	}
	return fx.PublisherID, fx.OwnerID
}

// TestAuditL29U_MediaDashboardServesData : le dashboard d'un média doit rendre
// ses articles récents et ses lectures. À HEAD, la requête des articles récents
// projette $2 alors que l'appel ne passe qu'un argument, et les deux requêtes
// de lectures passent deux arguments à un SQL qui n'en référence qu'un : pgx
// rejette les trois et le service avale l'erreur.
func TestAuditL29U_MediaDashboardServesData(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	pubID, ownerID := seedMediaWorkspace(t, ctx)

	out, err := newTestService().DashboardOverview(ctx, ownerID, pubID, "MEDIA")
	if err != nil {
		t.Fatalf("DashboardOverview(MEDIA): %v", err)
	}
	if len(out.RecentArticles) == 0 {
		t.Fatalf("recentArticles = 0, attendu l'article publié du média (requête désalignée)")
	}
	if out.Pageviews30d != 1 {
		t.Fatalf("pageviews30d = %d, attendu 1", out.Pageviews30d)
	}
	if out.Visitors30d != 1 {
		t.Fatalf("visitors30d = %d, attendu 1", out.Visitors30d)
	}
	if len(out.DraftArticles) != 1 || len(out.ScheduledArticles) != 1 {
		t.Fatalf("brouillons = %d / programmés = %d, attendu 1/1",
			len(out.DraftArticles), len(out.ScheduledArticles))
	}
	if out.LatestPublishedArticle == nil {
		t.Fatal("latestPublishedArticle = nil, attendu l'article publié")
	}
}

// TestAuditL29U_ScheduledArticleIsNotADraft : un article programmé possède sa
// propre liste ; le compter aussi comme brouillon doublait la carte
// « Brouillons » et laissait croire qu'il n'était pas prêt à partir.
func TestAuditL29U_ScheduledArticleIsNotADraft(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	pubID, ownerID := seedMediaWorkspace(t, ctx)

	out, err := newTestService().DashboardOverview(ctx, ownerID, pubID, "MEDIA")
	if err != nil {
		t.Fatalf("DashboardOverview(MEDIA): %v", err)
	}
	titles := make([]string, 0, len(out.DraftArticles))
	for _, d := range out.DraftArticles {
		titles = append(titles, d.Title)
	}
	if len(out.DraftArticles) != 1 {
		t.Fatalf("brouillons = %d %v, attendu 1 (l'article programmé a sa propre liste)",
			len(out.DraftArticles), titles)
	}
	if len(out.ScheduledArticles) != 1 {
		t.Fatalf("programmés = %d, attendu 1", len(out.ScheduledArticles))
	}
}

// TestAuditL29U_DashboardPropagatesDatabaseFailure : une panne de lecture ne
// doit jamais produire un dashboard à zéro en 200.
func TestAuditL29U_DashboardPropagatesDatabaseFailure(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	seedProductMetrics(t, ctx)

	svc := &Service{
		pool: &selectivePool{pooler: poolTest, marker: `FROM "Subscriber"`, err: errBoom},
		q:    db.New(poolTest),
	}
	if _, err := svc.DashboardOverview(ctx, analyticsOwner, analyticsPub, "PERSONAL"); err == nil {
		t.Fatal("panne DB du dashboard avalée : 200 avec des métriques à zéro")
	}
}

// TestAuditL29U_AudienceInsightsPropagatesFollowerFailure : la liste des
// abonnés en panne ne doit pas se déguiser en audience vide.
func TestAuditL29U_AudienceInsightsPropagatesFollowerFailure(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	seedProductMetrics(t, ctx)

	svc := &Service{
		pool: &selectivePool{pooler: poolTest, marker: `FROM "Follows"`, err: errBoom},
		q:    db.New(poolTest),
	}
	if _, err := svc.GetAudienceInsights(ctx, analyticsOwner, analyticsPub); err == nil {
		t.Fatal("panne de lecture des abonnés avalée : insights renvoyés sans audience")
	}
}

// TestAuditL29U_ArticleStatsPropagatesInteractionFailure : les compteurs
// d'interaction (likes, signets, surlignages…) sont lus sans contrôle d'erreur
// et retombent à zéro au moindre incident.
func TestAuditL29U_ArticleStatsPropagatesInteractionFailure(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	seedReadingData(t, ctx)

	svc := &Service{
		pool: &selectivePool{pooler: poolTest, marker: `"ContentFeedback"`, err: errBoom},
		q:    db.New(poolTest),
	}
	if _, err := svc.GetArticleReadingStats(ctx, analyticsOwner, "art_an_01", nil); err == nil {
		t.Fatal("panne du comptage des interactions avalée : statistiques d'article tronquées en 200")
	}
}

// TestAuditL29U_AccessDatabaseFailureIsNotForbidden : une panne de la matrice
// d'accès est une panne serveur, pas un refus de l'utilisateur.
func TestAuditL29U_AccessDatabaseFailureIsNotForbidden(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	seedProductMetrics(t, ctx)

	fq := &faultQ{Queries: db.New(poolTest), fail: map[string]error{
		"GetUserPersonalPublisher": errBoom,
	}}
	svc := &Service{pool: poolTest, q: fq}
	_, err := svc.Financial(ctx, analyticsOwner, analyticsPub)
	if err == nil {
		t.Fatal("panne DB de canAccess avalée")
	}
	if errors.Is(err, errForbidden) {
		t.Fatalf("panne DB rendue en errForbidden (403) : %v", err)
	}

	h := NewHandler(svc)
	r := chi.NewRouter()
	h.Register(r)
	w := get(t, r, "/v1/analytics/financial?publisherId="+analyticsPub, analyticsOwner)
	if w.Code != http.StatusInternalServerError {
		t.Fatalf("panne DB de canAccess → %d (%s), attendu 500", w.Code, w.Body.String())
	}
}

// TestAuditL29U_UmamiDatabaseFailureIsNotZero : la résolution du site Umami en
// panne doit remonter en 500, pas servir des zéros.
func TestAuditL29U_UmamiDatabaseFailureIsNotZero(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	seedProductMetrics(t, ctx)

	fq := &faultQ{Queries: db.New(poolTest), fail: map[string]error{
		"GetPublisherUmamiWebsiteId": errBoom,
	}}
	h := NewHandler(&Service{pool: poolTest, q: fq})
	r := chi.NewRouter()
	h.Register(r)

	w := get(t, r, "/v1/analytics/umami/returning?publisherId="+analyticsPub, analyticsOwner)
	if w.Code != http.StatusInternalServerError {
		t.Fatalf("panne DB du site Umami → %d (%s), attendu 500", w.Code, w.Body.String())
	}
}

// TestAuditL29U_UmamiMissingClientIsServiceUnavailable : un site Umami
// provisionné sans base Umami configurée ne peut pas répondre « zéro visite ».
func TestAuditL29U_UmamiMissingClientIsServiceUnavailable(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	seedProductMetrics(t, ctx)
	if _, err := poolTest.Exec(ctx,
		`UPDATE "Publisher" SET "umamiWebsiteId" = 'site-umami-test' WHERE id = $1`, analyticsPub); err != nil {
		t.Fatalf("set umamiWebsiteId: %v", err)
	}

	h := NewHandler(&Service{pool: poolTest, q: db.New(poolTest)})
	r := chi.NewRouter()
	h.Register(r)

	w := get(t, r, "/v1/analytics/umami/hours?publisherId="+analyticsPub, analyticsOwner)
	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("site Umami sans pool → %d (%s), attendu 503", w.Code, w.Body.String())
	}
}

// TestAuditL29U_DeclaredCountsReaders : « declared » est le nombre de lecteurs
// ayant renseigné au moins un champ (contrat apps/studio/actions.ts), pas le
// nombre de valeurs distinctes d'une colonne.
func TestAuditL29U_DeclaredCountsReaders(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	seedProductMetrics(t, ctx)

	readers := []string{
		"00000000-0000-0000-0000-0000000000b1",
		"00000000-0000-0000-0000-0000000000b2",
		"00000000-0000-0000-0000-0000000000b3",
		"00000000-0000-0000-0000-0000000000b4",
	}
	for i, id := range readers {
		if _, err := poolTest.Exec(ctx,
			`INSERT INTO "User" (id, email, username, name, role, gender, "ageRange", "countryCode", "languageCode", "createdAt", "updatedAt")
			 VALUES ($1, $2, $3, 'Lecteur', 'user', 'FEMALE', 'AGE_25_34', 'FR', 'fr', now(), now())`,
			id, id+"@test.dev", "lecteur"+string(rune('a'+i)),
		); err != nil {
			t.Fatalf("lecteur %d: %v", i, err)
		}
		if _, err := poolTest.Exec(ctx,
			`INSERT INTO "Follows" (id, "readerId", "publisherId", "createdAt")
			 VALUES (gen_random_uuid()::text, $1, $2, now())`, id, analyticsPub); err != nil {
			t.Fatalf("follow %d: %v", i, err)
		}
	}

	insights, err := newTestService().GetAudienceInsights(ctx, analyticsOwner, analyticsPub)
	if err != nil {
		t.Fatalf("GetAudienceInsights: %v", err)
	}
	if insights.Creator.Declared != len(readers) {
		t.Fatalf("creator.declared = %d, attendu %d (lecteurs ayant déclaré)",
			insights.Creator.Declared, len(readers))
	}
}

// TestAuditL29U_UnknownWorkspaceTypeRejected : un workspaceType inconnu ne doit
// pas être interprété en silence comme PERSONAL.
func TestAuditL29U_UnknownWorkspaceTypeRejected(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	seedProductMetrics(t, ctx)

	r := chi.NewRouter()
	NewHandler(newTestService()).Register(r)

	w := get(t, r, "/v1/analytics/dashboard?publisherId="+analyticsPub+"&workspaceType=MEDIA_TYPO", analyticsOwner)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("workspaceType inconnu → %d (%s), attendu 400", w.Code, w.Body.String())
	}
}

// TestAuditL29U_UnreadableBoundsRejected : une borne illisible ne doit pas
// devenir silencieusement « 30 derniers jours » (ou 5 résultats).
func TestAuditL29U_UnreadableBoundsRejected(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	seedProductMetrics(t, ctx)

	r := chi.NewRouter()
	NewHandler(newTestService()).Register(r)

	for _, path := range []string{
		"/v1/analytics/creator?publisherId=" + analyticsPub + "&period=bogus",
		"/v1/analytics/reading-sessions?articleId=art_an_01&startAt=abc",
		"/v1/analytics/umami/returning?publisherId=" + analyticsPub + "&startAt=abc",
		"/v1/analytics/top-content?publisherId=" + analyticsPub + "&limit=abc",
	} {
		w := get(t, r, path, analyticsOwner)
		if w.Code != http.StatusBadRequest {
			t.Fatalf("%s → %d (%s), attendu 400", path, w.Code, w.Body.String())
		}
	}
}

// TestAuditL29U_ZeroServiceFailsClosed : un service sans pool doit renvoyer une
// erreur, jamais paniquer.
func TestAuditL29U_ZeroServiceFailsClosed(t *testing.T) {
	defer func() {
		if rec := recover(); rec != nil {
			t.Fatalf("service sans pool : panique %v au lieu d'une erreur", rec)
		}
	}()
	if _, err := (&Service{}).ProductMetrics(context.Background(), analyticsOwner, analyticsPub); err == nil {
		t.Fatal("service sans pool : err = nil")
	}
}
