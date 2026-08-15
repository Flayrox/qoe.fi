package webhooks

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/golang-jwt/jwt/v5"
	db "github.com/qoefi/api-go/internal/database"
	"github.com/qoefi/api-go/internal/middleware"
	"github.com/qoefi/api-go/internal/testutil"
)

const testSecret = "webhook-test-secret-0123456789"

func newTestRouter() *chi.Mux {
	svc := NewService(poolTest)
	h := NewHandler(svc)
	auth := middleware.NewAuth(testSecret, "")

	r := chi.NewRouter()
	r.Group(func(protected chi.Router) {
		protected.Use(auth.CombinedAuth(db.New(poolTest)))
		h.RegisterProtected(protected, middleware.RequireAPIScope)
	})
	return r
}

func testJWT(userID string) string {
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub": userID,
		"exp": time.Now().Add(time.Hour).Unix(),
	})
	s, _ := tok.SignedString([]byte(testSecret))
	return s
}

func insertAPIKey(t *testing.T, userID string, scopes []string) string {
	t.Helper()
	raw := "qoe_live_" + strings.Repeat("b", 32) + t.Name()
	sum := sha256.Sum256([]byte(raw))
	if _, err := poolTest.Exec(context.Background(),
		`INSERT INTO "ApiKey" (id, name, "keyPrefix", "keyHash", scopes, "userId", "createdAt")
		 VALUES (gen_random_uuid()::text, 'test', 'qoe_live', $1, $2, $3, now())`,
		hex.EncodeToString(sum[:]), scopes, userID,
	); err != nil {
		t.Fatalf("insert api key: %v", err)
	}
	return raw
}

func doJSON(t *testing.T, r *chi.Mux, method, path, token string, body any) (*httptest.ResponseRecorder, map[string]any) {
	t.Helper()
	var rd *bytes.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			t.Fatalf("marshal: %v", err)
		}
		rd = bytes.NewReader(b)
	} else {
		rd = bytes.NewReader(nil)
	}
	req := httptest.NewRequest(method, path, rd)
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	var parsed map[string]any
	if strings.Contains(w.Header().Get("Content-Type"), "json") && w.Body.Len() > 0 {
		_ = json.Unmarshal(w.Body.Bytes(), &parsed)
	}
	return w, parsed
}

// doJSONArray est la variante pour les réponses qui sont un tableau JSON direct
// (ex. list de webhooks : response.OK(items) sans enveloppe).
func doJSONArray(t *testing.T, r *chi.Mux, method, path, token string) (*httptest.ResponseRecorder, []any) {
	t.Helper()
	req := httptest.NewRequest(method, path, nil)
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	var parsed []any
	if strings.Contains(w.Header().Get("Content-Type"), "json") && w.Body.Len() > 0 {
		_ = json.Unmarshal(w.Body.Bytes(), &parsed)
	}
	return w, parsed
}

// ─── Liste ────────────────────────────────────────────────────────────

func TestHandler_List_OwnerJWT(t *testing.T) {
	fx, err := testutil.SeedWebhooks(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	r := newTestRouter()
	token := testJWT(fx.OwnerID)

	w, items := doJSONArray(t, r, "GET", "/v1/webhooks?publicationId="+fx.PublicationID, token)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
	if len(items) != 3 {
		t.Fatalf("len = %d, attendu 3 webhooks", len(items))
	}
	// Le secret ne fuit JAMAIS dans la liste.
	raw := w.Body.String()
	if strings.Contains(raw, "secret_placeholder") {
		t.Fatal("fuite de secret dans la liste")
	}
}

func TestHandler_List_NoPublicationID(t *testing.T) {
	if _, err := testutil.SeedWebhooks(context.Background(), poolTest); err != nil {
		t.Fatalf("seed: %v", err)
	}
	r := newTestRouter()
	token := testJWT("00000000-0000-0000-0000-000000000010")

	w, _ := doJSON(t, r, "GET", "/v1/webhooks", token, nil)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, attendu 400", w.Code)
	}
}

func TestHandler_List_NoAuth(t *testing.T) {
	if _, err := testutil.SeedWebhooks(context.Background(), poolTest); err != nil {
		t.Fatalf("seed: %v", err)
	}
	r := newTestRouter()

	w, _ := doJSON(t, r, "GET", "/v1/webhooks?publicationId=pub_wh_001", "", nil)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, attendu 401", w.Code)
	}
}

func TestHandler_List_ViewerCanRead(t *testing.T) {
	fx, err := testutil.SeedWebhooks(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	r := newTestRouter()
	token := testJWT(fx.ViewerID)

	// La LECTURE est ouverte à tout membre (y compris viewer) ; c'est la
	// gestion (create/delete/toggle) qui est réservée à owner/editor.
	w, items := doJSONArray(t, r, "GET", "/v1/webhooks?publicationId="+fx.PublicationID, token)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, attendu 200 (viewer peut lire)", w.Code)
	}
	if len(items) != 3 {
		t.Fatalf("len = %d, attendu 3", len(items))
	}
}

