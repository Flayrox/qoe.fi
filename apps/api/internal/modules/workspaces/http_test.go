package workspaces

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/qoefi/api/internal/middleware"
	"github.com/qoefi/api/internal/testutil"
)

// Tests HTTP du handler /v1/workspaces/active.

func newHTTPRouter() http.Handler {
	h := NewHandler(NewService(poolTest))
	r := chi.NewRouter()
	h.Register(r)
	return r
}

func TestGetActive_HTTP(t *testing.T) {
	mfx, err := testutil.SeedMedia(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed media: %v", err)
	}
	r := newHTTPRouter()

	get := func(userID, query string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodGet, "/v1/workspaces/active"+query, nil)
		if userID != "" {
			ctx := context.WithValue(req.Context(), middleware.UserIDKey, userID)
			req = req.WithContext(ctx)
		}
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		return w
	}

	// Anonyme → 401.
	if w := get("", ""); w.Code != http.StatusUnauthorized {
		t.Fatalf("anonyme = %d, attendu 401", w.Code)
	}

	// Membre média avec mediaId → workspace MEDIA.
	w := get(mfx.OwnerID, "?mediaId=media_001")
	if w.Code != http.StatusOK {
		t.Fatalf("media = %d %s", w.Code, w.Body.String())
	}
	var ws struct {
		Type          string `json:"type"`
		PublicationID string `json:"publicationId"`
		Name          string `json:"name"`
		MediaRole     string `json:"mediaRole"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &ws); err != nil {
		t.Fatalf("json: %v (%s)", err, w.Body.String())
	}
	if ws.Type != "MEDIA" || ws.MediaRole != "owner" || ws.Name != "Média Quotidien" {
		t.Fatalf("workspace = %+v", ws)
	}
	if !strings.HasPrefix(ws.PublicationID, "pub_media") {
		t.Fatalf("publicationId = %q", ws.PublicationID)
	}

	// Sans mediaId → fallback personnel fictif (users seedés sans publication).
	w = get(mfx.ViewerID, "")
	if w.Code != http.StatusOK {
		t.Fatalf("fallback = %d %s", w.Code, w.Body.String())
	}
	var personal struct {
		Type string `json:"type"`
		Slug string `json:"slug"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &personal); err != nil {
		t.Fatalf("json: %v", err)
	}
	if personal.Type != "PERSONAL" || personal.Slug != "personal" {
		t.Fatalf("fallback = %+v", personal)
	}
}
