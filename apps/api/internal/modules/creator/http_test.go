package creator

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/qoefi/api/internal/middleware"
)

// Ces tests passent par les vrais handlers HTTP (et non h.q direct) pour
// couvrir le routage, le parsing et les contrats de réponse.

func authedRequest(h http.Handler, method, path, userID string, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	if userID != "" {
		ctx := context.WithValue(req.Context(), middleware.UserIDKey, userID)
		req = req.WithContext(ctx)
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)
	return w
}

// Routeur combiné : routes publiques + protégées, comme le serveur réel.
func newFullRouter() *chi.Mux {
	r := chi.NewRouter()
	h := newTestHandler()
	h.RegisterPublic(r)
	h.RegisterProtected(r, func(string) func(http.Handler) http.Handler {
		return func(next http.Handler) http.Handler { return next }
	})
	return r
}

// ─── GET /v1/users/{username} (profil public) ──────────────────────────

func TestUserByUsername_PublicProfile(t *testing.T) {
	alicePubID, _, _, _ := seedFollows(t)
	r := newFullRouter()

	w := authedRequest(r, http.MethodGet, "/v1/users/alice", "", "")
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d body=%s, attendu 200", w.Code, w.Body.String())
	}
	var res struct {
		Data struct {
			ID          string `json:"id"`
			Slug        string `json:"slug"`
			Name        string `json:"name"`
			IsFollowing bool   `json:"isFollowing"`
			Count       struct {
				Followers int `json:"followers"`
			} `json:"_count"`
		} `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &res); err != nil {
		t.Fatalf("json: %v (%s)", err, w.Body.String())
	}
	if res.Data.ID != alicePubID {
		t.Fatalf("data.id = %q, attendu %q", res.Data.ID, alicePubID)
	}
	if res.Data.Count.Followers != 1 {
		t.Fatalf("_count.followers = %d, attendu 1 (bob suit alice)", res.Data.Count.Followers)
	}
}

func TestUserByUsername_Unknown(t *testing.T) {
	r := newFullRouter()
	w := authedRequest(r, http.MethodGet, "/v1/users/inconnu-xyz", "", "")
	if w.Code != http.StatusNotFound {
		t.Fatalf("status = %d, attendu 404", w.Code)
	}
}

func TestUserByUsername_ViewerIsFollowingFlag(t *testing.T) {
	_, _, _, bobUserID := seedFollows(t)
	r := newFullRouter()

	// Bob (connecté) regarde alice : isFollowing doit être true.
	w := authedRequest(r, http.MethodGet, "/v1/users/alice", bobUserID, "")
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d body=%s", w.Code, w.Body.String())
	}
	var res struct {
		Data struct {
			IsFollowing bool `json:"isFollowing"`
		} `json:"data"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &res)
	if !res.Data.IsFollowing {
		t.Fatal("isFollowing = false, attendu true (bob suit alice)")
	}
}

// ─── POST /v1/users/{id}/follow (toggle) ───────────────────────────────

