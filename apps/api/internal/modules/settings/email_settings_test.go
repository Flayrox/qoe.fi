package settings

// =====================================================================
// 📧 Tests HTTP des réglages email transactionnels (GET|PATCH /v1/settings/email)
// =====================================================================
// Contrat : auth requise, autorisation par publication, validation via
// workers.ParseEmailPrefs (valeurs invalides ignorées, jamais bloquantes),
// persistance de la version assainie, retour du JSON nettoyé.

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"
)

func TestHandler_EmailSettings_GetDefaults(t *testing.T) {
	fx := seed(t)
	r := newTestRouter()
	token := testJWT(fx.OwnerID)

	w, body := doJSON(t, r, "GET", "/v1/settings/email?publicationId="+fx.PubID, token, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
	settings, ok := body["emailSettings"].(map[string]any)
	if !ok {
		t.Fatalf("emailSettings absent : %s", w.Body.String())
	}
	if name, _ := body["publicationName"].(string); name == "" {
		t.Error("publicationName attendu dans la réponse")
	}
	// Défauts : réglages vides (le front pré-remplit avec accentColor/logoUrl).
	if _, exists := settings["fromName"]; exists {
		t.Errorf("fromName devrait être absent par défaut, got %v", settings["fromName"])
	}
}

func TestHandler_EmailSettings_PatchValidatesAndPersists(t *testing.T) {
	fx := seed(t)
	r := newTestRouter()
	token := testJWT(fx.OwnerID)

	payload := map[string]any{
		"publicationId": fx.PubID,
		"settings": map[string]any{
			"fromName":      "Léa de La Gazette",
			"accentColor":   "#7C3AED",               // sera normalisé en minuscules
			"replyTo":       "bad reply with spaces", // rejeté par la validation
			"subjects":      map[string]any{"welcome": "Bienvenue chez nous !", "nope": "clé inconnue"},
			"footerNote":    "Publié avec amour.",
			"welcomeBodyFr": "Corps personnalisé.",
		},
	}
	w, body := doJSON(t, r, "PATCH", "/v1/settings/email", token, payload)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
	clean, ok := body["emailSettings"].(map[string]any)
	if !ok {
		t.Fatalf("emailSettings absent de la réponse : %s", w.Body.String())
	}
	if clean["fromName"] != "Léa de La Gazette" {
		t.Errorf("fromName = %v", clean["fromName"])
	}
	if clean["accentColor"] != "#7c3aed" {
		t.Errorf("accentColor = %v (minuscules attendues)", clean["accentColor"])
	}
	if _, exists := clean["replyTo"]; exists {
		t.Error("replyTo invalide : aurait dû être rejeté")
	}
	subjects, _ := clean["subjects"].(map[string]any)
	if subjects["welcome"] != "Bienvenue chez nous !" {
		t.Errorf("subjects.welcome = %v", subjects["welcome"])
	}
	if _, exists := subjects["nope"]; exists {
		t.Error("clé de sujet inconnue : aurait dû être écartée")
	}

	// Persistance de la version assainie en base.
	var stored []byte
	if err := poolTest.QueryRow(context.Background(),
		`SELECT "emailSettings" FROM "Publication" WHERE id = $1`, fx.PubID).Scan(&stored); err != nil {
		t.Fatalf("lecture emailSettings: %v", err)
	}
	var m map[string]any
	if err := json.Unmarshal(stored, &m); err != nil {
		t.Fatalf("JSON stocké invalide: %v (%s)", err, stored)
	}
	if m["accentColor"] != "#7c3aed" {
		t.Errorf("accentColor stocké = %v", m["accentColor"])
	}

	// Le GET reflète la personnalisation.
	w2, body2 := doJSON(t, r, "GET", "/v1/settings/email?publicationId="+fx.PubID, token, nil)
	if w2.Code != http.StatusOK {
		t.Fatalf("GET après PATCH: %d", w2.Code)
	}
	got := body2["emailSettings"].(map[string]any)
	if got["footerNote"] != "Publié avec amour." {
		t.Errorf("footerNote après GET = %v", got["footerNote"])
	}
}

func TestHandler_EmailSettings_AuthAndErrors(t *testing.T) {
	fx := seed(t)
	r := newTestRouter()

	// Sans token → 401.
	w, _ := doJSON(t, r, "GET", "/v1/settings/email?publicationId="+fx.PubID, "", nil)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("sans token: %d, attendu 401", w.Code)
	}

	// publicationId manquant → 400.
	w2, _ := doJSON(t, r, "GET", "/v1/settings/email", testJWT(fx.OwnerID), nil)
	if w2.Code != http.StatusBadRequest {
		t.Fatalf("sans publicationId: %d, attendu 400", w2.Code)
	}

	// JSON invalide au PATCH → 400.
	w3, _ := doJSON(t, r, "PATCH", "/v1/settings/email", testJWT(fx.OwnerID), map[string]any{})
	if w3.Code != http.StatusBadRequest {
		t.Fatalf("PATCH sans publicationId: %d, attendu 400", w3.Code)
	}

	// Réglages JSON complètement invalides → le service ne casse pas :
	// ParseEmailPrefs rend les défauts et le PATCH reste 200.
	w4, body4 := doJSON(t, r, "PATCH", "/v1/settings/email", testJWT(fx.OwnerID), map[string]any{
		"publicationId": fx.PubID,
		"settings":      "not an object",
	})
	if w4.Code != http.StatusOK {
		t.Fatalf("PATCH avec JSON invalide doit rester tolérant: %d (%s)", w4.Code, w4.Body.String())
	}
	clean, _ := body4["emailSettings"].(map[string]any)
	if clean == nil {
		t.Error("emailSettings attendu (défauts) même avec entrée invalide")
	}
}
