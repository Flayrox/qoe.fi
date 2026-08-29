package webhooks

import (
	"context"
	"net/http"
	"testing"

	"github.com/qoefi/api/internal/testutil"
)

func seedWH(t *testing.T) *testutil.WebhookFixtures {
	t.Helper()
	fx, err := testutil.SeedWebhooks(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	return fx
}

// TestHandler_Test_NetworkError : endpoint injoignable → 200 avec success=false.
func TestHandler_Test_NetworkError(t *testing.T) {
	fx := seedWH(t)

	var whID string
	if err := poolTest.QueryRow(context.Background(),
		`INSERT INTO "Webhook" (id, "publicationId", name, url, secret, events, active, "createdAt", "updatedAt")
		 VALUES (gen_random_uuid()::text, $1, 'Down', 'http://127.0.0.1:1/hook', 'secret_x', ARRAY['article.published'], true, now(), now())
		 RETURNING id`,
		fx.PublicationID,
	).Scan(&whID); err != nil {
		t.Fatalf("insert webhook: %v", err)
	}

	r := newTestRouter()
	token := testJWT(fx.OwnerID)
	w, body := doJSON(t, r, "POST", "/v1/webhooks/"+whID+"/test?publicationId="+fx.PublicationID, token, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, attendu 200 (erreur réseau → success=false)", w.Code)
	}
	if body["success"] != false {
		t.Fatalf("body = %s, attendu success=false", w.Body.String())
	}

	// La livraison FAILED est enregistrée.
	var status string
	if err := poolTest.QueryRow(context.Background(),
		`SELECT status FROM "WebhookDelivery" WHERE "webhookId" = $1 ORDER BY "createdAt" DESC LIMIT 1`,
		whID,
	).Scan(&status); err != nil {
		t.Fatalf("delivery: %v", err)
	}
	if status != "FAILED" {
		t.Fatalf("status = %q, attendu FAILED", status)
	}
}

// TestHandler_Test_ViewerForbidden : viewer n'a pas media:manage → 403.
func TestHandler_Test_ViewerForbidden(t *testing.T) {
	fx := seedWH(t)
	r := newTestRouter()
	token := testJWT(fx.ViewerID)

	w, _ := doJSON(t, r, "POST", "/v1/webhooks/"+fx.WebhookID+"/test?publicationId="+fx.PublicationID, token, nil)
	if w.Code != http.StatusForbidden {
		t.Fatalf("status = %d, attendu 403 (viewer)", w.Code)
	}
}

// TestHandler_Delete_ViewerForbidden : writeWebhookError branche errForbidden.
func TestHandler_Delete_ViewerForbidden(t *testing.T) {
	fx := seedWH(t)
	r := newTestRouter()
	token := testJWT(fx.ViewerID)

	w, _ := doJSON(t, r, "DELETE", "/v1/webhooks/"+fx.WebhookID+"?publicationId="+fx.PublicationID, token, nil)
	if w.Code != http.StatusForbidden {
		t.Fatalf("status = %d, attendu 403 (viewer)", w.Code)
	}
}

// TestHandler_Delete_NoPublicationID → 400.
func TestHandler_Delete_NoPublicationID(t *testing.T) {
	fx := seedWH(t)
	r := newTestRouter()
	token := testJWT(fx.OwnerID)

	w, _ := doJSON(t, r, "DELETE", "/v1/webhooks/"+fx.WebhookID, token, nil)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, attendu 400", w.Code)
	}
}

// TestHandler_ListDeliveries_Branches : clamp du limit + 404 ownership.
func TestHandler_ListDeliveries_Branches(t *testing.T) {
	fx := seedWH(t)
	r := newTestRouter()
	token := testJWT(fx.OwnerID)

	// limit hors bornes → clamp 50 (aucune erreur).
	w, _ := doJSONArray(t, r, "GET", "/v1/webhooks/"+fx.WebhookID+"/deliveries?publicationId="+fx.PublicationID+"&limit=9999", token)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, attendu 200 (limit clamp)", w.Code)
	}

	// Publication étrangère → resolveRole échoue → 403 (RBAC avant ownership).
	w2, _ := doJSON(t, r, "GET", "/v1/webhooks/"+fx.WebhookID+"/deliveries?publicationId=pub_autre", token, nil)
	if w2.Code != http.StatusForbidden {
		t.Fatalf("status = %d, attendu 403 (publication étrangère)", w2.Code)
	}

	// Id inexistant → 404.
	w3, _ := doJSON(t, r, "GET", "/v1/webhooks/wh_inexistant/deliveries?publicationId="+fx.PublicationID, token, nil)
	if w3.Code != http.StatusNotFound {
		t.Fatalf("status = %d, attendu 404", w3.Code)
	}
}

// TestHandler_Create_Validation : JSON invalide, nom/URL vides, pas de publication.
func TestHandler_Create_Validation(t *testing.T) {
	fx := seedWH(t)
	r := newTestRouter()
	token := testJWT(fx.OwnerID)

	// JSON invalide.
	w, _ := doJSON(t, r, "POST", "/v1/webhooks", token, "{{{{")
	if w.Code != http.StatusBadRequest {
		t.Fatalf("json invalide = %d, attendu 400", w.Code)
	}

	// Nom vide.
	w2, _ := doJSON(t, r, "POST", "/v1/webhooks", token, map[string]any{
		"publicationId": fx.PublicationID, "name": "  ", "url": "https://x.example.com/hook",
		"events": []string{"article.published"},
	})
	if w2.Code != http.StatusBadRequest {
		t.Fatalf("nom vide = %d, attendu 400", w2.Code)
	}

	// Ni body ni query : pas de publication.
	w3, _ := doJSON(t, r, "POST", "/v1/webhooks", token, map[string]any{
		"name": "X", "url": "https://x.example.com/hook", "events": []string{"article.published"},
	})
	if w3.Code != http.StatusBadRequest {
		t.Fatalf("sans publication = %d, attendu 400", w3.Code)
	}
}

