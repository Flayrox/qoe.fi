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
	"time"
)

// StripeClient appelle l'API Stripe. Zero valeur (ou clé vide) = non
// configuré : les routes répondent 503 explicite, jamais un faux succès.
type StripeClient struct {
	secretKey  string
	baseURL    string
	httpClient *http.Client
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
		"userId":   p.UserID,
		"creatorId": p.CreatorID,
		"plan":     p.Plan,
		"tierId":   p.TierID,
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

func (c *StripeClient) post(ctx context.Context, path string, form url.Values, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+path, strings.NewReader(form.Encode()))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+c.secretKey)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("stripe: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("stripe %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}
	if err := json.Unmarshal(body, out); err != nil {
		return fmt.Errorf("stripe: réponse illisible: %w", err)
	}
	return nil
}
