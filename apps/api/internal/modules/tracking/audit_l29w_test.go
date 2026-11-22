package tracking

import (
	"context"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// unreachablePool pointe sur un port fermé : aucune connexion possible, sans
// dépendre de Docker.
func unreachablePool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	pool, err := pgxpool.New(ctx, "postgres://qoe:qoe@127.0.0.1:1/qoe?connect_timeout=1")
	if err != nil {
		t.Fatalf("pool: %v", err)
	}
	t.Cleanup(pool.Close)
	return pool
}

// TestAuditL29W_FeedImpressionsAreNotFaked : chaque INSERT d'impression était
// avalé et le service renvoyait `len(items)` comme nombre inséré — une base
// injoignable produisait `success: true, inserted: N` sans une seule ligne.
func TestAuditL29W_FeedImpressionsAreNotFaked(t *testing.T) {
	svc := NewService(unreachablePool(t))
	items := []FeedImpressionItem{
		{ItemType: "ARTICLE", ItemID: "a1", Position: 0},
		{ItemType: "ARTICLE", ItemID: "a2", Position: 1},
		{ItemType: "THOUGHT", ItemID: "t1", Position: 2},
	}
	inserted, err := svc.TrackFeedImpression(context.Background(), "", items)
	if err == nil {
		t.Fatalf("base injoignable → inserted = %d et err = nil", inserted)
	}
}

// TestAuditL29W_ReadingHistoryHonoursRequestedWindow : le handler annonçait
// « 1 à 365 jours » mais le service ramenait tout à 30 jours en silence.
func TestAuditL29W_ReadingHistoryHonoursRequestedWindow(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	userID, articleID, _, _, err := seedTracking(ctx, poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "ReadingSession" (id, "articleId", "userId", source, status, "scrollDepth", "dwellSeconds", "createdAt")
		 VALUES (gen_random_uuid()::text, $1, $2, 'feed', 'READ_COMPLETE', 100, 120, now() - interval '45 days')`,
		articleID, userID); err != nil {
		t.Fatalf("session 45j: %v", err)
	}

	items, err := newTestService().ReadingHistory(ctx, userID, 90)
	if err != nil {
		t.Fatalf("ReadingHistory: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("historique sur 90 jours = %d sessions, attendu 1 (lecture de 45 jours)", len(items))
	}
}

// TestAuditL29W_AnonHashIgnoresSpoofedForwardedFor : l'IP était lue au PREMIER
// élément de X-Forwarded-For, contrôlé par le client ; un visiteur changeait
// donc d'identité anonyme à chaque requête (et gonflait les visiteurs uniques).
// Le proxy ajoute le pair réel en fin de chaîne : deux préfixes forgés
// différents doivent produire le même hash.
func TestAuditL29W_AnonHashIgnoresSpoofedForwardedFor(t *testing.T) {
	h := NewHandler(nil).SetAnalyticsAnonSecret("secret-test")

	reqA := httptest.NewRequest("POST", "/v1/tracking/reading-session", nil)
	reqA.RemoteAddr = "203.0.113.9:4111"
	reqA.Header.Set("X-Forwarded-For", "9.9.9.9, 203.0.113.9")
	reqA.Header.Set("User-Agent", "Mozilla/5.0")

	reqB := httptest.NewRequest("POST", "/v1/tracking/reading-session", nil)
	reqB.RemoteAddr = "203.0.113.9:4111"
	reqB.Header.Set("X-Forwarded-For", "8.8.8.8, 203.0.113.9")
	reqB.Header.Set("User-Agent", "Mozilla/5.0")

	a := h.dailyAnonHash(reqA)
	b := h.dailyAnonHash(reqB)
	if a == "" || b == "" {
		t.Fatal("hash anonyme vide")
	}
	if a != b {
		t.Fatalf("un préfixe X-Forwarded-For forgé change l'identité anonyme (%s != %s)", a[:8], b[:8])
	}
}
