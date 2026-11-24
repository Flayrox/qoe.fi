package mediaassets

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/alicebob/miniredis/v2"
	"github.com/go-chi/chi/v5"
	"github.com/qoefi/api/internal/middleware"
	"github.com/qoefi/api/internal/observability"
	"github.com/qoefi/api/internal/secguard"
	"github.com/redis/go-redis/v9"
)

func doRegister(t *testing.T, svc *Service, userID string, body any) *httptest.ResponseRecorder {
	t.Helper()
	h := NewHandler(svc)
	r := chi.NewRouter()
	h.Register(r)
	var buf bytes.Buffer
	if body != nil {
		_ = json.NewEncoder(&buf).Encode(body)
	}
	req := httptest.NewRequest(http.MethodPost, "/v1/media-assets", &buf)
	req.Header.Set("Content-Type", "application/json")
	if userID != "" {
		req = req.WithContext(context.WithValue(req.Context(), middleware.UserIDKey, userID))
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func TestRegisterUnauthorized(t *testing.T) {
	w := doRegister(t, newTestService(), "", map[string]any{})
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("code = %d, attendu 401", w.Code)
	}
}

func TestRegisterBadJSON(t *testing.T) {
	ctx := context.Background()
	seedAssets(t, ctx)
	h := NewHandler(newTestService())
	r := chi.NewRouter()
	h.Register(r)
	req := httptest.NewRequest(http.MethodPost, "/v1/media-assets", bytes.NewBufferString("{bad"))
	req = req.WithContext(context.WithValue(req.Context(), middleware.UserIDKey, assetOwnerID))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("code = %d, attendu 400", w.Code)
	}
}

func TestRegisterValidationError(t *testing.T) {
	ctx := context.Background()
	seedAssets(t, ctx)
	// sha256 manquant → 400 (erreur service remontée par le handler).
	w := doRegister(t, newTestService(), assetOwnerID, map[string]any{
		"url": "https://cdn.qoe.fi/x.webp", "storagePath": "x.webp", "targetType": "SHARED",
		"mimeType": "image/webp", "sizeBytes": 10,
	})
	if w.Code != http.StatusBadRequest {
		t.Fatalf("code = %d, attendu 400 (body %s)", w.Code, w.Body.String())
	}
	// targetType invalide → 400.
	w2 := doRegister(t, newTestService(), assetOwnerID, map[string]any{
		"sha256": shaOf("bad-target"), "url": "https://cdn.qoe.fi/x.webp", "storagePath": "x.webp",
		"mimeType": "image/webp", "sizeBytes": 10, "targetType": "MALICIOUS",
	})
	if w2.Code != http.StatusBadRequest {
		t.Fatalf("code = %d, attendu 400 (targetType)", w2.Code)
	}
}

func TestRegisterSuccess(t *testing.T) {
	ctx := context.Background()
	seedAssets(t, ctx)
	w := doRegister(t, newTestService(), assetOwnerID, map[string]any{
		"sha256": shaOf("ok"), "url": "https://cdn.qoe.fi/x.webp", "storagePath": "x.webp",
		"mimeType": "image/webp", "targetType": "ARTICLE_BODY", "sizeBytes": 10,
	})
	if w.Code != http.StatusCreated {
		t.Fatalf("code = %d, attendu 201 (body %s)", w.Code, w.Body.String())
	}
	var dto AssetDTO
	if err := json.Unmarshal(w.Body.Bytes(), &dto); err != nil {
		t.Fatalf("json: %v", err)
	}
	if dto.Sha256 != shaOf("ok") || dto.Status == "" || dto.TargetType != "ARTICLE_BODY" {
		t.Fatalf("dto = %+v", dto)
	}
}

