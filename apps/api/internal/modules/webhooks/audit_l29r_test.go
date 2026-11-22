package webhooks

// Tests du lot d'audit L29r : chaque cas reproduit un défaut constaté sur le
// code d'avant correction (worktree à HEAD) et doit y échouer.

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"unicode/utf8"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/qoefi/api/internal/middleware"
)

// roundTripFunc est défini dans handler_integration_test.go (même paquet).

// webhookFixture insère un abonnement dont l'URL est validable mais dont la
// livraison sera interceptée par un transport de test.
func webhookFixture(t *testing.T, id, url string) {
	t.Helper()
	if _, err := poolTest.Exec(context.Background(),
		`INSERT INTO "Webhook" (id, "publisherId", name, url, secret, events, active, "createdAt", "updatedAt")
		 VALUES ($1, 'pub_wh_001', 'Test', $2, 'secret_test', ARRAY['article.published'], true, now(), now())`,
		id, url); err != nil {
		t.Fatalf("insert webhook: %v", err)
	}
}

// F659 : `truncate` coupait en octets — un corps distant multioctet produisait
// une chaîne UTF-8 invalide (JSON corrompu côté studio).
func TestAuditL29R_TruncationKeepsValidUTF8(t *testing.T) {
	fx := seedWebhooks(t)
	webhookFixture(t, "wh_l29r_utf8", "https://hooks.example.com/utf8")

	// Préfixe d'un octet : la coupe à 500 tombe alors au milieu d'une rune.
	body := "a" + strings.Repeat("é", 400)
	svc := NewService(poolTest)
	svc.httpClient = &http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) {
		return &http.Response{
			StatusCode: 200,
			Body:       io.NopCloser(strings.NewReader(body)),
			Header:     make(http.Header),
		}, nil
	})}

	res, err := svc.Test(context.Background(), fx.OwnerID, "wh_l29r_utf8", fx.PublisherID)
	if err != nil {
		t.Fatalf("Test: %v", err)
	}
	if len(res.Response) > 500 || len(res.Response) < 499 {
		t.Fatalf("longueur = %d, attendu <= 500 (rune entière)", len(res.Response))
	}
	if !utf8.ValidString(res.Response) {
		t.Fatal("réponse tronquée au milieu d'une rune : UTF-8 invalide")
	}
}

// F660 : une panne de base devenait « 403 permission insuffisante ».
func TestAuditL29R_DatabaseOutageIsNotForbidden(t *testing.T) {
	fx := seedWebhooks(t)
	cfg := poolTest.Config().Copy()
	broken, err := pgxpool.NewWithConfig(context.Background(), cfg)
	if err != nil {
		t.Fatalf("pool jetable: %v", err)
	}
	broken.Close()

	_, err = NewService(broken).List(context.Background(), fx.OwnerID, fx.PublisherID)
	if err == nil {
		t.Fatal("List sur base coupée = nil, attendu une erreur")
	}
	if errors.Is(err, errForbidden) {
		t.Fatalf("panne DB rendue en errForbidden (403) : %v", err)
	}
}

// F662 : aucun plafond d'abonnements — chaque webhook actif multiplie les
// livraisons sortantes.
func TestAuditL29R_WebhookQuota(t *testing.T) {
	fx := seedWebhooks(t)
	svc := NewService(poolTest)
	ctx := context.Background()
	// Contrat : 20 abonnements maximum par publication. Le seed en pose 3,
	// donc la 18e création (21e au total) doit être refusée.
	const quota = 20
	for i := 0; i < quota-3+1; i++ {
		_, _, err := svc.Create(ctx, fx.OwnerID, fx.PublisherID,
			"Quota", "https://hooks.example.com/quota", []string{"article.published"})
		if i < quota-3 {
			if err != nil {
				t.Fatalf("création %d refusée avant la limite: %v", i, err)
			}
			continue
		}
		if err == nil {
			t.Fatal("creation au-dela du quota acceptee : aucun plafond")
		}
	}
}

