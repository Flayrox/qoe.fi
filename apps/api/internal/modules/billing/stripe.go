// Package billing — client HTTP minimal de l'API Stripe.
//
// Trois appels suffisent (session Checkout, portail abonné) et un SDK
// ajouterait une dépendance lourde pour du form-encoded : on parle
// directement à l'API REST. La clé secrète ne quitte jamais le serveur.
package billing

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/qoefi/api/internal/resilience"
)

// Price : sous-ensemble de l'objet Price Stripe utile à la vérification des
// formules (montant, devise, cadence, actif).
type Price struct {
	ID         string `json:"id"`
	Active     bool   `json:"active"`
	Currency   string `json:"currency"`
	UnitAmount *int   `json:"unit_amount"`
	Recurring  *struct {
		Interval      string `json:"interval"`
		IntervalCount int    `json:"interval_count"`
	} `json:"recurring"`
}

// StripeClient appelle l'API Stripe. Zero valeur (ou clé vide) = non
// configuré : les routes répondent 503 explicite, jamais un faux succès.
type StripeClient struct {
	secretKey  string
	baseURL    string
	httpClient *http.Client
	cbOnce     sync.Once
	cb         *resilience.CircuitBreaker
}

// NewStripeClient construit le client. baseURL vide → API publique (les
// tests injectent un httptest.Server).
func NewStripeClient(secretKey, baseURL string) *StripeClient {
	if strings.TrimSpace(baseURL) == "" {
		baseURL = "https://api.stripe.com"
	}
	return &StripeClient{
		secretKey:  strings.TrimSpace(secretKey),
		baseURL:    strings.TrimSuffix(baseURL, "/"),
		httpClient: &http.Client{Timeout: 15 * time.Second},
	}
}

func (c *StripeClient) breaker() *resilience.CircuitBreaker {
	if c.cb != nil {
		return c.cb
	}
	c.cbOnce.Do(func() {
		c.cb = resilience.NewCircuitBreaker(resilience.Options{
			Name:             "stripe",
			FailureThreshold: 5,
			Cooldown:         30 * time.Second,
			CallTimeout:      15 * time.Second,
		})
	})
	return c.cb
}

// Configured dit si une clé est présente.
func (c *StripeClient) Configured() bool {
	return c != nil && c.secretKey != ""
}

// CheckoutParams décrit une session d'abonnement.
type CheckoutParams struct {
	PriceID string
	// CustomerEmail pré-remplit le formulaire Stripe (le client est créé
	// côté Stripe : aucune donnée bancaire ne transite par qoe.fi).
	CustomerEmail string
	UserID        string
	CreatorID     string
	Plan          string
	TierID        string
	// StripeAccount : compte Connect du créateur (destination des fonds).
	StripeAccount string
	// FeePercent : commission plateforme (10 % gratuit, 5 % Pro).
	FeePercent int
	SuccessURL string
	CancelURL  string
}

// CreateCheckoutSession crée une session d'abonnement et renvoie son URL.
func (c *StripeClient) CreateCheckoutSession(ctx context.Context, p CheckoutParams) (string, error) {
	if !c.Configured() {
		return "", ErrNotConfigured
	}
	if strings.TrimSpace(p.PriceID) == "" {
		return "", fmt.Errorf("stripe: tarif manquant")
	}

	form := url.Values{}
	form.Set("mode", "subscription")
	form.Set("line_items[0][price]", p.PriceID)
	form.Set("line_items[0][quantity]", "1")
	form.Set("success_url", p.SuccessURL)
	form.Set("cancel_url", p.CancelURL)
	if p.CustomerEmail != "" {
		form.Set("customer_email", p.CustomerEmail)
	}
	if p.UserID != "" {
		form.Set("client_reference_id", p.UserID)
	}

	// Les metadata sont posées DEUX fois : sur la session (checkout.session
	// .completed) et sur l'abonnement (customer.subscription.*), sinon les
	// événements ultérieurs perdent le lien vers la publication.
	meta := map[string]string{
		"userId":    p.UserID,
		"creatorId": p.CreatorID,
		"plan":      p.Plan,
		"tierId":    p.TierID,
	}
	for k, v := range meta {
		if v == "" {
			continue
		}
		form.Set("metadata["+k+"]", v)
		form.Set("subscription_data[metadata]["+k+"]", v)
	}

	if p.StripeAccount != "" {
		form.Set("subscription_data[transfer_data][destination]", p.StripeAccount)
		fee := p.FeePercent
		if fee <= 0 {
			fee = 10
		}
		if fee > 100 {
			fee = 100
		}
		form.Set("subscription_data[application_fee_percent]", strconv.Itoa(fee))
	}

	var out struct {
		ID  string `json:"id"`
		URL string `json:"url"`
	}
	if err := c.post(ctx, "/v1/checkout/sessions", form, &out); err != nil {
		return "", err
	}
	if out.URL == "" {
		return "", fmt.Errorf("stripe: session sans url")
	}
	return out.URL, nil
}

