package settings

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// Couvre les handlers de settings restés à 0% (routes protégées JWT) via le
// routeur chi réel + service réel : publication, préférences, suppression
// de compte, subdomain, api-application.
func TestHandlers_ZeroCoverage_Routes(t *testing.T) {
	fx := seed(t)
	r := newTestRouter()
	tok := testJWT(fx.OwnerID)

	// GET /v1/settings/publication?publicationId=<pub de l'owner>
	path := "/v1/settings/publication?publicationId=" + fx.PubID
	if w, _ := doJSON(t, r, http.MethodGet, path, tok, nil); w.Code != http.StatusOK {
		t.Fatalf("publication → %d (%s), attendu 200", w.Code, w.Body.String())
	}

	// GET /v1/settings/preferences
	if w, _ := doJSON(t, r, http.MethodGet, "/v1/settings/preferences", tok, nil); w.Code != http.StatusOK {
		t.Fatalf("preferences GET → %d (%s), attendu 200", w.Code, w.Body.String())
	}

	// PATCH /v1/settings/preferences
	if w, _ := doJSON(t, r, http.MethodPatch, "/v1/settings/preferences", tok,
		map[string]any{"notifications": map[string]any{"articlePublished": false}},
	); w.Code != http.StatusOK {
		t.Fatalf("preferences PATCH → %d (%s), attendu 200", w.Code, w.Body.String())
	}

	// GET /v1/me/account-deletion-request (aucune demande → 200 avec requête vide)
	if w, _ := doJSON(t, r, http.MethodGet, "/v1/me/account-deletion-request", tok, nil); w.Code != http.StatusOK {
		t.Fatalf("deletion GET → %d (%s), attendu 200", w.Code, w.Body.String())
	}

	// POST /v1/me/account-deletion-request (crée)
	if w, _ := doJSON(t, r, http.MethodPost, "/v1/me/account-deletion-request", tok, nil); w.Code != http.StatusOK {
		t.Fatalf("deletion POST → %d (%s), attendu 200", w.Code, w.Body.String())
	}

	// DELETE /v1/me/account-deletion-request (annule)
	if w, _ := doJSON(t, r, http.MethodDelete, "/v1/me/account-deletion-request", tok, nil); w.Code != http.StatusOK {
		t.Fatalf("deletion DELETE → %d (%s), attendu 200", w.Code, w.Body.String())
	}
}

func TestHandlers_UpdatePreferences_BadJSON(t *testing.T) {
	fx := seed(t)
	r := newTestRouter()
	tok := testJWT(fx.OwnerID)

	req := httptest.NewRequest(http.MethodPatch, "/v1/settings/preferences", strings.NewReader("{nope"))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+tok)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("JSON invalide → %d (%s), attendu 400", w.Code, w.Body.String())
	}
}

func TestTextFromAny(t *testing.T) {
	// nil → pgtype.Text{} vide, pas d'erreur.
	txt, err := textFromAny(nil)
	if err != nil {
		t.Fatalf("nil: err=%v", err)
	}
	if txt.Valid {
		t.Fatalf("nil doit être invalid")
	}
	// string → valid.
	txt, err = textFromAny("abc")
	if err != nil || !txt.Valid || txt.String != "abc" {
		t.Fatalf("string: %+v err=%v", txt, err)
	}
	// non-string → erreur.
	if _, err := textFromAny(3); err == nil {
		t.Fatal("int doit être une erreur")
	}
}

func TestHandlers_UpdateProfile_BadField(t *testing.T) {
	fx := seed(t)
	r := newTestRouter()
	tok := testJWT(fx.OwnerID)

	// allowIndexing non-bool → erreur du service → 400.
	if w, _ := doJSON(t, r, http.MethodPatch, "/v1/settings/profile", tok,
		map[string]any{"allowIndexing": "pas-un-bool"}); w.Code != http.StatusBadRequest {
		t.Fatalf("allowIndexing invalide → %d (%s), attendu 400", w.Code, w.Body.String())
	}
	// champ string non-string (ex: nouveltermeType) → 400.
	if w, _ := doJSON(t, r, http.MethodPatch, "/v1/settings/profile", tok,
		map[string]any{"name": 123}); w.Code != http.StatusBadRequest {
		t.Fatalf("name non-string → %d (%s), attendu 400", w.Code, w.Body.String())
	}
}

func TestHandlers_GetPublication_Forbidden(t *testing.T) {
	fx := seed(t)
	r := newTestRouter()
	// Le viewer n'est pas membre de la publication personnelle de l'owner → 403.
	w, _ := doJSON(t, r, http.MethodGet, "/v1/settings/publication?publicationId="+fx.PubID,
		testJWT(fx.ViewerID), nil)
	if w.Code != http.StatusForbidden {
		t.Fatalf("viewer sur pub owner → %d (%s), attendu 403", w.Code, w.Body.String())
	}
}

func TestHandlers_NoAuth_Unauthorized(t *testing.T) {
	seed(t)
	r := newTestRouter()

	for _, tc := range []struct{ method, path string }{
		{http.MethodGet, "/v1/settings/publication"},
		{http.MethodGet, "/v1/settings/preferences"},
		{http.MethodGet, "/v1/me/account-deletion-request"},
	} {
		w, _ := doJSON(t, r, tc.method, tc.path, "", nil)
		if w.Code != http.StatusUnauthorized {
			t.Fatalf("%s %s → %d (%s), attendu 401", tc.method, tc.path, w.Code, w.Body.String())
		}
	}
}