func TestFollowToggle_OnThenOff(t *testing.T) {
	alicePubID, _, _, _ := seedFollows(t)
	r := chi.NewRouter()
	newTestHandler().RegisterProtected(r, func(string) func(http.Handler) http.Handler {
		return func(next http.Handler) http.Handler { return next }
	})

	// Un viewer fraîchement créé suit alice.
	viewerID := "00000000-0000-0000-0000-000000000200"
	if _, err := poolTest.Exec(context.Background(),
		`INSERT INTO "User" (id, email, username, name, role, "createdAt", "updatedAt")
		 VALUES ($1, 'viewer2@test.dev', 'viewer2', 'V2', 'user', now(), now())`,
		viewerID); err != nil {
		t.Fatalf("seed viewer: %v", err)
	}

	w := authedRequest(r, http.MethodPost, "/v1/users/"+alicePubID+"/follow", viewerID, "")
	if w.Code != http.StatusOK {
		t.Fatalf("follow on = %d %s", w.Code, w.Body.String())
	}

	// Vérifie l'état en base.
	var n int
	if err := poolTest.QueryRow(context.Background(),
		`SELECT COUNT(*) FROM "Follows" WHERE "readerId" = $1 AND "publicationId" = $2`,
		viewerID, alicePubID).Scan(&n); err != nil {
		t.Fatalf("count: %v", err)
	}
	if n != 1 {
		t.Fatalf("follow absent après toggle on")
	}

	// Toggle off.
	w = authedRequest(r, http.MethodPost, "/v1/users/"+alicePubID+"/follow", viewerID, "")
	if w.Code != http.StatusOK {
		t.Fatalf("follow off = %d %s", w.Code, w.Body.String())
	}
	if err := poolTest.QueryRow(context.Background(),
		`SELECT COUNT(*) FROM "Follows" WHERE "readerId" = $1 AND "publicationId" = $2`,
		viewerID, alicePubID).Scan(&n); err != nil {
		t.Fatalf("count: %v", err)
	}
	if n != 0 {
		t.Fatalf("follow toujours présent après toggle off")
	}
}

func TestFollowToggle_Unauthenticated(t *testing.T) {
	alicePubID, _, _, _ := seedFollows(t)
	r := chi.NewRouter()
	newTestHandler().RegisterProtected(r, func(string) func(http.Handler) http.Handler {
		return func(next http.Handler) http.Handler { return next }
	})
	w := authedRequest(r, http.MethodPost, "/v1/users/"+alicePubID+"/follow", "", "")
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("sans session = %d, attendu 401", w.Code)
	}
}

// ─── Catégories : autorisation par propriétaire OU membre média ───────

func TestCategories_OwnerCanCreateAndList(t *testing.T) {
	alicePubID, aliceUserID, _, _ := seedFollows(t)
	r := chi.NewRouter()
	newTestHandler().RegisterProtected(r, func(string) func(http.Handler) http.Handler {
		return func(next http.Handler) http.Handler { return next }
	})

	body := `{"publicationId":"` + alicePubID + `","name":"Politique","slug":"politique"}`
	w := authedRequest(r, http.MethodPost, "/v1/categories", aliceUserID, body)
	if w.Code != http.StatusOK && w.Code != http.StatusCreated {
		t.Fatalf("create = %d %s", w.Code, w.Body.String())
	}

	// La catégorie existe en base.
	var n int
	if err := poolTest.QueryRow(context.Background(),
		`SELECT COUNT(*) FROM "Category" WHERE "publicationId" = $1 AND slug = 'politique'`,
		alicePubID).Scan(&n); err != nil {
		t.Fatalf("count: %v", err)
	}
	if n != 1 {
		t.Fatal("catégorie non créée")
	}

	w = authedRequest(r, http.MethodGet, "/v1/categories?publicationId="+alicePubID, aliceUserID, "")
	if w.Code != http.StatusOK {
		t.Fatalf("list = %d %s", w.Code, w.Body.String())
	}
	if !strings.Contains(w.Body.String(), "politique") {
		t.Fatalf("liste sans la catégorie : %s", w.Body.String())
	}
}

func TestCategories_NonOwnerForbidden(t *testing.T) {
	alicePubID, _, bobUserID, _ := seedFollows(t)
	r := chi.NewRouter()
	newTestHandler().RegisterProtected(r, func(string) func(http.Handler) http.Handler {
		return func(next http.Handler) http.Handler { return next }
	})

	// Bob n'est ni owner d'alice ni membre média : interdit.
	body := `{"publicationId":"` + alicePubID + `","name":"X","slug":"x"}`
	w := authedRequest(r, http.MethodPost, "/v1/categories", bobUserID, body)
	if w.Code != http.StatusForbidden {
		t.Fatalf("create par non-owner = %d %s, attendu 403", w.Code, w.Body.String())
	}
}
