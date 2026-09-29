package settings

// Défaut de téléchargement (fiche Plus P1) : la publication règle le défaut
// des NOUVEAUX articles (l'auteur ajuste ensuite par article). Exige
// Postgres — skippé sans Docker.

import (
	"context"
	"net/http"
	"testing"
)

func TestHandler_DownloadDefault_PatchAndRead(t *testing.T) {
	requirePool(t)
	fx := seed(t)
	r := newTestRouter()
	token := testJWT(fx.OwnerID)

	// Défaut initial : true (opt-out — comportement actuel préservé).
	ctx := context.Background()
	var current bool
	if err := poolTest.QueryRow(ctx,
		`SELECT "allowDownloadDefault" FROM "Publication" WHERE id = $1`, fx.PubID).Scan(&current); err != nil || !current {
		t.Fatalf("défaut true attendu, obtenu %v (%v)", current, err)
	}
	// Bascule à false.
	w, body := doJSON(t, r, "PATCH", "/v1/settings/publication/download-default", token,
		map[string]any{"publicationId": fx.PubID, "allowDownloadDefault": false})
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
	if body["allowDownloadDefault"] != false {
		t.Fatalf("false attendu, obtenu %v", body)
	}
	// Sans auth : 401. Corps invalide : 400.
	if w, _ := doJSON(t, r, "PATCH", "/v1/settings/publication/download-default", "", map[string]any{}); w.Code != http.StatusUnauthorized {
		t.Fatalf("sans auth : 401 attendu, obtenu %d", w.Code)
	}
	if w, _ := doJSON(t, r, "PATCH", "/v1/settings/publication/download-default", token, map[string]any{}); w.Code != http.StatusBadRequest {
		t.Fatalf("corps vide : 400 attendu, obtenu %d", w.Code)
	}
	// Rétabli (hygiène inter-tests).
	if _, err := poolTest.Exec(ctx,
		`UPDATE "Publication" SET "allowDownloadDefault" = true WHERE id = $1`, fx.PubID); err != nil {
		t.Fatalf("rétablir : %v", err)
	}
}
