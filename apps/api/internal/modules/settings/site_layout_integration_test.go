package settings

import (
	"net/http"
	"testing"
)

// Flow complet : brouillon → publication (avec snapshot) → versions → restauration.
func TestSiteLayout_DraftPublishRestore(t *testing.T) {
	requirePool(t)
	fx := seed(t)
	r := newTestRouter()
	token := testJWT(fx.OwnerID)
	pub := fx.PubID

	// 1. Pas de brouillon initial.
	w, body := doJSON(t, r, "GET", "/v1/settings/site-layout?publicationId="+pub, token, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("get draft: status = %d, body = %s", w.Code, w.Body.String())
	}
	if body["layout"] != nil {
		t.Fatalf("brouillon initial attendu vide, got %s", w.Body.String())
	}

	// 2. Brouillon invalide rejeté.
	w, _ = doJSON(t, r, "PATCH", "/v1/settings/site-layout", token, map[string]any{
		"publicationId": pub, "layout": "pas-du-json",
	})
	if w.Code != http.StatusBadRequest {
		t.Fatalf("brouillon invalide: status = %d, attendu 400", w.Code)
	}

	// 3. Sauvegarde brouillon.
	draft := `{"version":1,"archetype":"minimal","tokens":{},"blocks":[]}`
	w, _ = doJSON(t, r, "PATCH", "/v1/settings/site-layout", token, map[string]any{
		"publicationId": pub, "layout": draft,
	})
	if w.Code != http.StatusOK {
		t.Fatalf("save draft: status = %d, body = %s", w.Code, w.Body.String())
	}

	// 4. Relecture brouillon.
	_, body = doJSON(t, r, "GET", "/v1/settings/site-layout?publicationId="+pub, token, nil)
	if body["layout"] != draft {
		t.Fatalf("relecture brouillon: got %s", w.Body.String())
	}

	// 5. Publication.
	w, _ = doJSON(t, r, "POST", "/v1/settings/site-layout/publish", token, map[string]any{
		"publicationId": pub,
	})
	if w.Code != http.StatusOK {
		t.Fatalf("publish: status = %d, body = %s", w.Code, w.Body.String())
	}

	// 6. Brouillon consommé.
	_, body = doJSON(t, r, "GET", "/v1/settings/site-layout?publicationId="+pub, token, nil)
	if body["layout"] != nil {
		t.Fatalf("brouillon attendu consommé, got %s", w.Body.String())
	}

	// 7. Nouveau brouillon + republication = 1 version archivée.
	draft2 := `{"version":1,"archetype":"magazine","tokens":{},"blocks":[]}`
	if w, _ := doJSON(t, r, "PATCH", "/v1/settings/site-layout", token, map[string]any{
		"publicationId": pub, "layout": draft2,
	}); w.Code != http.StatusOK {
		t.Fatalf("save draft2: status = %d", w.Code)
	}
	if w, _ := doJSON(t, r, "POST", "/v1/settings/site-layout/publish", token, map[string]any{
		"publicationId": pub,
	}); w.Code != http.StatusOK {
		t.Fatalf("publish2: status = %d", w.Code)
	}

	w, body = doJSON(t, r, "GET", "/v1/settings/site-layout/versions?publicationId="+pub, token, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("versions: status = %d, body = %s", w.Code, w.Body.String())
	}
	versions, _ := body["versions"].([]any)
	// 2 versions : seed 'minimal' archivé au 1er publish, puis draft1 au 2e.
	if len(versions) != 2 {
		t.Fatalf("versions = %d, attendu 2, body = %s", len(versions), w.Body.String())
	}
	versionID, _ := versions[0].(map[string]any)["id"].(string)
	if versionID == "" {
		t.Fatalf("version sans id: %s", w.Body.String())
	}

	// 8. Restauration du dernier snapshot (draft1) vers le brouillon.
	w, _ = doJSON(t, r, "POST", "/v1/settings/site-layout/restore", token, map[string]any{
		"publicationId": pub, "versionId": versionID,
	})
	if w.Code != http.StatusOK {
		t.Fatalf("restore: status = %d, body = %s", w.Code, w.Body.String())
	}
	_, body = doJSON(t, r, "GET", "/v1/settings/site-layout?publicationId="+pub, token, nil)
	if body["layout"] != draft {
		t.Fatalf("brouillon restauré attendu %q, got %s", draft, w.Body.String())
	}
}

// Un lecteur sans droit ne touche pas aux brouillons.
func TestSiteLayout_ViewerForbidden(t *testing.T) {
	requirePool(t)
	fx := seed(t)
	r := newTestRouter()
	token := testJWT(fx.ViewerID)

	w, _ := doJSON(t, r, "GET", "/v1/settings/site-layout/versions?publicationId="+fx.MediaPubID, token, nil)
	if w.Code != http.StatusForbidden {
		t.Fatalf("viewer versions: status = %d, attendu 403", w.Code)
	}
	w, _ = doJSON(t, r, "PATCH", "/v1/settings/site-layout", token, map[string]any{
		"publicationId": fx.MediaPubID, "layout": `{"a":1}`,
	})
	if w.Code != http.StatusForbidden {
		t.Fatalf("viewer save: status = %d, attendu 403", w.Code)
	}
}

// Publier sans brouillon = 400 explicite.
func TestSiteLayout_PublishWithoutDraft(t *testing.T) {
	requirePool(t)
	fx := seed(t)
	r := newTestRouter()
	token := testJWT(fx.OwnerID)

	w, _ := doJSON(t, r, "POST", "/v1/settings/site-layout/publish", token, map[string]any{
		"publicationId": fx.PubID,
	})
	if w.Code != http.StatusBadRequest {
		t.Fatalf("publish sans brouillon: status = %d, attendu 400", w.Code)
	}
}