// TestService_Delete_ViewerForbidden : branche canManage du service Delete.
func TestService_Delete_ViewerForbidden(t *testing.T) {
	fx := seedWH(t)
	svc := NewService(poolTest)

	if err := svc.Delete(context.Background(), fx.ViewerID, fx.WebhookID, fx.PublicationID); err == nil {
		t.Fatal("Delete(viewer) attendu errForbidden")
	}
}

// TestService_Toggle_ViewerForbidden : branche canManage du service Toggle.
func TestService_Toggle_ViewerForbidden(t *testing.T) {
	fx := seedWH(t)
	svc := NewService(poolTest)

	if _, err := svc.Toggle(context.Background(), fx.ViewerID, fx.WebhookID, fx.PublicationID); err == nil {
		t.Fatal("Toggle(viewer) attendu errForbidden")
	}
}

// TestService_ListDeliveries_NotFound : ownership/404 via service.
func TestService_ListDeliveries_NotFound(t *testing.T) {
	fx := seedWH(t)
	svc := NewService(poolTest)

	// Publication étrangère → resolveRole échoue → errForbidden.
	if _, err := svc.ListDeliveries(context.Background(), fx.OwnerID, "pub_autre", fx.WebhookID, 10); err == nil {
		t.Fatal("ListDeliveries(autre publication) attendu erreur")
	}
	// Id inexistant → errNotFound.
	if _, err := svc.ListDeliveries(context.Background(), fx.OwnerID, fx.PublicationID, "wh_inexistant", 10); err == nil {
		t.Fatal("ListDeliveries(inexistant) attendu errNotFound")
	}
}

// TestEnsureOwnership_Mismatch : webhook d'une autre publication → errNotFound.
func TestEnsureOwnership_Mismatch(t *testing.T) {
	fx := seedWH(t)
	svc := NewService(poolTest)

	if _, err := svc.ensureOwnership(context.Background(), fx.WebhookID, "pub_autre"); err == nil {
		t.Fatal("ensureOwnership(autre publication) attendu errNotFound")
	}
}

// TestService_Test_NetworkError : retour d'erreur réseau + livraison FAILED.
func TestService_Test_NetworkError(t *testing.T) {
	fx := seedWH(t)
	svc := NewService(poolTest)

	var whID string
	if err := poolTest.QueryRow(context.Background(),
		`INSERT INTO "Webhook" (id, "publicationId", name, url, secret, events, active, "createdAt", "updatedAt")
		 VALUES (gen_random_uuid()::text, $1, 'Down2', 'http://127.0.0.1:1/hook', 'secret_y', ARRAY['article.published'], true, now(), now())
		 RETURNING id`,
		fx.PublicationID,
	).Scan(&whID); err != nil {
		t.Fatalf("insert: %v", err)
	}

	res, err := svc.Test(context.Background(), fx.OwnerID, whID, fx.PublicationID)
	if err == nil {
		t.Fatal("Test(endpoint down) attendu erreur réseau")
	}
	if res.Status != 0 || res.Response == "" {
		t.Fatalf("res = %+v, attendu status 0 + message d'erreur", res)
	}
}

// TestTruncate : branche longueur > n.
func TestTruncate(t *testing.T) {
	if got := truncate("court", 10); got != "court" {
		t.Fatalf("court = %q", got)
	}
	if got := truncate("un message très long qui dépasse la limite", 10); len(got) != 10 {
		t.Fatalf("long = %q (len %d), attendu 10", got, len(got))
	}
}

// TestDeliveryFromRow_NilFields : livraison sans httpStatus ni responseBody.
func TestDeliveryFromRow_NilFields(t *testing.T) {
	// Via ListDeliveries : livraison minimale sans statut HTTP (statut en cours).
	fx := seedWH(t)
	svc := NewService(poolTest)

	if _, err := poolTest.Exec(context.Background(),
		`INSERT INTO "WebhookDelivery" (id, "webhookId", event, payload, status, attempts, "createdAt")
		 VALUES (gen_random_uuid()::text, $1, 'article.updated', '{}'::jsonb, 'PENDING', 0, now())`,
		fx.WebhookID,
	); err != nil {
		t.Fatalf("insert delivery: %v", err)
	}

	items, err := svc.ListDeliveries(context.Background(), fx.OwnerID, fx.PublicationID, fx.WebhookID, 10)
	if err != nil {
		t.Fatalf("ListDeliveries: %v", err)
	}
	var found bool
	for _, d := range items {
		if d.Status == "PENDING" {
			found = true
			if d.HTTPStatus != nil {
				t.Fatalf("httpStatus attendu nil pour PENDING, got %v", *d.HTTPStatus)
			}
		}
	}
	if !found {
		t.Fatal("livraison PENDING absente")
	}
}