// F663 : le service acceptait un événement inexistant (abonnement « actif »
// qui ne livrerait jamais) et une URL http (charge signée en clair).
func TestAuditL29R_CreateValidatesEventsAndScheme(t *testing.T) {
	fx := seedWebhooks(t)
	svc := NewService(poolTest)
	ctx := context.Background()

	if _, _, err := svc.Create(ctx, fx.OwnerID, fx.PublisherID, "Événement",
		"https://hooks.example.com/evt", []string{"article.published", "made.up"}); err != nil {
		t.Fatalf("Create: %v", err)
	}
	var bad int
	if err := poolTest.QueryRow(ctx,
		`SELECT COUNT(*)::int FROM "Webhook" WHERE 'made.up' = ANY(events)`).Scan(&bad); err != nil {
		t.Fatalf("count: %v", err)
	}
	if bad != 0 {
		t.Fatalf("%d webhooks abonnés à un événement inexistant", bad)
	}

	if _, _, err := svc.Create(ctx, fx.OwnerID, fx.PublisherID, "Clair",
		"http://hooks.example.com/plain", []string{"article.published"}); !errors.Is(err, errInvalidURL) {
		t.Fatalf("URL http = %v, attendu errInvalidURL", err)
	}
}

// F664 : la livraison de test journalisait `{\"test\":true}`, qui n'est le corps
// d'aucune requête — le journal de livraison mentait sur ce qui a été envoyé.
func TestAuditL29R_TestDeliveryLogsSentBody(t *testing.T) {
	fx := seedWebhooks(t)
	webhookFixture(t, "wh_l29r_payload", "https://hooks.example.com/payload")

	var received []byte
	svc := NewService(poolTest)
	svc.httpClient = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		received, _ = io.ReadAll(r.Body)
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader("ok")), Header: make(http.Header)}, nil
	})}
	if _, err := svc.Test(context.Background(), fx.OwnerID, "wh_l29r_payload", fx.PublisherID); err != nil {
		t.Fatalf("Test: %v", err)
	}

	var stored []byte
	if err := poolTest.QueryRow(context.Background(),
		`SELECT payload FROM "WebhookDelivery" WHERE "webhookId" = 'wh_l29r_payload'
		 ORDER BY "createdAt" DESC LIMIT 1`).Scan(&stored); err != nil {
		t.Fatalf("lecture payload: %v", err)
	}
	var got, sent map[string]any
	if err := json.Unmarshal(stored, &got); err != nil {
		t.Fatalf("payload stocké illisible: %v", err)
	}
	if err := json.Unmarshal(received, &sent); err != nil {
		t.Fatalf("corps envoyé illisible: %v", err)
	}
	if got["event"] != "webhook.test" {
		t.Fatalf("payload journalisé = %v, attendu le corps réellement envoyé", got)
	}
	if got["event"] != sent["event"] {
		t.Fatalf("journal (%v) différent du corps envoyé (%v)", got, sent)
	}
}

// F667 : une session illisible ressortait en 403 (refus métier) au lieu d'un
// 401 (session invalide).
func TestAuditL29R_InvalidSessionIsRejected(t *testing.T) {
	seedWebhooks(t)
	h := NewHandler(NewService(poolTest))
	req := httptest.NewRequest(http.MethodGet, "/v1/webhooks?publisherId=pub_wh_001", nil)
	req = req.WithContext(context.WithValue(req.Context(), middleware.UserIDKey, "pas-un-uuid"))
	w := httptest.NewRecorder()
	h.list(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("session non-UUID = %d (%s), attendu 401", w.Code, w.Body.String())
	}
}

// F668 : un nom vide était accepté par le service (le handler seul validait).
func TestAuditL29R_CreateRejectsEmptyName(t *testing.T) {
	fx := seedWebhooks(t)
	_, _, err := NewService(poolTest).Create(context.Background(), fx.OwnerID, fx.PublisherID,
		"   ", "https://hooks.example.com/name", []string{"article.published"})
	if err == nil {
		t.Fatal("nom vide accepté par le service")
	}
}