// GetPrice relit un tarif. Sert à refuser un ID saisi par le créateur qui ne
// correspond pas au montant affiché (aucune confiance dans l'entrée client).
func (c *StripeClient) GetPrice(ctx context.Context, priceID string) (Price, error) {
	if !c.Configured() {
		return Price{}, ErrNotConfigured
	}
	priceID = strings.TrimSpace(priceID)
	if priceID == "" {
		return Price{}, fmt.Errorf("stripe: tarif manquant")
	}
	var out Price
	if err := c.get(ctx, "/v1/prices/"+url.PathEscape(priceID), &out); err != nil {
		return Price{}, err
	}
	return out, nil
}

// CreatePortalSession ouvre le portail de facturation d'un client existant.
func (c *StripeClient) CreatePortalSession(ctx context.Context, customerID, returnURL string) (string, error) {
	if !c.Configured() {
		return "", ErrNotConfigured
	}
	if strings.TrimSpace(customerID) == "" {
		return "", fmt.Errorf("stripe: client inconnu")
	}
	form := url.Values{}
	form.Set("customer", customerID)
	form.Set("return_url", returnURL)

	var out struct {
		URL string `json:"url"`
	}
	if err := c.post(ctx, "/v1/billing_portal/sessions", form, &out); err != nil {
		return "", err
	}
	if out.URL == "" {
		return "", fmt.Errorf("stripe: portail sans url")
	}
	return out.URL, nil
}

// CreateConnectAccount provisionne un compte Express Stripe Connect pour une
// publication (la destination des paiements d'abonnement).
func (c *StripeClient) CreateConnectAccount(ctx context.Context, email, publisherID string) (string, error) {
	if !c.Configured() {
		return "", ErrNotConfigured
	}
	publisherID = strings.TrimSpace(publisherID)
	if publisherID == "" {
		return "", fmt.Errorf("stripe: publication manquante")
	}
	form := url.Values{}
	form.Set("type", "express")
	form.Set("country", "FR")
	if email = strings.TrimSpace(email); email != "" {
		form.Set("email", email)
	}
	form.Set("capabilities[card_payments][requested]", "true")
	form.Set("capabilities[transfers][requested]", "true")
	form.Set("metadata[publisherId]", publisherID)

	var out struct {
		ID string `json:"id"`
	}
	if err := c.post(ctx, "/v1/accounts", form, &out); err != nil {
		return "", err
	}
	if out.ID == "" {
		return "", fmt.Errorf("stripe: compte connect sans id")
	}
	return out.ID, nil
}

// CreateAccountLink génère le lien Stripe Connect hébergé permettant au
// créateur de finaliser son onboarding bancaire et KYC.
func (c *StripeClient) CreateAccountLink(ctx context.Context, accountID, refreshURL, returnURL string) (string, error) {
	if !c.Configured() {
		return "", ErrNotConfigured
	}
	accountID = strings.TrimSpace(accountID)
	refreshURL = strings.TrimSpace(refreshURL)
	returnURL = strings.TrimSpace(returnURL)
	if accountID == "" {
		return "", fmt.Errorf("stripe: compte connect manquant")
	}
	if refreshURL == "" || returnURL == "" {
		return "", fmt.Errorf("stripe: urls de retour manquantes")
	}
	form := url.Values{}
	form.Set("account", accountID)
	form.Set("type", "account_onboarding")
	form.Set("refresh_url", refreshURL)
	form.Set("return_url", returnURL)

	var out struct {
		URL string `json:"url"`
	}
	if err := c.post(ctx, "/v1/account_links", form, &out); err != nil {
		return "", err
	}
	if out.URL == "" {
		return "", fmt.Errorf("stripe: lien d'onboarding sans url")
	}
	return out.URL, nil
}

func (c *StripeClient) get(ctx context.Context, path string, out any) error {
	return c.doRequest(ctx, http.MethodGet, path, nil, out)
}

func (c *StripeClient) post(ctx context.Context, path string, form url.Values, out any) error {
	return c.doRequest(ctx, http.MethodPost, path, form, out)
}

func (c *StripeClient) doRequest(ctx context.Context, method, path string, form url.Values, out any) error {
	var encoded string
	if form != nil {
		encoded = form.Encode()
	}
	var clientErr error
	execErr := c.breaker().Execute(ctx, func(callCtx context.Context) error {
		var bodyReader io.Reader
		if form != nil {
			bodyReader = strings.NewReader(encoded)
		}
		req, err := http.NewRequestWithContext(callCtx, method, c.baseURL+path, bodyReader)
		if err != nil {
			clientErr = err
			return nil
		}
		req.Header.Set("Authorization", "Bearer "+c.secretKey)
		if form != nil {
			req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		}
		resp, err := c.httpClient.Do(req)
		if err != nil {
			return fmt.Errorf("stripe: %w", err)
		}
		defer resp.Body.Close()

		body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
		if resp.StatusCode == http.StatusTooManyRequests || resp.StatusCode >= 500 {
			return fmt.Errorf("stripe %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
		}
		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			clientErr = fmt.Errorf("stripe %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
			return nil
		}
		if err := json.Unmarshal(body, out); err != nil {
			return fmt.Errorf("stripe: réponse illisible: %w", err)
		}
		return nil
	})
	if execErr != nil {
		return execErr
	}
	return clientErr
}
