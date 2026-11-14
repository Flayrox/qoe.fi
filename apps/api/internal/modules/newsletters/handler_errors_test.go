package newsletters

// =====================================================================
// 🩹 Routes de brouillon : identifiant inconnu → 404, jamais 5xx
// =====================================================================
// Le studio peut envoyer un id obsolète (brouillon supprimé dans un autre
// onglet, lien de session restauré). La réponse doit être un 404 propre : le
// handler traduit `pgx.ErrNoRows` en « introuvable » au lieu de laisser
// remonter une erreur serveur.
// =====================================================================

import (
	"context"
	"net/http"
	"testing"
)

func TestHTTP_DraftRoutes_IdInconnu(t *testing.T) {
	ctx := context.Background()
	seedNewsletterEnv(t, ctx)
	r := newHTTPRouter(t, false)

	if w := nlReq(r, http.MethodPatch, "/v1/newsletters/nl_inexistant", ownerID,
		`{"subject":"X","html":"<p>x</p>"}`); w.Code != http.StatusNotFound {
		t.Fatalf("PATCH inconnu = %d, attendu 404 (%.80s)", w.Code, w.Body.String())
	}

	if w := nlReq(r, http.MethodDelete, "/v1/newsletters/nl_inexistant", ownerID, ""); w.Code != http.StatusNotFound {
		t.Fatalf("DELETE inconnu = %d, attendu 404 (%.80s)", w.Code, w.Body.String())
	}
}
