package billing

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/qoefi/api/internal/middleware"
	"github.com/qoefi/api/internal/observability"
	"github.com/qoefi/api/internal/resilience"
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

func TestCommissionPercent(t *testing.T) {
	if got := commissionPercent(true); got != 5 {
		t.Fatalf("Pro = %d %%, attendu 5", got)
	}
	if got := commissionPercent(false); got != 10 {
		t.Fatalf("gratuit = %d %%, attendu 10", got)
	}
}

func TestSaveUserCustomer_NilPool(t *testing.T) {
	if err := NewService(nil).SaveUserCustomer(context.Background(), "user-1", "cus_1"); err != nil {
		t.Fatalf("SaveUserCustomer sans base = %v", err)
	}
	if NewService(nil).IsPro(context.Background(), "pub-1") {
		t.Fatal("IsPro sans base doit être faux")
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
	if customer, err := svc.ReaderStripeCustomer(context.Background(), "user-1"); customer != "" || err != nil {
		t.Fatalf("ReaderStripeCustomer sans base = %q, %v", customer, err)
	}
	if err := svc.SavePublisherStripeAccount(context.Background(), "pub-1", "acct_1"); err != nil {
		t.Fatalf("SavePublisherStripeAccount sans base = %v", err)
	}
}

func TestCreateConnectAccount(t *testing.T) {
	var gotPath, gotAuth, gotForm string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		gotAuth = r.Header.Get("Authorization")
		_ = r.ParseForm()
		gotForm = r.PostForm.Encode()
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"id":"acct_test_123"}`))
	}))
	defer srv.Close()

	c := NewStripeClient("sk_test_123", srv.URL)
	id, err := c.CreateConnectAccount(context.Background(), "createur@test.dev", "pub-42")
	if err != nil {
		t.Fatalf("CreateConnectAccount: %v", err)
	}
	if id != "acct_test_123" {
		t.Fatalf("id = %q", id)
	}
	if gotPath != "/v1/accounts" || gotAuth != "Bearer sk_test_123" {
		t.Fatalf("requête = %s auth=%q", gotPath, gotAuth)
	}
	for _, want := range []string{
		"type=express",
		"country=FR",
		"email=createur%40test.dev",
		"capabilities%5Bcard_payments%5D%5Brequested%5D=true",
		"capabilities%5Btransfers%5D%5Brequested%5D=true",
		"metadata%5BpublisherId%5D=pub-42",
	} {
		if !strings.Contains(gotForm, want) {
			t.Fatalf("formulaire sans %q : %s", want, gotForm)
		}
	}

	unconfigured := NewStripeClient("", "")
	if _, err := unconfigured.CreateConnectAccount(context.Background(), "", "pub-42"); !errors.Is(err, ErrNotConfigured) {
		t.Fatalf("non configuré = %v, attendu ErrNotConfigured", err)
	}
}

func TestCreateAccountLink(t *testing.T) {
	var gotPath, gotAuth, gotForm string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		gotAuth = r.Header.Get("Authorization")
		_ = r.ParseForm()
		gotForm = r.PostForm.Encode()
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"url":"https://connect.stripe.test/setup/s/1"}`))
	}))
	defer srv.Close()

	c := NewStripeClient("sk_test_123", srv.URL)
	link, err := c.CreateAccountLink(
		context.Background(),
		"acct_test_123",
		"https://studio.qoe.test/monetization?connect=refresh",
		"https://studio.qoe.test/monetization?connect=return",
	)
	if err != nil {
		t.Fatalf("CreateAccountLink: %v", err)
	}
	if link != "https://connect.stripe.test/setup/s/1" {
		t.Fatalf("url = %q", link)
	}
	if gotPath != "/v1/account_links" || gotAuth != "Bearer sk_test_123" {
		t.Fatalf("requête = %s auth=%q", gotPath, gotAuth)
	}
	for _, want := range []string{
		"account=acct_test_123",
		"type=account_onboarding",
		"refresh_url=https%3A%2F%2Fstudio.qoe.test%2Fmonetization%3Fconnect%3Drefresh",
		"return_url=https%3A%2F%2Fstudio.qoe.test%2Fmonetization%3Fconnect%3Dreturn",
	} {
		if !strings.Contains(gotForm, want) {
			t.Fatalf("formulaire sans %q : %s", want, gotForm)
		}
	}

	unconfigured := NewStripeClient("", "")
	if _, err := unconfigured.CreateAccountLink(context.Background(), "acct_1", "https://a", "https://b"); !errors.Is(err, ErrNotConfigured) {
		t.Fatalf("non configuré = %v, attendu ErrNotConfigured", err)
	}
}

