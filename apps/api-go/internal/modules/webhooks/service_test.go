package webhooks

import "testing"

func TestNewSecret(t *testing.T) {
	s1, err := newSecret()
	if err != nil {
		t.Fatalf("génération secret: %v", err)
	}
	s2, err := newSecret()
	if err != nil {
		t.Fatalf("génération secret: %v", err)
	}
	// 32 octets encodés en hex = 64 caractères.
	if len(s1) != 64 {
		t.Errorf("longueur = %d, want 64", len(s1))
	}
	if s1 == s2 {
		t.Error("deux secrets générés identiques (entropie insuffisante)")
	}
}

func TestFilterValidEvents(t *testing.T) {
	// Événements connus conservés, inconnus filtrés, doublons dédupliqués.
	got := filterValidEvents([]string{"article.published", "article.unknown", "article.published", "subscriber.created"})
	if len(got) != 2 {
		t.Fatalf("len = %d, want 2: %v", len(got), got)
	}
	if got[0] != "article.published" || got[1] != "subscriber.created" {
		t.Errorf("événements inattendus: %v", got)
	}
	if len(filterValidEvents(nil)) != 0 {
		t.Error("liste vide doit rester vide")
	}
}

func TestSignHMAC(t *testing.T) {
	sig1 := signHMAC("secret", `{"event":"webhook.test"}`)
	sig2 := signHMAC("secret", `{"event":"webhook.test"}`)
	sig3 := signHMAC("autre-secret", `{"event":"webhook.test"}`)
	if sig1 != sig2 {
		t.Error("signature instable pour les mêmes entrées")
	}
	if sig1 == sig3 {
		t.Error("signatures identiques avec des secrets différents")
	}
	if len(sig1) != 64 {
		t.Errorf("longueur signature = %d, want 64 (SHA-256 hex)", len(sig1))
	}
}
