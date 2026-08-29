package tracking

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/qoefi/api/internal/middleware"
)

func newRouter(t *testing.T, userID string) *chi.Mux {
	t.Helper()
	r := chi.NewRouter()
	h := NewHandler(newTestService())
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			ctx := req.Context()
			if userID != "" {
				ctx = context.WithValue(ctx, middleware.UserIDKey, userID)
			}
			next.ServeHTTP(w, req.WithContext(ctx))
		})
	})
	h.RegisterProtected(r)
	h.RegisterReader(r)
	return r
}

func postT(t *testing.T, r *chi.Mux, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest("POST", path, bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	return rr
}

func getT(t *testing.T, r *chi.Mux, path string) *httptest.ResponseRecorder {
	t.Helper()
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, httptest.NewRequest("GET", path, nil))
	return rr
}

func TestHandler_Track(t *testing.T) {
	ctx := context.Background()
	userID, articleID, _, _, err := seedTracking(ctx, poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	r := newRouter(t, userID)

	// track valide.
	body := `{"articleId":` + strconvQ(articleID) + `,"source":"feed","status":"READ_COMPLETE","scrollDepth":100,"dwellSeconds":30,"readingTimeMinutes":8}`
	if rr := postT(t, r, "/v1/tracking/reading-session", body); rr.Code != http.StatusOK {
		t.Fatalf("track code = %d, body=%s", rr.Code, rr.Body.String())
	}
	// JSON invalide → 400.
	if rr := postT(t, r, "/v1/tracking/reading-session", `{`); rr.Code != http.StatusBadRequest {
		t.Fatalf("track badjson code = %d", rr.Code)
	}
	// articleId manquant → 400.
	if rr := postT(t, r, "/v1/tracking/reading-session", `{"source":"feed"}`); rr.Code != http.StatusBadRequest {
		t.Fatalf("track sans articleId code = %d", rr.Code)
	}
}

func TestHandler_TrackAnonymous(t *testing.T) {
	ctx := context.Background()
	_, articleID, _, _, err := seedTracking(ctx, poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	// Anonyme (aucun UID) : track autorisé (completionRate MAJ, pas de session).
	r := newRouter(t, "")
	if rr := postT(t, r, "/v1/tracking/reading-session", `{"articleId":`+strconvQ(articleID)+`,"source":"feed","status":"READ_COMPLETE"}`); rr.Code != http.StatusOK {
		t.Fatalf("track anon code = %d, body=%s", rr.Code, rr.Body.String())
	}
}

func TestHandler_FeedImpression(t *testing.T) {
	ctx := context.Background()
	userID, _, _, _, err := seedTracking(ctx, poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	r := newRouter(t, userID)

	if rr := postT(t, r, "/v1/tracking/feed-impression", `{"items":[{"itemType":"ARTICLE","itemId":"a1","position":2}]}`); rr.Code != http.StatusOK {
		t.Fatalf("feedImpression code = %d, body=%s", rr.Code, rr.Body.String())
	}
	if rr := postT(t, r, "/v1/tracking/feed-impression", `{`); rr.Code != http.StatusBadRequest {
		t.Fatalf("feedImpression badjson code = %d", rr.Code)
	}
}

func TestHandler_ShowLessMore(t *testing.T) {
	ctx := context.Background()
	userID, articleID, postID, _, err := seedTracking(ctx, poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	r := newRouter(t, userID)

	// show-less sur une pensée.
	if rr := postT(t, r, "/v1/feed/show-less", `{"thoughtId":`+strconvQ(postID)+`}`); rr.Code != http.StatusOK {
		t.Fatalf("show-less code = %d, body=%s", rr.Code, rr.Body.String())
	}
	// show-less sur un article.
	if rr := postT(t, r, "/v1/feed/show-less", `{"articleId":`+strconvQ(articleID)+`}`); rr.Code != http.StatusOK {
		t.Fatalf("show-less article code = %d, body=%s", rr.Code, rr.Body.String())
	}
	// show-more sur une pensée.
	if rr := postT(t, r, "/v1/feed/show-more", `{"thoughtId":`+strconvQ(postID)+`}`); rr.Code != http.StatusOK {
		t.Fatalf("show-more code = %d, body=%s", rr.Code, rr.Body.String())
	}
	// ni articleId ni thoughtId → 400.
	if rr := postT(t, r, "/v1/feed/show-less", `{}`); rr.Code != http.StatusBadRequest {
		t.Fatalf("show-less vide code = %d, attendu 400", rr.Code)
	}
	// JSON invalide → 400.
	if rr := postT(t, r, "/v1/feed/show-less", `{`); rr.Code != http.StatusBadRequest {
		t.Fatalf("show-less badjson code = %d", rr.Code)
	}
	// Anonyme → 401.
	ra := newRouter(t, "")
	if rr := postT(t, ra, "/v1/feed/show-less", `{"thoughtId":"x"}`); rr.Code != http.StatusUnauthorized {
		t.Fatalf("show-less anon code = %d, attendu 401", rr.Code)
	}
	if rr := postT(t, ra, "/v1/feed/show-more", `{"thoughtId":"x"}`); rr.Code != http.StatusUnauthorized {
		t.Fatalf("show-more anon code = %d, attendu 401", rr.Code)
	}
}

func TestHandler_ReadingHistory(t *testing.T) {
	ctx := context.Background()
	userID, articleID, _, _, err := seedTracking(ctx, poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	if _, err := newTestService().TrackReadingSession(ctx, userID, articleID, "feed", "READ_COMPLETE", 100, 30, 8, nil, nil); err != nil {
		t.Fatalf("session: %v", err)
	}

	r := newRouter(t, userID)
	if rr := getT(t, r, "/v1/me/reading-history?days=14"); rr.Code != http.StatusOK {
		t.Fatalf("reading-history code = %d, body=%s", rr.Code, rr.Body.String())
	}
	// days invalide → repli 14 par défaut (200).
	if rr := getT(t, r, "/v1/me/reading-history?days=abc"); rr.Code != http.StatusOK {
		t.Fatalf("reading-history bad days code = %d", rr.Code)
	}
	// Anonyme → 401.
	ra := newRouter(t, "")
	if rr := getT(t, ra, "/v1/me/reading-history"); rr.Code != http.StatusUnauthorized {
		t.Fatalf("reading-history anon code = %d, attendu 401", rr.Code)
	}
}

func strconvQ(s string) string { return "\"" + s + "\"" }