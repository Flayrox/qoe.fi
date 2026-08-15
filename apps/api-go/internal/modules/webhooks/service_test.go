package webhooks

import "testing"

func TestGenerateSecret(t *testing.T) {
	s1, err := generateSecret()
	if err != nil {
		t.Fatalf("génération secret: %v", err)
	}
	s2, err := generateSecret()
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

func TestValidateWebhookURL(t *testing.T) {
	for _, ok := range []string{
		"https://site.com/hook",
		"http://localhost:3000/hook",
		"https://sub.example.org/path?q=1",
	} {
		if err := validateWebhookURL(ok); err != nil {
			t.Errorf("%q doit être valide: %v", ok, err)
		}
	}
	for _, bad := range []string{
		"",
		"ftp://x.com",
		"https://",
		"javascript:alert(1)",
		"not-a-url",
	} {
		if err := validateWebhookURL(bad); err == nil {
			t.Errorf("%q doit être invalide", bad)
		}
	}
}

func TestValidateEvents(t *testing.T) {
	if err := validateEvents([]string{"article.published"}); err != nil {
		t.Errorf("événement valide rejeté: %v", err)
	}
	if err := validateEvents([]string{"article.published", "subscriber.created"}); err != nil {
		t.Errorf("événements valides rejetés: %v", err)
	}
	if err := validateEvents(nil); err == nil {
		t.Error("liste vide doit être refusée")
	}
	if err := validateEvents([]string{"article.unknown"}); err == nil {
		t.Error("événement inconnu doit être refusé")
	}
}