// ─── Création ─────────────────────────────────────────────────────────

func TestHandler_Create_OwnerJWT(t *testing.T) {
	fx, err := testutil.SeedWebhooks(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	r := newTestRouter()
	token := testJWT(fx.OwnerID)

	w, body := doJSON(t, r, "POST", "/v1/webhooks", token, map[string]any{
		"publicationId": fx.PublicationID,
		"name":          "Nouveau CMS",
		"url":           "https://cms2.example.com/hook",
		"events":        []string{"article.published", "article.updated", "EVENT_INCONNU"},
	})
	if w.Code != http.StatusCreated {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
	// Le secret est retourné UNE fois à la création.
	if body["secret"] == nil || body["secret"] == "" {
		t.Fatal("secret absent à la création")
	}
	wh, _ := body["webhook"].(map[string]any)
	if wh["name"] != "Nouveau CMS" {
		t.Fatalf("webhook = %v", wh)
	}
	// L'événement invalide est filtré.
	events, _ := wh["events"].([]any)
	if len(events) != 2 {
		t.Fatalf("events = %v, attendu 2 (invalide filtré)", events)
	}
}

func TestHandler_Create_InvalidURL(t *testing.T) {
	fx, err := testutil.SeedWebhooks(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	r := newTestRouter()
	token := testJWT(fx.OwnerID)

	w, _ := doJSON(t, r, "POST", "/v1/webhooks", token, map[string]any{
		"publicationId": fx.PublicationID,
		"name":          "Mauvais",
		"url":           "ftp://insecure.example.com",
		"events":        []string{"article.published"},
	})
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, attendu 400 (URL non-https)", w.Code)
	}
}

func TestHandler_Create_NoEvents(t *testing.T) {
	fx, err := testutil.SeedWebhooks(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	r := newTestRouter()
	token := testJWT(fx.OwnerID)

	w, _ := doJSON(t, r, "POST", "/v1/webhooks", token, map[string]any{
		"publicationId": fx.PublicationID,
		"name":          "Sans événement",
		"url":           "https://x.example.com/hook",
		"events":        []string{"NOPE"},
	})
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, attendu 400 (aucun événement valide)", w.Code)
	}
}

func TestHandler_Create_EditorAllowed(t *testing.T) {
	fx, err := testutil.SeedWebhooks(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	r := newTestRouter()
	token := testJWT(fx.EditorID)

	w, _ := doJSON(t, r, "POST", "/v1/webhooks", token, map[string]any{
		"publicationId": fx.PublicationID,
		"name":          "Par editor",
		"url":           "https://editor.example.com/hook",
		"events":        []string{"subscriber.created"},
	})
	if w.Code != http.StatusCreated {
		t.Fatalf("status = %d, attendu 201 (editor peut créer)", w.Code)
	}
}

func TestHandler_Create_ViewerForbidden(t *testing.T) {
	fx, err := testutil.SeedWebhooks(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	r := newTestRouter()
	token := testJWT(fx.ViewerID)

	w, _ := doJSON(t, r, "POST", "/v1/webhooks", token, map[string]any{
		"publicationId": fx.PublicationID,
		"name":          "Tentative",
		"url":           "https://x.example.com/hook",
		"events":        []string{"article.published"},
	})
	if w.Code != http.StatusForbidden {
		t.Fatalf("status = %d, attendu 403 (viewer)", w.Code)
	}
}

func TestHandler_Create_APIKey_ScopeDenied(t *testing.T) {
	fx, err := testutil.SeedWebhooks(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	r := newTestRouter()
	// Clé avec READ seul → POST interdit (WRITE requis).
	key := insertAPIKey(t, fx.OwnerID, []string{middleware.ScopeRead})

	w, _ := doJSON(t, r, "POST", "/v1/webhooks", key, map[string]any{
		"name":   "X",
		"url":    "https://x.example.com/hook",
		"events": []string{"article.published"},
	})
	if w.Code != http.StatusForbidden {
		t.Fatalf("status = %d, attendu 403 (scope WRITE requis)", w.Code)
	}
}

// ─── Actions (toggle, delete, deliveries) ─────────────────────────────

func TestHandler_Toggle_OwnerJWT(t *testing.T) {
	fx, err := testutil.SeedWebhooks(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	r := newTestRouter()
	token := testJWT(fx.OwnerID)

	// Le webhook actif devient inactif.
	w, body := doJSON(t, r, "POST", "/v1/webhooks/"+fx.WebhookID+"/toggle?publicationId="+fx.PublicationID, token, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
	if body["active"] != false {
		t.Fatalf("body = %s, attendu active=false", w.Body.String())
	}
}

func TestHandler_Toggle_NotFound(t *testing.T) {
	fx, err := testutil.SeedWebhooks(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	r := newTestRouter()
	token := testJWT(fx.OwnerID)

	w, _ := doJSON(t, r, "POST", "/v1/webhooks/wh_inexistant/toggle?publicationId="+fx.PublicationID, token, nil)
	if w.Code != http.StatusNotFound {
		t.Fatalf("status = %d, attendu 404", w.Code)
	}
}

func TestHandler_Delete_OwnerJWT(t *testing.T) {
	fx, err := testutil.SeedWebhooks(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	r := newTestRouter()
	token := testJWT(fx.OwnerID)

	w, _ := doJSON(t, r, "DELETE", "/v1/webhooks/"+fx.WebhookID+"?publicationId="+fx.PublicationID, token, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}

	// Supprimé en base.
	var n int
	if err := poolTest.QueryRow(context.Background(),
		`SELECT COUNT(*) FROM "Webhook" WHERE id = $1`, fx.WebhookID,
	).Scan(&n); err != nil {
		t.Fatalf("count: %v", err)
	}
	if n != 0 {
		t.Fatalf("webhook encore présent (%d)", n)
	}
}

func TestHandler_ListDeliveries_OwnerJWT(t *testing.T) {
	fx, err := testutil.SeedWebhooks(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	// Une livraison en base.
	if _, err := poolTest.Exec(context.Background(),
		`INSERT INTO "WebhookDelivery" (id, "webhookId", event, payload, status, "httpStatus", attempts, "createdAt")
		 VALUES (gen_random_uuid()::text, $1, 'article.published', '{}'::jsonb, 'SUCCESS', 200, 1, now())`,
		fx.WebhookID,
	); err != nil {
		t.Fatalf("insert delivery: %v", err)
	}

	r := newTestRouter()
	token := testJWT(fx.OwnerID)

	w, items := doJSONArray(t, r, "GET", "/v1/webhooks/"+fx.WebhookID+"/deliveries?publicationId="+fx.PublicationID, token)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
	if len(items) != 1 {
		t.Fatalf("len = %d, attendu 1 livraison", len(items))
	}
	first, _ := items[0].(map[string]any)
	if first["status"] != "SUCCESS" || first["httpStatus"] != float64(200) {
		t.Fatalf("delivery = %v", first)
	}
}

// ─── Test ping (webhook.test) ─────────────────────────────────────────

func TestHandler_Test_Ping_ReceivesSignedRequest(t *testing.T) {
	fx, err := testutil.SeedWebhooks(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}

	// Endpoint de test qui vérifie la signature HMAC (même secret que le seed).
	received := make(chan string, 1)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		sig := r.Header.Get("X-Qoe-Signature")
		if r.Header.Get("X-Qoe-Event") != "webhook.test" {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		select {
		case received <- sig:
		default:
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("pong"))
	}))
	defer srv.Close()

	// Webhook pointant vers le serveur de test.
	var whID string
	if err := poolTest.QueryRow(context.Background(),
		`INSERT INTO "Webhook" (id, "publicationId", name, url, secret, events, active, "createdAt", "updatedAt")
		 VALUES (gen_random_uuid()::text, $1, 'Test', $2, 'secret_placeholder', ARRAY['article.published'], true, now(), now())
		 RETURNING id`,
		fx.PublicationID, srv.URL,
	).Scan(&whID); err != nil {
		t.Fatalf("insert webhook test: %v", err)
	}

	r := newTestRouter()
	token := testJWT(fx.OwnerID)

	w, body := doJSON(t, r, "POST", "/v1/webhooks/"+whID+"/test?publicationId="+fx.PublicationID, token, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
	if body["success"] != true {
		t.Fatalf("body = %s, attendu success=true", w.Body.String())
	}

	// L'endpoint a bien reçu une signature HMAC (non vide) + un ping signé.
	select {
	case sig := <-received:
		if sig == "" || !strings.HasPrefix(sig, "sha256=") {
			t.Fatalf("signature = %q, attendu sha256=…", sig)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("l'endpoint n'a pas reçu le ping")
	}

	// La livraison a été enregistrée.
	var status string
	if err := poolTest.QueryRow(context.Background(),
		`SELECT status FROM "WebhookDelivery" WHERE "webhookId" = $1 ORDER BY "createdAt" DESC LIMIT 1`,
		whID,
	).Scan(&status); err != nil {
		t.Fatalf("delivery: %v", err)
	}
	if status != "SUCCESS" {
		t.Fatalf("status = %q, attendu SUCCESS", status)
	}
}

func TestHandler_Test_NotFound(t *testing.T) {
	fx, err := testutil.SeedWebhooks(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	r := newTestRouter()
	token := testJWT(fx.OwnerID)

	w, _ := doJSON(t, r, "POST", "/v1/webhooks/wh_inexistant/test?publicationId="+fx.PublicationID, token, nil)
	if w.Code != http.StatusNotFound {
		t.Fatalf("status = %d, attendu 404", w.Code)
	}
}
