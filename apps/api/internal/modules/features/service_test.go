package features

import (
	"context"
	"errors"
	"net/url"
	"strings"
	"testing"
)

func TestUnsubscribeToken_IsSignedAndCarriesNoEmail(t *testing.T) {
	svc := NewService(nil)
	svc.SetUnsubscribeSecret("test-secret")
	token, err := svc.SignInterestToken("interest-123")
	if err != nil {
		t.Fatalf("SignInterestToken: %v", err)
	}
	if strings.Contains(token, "@") || strings.Contains(token, "interest-123") {
		t.Fatalf("le jeton expose l'identifiant ou un email : %q", token)
	}
	link, err := svc.UnsubscribeURL("interest-123")
	if err != nil {
		t.Fatalf("UnsubscribeURL: %v", err)
	}
	parsed, err := url.Parse(link)
	if err != nil {
		t.Fatalf("URL: %v", err)
	}
	if got := parsed.Query().Get("token"); got != token {
		t.Fatalf("token URL = %q, attendu %q", got, token)
	}
	if strings.Contains(link, "@") {
		t.Fatalf("le lien contient un email : %q", link)
	}
}

func TestUnsubscribe_RejectsTamperedTokenWithoutDatabase(t *testing.T) {
	svc := NewService(nil)
	svc.SetUnsubscribeSecret("test-secret")
	token, err := svc.SignInterestToken("interest-123")
	if err != nil {
		t.Fatalf("SignInterestToken: %v", err)
	}
	if _, err := svc.Unsubscribe(context.Background(), token+"x"); !errors.Is(err, ErrUnsubscribeInvalid) {
		t.Fatalf("jeton falsifié = %v, attendu ErrUnsubscribeInvalid", err)
	}
	if _, err := svc.Unsubscribe(context.Background(), ""); !errors.Is(err, ErrUnsubscribeInvalid) {
		t.Fatalf("jeton vide = %v, attendu ErrUnsubscribeInvalid", err)
	}
}

func TestRecord_NotifyRefusesClosedFeature(t *testing.T) {
	svc := NewService(nil)
	if _, err := svc.Record(context.Background(), "11111111-1111-4111-8111-111111111111", SignalInput{
		FeatureKey: "custom-domain", Kind: KindNotify,
	}); !errors.Is(err, ErrFeatureUnavailable) {
		t.Fatalf("notify sans catalogue = %v, attendu ErrFeatureUnavailable", err)
	}
}
