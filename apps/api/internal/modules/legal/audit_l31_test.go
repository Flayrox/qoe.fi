package legal

// Audit L31 : l'IP enregistrée à l'acceptation d'un document légal est lue
// dans le PREMIER élément de X-Forwarded-For (contrôlé par le client) et
// X-Real-IP est cru sans condition : la preuve de consentement porte une IP
// forgeable.

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestAuditL31_ClientIPIgnoresSpoofedForwardedFor(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/v1/legal/accept", nil)
	req.RemoteAddr = "203.0.113.7:53144"
	req.Header.Set("X-Forwarded-For", "1.1.1.1, 203.0.113.7")

	if got := clientIP(req); got != "203.0.113.7" {
		t.Fatalf("clientIP = %q, attendu le saut de confiance 203.0.113.7 (1.1.1.1 est forgé)", got)
	}

	req2 := httptest.NewRequest(http.MethodPost, "/v1/legal/accept", nil)
	req2.RemoteAddr = "203.0.113.7:53144"
	req2.Header.Set("X-Real-IP", "9.9.9.9")
	if got := clientIP(req2); got != "203.0.113.7" {
		t.Fatalf("clientIP = %q, attendu l'adresse de connexion (X-Real-IP non fiable)", got)
	}
}
