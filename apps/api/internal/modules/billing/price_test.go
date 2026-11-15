package billing

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func stripePrice(id string, cents int, currency, interval string, active bool) Price {
	p := Price{ID: id, Active: active, Currency: currency, UnitAmount: &cents}
	p.Recurring = &struct {
		Interval      string `json:"interval"`
		IntervalCount int    `json:"interval_count"`
	}{Interval: interval, IntervalCount: 1}
	return p
}

// TestValidatePrice : le tarif doit débiter exactement l'affiché, en euros,
// à la bonne cadence, et être encore actif.
func TestValidatePrice(t *testing.T) {
	ok := stripePrice("price_1", 500, "eur", "month", true)
	if err := ValidatePrice(ok, TierPriceCheck{Cents: 500, Interval: "month"}); err != nil {
		t.Fatalf("tarif conforme refusé: %v", err)
	}

	cases := []struct {
		name  string
		price Price
		check TierPriceCheck
	}{
		{"montant différent", stripePrice("price_1", 5000, "eur", "month", true), TierPriceCheck{Cents: 500, Interval: "month"}},
		{"devise différente", stripePrice("price_1", 500, "usd", "month", true), TierPriceCheck{Cents: 500, Interval: "month"}},
		{"archivé", stripePrice("price_1", 500, "eur", "month", false), TierPriceCheck{Cents: 500, Interval: "month"}},
		{"cadence annuelle pour un mensuel", stripePrice("price_1", 500, "eur", "year", true), TierPriceCheck{Cents: 500, Interval: "month"}},
		{"sans montant", Price{ID: "price_1", Active: true, Currency: "eur"}, TierPriceCheck{Cents: 500, Interval: "month"}},
		{"sans récurrence", Price{ID: "price_1", Active: true, Currency: "eur", UnitAmount: intPtr(500)}, TierPriceCheck{Cents: 500, Interval: "month"}},
		{"identifiant vide", stripePrice("", 500, "eur", "month", true), TierPriceCheck{Cents: 500, Interval: "month"}},
		{"montant affiché nul", stripePrice("price_1", 0, "eur", "month", true), TierPriceCheck{Cents: 0, Interval: "month"}},
	}
	for _, tc := range cases {
		if err := ValidatePrice(tc.price, tc.check); !errors.Is(err, ErrPriceMismatch) {
			t.Errorf("%s : err = %v, attendu ErrPriceMismatch", tc.name, err)
		}
	}
}

func intPtr(v int) *int { return &v }

func TestGetPrice(t *testing.T) {
	var gotPath, gotAuth string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		gotAuth = r.Header.Get("Authorization")
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"id":"price_42","active":true,"currency":"eur","unit_amount":500,
			"recurring":{"interval":"month","interval_count":1}}`))
	}))
	defer srv.Close()

	c := NewStripeClient("sk_test_123", srv.URL)
	p, err := c.GetPrice(context.Background(), "price_42")
	if err != nil {
		t.Fatalf("GetPrice: %v", err)
	}
	if gotPath != "/v1/prices/price_42" || gotAuth != "Bearer sk_test_123" {
		t.Fatalf("requête = %s auth=%q", gotPath, gotAuth)
	}
	if p.Currency != "eur" || p.UnitAmount == nil || *p.UnitAmount != 500 ||
		p.Recurring == nil || p.Recurring.Interval != "month" {
		t.Fatalf("tarif mal décodé: %+v", p)
	}
}

func TestGetPrice_NonConfigure(t *testing.T) {
	c := NewStripeClient("", "")
	if _, err := c.GetPrice(context.Background(), "price_1"); !errors.Is(err, ErrNotConfigured) {
		t.Fatalf("err = %v, attendu ErrNotConfigured", err)
	}
}

// TestValidateTierPrices : la garde d'enregistrement interroge réellement
// Stripe, refuse un montant incohérent et refuse tout ID quand Stripe n'est
// pas configuré (on n'enregistre jamais un tarif non vérifié).
func TestValidateTierPrices(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		amount := "500"
		if strings.HasSuffix(r.URL.Path, "price_9999") {
			amount = "9999"
		}
		_, _ = w.Write([]byte(`{"id":"` + strings.TrimPrefix(r.URL.Path, "/v1/prices/") +
			`","active":true,"currency":"eur","unit_amount":` + amount + `,
			"recurring":{"interval":"month","interval_count":1}}`))
	}))
	defer srv.Close()

	h := NewHandler(nil, "")
	h.stripe = NewStripeClient("sk_test_123", srv.URL)

	ok := CreateTierInput{Name: "Soutien", MonthlyPriceCents: 500, StripePriceIDMonthly: "price_500"}
	if err := h.validateTierPrices(context.Background(), ok); err != nil {
		t.Fatalf("tarif conforme refusé: %v", err)
	}

	bad := ok
	bad.MonthlyPriceCents = 5
	if err := h.validateTierPrices(context.Background(), bad); !errors.Is(err, ErrPriceMismatch) {
		t.Fatalf("montant incohérent accepté: %v", err)
	}

	inconnu := ok
	inconnu.StripePriceIDMonthly = ""
	if err := h.validateTierPrices(context.Background(), inconnu); err != nil {
		t.Fatalf("formule sans tarif Stripe doit passer: %v", err)
	}

	annuelSansPrix := ok
	annuelSansPrix.StripePriceIDYearly = "price_500"
	if err := h.validateTierPrices(context.Background(), annuelSansPrix); !errors.Is(err, ErrInvalidTier) {
		t.Fatalf("tarif annuel sans montant accepté: %v", err)
	}

	h.stripe = NewStripeClient("", "")
	if err := h.validateTierPrices(context.Background(), ok); !errors.Is(err, ErrNotConfigured) {
		t.Fatalf("Stripe non configuré : err = %v, attendu ErrNotConfigured", err)
	}
}
