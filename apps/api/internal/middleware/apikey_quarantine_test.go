package middleware

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestRequireWritableAPIKey(t *testing.T) {
	cutoff := time.Date(2026, 11, 14, 18, 0, 0, 0, time.UTC)

	inner := RequireWritableAPIKey(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if ts, ok := ReadOnlyCutoff(r.Context()); ok && !ts.Equal(cutoff) {
			t.Fatalf("cutoff inattendu: %v", ts)
		}
		w.WriteHeader(http.StatusOK)
	}))

	t.Run("sans quarantaine toutes les methodes passent", func(t *testing.T) {
		for _, method := range []string{http.MethodGet, http.MethodPost, http.MethodPatch, http.MethodDelete} {
			req := httptest.NewRequest(method, "/v1/creator/articles", nil)
			rec := httptest.NewRecorder()
			inner.ServeHTTP(rec, req)
			if rec.Code != http.StatusOK {
				t.Fatalf("%s sans quarantaine: code=%d, attendu 200", method, rec.Code)
			}
		}
	})

	t.Run("en quarantaine GET passe avec cutoff mais mutations bloquent 403", func(t *testing.T) {
		for _, method := range []string{http.MethodGet, http.MethodHead, http.MethodOptions} {
			req := httptest.NewRequest(method, "/v1/creator/articles", nil)
			req = req.WithContext(context.WithValue(req.Context(), ReadOnlyCutoffKey, cutoff))
			rec := httptest.NewRecorder()
			inner.ServeHTTP(rec, req)
			if rec.Code != http.StatusOK {
				t.Fatalf("%s en quarantaine: code=%d, attendu 200", method, rec.Code)
			}
		}

		for _, method := range []string{http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete} {
			req := httptest.NewRequest(method, "/v1/creator/articles", nil)
			req = req.WithContext(context.WithValue(req.Context(), ReadOnlyCutoffKey, cutoff))
			rec := httptest.NewRecorder()
			inner.ServeHTTP(rec, req)
			if rec.Code != http.StatusForbidden {
				t.Fatalf("%s en quarantaine: code=%d, attendu 403", method, rec.Code)
			}
			var body map[string]any
			if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
				t.Fatalf("json invalide: %v", err)
			}
			if body["code"] != "api_read_only_quarantine" {
				t.Fatalf("code=%v, attendu api_read_only_quarantine", body["code"])
			}
		}
	})
}
