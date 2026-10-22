package features

import (
	"bytes"
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/qoefi/api/internal/middleware"
)

// Ces tests couvrent les gardes pures : tout ce qui doit refuser AVANT de
// toucher la base. Le service est monté sans pool (nil) pour prouver que
// l'invalidation ne dépend d'aucune I/O.

func newTestRouter(userID string) *chi.Mux {
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
	NewHandler(NewService(nil)).RegisterProtected(r)
	return r
}

func postJSON(r *chi.Mux, path, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest("POST", path, bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	return rr
}

func TestRecord_RejectsInvalidSignals(t *testing.T) {
	svc := NewService(nil)
	const userID = "11111111-1111-4111-8111-111111111111"

	cases := []struct {
		name string
		in   SignalInput
	}{
		{"clé vide", SignalInput{FeatureKey: "", Kind: KindView}},
		{"clé avec espace", SignalInput{FeatureKey: "custom domain", Kind: KindView}},
		{"clé majuscule", SignalInput{FeatureKey: "Custom-Domain", Kind: KindView}},
		{"clé trop longue", SignalInput{FeatureKey: string(bytes.Repeat([]byte("a"), 65)), Kind: KindView}},
		{"nature inconnue", SignalInput{FeatureKey: "custom-domain", Kind: "click"}},
		{"source inconnue", SignalInput{FeatureKey: "custom-domain", Kind: KindView, Source: "email"}},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := svc.Record(context.Background(), userID, tc.in); !errors.Is(err, ErrInvalidSignal) {
				t.Fatalf("err = %v, attendu ErrInvalidSignal", err)
			}
		})
	}
}

func TestRecord_RequiresUser(t *testing.T) {
	svc := NewService(nil)
	if _, err := svc.Record(context.Background(), "", SignalInput{
		FeatureKey: "custom-domain", Kind: KindNotify,
	}); !errors.Is(err, ErrInvalidSignal) {
		t.Fatalf("err = %v, attendu ErrInvalidSignal", err)
	}
}

func TestSummary_RequiresPublication(t *testing.T) {
	svc := NewService(nil)
	if _, err := svc.Summary(context.Background(), "user", ""); !errors.Is(err, ErrInvalidSignal) {
		t.Fatalf("err = %v, attendu ErrInvalidSignal", err)
	}
}

func TestHandler_RequiresAuthentication(t *testing.T) {
	r := newTestRouter("")
	rr := postJSON(r, "/v1/features/signals", `{"feature":"custom-domain","kind":"view"}`)
	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("code = %d, attendu 401", rr.Code)
	}
}

func TestHandler_RejectsMalformedBody(t *testing.T) {
	r := newTestRouter("11111111-1111-4111-8111-111111111111")
	rr := postJSON(r, "/v1/features/signals", `{"feature":`)
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("code = %d, attendu 400", rr.Code)
	}
}

func TestHandler_RejectsInvalidKindWithoutDatabase(t *testing.T) {
	r := newTestRouter("11111111-1111-4111-8111-111111111111")
	rr := postJSON(r, "/v1/features/signals", `{"feature":"custom-domain","kind":"click"}`)
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("code = %d, attendu 400", rr.Code)
	}
	if !bytes.Contains(rr.Body.Bytes(), []byte("invalid_signal")) {
		t.Fatalf("corps = %s, code machine attendu", rr.Body.String())
	}
}

func TestHandler_SummaryRequiresPublicationID(t *testing.T) {
	r := newTestRouter("11111111-1111-4111-8111-111111111111")
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, httptest.NewRequest("GET", "/v1/features/signals/summary", nil))
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("code = %d, attendu 400", rr.Code)
	}
}
