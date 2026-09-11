package workers

import (
	"testing"
)

func TestVerifyUnsubscribe_HMACSecurity(t *testing.T) {
	pubID := "pub_test_secure_123"
	email := "reader@example.com"

	// 1. Signature valide
	validSig := SignUnsubscribe(pubID, email)
	if !VerifyUnsubscribe(pubID, email, validSig) {
		t.Fatalf("VerifyUnsubscribe failed for valid signature: %s", validSig)
	}

	// 2. Insensible à la casse de l'email
	if !VerifyUnsubscribe(pubID, "READER@EXAMPLE.COM", validSig) {
		t.Fatalf("VerifyUnsubscribe should be case-insensitive on email")
	}

	// 3. Faux email avec la même signature -> rejet
	if VerifyUnsubscribe(pubID, "victim@example.com", validSig) {
		t.Fatalf("VerifyUnsubscribe should reject spoofed email")
	}

	// 4. Fausse publication avec la même signature -> rejet
	if VerifyUnsubscribe("pub_other", email, validSig) {
		t.Fatalf("VerifyUnsubscribe should reject spoofed publication")
	}

	// 5. Signature forgée/corrompue -> rejet
	forgedSig := "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
	if VerifyUnsubscribe(pubID, email, forgedSig) {
		t.Fatalf("VerifyUnsubscribe should reject forged signature")
	}

	// 6. Signature vide ou paramètres vides -> rejet
	if VerifyUnsubscribe("", email, validSig) || VerifyUnsubscribe(pubID, "", validSig) || VerifyUnsubscribe(pubID, email, "") {
		t.Fatalf("VerifyUnsubscribe should reject empty parameters")
	}
}
