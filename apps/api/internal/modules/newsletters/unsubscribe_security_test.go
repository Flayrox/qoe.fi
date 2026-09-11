package newsletters

import (
	"context"
	"net/http"
	"testing"

	"github.com/qoefi/api/internal/workers"
)

func TestUnsubscribe_SecurityTampering(t *testing.T) {
	ctx := context.Background()
	seedNewsletterEnv(t, ctx)
	r := newHTTPRouter(t, false)

	validEmail := "reader@test.dev"
	validSig := workers.SignUnsubscribe(pubID, validEmail)

	// 1. Signature valide -> 200 OK
	w := nlReq(r, http.MethodGet, "/v1/newsletters/unsubscribe?pub="+pubID+"&email="+validEmail+"&sig="+validSig, "", "")
	if w.Code != http.StatusOK {
		t.Fatalf("Valid unsubscribe failed: %d", w.Code)
	}

	// 2. Altération d'un seul caractère de la signature -> 403 Forbidden
	tamperedSig := validSig[:len(validSig)-1] + "x"
	if tamperedSig == validSig {
		tamperedSig = validSig[:len(validSig)-1] + "a"
	}
	wTampered := nlReq(r, http.MethodGet, "/v1/newsletters/unsubscribe?pub="+pubID+"&email="+validEmail+"&sig="+tamperedSig, "", "")
	if wTampered.Code != http.StatusForbidden {
		t.Fatalf("Tampered signature accepted: code %d", wTampered.Code)
	}

	// 3. Signature pour une autre adresse email -> 403 Forbidden
	otherSig := workers.SignUnsubscribe(pubID, "other@victim.com")
	wOtherEmail := nlReq(r, http.MethodGet, "/v1/newsletters/unsubscribe?pub="+pubID+"&email="+validEmail+"&sig="+otherSig, "", "")
	if wOtherEmail.Code != http.StatusForbidden {
		t.Fatalf("Cross-email signature accepted: code %d", wOtherEmail.Code)
	}

	// 4. Signature pour une autre publication -> 403 Forbidden
	otherPubSig := workers.SignUnsubscribe("pub_other_publication", validEmail)
	wOtherPub := nlReq(r, http.MethodGet, "/v1/newsletters/unsubscribe?pub="+pubID+"&email="+validEmail+"&sig="+otherPubSig, "", "")
	if wOtherPub.Code != http.StatusForbidden {
		t.Fatalf("Cross-pub signature accepted: code %d", wOtherPub.Code)
	}
}
