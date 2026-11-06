package features

// Tests d'acceptation de la promesse « Me prévenir ».
//
// Ces tests parlent à un vrai PostgreSQL (testcontainers) : ce qui compte ici
// n'est pas la réponse HTTP mais ce qui RESTE en base — un consentement daté,
// versionné, unique par (compte, fonctionnalité), qui ne dépend pas de la purge
// des signaux analytics, et un retrait signé idempotent.

import (
	"context"
	"errors"
	"log"
	"os"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/qoefi/api/internal/testutil"
)

var poolTest *pgxpool.Pool

func TestMain(m *testing.M) {
	p, err := testutil.TryPool(context.Background())
	if err != nil {
		log.Printf("testcontainers indisponible, tests DB features skippés: %v", err)
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

const featureTestUser = "00000000-0000-0000-0000-0000000000f1"

func requirePool(t *testing.T) {
	t.Helper()
	if poolTest == nil {
		t.Skip("DB indisponible (Docker/testcontainers requis)")
	}
}

// seedFeatureUser prépare un compte et remet le catalogue dans un état connu :
// la migration sème `custom-domain` en coming-soon avec notifyEnabled=true.
func seedFeatureUser(t *testing.T, ctx context.Context) {
	t.Helper()
	requirePool(t)
	if _, err := poolTest.Exec(ctx, `
		INSERT INTO "User" (id, email, username, name, role, "createdAt", "updatedAt")
		VALUES ($1, 'feature-db@test.dev', 'featuredb', 'Feature DB', 'user', now(), now())
		ON CONFLICT (id) DO NOTHING`, featureTestUser); err != nil {
		t.Fatalf("seed user: %v", err)
	}
	if _, err := poolTest.Exec(ctx, `
		UPDATE "Feature" SET "status" = 'coming-soon', "notifyEnabled" = true
		WHERE "key" = 'custom-domain'`); err != nil {
		t.Fatalf("seed feature: %v", err)
	}
	if _, err := poolTest.Exec(ctx, `DELETE FROM "FeatureInterest" WHERE "userId" = $1::uuid`, featureTestUser); err != nil {
		t.Fatalf("clean interests: %v", err)
	}
	if _, err := poolTest.Exec(ctx, `DELETE FROM "FeatureSignal" WHERE "userId" = $1`, featureTestUser); err != nil {
		t.Fatalf("clean signals: %v", err)
	}
}

func TestNotifyInterest_IsIdempotentAndSurvivesSignalPurge(t *testing.T) {
	ctx := context.Background()
	seedFeatureUser(t, ctx)
	svc := NewService(poolTest)

	for i := 0; i < 3; i++ {
		notified, err := svc.Record(ctx, featureTestUser, SignalInput{
			FeatureKey: "custom-domain", Kind: KindNotify, Source: SourceStudio,
		})
		if err != nil {
			t.Fatalf("Record #%d: %v", i, err)
		}
		if !notified {
			t.Fatalf("Record #%d: notify=false, attendu true", i)
		}
	}

	var rows int
	if err := poolTest.QueryRow(ctx,
		`SELECT COUNT(*) FROM "FeatureInterest" WHERE "userId" = $1::uuid AND "featureKey" = 'custom-domain'`,
		featureTestUser).Scan(&rows); err != nil {
		t.Fatalf("count interests: %v", err)
	}
	if rows != 1 {
		t.Fatalf("intérêts = %d, attendu 1 (idempotence par (userId, featureKey))", rows)
	}

	var status, version string
	var consentAt *string
	if err := poolTest.QueryRow(ctx, `
		SELECT "status", "consentVersion", "consentAt"::text
		  FROM "FeatureInterest"
		 WHERE "userId" = $1::uuid AND "featureKey" = 'custom-domain'`,
		featureTestUser).Scan(&status, &version, &consentAt); err != nil {
		t.Fatalf("read interest: %v", err)
	}
	if status != "active" || version != "v1" || consentAt == nil || *consentAt == "" {
		t.Fatalf("preuve de consentement incomplète: statut=%q version=%q date=%v", status, version, consentAt)
	}

	// La purge analytics (180 jours) efface les signaux : la promesse doit
	// rester lisible, car elle vit dans FeatureInterest.
	if _, err := poolTest.Exec(ctx, `DELETE FROM "FeatureSignal" WHERE "userId" = $1`, featureTestUser); err != nil {
		t.Fatalf("purge signals: %v", err)
	}
	keys, err := svc.NotifiedFeatures(ctx, featureTestUser)
	if err != nil {
		t.Fatalf("NotifiedFeatures: %v", err)
	}
	if len(keys) != 1 || keys[0] != "custom-domain" {
		t.Fatalf("NotifiedFeatures = %v, attendu [custom-domain] après purge des signaux", keys)
	}
	states, err := svc.States(ctx, featureTestUser)
	if err != nil {
		t.Fatalf("States: %v", err)
	}
	var found bool
	for _, st := range states {
		if st.Key == "custom-domain" {
			found = true
			if !st.Notified || !st.NotifyEnabled {
				t.Fatalf("état = %+v, attendu notified+notifyEnabled", st)
			}
		}
	}
	if !found {
		t.Fatal("custom-domain absent du catalogue")
	}
}

func TestNotifyInterest_RefusedWhenPausedOrDisabled(t *testing.T) {
	ctx := context.Background()
	seedFeatureUser(t, ctx)
	svc := NewService(poolTest)
	t.Cleanup(func() {
		_, _ = poolTest.Exec(context.Background(), `
			UPDATE "Feature" SET "status" = 'coming-soon', "notifyEnabled" = true
			WHERE "key" = 'custom-domain'`)
	})

	cases := []struct {
		name     string
		status   string
		enabled  bool
	}{
		{"paused", "paused", true},
		{"notify disabled", "coming-soon", false},
		{"retired", "retired", true},
	}
	for _, tc := range cases {
		if _, err := poolTest.Exec(ctx, `
			UPDATE "Feature" SET "status" = $1, "notifyEnabled" = $2
			WHERE "key" = 'custom-domain'`, tc.status, tc.enabled); err != nil {
			t.Fatalf("%s: update: %v", tc.name, err)
		}
		if _, err := svc.Record(ctx, featureTestUser, SignalInput{
			FeatureKey: "custom-domain", Kind: KindNotify,
		}); !errors.Is(err, ErrFeatureUnavailable) {
			t.Fatalf("%s : err = %v, attendu ErrFeatureUnavailable", tc.name, err)
		}
	}

	if _, err := svc.Record(ctx, featureTestUser, SignalInput{
		FeatureKey: "inconnue-du-catalogue", Kind: KindNotify,
	}); !errors.Is(err, ErrFeatureUnavailable) {
		t.Fatalf("clé inconnue = %v, attendu ErrFeatureUnavailable", err)
	}
}

func TestUnsubscribe_SignedTokenIsIdempotentAndRejectsTampering(t *testing.T) {
	ctx := context.Background()
	seedFeatureUser(t, ctx)
	svc := NewService(poolTest)
	svc.SetUnsubscribeSecret("test-secret")

	if _, err := svc.Record(ctx, featureTestUser, SignalInput{
		FeatureKey: "custom-domain", Kind: KindNotify,
	}); err != nil {
		t.Fatalf("Record: %v", err)
	}
	var interestID string
	if err := poolTest.QueryRow(ctx,
		`SELECT "id" FROM "FeatureInterest" WHERE "userId" = $1::uuid AND "featureKey" = 'custom-domain'`,
		featureTestUser).Scan(&interestID); err != nil {
		t.Fatalf("read interest id: %v", err)
	}

	token, err := svc.SignInterestToken(interestID)
	if err != nil {
		t.Fatalf("SignInterestToken: %v", err)
	}
	if _, err := svc.Unsubscribe(ctx, token+"x"); !errors.Is(err, ErrUnsubscribeInvalid) {
		t.Fatalf("jeton falsifié = %v, attendu ErrUnsubscribeInvalid", err)
	}

	key, err := svc.Unsubscribe(ctx, token)
	if err != nil {
		t.Fatalf("Unsubscribe: %v", err)
	}
	if key != "custom-domain" {
		t.Fatalf("clé = %q, attendu custom-domain", key)
	}
	keys, err := svc.NotifiedFeatures(ctx, featureTestUser)
	if err != nil {
		t.Fatalf("NotifiedFeatures: %v", err)
	}
	if len(keys) != 0 {
		t.Fatalf("promesse encore active après retrait : %v", keys)
	}

	// Deuxième clic sur le même lien : idempotent, même confirmation.
	if key2, err := svc.Unsubscribe(ctx, token); err != nil || key2 != "custom-domain" {
		t.Fatalf("retrait rejoué = (%q, %v), attendu (custom-domain, nil)", key2, err)
	}

	// Reconsentement explicite : le retrait n'est pas définitif.
	if notified, err := svc.Record(ctx, featureTestUser, SignalInput{
		FeatureKey: "custom-domain", Kind: KindNotify,
	}); err != nil || !notified {
		t.Fatalf("reconsentement = (%v, %v)", notified, err)
	}
	var status string
	var unsubscribedAt *string
	if err := poolTest.QueryRow(ctx, `
		SELECT "status", "unsubscribedAt"::text FROM "FeatureInterest"
		 WHERE "userId" = $1::uuid AND "featureKey" = 'custom-domain'`,
		featureTestUser).Scan(&status, &unsubscribedAt); err != nil {
		t.Fatalf("read resumed interest: %v", err)
	}
	if status != "active" || unsubscribedAt != nil {
		t.Fatalf("reprise = statut %q, unsubscribedAt %v", status, unsubscribedAt)
	}
}

func TestNotifyInterest_RemovedWithAccount(t *testing.T) {
	ctx := context.Background()
	seedFeatureUser(t, ctx)
	svc := NewService(poolTest)
	const doomed = "00000000-0000-0000-0000-0000000000f2"
	if _, err := poolTest.Exec(ctx, `
		INSERT INTO "User" (id, email, username, name, role, "createdAt", "updatedAt")
		VALUES ($1, 'feature-doomed@test.dev', 'featuredoomed', 'Doomed', 'user', now(), now())
		ON CONFLICT (id) DO NOTHING`, doomed); err != nil {
		t.Fatalf("seed doomed user: %v", err)
	}
	if _, err := svc.Record(ctx, doomed, SignalInput{
		FeatureKey: "custom-domain", Kind: KindNotify,
	}); err != nil {
		t.Fatalf("Record: %v", err)
	}
	if _, err := poolTest.Exec(ctx, `DELETE FROM "User" WHERE id = $1`, doomed); err != nil {
		t.Fatalf("delete user: %v", err)
	}
	var n int
	if err := poolTest.QueryRow(ctx,
		`SELECT COUNT(*) FROM "FeatureInterest" WHERE "userId" = $1::uuid`, doomed).Scan(&n); err != nil {
		t.Fatalf("count: %v", err)
	}
	if n != 0 {
		t.Fatalf("%d intérêts survivent à la suppression du compte (ON DELETE CASCADE attendu)", n)
	}
}
