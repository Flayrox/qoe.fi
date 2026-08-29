package starterpacks

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

func doSP(t *testing.T, svc *Service, method, path, userID string, body any) *httptest.ResponseRecorder {
	t.Helper()
	h := NewHandler(svc)
	r := chi.NewRouter()
	h.RegisterPublic(r)
	h.RegisterProtected(r)
	var buf bytes.Buffer
	if body != nil {
		_ = json.NewEncoder(&buf).Encode(body)
	}
	req := httptest.NewRequest(method, path, &buf)
	req.Header.Set("Content-Type", "application/json")
	if userID != "" {
		req = req.WithContext(context.WithValue(req.Context(), middleware.UserIDKey, userID))
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func TestSPList(t *testing.T) {
	authorID, _ := seedStarterPacks(t)
	svc := NewService(poolTest)
	ctx := context.Background()
	if _, err := svc.Create(ctx, authorID, "Pack List", sp("d"), nil, nil); err != nil {
		t.Fatalf("create: %v", err)
	}
	// Limite par défaut, borne haute et offset invalide.
	for _, q := range []string{"", "?limit=200", "?limit=5&offset=-3", "?limit=abc"} {
		w := doSP(t, svc, http.MethodGet, "/v1/starter-packs"+q, "", nil)
		if w.Code != http.StatusOK {
			t.Fatalf("%s: code = %d", q, w.Code)
		}
		if !bytes.Contains(w.Body.Bytes(), []byte("starterPacks")) {
			t.Fatalf("%s: body = %s", q, w.Body.String())
		}
	}
}

func TestSPGet(t *testing.T) {
	authorID, _ := seedStarterPacks(t)
	svc := NewService(poolTest)
	ctx := context.Background()
	pack, err := svc.Create(ctx, authorID, "Pack Get", nil, nil, nil)
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	w := doSP(t, svc, http.MethodGet, "/v1/starter-packs/"+pack.ID, "", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("code = %d, attendu 200", w.Code)
	}
	w2 := doSP(t, svc, http.MethodGet, "/v1/starter-packs/introuvable", "", nil)
	if w2.Code != http.StatusNotFound {
		t.Fatalf("code = %d, attendu 404", w2.Code)
	}
}

func TestSPCreate(t *testing.T) {
	authorID, _ := seedStarterPacks(t)
	svc := NewService(poolTest)

	// JSON vide → 400.
	w := doSP(t, svc, http.MethodPost, "/v1/starter-packs", "", nil)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("code = %d, attendu 400 (JSON vide)", w.Code)
	}
	w2 := doSP(t, svc, http.MethodPost, "/v1/starter-packs", authorID, map[string]any{"title": ""})
	if w2.Code != http.StatusBadRequest {
		t.Fatalf("code = %d, attendu 400 (titre requis)", w2.Code)
	}
	w3 := doSP(t, svc, http.MethodPost, "/v1/starter-packs", authorID, map[string]any{
		"title": "Pack Create", "userIds": []string{authorID},
	})
	if w3.Code != http.StatusCreated {
		t.Fatalf("code = %d, attendu 201 (body %s)", w3.Code, w3.Body.String())
	}
}

func TestSPFollowAll(t *testing.T) {
	authorID, memberID := seedStarterPacks(t)
	svc := NewService(poolTest)
	ctx := context.Background()
	pack, err := svc.Create(ctx, authorID, "Pack Follow", nil, nil, []string{memberID})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	w := doSP(t, svc, http.MethodPost, "/v1/starter-packs/"+pack.ID+"/follow-all", memberID, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("code = %d, attendu 200 (body %s)", w.Code, w.Body.String())
	}
	var out struct {
		FollowedCount int `json:"followedCount"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil || out.FollowedCount != 1 {
		t.Fatalf("followedCount = %d (err=%v), attendu 1", out.FollowedCount, err)
	}
	// Pack inconnu → 404.
	w2 := doSP(t, svc, http.MethodPost, "/v1/starter-packs/introuvable/follow-all", memberID, nil)
	if w2.Code != http.StatusNotFound {
		t.Fatalf("code = %d, attendu 404", w2.Code)
	}
}
