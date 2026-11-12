package ai

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/qoefi/api/internal/middleware"
)

func newAITestRouter(userID string, maxBodyBytes int64) *chi.Mux {
	r := chi.NewRouter()
	if maxBodyBytes > 0 {
		r.Use(middleware.MaxBodyBytes(maxBodyBytes))
	}
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			if userID != "" {
				ctx := context.WithValue(req.Context(), middleware.UserIDKey, userID)
				req = req.WithContext(ctx)
			}
			next.ServeHTTP(w, req)
		})
	})
	h := NewHandler(NewService(nil, fakeProvider{text: "ok"}))
	h.RegisterProtected(r)
	return r
}

func TestAIHandler_413_And_ExplainBounds(t *testing.T) {
	r := newAITestRouter("user-ai-1", 64)

	// Payload trop volumineux sur summarize -> 413.
	reqSum := httptest.NewRequest(http.MethodPost, "/v1/ai/summarize", bytes.NewBufferString(`{"articleId":"`+strings.Repeat("a", 128)+`"}`))
	reqSum.Header.Set("Content-Type", "application/json")
	wSum := httptest.NewRecorder()
	r.ServeHTTP(wSum, reqSum)
	if wSum.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("summarize > MaxBodyBytes: attendu 413, obtenu %d (%s)", wSum.Code, wSum.Body.String())
	}

	// Payload trop volumineux sur explain -> 413.
	reqExp := httptest.NewRequest(http.MethodPost, "/v1/ai/explain", bytes.NewBufferString(`{"text":"`+strings.Repeat("b", 128)+`"}`))
	reqExp.Header.Set("Content-Type", "application/json")
	wExp := httptest.NewRecorder()
	r.ServeHTTP(wExp, reqExp)
	if wExp.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("explain > MaxBodyBytes: attendu 413, obtenu %d (%s)", wExp.Code, wExp.Body.String())
	}

	// Bornes explain (texte vide ou > 2000 runes) -> 400.
	rLarge := newAITestRouter("user-ai-1", 1<<20)
	for _, body := range []string{
		`{"text":"   "}`,
		`{"text":"` + strings.Repeat("é", 2001) + `"}`,
	} {
		req := httptest.NewRequest(http.MethodPost, "/v1/ai/explain", bytes.NewBufferString(body))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		rLarge.ServeHTTP(w, req)
		if w.Code != http.StatusBadRequest {
			t.Fatalf("explain hors bornes: attendu 400, obtenu %d (%s)", w.Code, w.Body.String())
		}
	}
}
