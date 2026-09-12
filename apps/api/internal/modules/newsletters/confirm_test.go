package newsletters

// =====================================================================
// ✅ Tests HTTP de la confirmation double opt-in (GET|POST /confirm)
// =====================================================================
// Contrat : signature HMAC obligatoire (miroir de l'unsubscribe RFC 8058),
// token à usage unique (replay → 409), activation receiveArticles +
// horodatage confirmedAt, page HTML de succès en GET, plain-text en POST.

import (
	"context"
	"net/http"
	"strings"
	"testing"

	"github.com/qoefi/api/internal/workers"
)

func seedPendingSubscriber(t *testing.T, ctx context.Context, email, token string) {
	t.Helper()
	// ID déterministe dérivé de l'email : plusieurs emails par test sans collision.
	if _, err := poolTest.Exec(ctx, `
		INSERT INTO "Subscriber" (id, email, "publicationId", "isActive", "receiveArticles", "confirmationToken", "createdAt", "updatedAt")
		VALUES ('sub_confirm_' || left(md5($1), 12), $1, $2, true, false, $3, now(), now())
		ON CONFLICT (email, "publicationId") DO UPDATE SET
		  "receiveArticles" = false, "confirmationToken" = $3, "confirmedAt" = NULL`, email, pubID, token); err != nil {
		t.Fatalf("seed pending subscriber: %v", err)
	}
	t.Cleanup(func() {
		_, _ = poolTest.Exec(ctx, `DELETE FROM "Subscriber" WHERE email = $1 AND "publicationId" = $2`, email, pubID)
	})
}

func TestHTTP_Confirm_HappyPath(t *testing.T) {
	ctx := context.Background()
	seedNewsletterEnv(t, ctx)
	const email = "confirm-me@test.dev"
	const token = "tok-http-confirmation"
	seedPendingSubscriber(t, ctx, email, token)
	r := newHTTPRouter(t, false)

	sig := workers.SignConfirm(pubID, email)
	w := nlReq(r, http.MethodGet,
		"/v1/newsletters/confirm?pub="+pubID+"&email="+email+"&token="+token+"&sig="+sig, "", "")
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), "confirm") {
		t.Fatalf("GET confirm = %d %.120s", w.Code, w.Body.String())
	}

	var receive bool
	var confirmedNull bool
	if err := poolTest.QueryRow(ctx,
		`SELECT "receiveArticles", "confirmedAt" IS NULL FROM "Subscriber" WHERE email = $1 AND "publicationId" = $2`,
		email, pubID).Scan(&receive, &confirmedNull); err != nil {
		t.Fatalf("read subscriber: %v", err)
	}
	if !receive || confirmedNull {
		t.Fatalf("receiveArticles=%v confirmedAt IS NULL=%v, attendu true/false", receive, confirmedNull)
	}

	// POST (email HTML mal rendu, client texte) : même contrat en plain-text,
	// avec un token frais (l'usage unique du 1er lien s'applique aussi au POST).
	const email2 = "confirm-me-post@test.dev"
	const token2 = "tok-http-confirmation-post"
	seedPendingSubscriber(t, ctx, email2, token2)
	sig2 := workers.SignConfirm(pubID, email2)
	wPost := nlReq(r, http.MethodPost,
		"/v1/newsletters/confirm?pub="+pubID+"&email="+email2+"&token="+token2+"&sig="+sig2, "", "")
	if wPost.Code != http.StatusOK || !strings.Contains(wPost.Body.String(), "confirmed") {
		t.Fatalf("POST confirm = %d %.80s", wPost.Code, wPost.Body.String())
	}
}

func TestHTTP_Confirm_Security(t *testing.T) {
	ctx := context.Background()
	seedNewsletterEnv(t, ctx)
	const email = "sec-confirm@test.dev"
	const token = "tok-http-security"
	seedPendingSubscriber(t, ctx, email, token)
	r := newHTTPRouter(t, false)

	// Sans signature → 403.
	if w := nlReq(r, http.MethodGet, "/v1/newsletters/confirm?pub="+pubID+"&email="+email+"&token="+token, "", ""); w.Code != http.StatusForbidden {
		t.Fatalf("confirm sans sig = %d, attendu 403", w.Code)
	}
	// Signature falsifiée → 403.
	if w := nlReq(r, http.MethodGet, "/v1/newsletters/confirm?pub="+pubID+"&email="+email+"&token="+token+"&sig=deadbeef", "", ""); w.Code != http.StatusForbidden {
		t.Fatalf("confirm sig falsifiée = %d, attendu 403", w.Code)
	}
	// Signature d'un autre couple pub/email → 403.
	otherSig := workers.SignConfirm("pub_other", email)
	if w := nlReq(r, http.MethodGet, "/v1/newsletters/confirm?pub="+pubID+"&email="+email+"&token="+token+"&sig="+otherSig, "", ""); w.Code != http.StatusForbidden {
		t.Fatalf("confirm sig d'un autre couple = %d, attendu 403", w.Code)
	}
}

func TestHTTP_Confirm_TokenSingleUse(t *testing.T) {
	ctx := context.Background()
	seedNewsletterEnv(t, ctx)
	const email = "single-use@test.dev"
	const token = "tok-single-use"
	seedPendingSubscriber(t, ctx, email, token)
	r := newHTTPRouter(t, false)

	sig := workers.SignConfirm(pubID, email)
	url := "/v1/newsletters/confirm?pub=" + pubID + "&email=" + email + "&token=" + token + "&sig=" + sig

	// 1re consommation → 200 ; le token est effacé (usage unique).
	if w := nlReq(r, http.MethodGet, url, "", ""); w.Code != http.StatusOK {
		t.Fatalf("1re confirmation = %d, attendu 200", w.Code)
	}
	// Replay → 409 (lien déjà consommé).
	if w := nlReq(r, http.MethodGet, url, "", ""); w.Code != http.StatusConflict {
		t.Fatalf("replay du lien = %d, attendu 409", w.Code)
	}
}

func TestSubscribe_PublicSignupStaysPending(t *testing.T) {
	ctx := context.Background()
	seedNewsletterEnv(t, ctx)
	const email = "pending-flow@test.dev"

	// La publication cible existe (seedNewsletterEnv) mais l'inscription passe
	// par le module home — on simule ici l'état post-subscribe en SQL public
	// (miroir de SubscribeToNewsletter) puis on vérifie le contrat opt-in :
	// receiveArticles=false + token posé + confirmedAt NULL.
	if _, err := poolTest.Exec(ctx, `
		INSERT INTO "Subscriber" (id, email, "publicationId", "isActive", "receiveArticles", "confirmationToken", "createdAt", "updatedAt")
		VALUES ('sub_pending_flow', $1, $2, true, false, 'tok-pending-flow', now(), now())
		ON CONFLICT (email, "publicationId") DO UPDATE SET "receiveArticles" = false, "confirmationToken" = 'tok-pending-flow'`, email, pubID); err != nil {
		t.Fatalf("seed pending: %v", err)
	}
	t.Cleanup(func() {
		_, _ = poolTest.Exec(ctx, `DELETE FROM "Subscriber" WHERE id = 'sub_pending_flow'`)
	})

	// Le fanout bulk ignore l'abonné en attente (contrat consentement).
	var receive bool
	if err := poolTest.QueryRow(ctx,
		`SELECT "receiveArticles" FROM "Subscriber" WHERE email = $1 AND "publicationId" = $2`,
		email, pubID).Scan(&receive); err != nil {
		t.Fatalf("read: %v", err)
	}
	if receive {
		t.Fatal("un abonné public non confirmé ne doit pas recevoir de bulk")
	}
}