func doPreflight(t *testing.T, h *Handler, userID, rawBody string) *httptest.ResponseRecorder {
	t.Helper()
	r := chi.NewRouter()
	h.Register(r)
	req := httptest.NewRequest(http.MethodPost, "/v1/media-assets/preflight", strings.NewReader(rawBody))
	req.Header.Set("Content-Type", "application/json")
	req.RemoteAddr = "198.51.100.10:1234"
	if userID != "" {
		req = req.WithContext(context.WithValue(req.Context(), middleware.UserIDKey, userID))
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func TestPreflight_ValidationAndAuthWithoutDB(t *testing.T) {
	svc := NewService(nil)
	h := NewHandler(svc)

	// 1. Sans JWT → 401.
	if w := doPreflight(t, h, "", `{"sizeBytes":100}`); w.Code != http.StatusUnauthorized {
		t.Fatalf("sans JWT = %d, attendu 401", w.Code)
	}
	// 2. JSON invalide → 400.
	if w := doPreflight(t, h, "user_preflight_1", `{bad`); w.Code != http.StatusBadRequest {
		t.Fatalf("json invalide = %d, attendu 400", w.Code)
	}
	// 3. Fichier > 12 Mo → 400 + métrique validation.
	if w := doPreflight(t, h, "user_preflight_1", `{"sizeBytes":13000000,"mimeType":"image/png"}`); w.Code != http.StatusBadRequest {
		t.Fatalf("trop gros = %d, attendu 400 (%s)", w.Code, w.Body.String())
	}
	// 4. MIME text/html interdit → 400.
	if w := doPreflight(t, h, "user_preflight_1", `{"sizeBytes":1024,"mimeType":"text/html"}`); w.Code != http.StatusBadRequest {
		t.Fatalf("mime text/html = %d, attendu 400 (%s)", w.Code, w.Body.String())
	}
	// 5. Nominal → 200 Allowed=true.
	w := doPreflight(t, h, "user_preflight_1", `{"sizeBytes":2048,"mimeType":"image/png","targetType":"ARTICLE_BODY"}`)
	if w.Code != http.StatusOK {
		t.Fatalf("nominal = %d, attendu 200 (%s)", w.Code, w.Body.String())
	}
	var res PreflightResult
	if err := json.Unmarshal(w.Body.Bytes(), &res); err != nil {
		t.Fatalf("json: %v", err)
	}
	if !res.Allowed || res.RemainingBytes != defaultQuotaBytes {
		t.Fatalf("résultat inattendu: %+v", res)
	}
}

func TestPreflight_QuotaThrottleAndSecguardRateLimit(t *testing.T) {
	// Quota stockage dépassé → 413.
	svcQuota := NewService(nil).SetQuotaBytes(1000).SetUploadsPerHour(50)
	svcQuota.uploadStatsFn = func(context.Context, string) (int64, int64, error) {
		return 1, 900, nil
	}
	if w := doPreflight(t, NewHandler(svcQuota), "u-quota", `{"sizeBytes":200,"mimeType":"image/webp"}`); w.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("quota = %d, attendu 413 (%s)", w.Code, w.Body.String())
	}

	// Throttle horaire dépassé → 429.
	svcThrottle := NewService(nil).SetUploadsPerHour(5)
	svcThrottle.uploadStatsFn = func(context.Context, string) (int64, int64, error) {
		return 5, 1024, nil
	}
	if w := doPreflight(t, NewHandler(svcThrottle), "u-throttle", `{"sizeBytes":200,"mimeType":"image/webp"}`); w.Code != http.StatusTooManyRequests {
		t.Fatalf("throttle = %d, attendu 429 (%s)", w.Code, w.Body.String())
	}

	// Rate limit GCRA secguard via miniredis → 429 après dépassement + compteur Prometheus.
	mr := miniredis.RunT(t)
	rc := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	t.Cleanup(func() { _ = rc.Close() })

	guard := secguard.New(nil, rc)
	// Sans pool Postgres, secguard fail-closed sur TierRestricted (PerHour: 3) :
	// 3 requêtes passent, la 4e renvoie 429.
	h := NewHandler(NewService(nil)).SetSecurityGuard(guard)
	for i := 0; i < secguard.QuotasMediaUpload.Restricted.PerHour; i++ {
		if w := doPreflight(t, h, "u-gcra", `{"sizeBytes":512,"mimeType":"image/png"}`); w.Code != http.StatusOK {
			t.Fatalf("requête %d = %d, attendu 200 (%s)", i, w.Code, w.Body.String())
		}
	}
	if w := doPreflight(t, h, "u-gcra", `{"sizeBytes":512,"mimeType":"image/png"}`); w.Code != http.StatusTooManyRequests {
		t.Fatalf("4e requête = %d, attendu 429", w.Code)
	}
	rendered := observability.Default().Render()
	if !strings.Contains(rendered, `qoe_media_preflight_rejections_total{reason="rate_limit"}`) {
		t.Fatalf("compteur rate_limit absent des métriques:\n%s", rendered)
	}
	if !strings.Contains(rendered, `qoe_media_preflight_rejections_total{reason="quota"}`) {
		t.Fatalf("compteur quota absent des métriques:\n%s", rendered)
	}
}
