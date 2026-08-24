package users

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

func newRouter() http.Handler {
	r := chi.NewRouter()
	h := NewHandler(NewService(poolTest))
	h.Register(r)
	h.RegisterPublic(r)
	return r
}

func do(r http.Handler, method, path, userID, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	if userID != "" {
		ctx := context.WithValue(req.Context(), middleware.UserIDKey, userID)
		req = req.WithContext(ctx)
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

// ─── GET /v1/me ────────────────────────────────────────────────────────

func TestMe_AuthRequiredAndProfile(t *testing.T) {
	fx, err := testutil.SeedPosts(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	r := newRouter()

	// Sans session.
	if w := do(r, http.MethodGet, "/v1/me", "", ""); w.Code != http.StatusUnauthorized {
		t.Fatalf("anonyme = %d, attendu 401", w.Code)
	}

	// Session valide : le profil complet est renvoyé.
	w := do(r, http.MethodGet, "/v1/me", fx.AuthorID, "")
	if w.Code != http.StatusOK {
		t.Fatalf("authentifié = %d %s", w.Code, w.Body.String())
	}
	// Contrat : ReaderProfile au niveau racine.
	var res struct {
		ID       string  `json:"id"`
		Username *string `json:"username"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &res); err != nil {
		t.Fatalf("json: %v (%s)", err, w.Body.String())
	}
	if res.ID != fx.AuthorID || res.Username == nil || *res.Username != "alice" {
		t.Fatalf("profil = %+v", res)
	}

	// Utilisateur inexistant (session mais pas de ligne) → 404.
	if w := do(r, http.MethodGet, "/v1/me",
		"00000000-0000-0000-0000-000000000999", ""); w.Code != http.StatusNotFound {
		t.Fatalf("inconnu = %d, attendu 404", w.Code)
	}
}

// ─── PATCH /v1/me/profile ──────────────────────────────────────────────

func TestHTTP_UpdateProfile(t *testing.T) {
	fx, err := testutil.SeedPosts(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	r := newRouter()

	w := do(r, http.MethodPatch, "/v1/me/profile", fx.AuthorID,
		`{"name":"Alice A.","onboardingText":"Lectrice curieuse","pronouns":"elle"}`)
	if w.Code != http.StatusOK {
		t.Fatalf("patch = %d %s", w.Code, w.Body.String())
	}
	var name, text string
	if err := poolTest.QueryRow(context.Background(),
		`SELECT name, "onboardingText" FROM "User" WHERE id = $1`,
		fx.AuthorID).Scan(&name, &text); err != nil {
		t.Fatalf("reload: %v", err)
	}
	if name != "Alice A." || text != "Lectrice curieuse" {
		t.Fatalf("patch non persisté : name=%q text=%q", name, text)
	}

	// JSON invalide → 400.
	if w = do(r, http.MethodPatch, "/v1/me/profile", fx.AuthorID, "{oops"); w.Code != http.StatusBadRequest {
		t.Fatalf("json invalide = %d, attendu 400", w.Code)
	}
	// Anonyme → 401.
	if w = do(r, http.MethodPatch, "/v1/me/profile", "", `{}`); w.Code != http.StatusUnauthorized {
		t.Fatalf("anonyme = %d, attendu 401", w.Code)
	}
}

// ─── GET /v1/users/search ──────────────────────────────────────────────

func TestHTTP_Search(t *testing.T) {
	if _, err := testutil.SeedPosts(context.Background(), poolTest); err != nil {
		t.Fatalf("seed: %v", err)
	}
	r := newRouter()

	// Requête trop courte → tableau vide.
	w := do(r, http.MethodGet, "/v1/users/search?q=a", "", "")
	if w.Code != http.StatusOK || strings.TrimSpace(w.Body.String()) == "null" {
		t.Fatalf("q court = %d %s", w.Code, w.Body.String())
	}

	// Recherche par username.
	w = do(r, http.MethodGet, "/v1/users/search?q=ali", "", "")
	if w.Code != http.StatusOK {
		t.Fatalf("search = %d %s", w.Code, w.Body.String())
	}
	var results []struct {
		Username string `json:"username"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &results); err != nil {
		t.Fatalf("json: %v (%s)", err, w.Body.String())
	}
	found := false
	for _, u := range results {
		if u.Username == "alice" {
			found = true
		}
	}
	if !found {
		t.Fatalf("alice absente des résultats : %s", w.Body.String())
	}
}

// ─── POST /v1/me/onboarding-complete ──────────────────────────────────

func TestHTTP_OnboardingComplete(t *testing.T) {
	fx, err := testutil.SeedPosts(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	r := newRouter()

	body := `{"interests":["tech"],"mutedWords":["spoiler"],"onboardingText":"Hello"}`
	w := do(r, http.MethodPost, "/v1/me/onboarding-complete", fx.ViewerID, body)
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"success":true`) {
		t.Fatalf("complete = %d %s", w.Code, w.Body.String())
	}

	// hasCompletedOnboarding persisté + mot masqué enregistré.
	var done bool
	if err := poolTest.QueryRow(context.Background(),
		`SELECT "hasCompletedOnboarding" FROM "User" WHERE id = $1`,
		fx.ViewerID).Scan(&done); err != nil {
		t.Fatalf("reload: %v", err)
	}
	if !done {
		t.Fatal("hasCompletedOnboarding non persisté")
	}
	var muted int
	if err := poolTest.QueryRow(context.Background(),
		`SELECT COUNT(*) FROM "MutedWord" WHERE "userId" = $1 AND word = 'spoiler'`,
		fx.ViewerID).Scan(&muted); err != nil {
		t.Fatalf("muted count: %v", err)
	}
	if muted != 1 {
		t.Fatal("mot masqué non enregistré par l'onboarding")
	}
}

// ─── GET /v1/me/data-export (RGPD) ────────────────────────────────────

func TestHTTP_DataExport(t *testing.T) {
	fx, err := testutil.SeedPosts(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	r := newRouter()

	w := do(r, http.MethodGet, "/v1/me/data-export", fx.AuthorID, "")
	if w.Code != http.StatusOK {
		t.Fatalf("export = %d %s", w.Code, w.Body.String())
	}
	var data map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &data); err != nil {
		t.Fatalf("json export: %v (%s)", err, w.Body.String())
	}
	// L'export doit contenir l'identité de l'utilisateur.
	blob, _ := json.Marshal(data)
	if !strings.Contains(string(blob), "alice@test.dev") && !strings.Contains(string(blob), "alice") {
		t.Fatalf("export sans identité : %s", string(blob))
	}

	if w = do(r, http.MethodGet, "/v1/me/data-export", "", ""); w.Code != http.StatusUnauthorized {
		t.Fatalf("export anonyme = %d, attendu 401", w.Code)
	}
}

// ─── POST /v1/me/muted-words ──────────────────────────────────────────

func TestHTTP_ToggleMuteWord(t *testing.T) {
	fx, err := testutil.SeedPosts(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	r := newRouter()

	w := do(r, http.MethodPost, "/v1/me/muted-words", fx.AuthorID, `{"word":"spoiler"}`)
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"muted":true`) {
		t.Fatalf("mute on = %d %s", w.Code, w.Body.String())
	}
	// Toggle off.
	w = do(r, http.MethodPost, "/v1/me/muted-words", fx.AuthorID, `{"word":"spoiler"}`)
	if !strings.Contains(w.Body.String(), `"muted":false`) {
		t.Fatalf("mute off = %d %s", w.Code, w.Body.String())
	}
	// Mot vide → 400.
	if w = do(r, http.MethodPost, "/v1/me/muted-words", fx.AuthorID, `{"word":""}`); w.Code != http.StatusBadRequest {
		t.Fatalf("mot vide = %d, attendu 400", w.Code)
	}
}

// ─── Publications & wallet ─────────────────────────────────────────────

func TestHTTP_MyPublicationAndMedia(t *testing.T) {
	fx, err := testutil.SeedPosts(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	r := newRouter()

	w := do(r, http.MethodGet, "/v1/me/publication", fx.AuthorID, "")
	if w.Code != http.StatusOK {
		t.Fatalf("my publication = %d %s", w.Code, w.Body.String())
	}

	w = do(r, http.MethodGet, "/v1/me/media/media_inconnu", fx.AuthorID, "")
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"publicationId":""`) {
		t.Fatalf("media inconnu = %d %s, attendu 200 publicationId vide", w.Code, w.Body.String())
	}

	if w = do(r, http.MethodGet, "/v1/me/publication", "", ""); w.Code != http.StatusUnauthorized {
		t.Fatalf("anonyme = %d, attendu 401", w.Code)
	}
}

func TestHTTP_WalletUnlock_Validation(t *testing.T) {
	fx, err := testutil.SeedPosts(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	r := newRouter()

	w := do(r, http.MethodPost, "/v1/me/wallet/unlock", fx.AuthorID, `{}`)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("creatorId manquant = %d, attendu 400", w.Code)
	}

	w = do(r, http.MethodPost, "/v1/me/wallet/unlock", fx.AuthorID, "{oops")
	if w.Code != http.StatusBadRequest {
		t.Fatalf("json invalide = %d, attendu 400", w.Code)
	}

	w = do(r, http.MethodPost, "/v1/me/wallet/unlock", "", `{"creatorId":"x"}`)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("anonyme = %d, attendu 401", w.Code)
	}

	w = do(r, http.MethodPost, "/v1/me/wallet/unlock", fx.ViewerID,
		`{"creatorId":"`+fx.AuthorID+`","costCents":200}`)
	if w.Code >= 500 {
		t.Fatalf("unlock nominal = %d %s, pas de 5xx attendu", w.Code, w.Body.String())
	}
}
