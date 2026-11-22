package features

// Tests du lot d'audit L29q : chaque cas reproduit un défaut constaté sur le
// code d'avant correction (worktree à HEAD) et doit y échouer.

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/qoefi/api/internal/middleware"
	"github.com/qoefi/api/internal/testutil"
)

// routerWith monte les routes protégées d'un service réel derrière une identité
// injectée, comme le fait le serveur (middleware protégé → handler).
func routerWith(svc *Service, userID string) *chi.Mux {
	r := chi.NewRouter()
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			ctx := req.Context()
			if userID != "" {
				ctx = context.WithValue(ctx, middleware.UserIDKey, userID)
			}
			next.ServeHTTP(w, req.WithContext(ctx))
		})
	})
	NewHandler(svc).RegisterProtected(r)
	return r
}

// publicRouter monte la route publique de retrait, hors authentification.
func publicRouter(svc *Service) *chi.Mux {
	r := chi.NewRouter()
	NewHandler(svc).RegisterPublic(r)
	return r
}

func doHTTP(r *chi.Mux, method, path, body string, headers map[string]string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	return rr
}

// F643 : une panne de base devenait « 403 publication inaccessible », effaçant
// l'incident derrière un refus métier (et sans trace serveur).
func TestAuditL29Q_DatabaseOutageIsNotForbidden(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	seedFeatureUser(t, ctx)

	cfg := poolTest.Config().Copy()
	broken, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatalf("pool jetable: %v", err)
	}
	broken.Close()

	_, err = NewService(broken).Record(ctx, featureTestUser, SignalInput{
		FeatureKey: "custom-domain", Kind: KindNotify, PublisherID: "pub_quelconque",
	})
	if err == nil {
		t.Fatal("Record sur base coupée = nil, attendu une erreur")
	}
	if errors.Is(err, ErrForbidden) {
		t.Fatalf("panne DB rendue en ErrForbidden (403) : %v", err)
	}
}

// F644 (structurel) : la lecture de la publication personnelle était avalée,
// le signal était écrit sans attribution au lieu de remonter la panne.

// F645 : une session non-UUID écrivait un signal inexploitable en 200 au lieu
// d'être refusée en 401 (la colonne FeatureSignal.userId est TEXT).
func TestAuditL29Q_InvalidSessionIsRejected(t *testing.T) {
	requirePool(t)
	seedFeatureUser(t, context.Background())
	r := routerWith(NewService(poolTest), "pas-un-uuid")
	rr := doHTTP(r, http.MethodPost, "/v1/features/signals", `{"feature":"custom-domain","kind":"view"}`, nil)
	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("session non-UUID = %d (%s), attendu 401", rr.Code, rr.Body.String())
	}
	var junk int
	if err := poolTest.QueryRow(context.Background(),
		`SELECT COUNT(*)::int FROM "FeatureSignal" WHERE "userId" = 'pas-un-uuid'`).Scan(&junk); err != nil {
		t.Fatalf("count: %v", err)
	}
	if junk != 0 {
		t.Fatalf("%d signaux écrits avec un userId non-UUID", junk)
	}
}

// F650 : une clé de fonctionnalité mal formée était traitée comme « aucune
// promesse » (404) après une requête inutile, au lieu d'être rejetée (400).
func TestAuditL29Q_InvalidFeatureKeyOnUnsubscribeIsBadRequest(t *testing.T) {
	requirePool(t)
	seedFeatureUser(t, context.Background())
	r := routerWith(NewService(poolTest), featureTestUser)
	rr := doHTTP(r, http.MethodPost, "/v1/features/interests/unsubscribe",
		`{"feature":"Pas une clé !"}`, nil)
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("clé invalide = %d (%s), attendu 400", rr.Code, rr.Body.String())
	}
}

// F651 : un publisherId forgé (plus long qu'une publication) était accepté et
// exécutait une requête d'agrégat, au lieu d'être rejeté avant la base.
func TestAuditL29Q_SummaryRejectsForgedPublisherID(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	seedFeatureUser(t, ctx)
	_, err := NewService(poolTest).Summary(ctx, featureTestUser, strings.Repeat("x", 200))
	if !errors.Is(err, ErrInvalidSignal) {
		t.Fatalf("publisherId forgé = %v, attendu ErrInvalidSignal", err)
	}
}

