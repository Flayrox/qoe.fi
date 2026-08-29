package mediaassets

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/qoefi/api/internal/middleware"
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
	w := doRegister(t, NewService(poolTest), "", map[string]any{})
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("code = %d, attendu 401", w.Code)
	}
}

func TestRegisterBadJSON(t *testing.T) {
	ctx := context.Background()
	seedAssets(t, ctx)
	h := NewHandler(NewService(poolTest))
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
	w := doRegister(t, NewService(poolTest), assetOwnerID, map[string]any{
		"url": "https://cdn/x.webp", "storagePath": "x.webp", "targetType": "SHARED",
	})
	if w.Code != http.StatusBadRequest {
		t.Fatalf("code = %d, attendu 400 (body %s)", w.Code, w.Body.String())
	}
	// targetType invalide → 400.
	w2 := doRegister(t, NewService(poolTest), assetOwnerID, map[string]any{
		"sha256": "x", "url": "u", "storagePath": "p", "targetType": "MALICIOUS",
	})
	if w2.Code != http.StatusBadRequest {
		t.Fatalf("code = %d, attendu 400 (targetType)", w2.Code)
	}
}

func TestRegisterSuccess(t *testing.T) {
	ctx := context.Background()
	seedAssets(t, ctx)
	w := doRegister(t, NewService(poolTest), assetOwnerID, map[string]any{
		"sha256": "sha-ok-1", "url": "https://cdn/x.webp", "storagePath": "x.webp",
		"mimeType": "image/webp", "targetType": "ARTICLE_BODY", "sizeBytes": 10,
	})
	if w.Code != http.StatusCreated {
		t.Fatalf("code = %d, attendu 201 (body %s)", w.Code, w.Body.String())
	}
	var dto AssetDTO
	if err := json.Unmarshal(w.Body.Bytes(), &dto); err != nil {
		t.Fatalf("json: %v", err)
	}
	if dto.Sha256 != "sha-ok-1" || dto.Status == "" || dto.TargetType != "ARTICLE_BODY" {
		t.Fatalf("dto = %+v", dto)
	}
}