func TestAnnualCheckout_SelectionEtSession(t *testing.T) {
	if got, ok := normalizeCheckoutInterval(""); !ok || got != "month" {
		t.Fatalf("défaut = %q, %v", got, ok)
	}
	if got, ok := normalizeCheckoutInterval(" year "); !ok || got != "year" {
		t.Fatalf("year = %q, %v", got, ok)
	}
	if _, ok := normalizeCheckoutInterval("week"); ok {
		t.Fatal("cadence week devrait être refusée")
	}

	yearlyCents := 5000
	tiers := []Tier{
		{
			ID:                   "t-monthly-only",
			PublisherID:          "pub-1",
			MonthlyPriceCents:    500,
			StripePriceIDMonthly: "price_m1",
		},
		{
			ID:                   "t-yearly",
			PublisherID:          "pub-1",
			MonthlyPriceCents:    700,
			YearlyPriceCents:     &yearlyCents,
			StripePriceIDMonthly: "price_m2",
			StripePriceIDYearly:  "price_y2",
		},
	}

	selected, priceID, cents, ok := selectPublicationTier(tiers, "year")
	if !ok || selected.ID != "t-yearly" || priceID != "price_y2" || cents != 5000 {
		t.Fatalf("sélection annuelle = %+v price=%q cents=%d ok=%v", selected, priceID, cents, ok)
	}

	if err := ValidatePrice(stripePrice(priceID, cents, "eur", "year", true), TierPriceCheck{Cents: cents, Interval: "year"}); err != nil {
		t.Fatalf("validation tarif annuel = %v", err)
	}

	var gotPrice string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = r.ParseForm()
		gotPrice = r.PostForm.Get("line_items[0][price]")
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"id":"cs_year_1","url":"https://checkout.stripe.test/year"}`))
	}))
	defer srv.Close()

	c := NewStripeClient("sk_test_123", srv.URL)
	url, err := c.CreateCheckoutSession(context.Background(), CheckoutParams{
		PriceID:       priceID,
		UserID:        "user-1",
		CreatorID:     "pub-1",
		Plan:          "publication",
		TierID:        selected.ID,
		StripeAccount: "acct_1",
		FeePercent:    5,
		SuccessURL:    "https://qoe.test/billing?checkout=success",
		CancelURL:     "https://qoe.test/billing?checkout=cancel",
	})
	if err != nil {
		t.Fatalf("CreateCheckoutSession annuel: %v", err)
	}
	if url != "https://checkout.stripe.test/year" || gotPrice != "price_y2" {
		t.Fatalf("url=%q price=%q", url, gotPrice)
	}
}

func TestConnectOnboarding_Validation(t *testing.T) {
	r := chi.NewRouter()
	h := NewHandler(nil, "")
	h.RegisterProtected(r)

	// Sans utilisateur authentifié → 401.
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/v1/billing/connect?publisherId=pub-1", nil)
	r.ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("sans auth = %d, attendu 401", w.Code)
	}

	// Sans publisherId → 400.
	w = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodPost, "/v1/billing/connect", nil)
	req = req.WithContext(context.WithValue(req.Context(), middleware.UserIDKey, "user-1"))
	r.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("sans publisherId = %d, attendu 400", w.Code)
	}

	// Cadence invalide au checkout → 400.
	w = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodPost, "/v1/billing/checkout", strings.NewReader(`{"plan":"publication","publisherId":"pub-1","interval":"week"}`))
	req = req.WithContext(context.WithValue(req.Context(), middleware.UserIDKey, "user-1"))
	h.stripe = NewStripeClient("sk_test_123", "https://stripe.invalid")
	r.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("cadence invalide = %d, attendu 400 (body=%s)", w.Code, w.Body.String())
	}
}

func TestStripeClient_CircuitBreakerOpensOn5xxAndSkips400(t *testing.T) {
	var calls atomic.Int32
	var status atomic.Int32
	status.Store(http.StatusBadRequest)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		w.WriteHeader(int(status.Load()))
		_, _ = w.Write([]byte(`{"error":"bad_request"}`))
	}))
	defer srv.Close()

	c := NewStripeClient("sk_test_cb", srv.URL)
	c.cb = resilience.NewCircuitBreaker(resilience.Options{
		Name:             "test-stripe",
		FailureThreshold: 2,
		Cooldown:         time.Minute,
		CallTimeout:      time.Second,
		Registry:         observability.NewRegistry(),
	})

	for i := 0; i < 3; i++ {
		if _, err := c.GetPrice(context.Background(), "price_bad"); err == nil {
			t.Fatal("400 attendu")
		}
	}
	if c.cb.State() != resilience.StateClosed {
		t.Fatalf("400 ne doit pas ouvrir le circuit (state=%s)", c.cb.State())
	}

	status.Store(http.StatusInternalServerError)
	_, _ = c.GetPrice(context.Background(), "price_err")
	_, _ = c.GetPrice(context.Background(), "price_err")
	callsBefore := calls.Load()
	_, err := c.GetPrice(context.Background(), "price_err")
	if !errors.Is(err, resilience.ErrCircuitOpen) {
		t.Fatalf("3e 500 attendu ErrCircuitOpen, obtenu %v", err)
	}
	if calls.Load() != callsBefore {
		t.Fatal("le circuit ouvert ne doit pas appeler Stripe")
	}
}