// F652 : le résumé n'était borné par rien — un compte peut créer autant de clés
// distinctes qu'il veut (les vues acceptent toute clé du motif), donc la réponse
// devenait un export.
func TestAuditL29Q_SummaryIsBounded(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	fx, err := testutil.SeedPosts(ctx, poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	var pubID string
	if err := poolTest.QueryRow(ctx,
		`SELECT "publisherId" FROM "User" WHERE id = $1`, fx.AuthorID).Scan(&pubID); err != nil {
		t.Fatalf("publication de l'auteur: %v", err)
	}
	for i := 0; i < 60; i++ {
		if _, err := poolTest.Exec(ctx,
			`INSERT INTO "FeatureSignal" ("featureKey", "kind", "source", "userId", "publisherId")
			 VALUES ($1, 'view', 'studio', $2, $3)`,
			fmt.Sprintf("l29q-key-%02d", i), fx.AuthorID, pubID); err != nil {
			t.Fatalf("signal %d: %v", i, err)
		}
	}
	t.Cleanup(func() {
		_, _ = poolTest.Exec(context.Background(),
			`DELETE FROM "FeatureSignal" WHERE "featureKey" LIKE 'l29q-key-%'`)
	})

	rows, err := NewService(poolTest).Summary(ctx, fx.AuthorID, pubID)
	if err != nil {
		t.Fatalf("Summary: %v", err)
	}
	// Contrat : la réponse est bornée (50 clés suffisent au catalogue réel).
	const summaryBound = 50
	if len(rows) > summaryBound {
		t.Fatalf("%d lignes renvoyées, borne attendue <= %d", len(rows), summaryBound)
	}
}

// F653 : le GET de désabonnement modifiait la promesse. Les clients mail et les
// scanners de liens préchargent les URLs : l'utilisateur était désabonné sans
// avoir cliqué. Le GET rend désormais une page de confirmation, le POST agit.
func TestAuditL29Q_GetDoesNotUnsubscribe(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	seedFeatureUser(t, ctx)
	svc := NewService(poolTest)
	svc.SetUnsubscribeSecret("test-secret")
	if _, err := svc.Record(ctx, featureTestUser, SignalInput{FeatureKey: "custom-domain", Kind: KindNotify}); err != nil {
		t.Fatalf("Record: %v", err)
	}
	var interestID string
	if err := poolTest.QueryRow(ctx,
		`SELECT "id" FROM "FeatureInterest" WHERE "userId" = $1::uuid AND "featureKey" = 'custom-domain'`,
		featureTestUser).Scan(&interestID); err != nil {
		t.Fatalf("interest id: %v", err)
	}
	token, err := svc.SignInterestToken(interestID)
	if err != nil {
		t.Fatalf("SignInterestToken: %v", err)
	}

	r := publicRouter(svc)
	rr := doHTTP(r, http.MethodGet, "/v1/features/unsubscribe?token="+token, "", nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("GET = %d (%s), attendu 200", rr.Code, rr.Body.String())
	}
	var status string
	if err := poolTest.QueryRow(ctx,
		`SELECT "status" FROM "FeatureInterest" WHERE "id" = $1`, interestID).Scan(&status); err != nil {
		t.Fatalf("status: %v", err)
	}
	if status != "active" {
		t.Fatalf("un GET a désabonné (statut %q) : un scanner de liens suffit à perdre la promesse", status)
	}

	// Le POST, lui, retire bien la promesse et rend la page de confirmation.
	rr = doHTTP(r, http.MethodPost, "/v1/features/unsubscribe?token="+token, "",
		map[string]string{"Accept": "text/html"})
	if rr.Code != http.StatusOK {
		t.Fatalf("POST = %d (%s), attendu 200", rr.Code, rr.Body.String())
	}
	if err := poolTest.QueryRow(ctx,
		`SELECT "status" FROM "FeatureInterest" WHERE "id" = $1`, interestID).Scan(&status); err != nil {
		t.Fatalf("status: %v", err)
	}
	if status != "unsubscribed" {
		t.Fatalf("statut après POST = %q, attendu unsubscribed", status)
	}
}

// F654 : un service monté sans base paniquait sur un signal « vue » (le garde
// n'existait que pour « notify »).
func TestAuditL29Q_ViewWithoutPoolDoesNotPanic(t *testing.T) {
	defer func() {
		if rec := recover(); rec != nil {
			t.Fatalf("panic sur pool nul : %v", rec)
		}
	}()
	if _, err := NewService(nil).Record(context.Background(), featureTestUser, SignalInput{
		FeatureKey: "custom-domain", Kind: KindView,
	}); err == nil {
		t.Fatal("Record sans base = nil, attendu une erreur")
	}
}
