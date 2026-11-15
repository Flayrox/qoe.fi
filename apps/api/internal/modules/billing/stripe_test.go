package billing

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// TestCreateCheckoutSession_FormEtMetadata vérifie le contrat Stripe réel :
// chemin, auth, mode abonnement, metadata dupliquée et destination Connect.
func TestCreateCheckoutSession_FormEtMetadata(t *testing.T) {
	var gotPath, gotAuth, gotForm string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		gotAuth = r.Header.Get("Authorization")
		_ = r.ParseForm()
		gotForm = r.PostForm.Encode()
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"id":"cs_test_1","url":"https://checkout.stripe.test/cs_test_1"}`))
	}))
	defer srv.Close()

	c := NewStripeClient("sk_test_123", srv.URL)
	url, err := c.CreateCheckoutSession(context.Background(), CheckoutParams{
		PriceID:       "price_42",
		CustomerEmail: "lecteur@test.dev",
		UserID:        "user-1",
		CreatorID:     "pub-1",
		Plan:          "publication",
		TierID:        "tier-1",
		StripeAccount: "acct_1",
		FeePercent:    10,
		SuccessURL:    "https://qoe.test/billing?checkout=success",
		CancelURL:     "https://qoe.test/billing?checkout=cancel",
	})
	if err != nil {
		t.Fatalf("CreateCheckoutSession: %v", err)
	}
	if url != "https://checkout.stripe.test/cs_test_1" {
		t.Fatalf("url = %q", url)
	}
	if gotPath != "/v1/checkout/sessions" {
		t.Fatalf("path = %q", gotPath)
	}
	if gotAuth != "Bearer sk_test_123" {
		t.Fatalf("auth = %q", gotAuth)
	}
	for _, want := range []string{
		"mode=subscription",
		"line_items%5B0%5D%5Bprice%5D=price_42",
		"metadata%5Bplan%5D=publication",
		"subscription_data%5Bmetadata%5D%5BtierId%5D=tier-1",
		"subscription_data%5Btransfer_data%5D%5Bdestination%5D=acct_1",
		"subscription_data%5Bapplication_fee_percent%5D=10",
		"customer_email=lecteur%40test.dev",
	} {
		if !strings.Contains(gotForm, want) {
			t.Fatalf("formulaire sans %q : %s", want, gotForm)
		}
	}
}

func TestCreateCheckoutSession_NonConfigure(t *testing.T) {
	c := NewStripeClient("", "")
	if c.Configured() {
		t.Fatal("Configured() = true sans clé")
	}
	if _, err := c.CreateCheckoutSession(context.Background(), CheckoutParams{PriceID: "price_1"}); err != ErrNotConfigured {
		t.Fatalf("err = %v, attendu ErrNotConfigured", err)
	}
}

func TestCreatePortalSession(t *testing.T) {
	var gotForm string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = r.ParseForm()
		gotForm = r.PostForm.Encode()
		_, _ = w.Write([]byte(`{"url":"https://billing.stripe.test/p/1"}`))
	}))
	defer srv.Close()

	c := NewStripeClient("sk_test_123", srv.URL)
	url, err := c.CreatePortalSession(context.Background(), "cus_1", "https://qoe.test/billing")
	if err != nil {
		t.Fatalf("CreatePortalSession: %v", err)
	}
	if url != "https://billing.stripe.test/p/1" {
		t.Fatalf("url = %q", url)
	}
	if !strings.Contains(gotForm, "customer=cus_1") || !strings.Contains(gotForm, "return_url=") {
		t.Fatalf("formulaire portail = %s", gotForm)
	}
}

func TestCreateCheckoutSession_ErreurStripe(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"error":{"message":"No such price"}}`))
	}))
	defer srv.Close()

	c := NewStripeClient("sk_test_123", srv.URL)
	_, err := c.CreateCheckoutSession(context.Background(), CheckoutParams{PriceID: "price_absent"})
	if err == nil || !strings.Contains(err.Error(), "No such price") {
		t.Fatalf("err = %v, attendu le message Stripe", err)
	}
}

// TestService_NilPool : sans base, les lectures sont vides et jamais en panne.
func TestService_NilPool(t *testing.T) {
	svc := NewService(nil)
	tiers, err := svc.ListTiers(context.Background(), "pub-1")
	if err != nil || len(tiers) != 0 {
		t.Fatalf("ListTiers nil pool = %v, %v", tiers, err)
	}
	if _, err := svc.GetTier(context.Background(), "tier-1"); err != ErrTierNotFound {
		t.Fatalf("GetTier = %v", err)
	}
	if svc.ReaderStripeCustomer(context.Background(), "user-1") != "" {
		t.Fatal("ReaderStripeCustomer sans base devrait être vide")
	}
}
