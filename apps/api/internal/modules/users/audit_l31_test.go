package users

// Audit L31 : l'IP d'audit (connexion, session) est lue dans le PREMIER
// élément de X-Forwarded-For — la valeur que le client choisit lui-même —
// et X-Real-IP est cru sans condition. Une IP forgée se retrouve dans le
// journal de sécurité du compte.

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestAuditL31_RequestIPIgnoresSpoofedForwardedFor(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/v1/me/sync", nil)
	req.RemoteAddr = "203.0.113.7:53144"
	req.Header.Set("X-Forwarded-For", "1.1.1.1, 203.0.113.7")

	if got := requestIP(req); got != "203.0.113.7" {
		t.Fatalf("requestIP = %q, attendu le saut de confiance 203.0.113.7 (1.1.1.1 est forgé)", got)
	}

	req2 := httptest.NewRequest(http.MethodPost, "/v1/me/sync", nil)
	req2.RemoteAddr = "203.0.113.7:53144"
	req2.Header.Set("X-Real-IP", "9.9.9.9")
	if got := requestIP(req2); got != "203.0.113.7" {
		t.Fatalf("requestIP = %q, attendu l'adresse de connexion (X-Real-IP non fiable)", got)
	}
}
