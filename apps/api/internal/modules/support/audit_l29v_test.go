package support

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/qoefi/api/internal/middleware"
)

// TestAuditL29V_UnreadableOffsetRejected : `?offset=abc` repartait
// silencieusement de la première page au lieu de signaler la faute.
func TestAuditL29V_UnreadableOffsetRejected(t *testing.T) {
	r := chi.NewRouter()
	NewHandler(NewService(nil)).RegisterProtected(r)

	req := httptest.NewRequest(http.MethodGet, "/v1/support/tickets?offset=abc", nil)
	req = req.WithContext(context.WithValue(req.Context(), middleware.UserIDKey,
		"00000000-0000-0000-0000-0000000000aa"))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("offset=abc → %d (%s), attendu 400", w.Code, w.Body.String())
	}
}
