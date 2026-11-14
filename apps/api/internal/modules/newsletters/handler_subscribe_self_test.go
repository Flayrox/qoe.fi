package newsletters

// =====================================================================
// 📬 POST /v1/me/subscriptions — parcours connecté
// =====================================================================
// Le service est déjà couvert (subscribe_self_test) ; ce fichier couvre la
// COUCHE HTTP, seule responsable des réponses visibles : session absente,
// claims absents, corps invalide, adresse d'un autre compte, puis les deux
// issues du double opt-in (activation directe / e-mail de confirmation).
//
// La réponse est volontairement neutre — `active: false` veut dire « vérifiez
// votre boîte » — donc les assertions portent sur `active`, jamais sur un
// message qui révélerait l'existence d'un compte.
// =====================================================================

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	db "github.com/qoefi/api/internal/database"
	"github.com/qoefi/api/internal/middleware"
)

// nlReqWithClaims monte une requête authentifiée : userID ET claims, comme le
// fait le middleware réel (sans claims, la route refuse la session).
func nlReqWithClaims(r http.Handler, method, path, userID, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	ctx := context.WithValue(req.Context(), middleware.UserIDKey, userID)
	ctx = context.WithValue(ctx, middleware.ClaimsKey, map[string]any{"sub": userID})
	req = req.WithContext(ctx)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func newSelfSubscribeRouter(t *testing.T, email string, confirmed bool) http.Handler {
	t.Helper()
	svc := NewService(db.New(poolTest), nil)
	svc.SetEmailVerifier(&fakeVerifier{email: email, confirmed: confirmed})
	h := NewHandler(svc)
	r := chi.NewRouter()
	h.Register(r)
	return r
}

func TestHTTP_SubscribeSelf_Guards(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	seedNewsletterEnv(t, ctx)
	r := newSelfSubscribeRouter(t, "owner@test.dev", true)
	path := "/v1/me/subscriptions"
	body := `{"email":"owner@test.dev","publisherId":"` + pubID + `"}`

	// Sans session : 401 (avant toute lecture de corps).
	if w := doNl(r, http.MethodPost, path, "", body); w.Code != http.StatusUnauthorized {
		t.Fatalf("anonyme = %d, attendu 401", w.Code)
	}

	// Identité seule, sans claims : la session de compte est incomplète.
	req := httptest.NewRequest(http.MethodPost, path, strings.NewReader(body))
	req = req.WithContext(context.WithValue(req.Context(), middleware.UserIDKey, ownerID))
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("sans claims = %d, attendu 401", rec.Code)
	}

	// Corps illisible : 400, pas un 500.
	if w := nlReqWithClaims(r, http.MethodPost, path, ownerID, "{"); w.Code != http.StatusBadRequest {
		t.Fatalf("JSON invalide = %d, attendu 400", w.Code)
	}

	// Saisir l'adresse d'un autre compte ne prouve pas qu'on en est titulaire.
	w := nlReqWithClaims(r, http.MethodPost, path, ownerID,
		`{"email":"autre@test.dev","publisherId":"`+pubID+`"}`)
	if w.Code != http.StatusForbidden {
		t.Fatalf("adresse d'un autre compte = %d, attendu 403", w.Code)
	}
}

func TestHTTP_SubscribeSelf_DoubleOptIn(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	seedNewsletterEnv(t, ctx)

	type resp struct {
		Success bool `json:"success"`
		Active  bool `json:"active"`
	}
	call := func(r http.Handler) resp {
		t.Helper()
		w := nlReqWithClaims(r, http.MethodPost, "/v1/me/subscriptions", ownerID,
			`{"email":"owner@test.dev","publisherId":"`+pubID+`"}`)
		if w.Code != http.StatusOK {
			t.Fatalf("subscribe true = %d %s", w.Code, w.Body.String())
		}
		var out resp
		if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
			t.Fatalf("json: %v (%s)", err, w.Body.String())
		}
		return out
	}

	// Adresse non vérifiée côté fournisseur → parcours invité : rien n'est
	// actif tant que le lien de confirmation n'a pas été cliqué.
	if got := call(newSelfSubscribeRouter(t, "owner@test.dev", false)); !got.Success || got.Active {
		t.Fatalf("non vérifiée = %+v, attendu success=true active=false", got)
	}

	// Adresse vérifiée → activation directe.
	if got := call(newSelfSubscribeRouter(t, "owner@test.dev", true)); !got.Success || !got.Active {
		t.Fatalf("vérifiée = %+v, attendu success=true active=true", got)
	}
}

// doNl envoie une requête anonyme (aucune identité).
func doNl(r http.Handler, method, path, _ string, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}
