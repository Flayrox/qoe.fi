package imports

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

func doImport(t *testing.T, svc *Service, userID string, body any) *httptest.ResponseRecorder {
	t.Helper()
	h := NewHandler(svc)
	r := chi.NewRouter()
	h.Register(r)
	var buf bytes.Buffer
	if body != nil {
		_ = json.NewEncoder(&buf).Encode(body)
	}
	req := httptest.NewRequest(http.MethodPost, "/v1/import/articles", &buf)
	req.Header.Set("Content-Type", "application/json")
	if userID != "" {
		req = req.WithContext(context.WithValue(req.Context(), middleware.UserIDKey, userID))
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func TestImportArticlesUnauthorized(t *testing.T) {
	w := doImport(t, NewService(poolTest), "", map[string]any{})
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("code = %d, attendu 401", w.Code)
	}
}

func TestImportArticlesBadJSON(t *testing.T) {
	ctx := context.Background()
	seedImport(t, ctx)
	h := NewHandler(NewService(poolTest))
	r := chi.NewRouter()
	h.Register(r)
	req := httptest.NewRequest(http.MethodPost, "/v1/import/articles", bytes.NewBufferString("{pas du json"))
	req = req.WithContext(context.WithValue(req.Context(), middleware.UserIDKey, importOwnerID))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("code = %d, attendu 400 (JSON invalide)", w.Code)
	}
}

func TestImportArticlesMissingFields(t *testing.T) {
	ctx := context.Background()
	seedImport(t, ctx)
	w := doImport(t, NewService(poolTest), importOwnerID, map[string]any{"publicationId": ""})
	if w.Code != http.StatusBadRequest {
		t.Fatalf("code = %d, attendu 400 (champs requis)", w.Code)
	}
	w2 := doImport(t, NewService(poolTest), importOwnerID, map[string]any{
		"publicationId": importPubPerso, "articles": []any{},
	})
	if w2.Code != http.StatusBadRequest {
		t.Fatalf("code = %d, attendu 400 (articles vides)", w2.Code)
	}
}

func TestImportArticlesForbidden(t *testing.T) {
	ctx := context.Background()
	seedImport(t, ctx)
	// L'étranger n'a aucun accès à la publication personnelle du owner.
	w := doImport(t, NewService(poolTest), importStranger, map[string]any{
		"publicationId": importPubPerso,
		"articles": []any{map[string]any{
			"title": "Titre", "slug": "titre", "content": "<p>x</p>", "readingTime": 2,
		}},
	})
	if w.Code != http.StatusForbidden {
		t.Fatalf("code = %d, attendu 403", w.Code)
	}
}

func TestImportArticlesSuccess(t *testing.T) {
	ctx := context.Background()
	seedImport(t, ctx)
	// Le owner importe dans sa publication personnelle.
	w := doImport(t, NewService(poolTest), importOwnerID, map[string]any{
		"publicationId": importPubPerso,
		"articles": []any{
			map[string]any{"title": "A", "slug": "article-a", "content": "<p>A</p>", "readingTime": 2},
			map[string]any{"title": "B", "slug": "article-b", "content": "<p>B</p>", "readingTime": 3},
		},
	})
	if w.Code != http.StatusCreated {
		t.Fatalf("code = %d, attendu 201 (body %s)", w.Code, w.Body.String())
	}
	var out struct {
		ImportedCount int `json:"importedCount"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
		t.Fatalf("json: %v", err)
	}
	if out.ImportedCount != 2 {
		t.Fatalf("importedCount = %d, attendu 2", out.ImportedCount)
	}

	// Re-import → dédup, 0 créé.
	w2 := doImport(t, NewService(poolTest), importOwnerID, map[string]any{
		"publicationId": importPubPerso,
		"articles":      []any{map[string]any{"title": "A", "slug": "article-a", "content": "<p>A</p>", "readingTime": 2}},
	})
	if w2.Code != http.StatusCreated {
		t.Fatalf("code = %d, attendu 201", w2.Code)
	}
	if err := json.Unmarshal(w2.Body.Bytes(), &out); err != nil || out.ImportedCount != 0 {
		t.Fatalf("importedCount = %d (err=%v), attendu 0 (dédup)", out.ImportedCount, err)
	}

	// Le owner importe aussi dans le média (rôle owner membre).
	w3 := doImport(t, NewService(poolTest), importOwnerID, map[string]any{
		"publicationId": importPubMedia,
		"articles":      []any{map[string]any{"title": "M", "slug": "article-m", "content": "<p>M</p>", "readingTime": 1}},
	})
	if w3.Code != http.StatusCreated {
		t.Fatalf("code média = %d, attendu 201", w3.Code)
	}
}
