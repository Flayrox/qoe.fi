package main

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/qoefi/api/internal/testutil"
)

// TestP0ProtectedRoutesRequireAuthentication verifies the auth boundary for
// every protected domain mounted by the production router. The requests stop
// in middleware, so no fixture data is required for this matrix.
func TestP0ProtectedRoutesRequireAuthentication(t *testing.T) {
	r := testRouter(t)

	tests := []struct {
		name   string
		method string
		path   string
	}{
		{"posts create", http.MethodPost, "/v1/posts"},
		{"feed following", http.MethodGet, "/v1/feed/"},
		{"articles list", http.MethodGet, "/v1/articles?publicationId=missing"},
		{"articles create", http.MethodPost, "/v1/articles"},
		{"notifications list", http.MethodGet, "/v1/notifications/"},
		{"notifications unread", http.MethodGet, "/v1/notifications/unread-count"},
		{"highlights bookmarks", http.MethodGet, "/v1/bookmarks"},
		{"analytics audience", http.MethodGet, "/v1/analytics/audience?publicationId=missing"},
		{"creator me", http.MethodGet, "/v1/users/me"},
		{"creator categories", http.MethodGet, "/v1/categories"},
		{"settings publication", http.MethodGet, "/v1/settings/publication?publicationId=missing"},
		{"settings preferences", http.MethodGet, "/v1/settings/preferences"},
		{"workspaces active", http.MethodGet, "/v1/workspaces/active"},
		{"media workspaces", http.MethodGet, "/v1/media/workspaces"},
		{"imports articles", http.MethodPost, "/v1/import/articles"},
		{"collaborations list", http.MethodGet, "/v1/collaborations/"},
		{"starter packs create", http.MethodPost, "/v1/starter-packs"},
		{"media assets register", http.MethodPost, "/v1/media-assets"},
		{"devtools data", http.MethodGet, "/v1/devtools/data"},
		{"admin dashboard", http.MethodGet, "/v1/admin/dashboard"},
		{"reader profile", http.MethodGet, "/v1/me"},
		{"reader billing", http.MethodGet, "/v1/me/billing"},
		{"reader history", http.MethodGet, "/v1/me/reading-history"},
		{"reader sync", http.MethodPost, "/v1/me/sync"},
		{"oauth authorize", http.MethodGet, "/v1/oauth/authorize"},
		{"webhooks deliveries", http.MethodGet, "/v1/webhooks"},
		{"creator api key analytics", http.MethodGet, "/v1/analytics/stats"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w, body := doContractReq(t, r, tt.method, tt.path, "", nil)
			if w.Code != http.StatusUnauthorized {
				t.Fatalf("%s %s = %d, body=%s; expected 401", tt.method, tt.path, w.Code, w.Body.String())
			}
			assertJSONError(t, w, body)
		})
	}
}

func TestP0PublicValidationContracts(t *testing.T) {
	r := testRouter(t)

	tests := []struct {
		name       string
		method     string
		path       string
		body       any
		statusCode int
	}{
		{"search articles empty query", http.MethodGet, "/search/articles", nil, http.StatusOK},
		{"search semantic empty query", http.MethodGet, "/search/semantic", nil, http.StatusOK},
		{"search thoughts empty query", http.MethodGet, "/search/thoughts", nil, http.StatusOK},
		{"subscribe invalid email", http.MethodPost, "/v1/home/subscribe", map[string]any{
			"email":         "invalid",
			"publicationId": "missing",
		}, http.StatusBadRequest},
		{"subscribe invalid json", http.MethodPost, "/v1/home/subscribe", rawJSONBody("not-json"), http.StatusBadRequest},
		{"feed hydrate invalid json", http.MethodPost, "/v1/feed/hydrate", rawJSONBody("not-json"), http.StatusBadRequest},
		{"article missing publication", http.MethodGet, "/v1/articles/missing?publicationId=missing", nil, http.StatusNotFound},
		{"publication missing domain", http.MethodGet, "/v1/publications/by-domain/missing-domain", nil, http.StatusNotFound},
		{"starter pack missing", http.MethodGet, "/v1/starter-packs/missing", nil, http.StatusNotFound},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w, body := doContractReq(t, r, tt.method, tt.path, "", tt.body)
			if w.Code != tt.statusCode {
				t.Fatalf("%s %s = %d, body=%s; expected %d", tt.method, tt.path, w.Code, w.Body.String(), tt.statusCode)
			}
			if tt.statusCode >= 400 {
				assertJSONError(t, w, body)
			}
		})
	}
}

func TestP0SeededPublicArticleContract(t *testing.T) {
	fx, err := testutil.SeedArticles(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	r := testRouter(t)

	w, body := doReq(t, r, http.MethodGet, "/v1/articles/recette-pates?publicationId="+fx.PublicationID, "", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("public article = %d, body=%s", w.Code, w.Body.String())
	}
	if body["slug"] != "recette-pates" {
		t.Fatalf("slug=%v, body=%s", body["slug"], w.Body.String())
	}
	if body["title"] != "Recette de pâtes" {
		t.Fatalf("title=%v, body=%s", body["title"], w.Body.String())
	}

	premium, premiumBody := doReq(t, r, http.MethodGet, "/v1/articles/article-payant?publicationId="+fx.PublicationID, "", nil)
	if premium.Code != http.StatusOK {
		t.Fatalf("premium article = %d, body=%s", premium.Code, premium.Body.String())
	}
	if premiumBody["isTruncated"] != true {
		t.Fatalf("premium isTruncated=%v, body=%s", premiumBody["isTruncated"], premium.Body.String())
	}
	if premiumBody["content"] == "<p>Intro gratuite</p><!--paywall--><p>Contenu PAYANT SENSIBLE</p>" {
		t.Fatal("premium content was returned without paywall truncation")
	}
}

func TestP0SeededTenantPublicationContract(t *testing.T) {
	fx, err := testutil.SeedSettings(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed settings: %v", err)
	}
	if _, err := poolTest.Exec(context.Background(),
		`UPDATE "Publication" SET subdomain = 'owner-blog' WHERE id = $1`, fx.PubID); err != nil {
		t.Fatalf("configure tenant domain: %v", err)
	}
	r := testRouter(t)

	w, body := doReq(t, r, http.MethodGet, "/v1/publications/by-domain/owner-blog", "", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("publication = %d, body=%s", w.Code, w.Body.String())
	}
	if body["slug"] != "owner-blog" {
		t.Fatalf("slug=%v, body=%s", body["slug"], w.Body.String())
	}
	if body["id"] != fx.PubID {
		t.Fatalf("id=%v, expected %s; body=%s", body["id"], fx.PubID, w.Body.String())
	}
}

func assertJSONError(t *testing.T, w *httptest.ResponseRecorder, body map[string]any) {
	t.Helper()
	if body == nil {
		t.Fatalf("error response is not JSON: %s", w.Body.String())
	}
	if _, ok := body["error"].(string); !ok {
		t.Fatalf("error response has no string error: %s", w.Body.String())
	}
	if contentType := w.Header().Get("Content-Type"); contentType == "" {
		t.Fatalf("error response has no Content-Type")
	}
}

type rawJSONBody string

func doContractReq(t *testing.T, r http.Handler, method, path, token string, body any) (*httptest.ResponseRecorder, map[string]any) {
	t.Helper()
	if raw, ok := body.(rawJSONBody); ok {
		req := httptest.NewRequest(method, path, bytes.NewBufferString(string(raw)))
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
	return doReq(t, r, method, path, token, body)
}
