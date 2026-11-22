package legal

// Test HTTP L29f : un corps JSON malformé ne doit pas être traité comme
// « aucun paramètre » (signer un export du registre entier, par exemple).

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/qoefi/api/internal/middleware"
)

// ─── Handler : un corps malformé n'est pas « aucun paramètre » ───────

func TestLegal_HTTPRejectsMalformedJSON(t *testing.T) {
	svc := seededService(t)
	h := NewHandler(svc)
	r := chi.NewRouter()
	r.Post("/accept-batch", h.acceptBatch)
	r.Post("/consent-export", h.adminCreateConsentExport)

	call := func(path, userID string) int {
		req := httptest.NewRequest(http.MethodPost, path, strings.NewReader(`{"slugs": [`))
		ctx := context.WithValue(req.Context(), middleware.UserIDKey, userID)
		req = req.WithContext(ctx)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		return w.Code
	}

	if code := call("/accept-batch", legalReaderID); code != http.StatusBadRequest {
		t.Fatalf("accept-batch avec JSON invalide = %d, attendu 400", code)
	}
	if code := call("/consent-export", legalAdminID); code != http.StatusBadRequest {
		t.Fatalf("export signé avec JSON invalide = %d, attendu 400", code)
	}
}
