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
	"strings"
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

// =====================================================================
// 👁️ POST /v1/settings/email/preview — rendu réel sans envoi
// =====================================================================
// Contrat : même moteur que les envois (sujets localisés, coquille
// multipart, personnalisation), brouillon du panneau prioritaire sur les
// réglages stockés, locale/template bornés, auth + autorisation.

func TestHandler_EmailSettings_PreviewConfirmFR(t *testing.T) {
	fx := seed(t)
	r := newTestRouter()
	token := testJWT(fx.OwnerID)

	w, body := doJSON(t, r, "POST", "/v1/settings/email/preview", token, map[string]any{
		"publicationId": fx.PubID,
		"template":      "confirm",
		"locale":        "fr",
	})
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
	if got := body["subject"].(string); got != "Confirmez votre abonnement — Owner Blog" {
		t.Errorf("sujet FR = %q", got)
	}
	html, _ := body["html"].(string)
	text, _ := body["text"].(string)
	for _, want := range []string{"Confirmer mon abonnement"} {
		if !strings.Contains(html, want) || !strings.Contains(text, want) {
			t.Errorf("CTA localisé attendu dans les DEUX parties, manquant %q (html=%d bytes, text=%d bytes)", want, len(html), len(text))
		}
	}
	// Coquille : version texte brute non vide + HTML complet.
	if len(text) < 50 || !strings.Contains(html, "<!DOCTYPE html>") {
		t.Error("coquille multipart attendue (texte brut substantiel + HTML document)")
	}
}

func TestHandler_EmailSettings_PreviewWelcomeEN(t *testing.T) {
	fx := seed(t)
	r := newTestRouter()
	token := testJWT(fx.OwnerID)

	w, body := doJSON(t, r, "POST", "/v1/settings/email/preview", token, map[string]any{
		"publicationId": fx.PubID,
		"template":      "welcome",
		"locale":        "en-US", // borne → "en"
	})
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
	if got := body["subject"].(string); got != "Welcome to Owner Blog" {
		t.Errorf("sujet EN = %q", got)
	}
	if !strings.Contains(body["html"].(string), "Discover Owner Blog") {
		t.Error("CTA EN attendu dans le HTML")
	}
}

func TestHandler_EmailSettings_PreviewDraftOverridesStored(t *testing.T) {
	fx := seed(t)
	r := newTestRouter()
	token := testJWT(fx.OwnerID)

	// 1) Stocker une personnalisation.
	_, _ = doJSON(t, r, "PATCH", "/v1/settings/email", token, map[string]any{
		"publicationId": fx.PubID,
		"settings":      map[string]any{"accentColor": "#2563eb", "subjects": map[string]any{"confirm": "Sujet stocké"}},
	})

	// 2) Prévisualiser avec un brouillon différent : le brouillon gagne.
	w, body := doJSON(t, r, "POST", "/v1/settings/email/preview", token, map[string]any{
		"publicationId": fx.PubID,
		"template":      "confirm",
		"locale":        "fr",
		"settings":      map[string]any{"subjects": map[string]any{"confirm": "Sujet brouillon"}},
	})
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
	if got := body["subject"].(string); got != "Sujet brouillon" {
		t.Errorf("le brouillon devrait primer, sujet = %q", got)
	}

	// 3) Sans brouillon : les réglages stockés s'appliquent.
	w2, body2 := doJSON(t, r, "POST", "/v1/settings/email/preview", token, map[string]any{
		"publicationId": fx.PubID,
		"template":      "confirm",
		"locale":        "fr",
	})
	if w2.Code != http.StatusOK {
		t.Fatalf("status = %d", w2.Code)
	}
	if got := body2["subject"].(string); got != "Sujet stocké" {
		t.Errorf("réglages stockés attendus, sujet = %q", got)
	}
}

func TestHandler_EmailSettings_PreviewAuthAndBounds(t *testing.T) {
	fx := seed(t)
	r := newTestRouter()
	token := testJWT(fx.OwnerID)

	// Sans auth → 401.
	if w, _ := doJSON(t, r, "POST", "/v1/settings/email/preview", "", map[string]any{"publicationId": fx.PubID}); w.Code != http.StatusUnauthorized {
		t.Errorf("sans token : status = %d, veut 401", w.Code)
	}
	// Pas owner → 403.
	if w, _ := doJSON(t, r, "POST", "/v1/settings/email/preview", testJWT(fx.ViewerID), map[string]any{"publicationId": fx.PubID}); w.Code != http.StatusForbidden {
		t.Errorf("viewer : status = %d, veut 403", w.Code)
	}
	// publicationId manquant → 400.
	if w, _ := doJSON(t, r, "POST", "/v1/settings/email/preview", token, map[string]any{}); w.Code != http.StatusBadRequest {
		t.Errorf("sans publicationId : status = %d, veut 400", w.Code)
	}
	// Template inconnu → borné à confirm (200, jamais d'erreur).
	w, body := doJSON(t, r, "POST", "/v1/settings/email/preview", token, map[string]any{
		"publicationId": fx.PubID, "template": "hack", "locale": "xx",
	})
	if w.Code != http.StatusOK {
		t.Fatalf("template inconnu : status = %d", w.Code)
	}
	if tpl, _ := body["template"].(string); tpl != "confirm" {
		t.Errorf("template borné attendu 'confirm', got %q", tpl)
	}
}
