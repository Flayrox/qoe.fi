// Routes billing — formules, Checkout, portail abonné.
//
// Le front ne fabrique jamais un prix ni une commission : il envoie un plan
// (ou une formule) et reçoit une URL Stripe. Toute la confiance est ici.
package billing

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/qoefi/api/internal/middleware"
	"github.com/qoefi/api/internal/response"
)

// SetBilling branche le service et le client Stripe (nil = 503 explicite).
// plusPriceID est le tarif Stripe du bundle lecteur Qoefi Plus ;
// returnBaseURL est l'origine vers laquelle Stripe renvoie le navigateur.
func (h *Handler) SetBilling(svc *Service, stripe *StripeClient, plusPriceID, returnBaseURL string) {
	h.svc = svc
	h.stripe = stripe
	h.plusPriceID = strings.TrimSpace(plusPriceID)
	h.returnBaseURL = strings.TrimSuffix(strings.TrimSpace(returnBaseURL), "/")
	if h.returnBaseURL == "" {
		h.returnBaseURL = "http://localhost:3000"
	}
}

// RegisterProtected monte les routes authentifiées (groupe déjà protégé par
// CombinedAuth) : Checkout, portail, création de formule et onboarding Connect.
func (h *Handler) RegisterProtected(r chi.Router) {
	r.Post("/v1/billing/checkout", h.checkout)
	r.Post("/v1/billing/portal", h.portal)
	r.Post("/v1/billing/tiers", h.createTier)
	r.Post("/v1/billing/connect", h.connectOnboarding)
}

// GET /v1/billing/tiers?publisherId=… — public (affiché sur le paywall).
func (h *Handler) listTiers(w http.ResponseWriter, r *http.Request) {
	publisherID := strings.TrimSpace(r.URL.Query().Get("publisherId"))
	if publisherID == "" {
		response.BadRequest(w, "publisherId requis")
		return
	}
	tiers, err := h.svc.ListTiers(r.Context(), publisherID)
	if err != nil {
		response.Internal(w)
		return
	}
	response.OK(w, map[string]any{"tiers": tiers})
}

// validateTierPrices revérifie côté Stripe chaque tarif fourni avant de
// l'enregistrer : montant, devise, cadence et activation doivent correspondre
// à ce que la formule affiche. Sans Stripe configuré, un ID ne peut pas être
// vérifié → refus (503), jamais un enregistrement à l'aveugle.
func (h *Handler) validateTierPrices(ctx context.Context, in CreateTierInput) error {
	monthly := strings.TrimSpace(in.StripePriceIDMonthly)
	yearly := strings.TrimSpace(in.StripePriceIDYearly)
	if monthly == "" && yearly == "" {
		return nil
	}
	if h.stripe == nil || !h.stripe.Configured() {
		return ErrNotConfigured
	}

	type check struct {
		id       string
		cents    int
		interval string
	}
	checks := make([]check, 0, 2)
	if monthly != "" {
		checks = append(checks, check{monthly, in.MonthlyPriceCents, "month"})
	}
	if yearly != "" {
		if in.YearlyPriceCents == nil || *in.YearlyPriceCents <= 0 {
			return ErrInvalidTier
		}
		checks = append(checks, check{yearly, *in.YearlyPriceCents, "year"})
	}

	for _, c := range checks {
		price, err := h.stripe.GetPrice(ctx, c.id)
		if err != nil {
			return fmt.Errorf("%w: %v", ErrPriceUnverified, err)
		}
		if err := ValidatePrice(price, TierPriceCheck{Cents: c.cents, Interval: c.interval}); err != nil {
			return err
		}
	}
	return nil
}

// commissionPercent centralise le barème (une seule définition, testée).
func commissionPercent(isPro bool) int {
	if isPro {
		return 5
	}
	return 10
}

// normalizeCheckoutInterval valide la cadence demandée ("month" par défaut).
func normalizeCheckoutInterval(raw string) (string, bool) {
	v := strings.TrimSpace(raw)
	if v == "" {
		return "month", true
	}
	if v == "month" || v == "year" {
		return v, true
	}
	return "", false
}

// tierPriceForInterval retourne le Stripe Price ID et le montant attendu pour la
// cadence demandée ("month" ou "year").
func tierPriceForInterval(t Tier, interval string) (priceID string, cents int, ok bool) {
	if interval == "year" {
		if strings.TrimSpace(t.StripePriceIDYearly) == "" || t.YearlyPriceCents == nil || *t.YearlyPriceCents <= 0 {
			return "", 0, false
		}
		return t.StripePriceIDYearly, *t.YearlyPriceCents, true
	}
	if strings.TrimSpace(t.StripePriceIDMonthly) == "" || t.MonthlyPriceCents <= 0 {
		return "", 0, false
	}
	return t.StripePriceIDMonthly, t.MonthlyPriceCents, true
}

// selectPublicationTier choisit la première formule payable pour la cadence.
func selectPublicationTier(tiers []Tier, interval string) (Tier, string, int, bool) {
	for _, candidate := range tiers {
		if priceID, cents, ok := tierPriceForInterval(candidate, interval); ok {
			return candidate, priceID, cents, true
		}
	}
	return Tier{}, "", 0, false
}

type checkoutInput struct {
	// Plan : "plus" (bundle lecteur) ou "publication" (formule du créateur).
	Plan        string `json:"plan"`
	PublisherID string `json:"publisherId"`
	TierID      string `json:"tierId"`
	// Interval : "month" (défaut) ou "year".
	Interval string `json:"interval"`
}

// POST /v1/billing/checkout — crée une session d'abonnement.
func (h *Handler) checkout(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	if userID == "" {
		response.Unauthorized(w, "Authentification requise")
		return
	}
	if h.stripe == nil || !h.stripe.Configured() {
		response.Error(w, http.StatusServiceUnavailable, "paiement non configuré")
		return
	}

	var in checkoutInput
	if !response.DecodeJSON(w, r, &in) {
		return
	}

	params := CheckoutParams{
		UserID:     userID,
		Plan:       strings.TrimSpace(in.Plan),
		SuccessURL: h.returnBaseURL + "/billing?checkout=success",
		CancelURL:  h.returnBaseURL + "/billing?checkout=cancel",
	}
	email, err := h.svc.UserEmail(r.Context(), userID)
	if err == nil {
		params.CustomerEmail = email
	}

	switch params.Plan {
	case "plus":
		if h.plusPriceID == "" {
			response.Error(w, http.StatusServiceUnavailable, "offre Plus non configurée")
			return
		}
		params.PriceID = h.plusPriceID
	case "publication":
		interval, ok := normalizeCheckoutInterval(in.Interval)
		if !ok {
			response.BadRequest(w, "cadence invalide")
			return
		}
		// Sans tierId, on prend la formule payable la moins chère : c'est le
		// CTA « Membre Premium » du paywall, qui n'a pas à connaître le
		// catalogue. Aucune formule payable → 503, jamais un prix inventé.
		var tier Tier
		if strings.TrimSpace(in.TierID) == "" {
			tiers, err := h.svc.ListTiers(r.Context(), in.PublisherID)
			if err != nil {
				response.Internal(w)
				return
			}
			selected, _, _, found := selectPublicationTier(tiers, interval)
			if !found {
				response.Error(w, http.StatusServiceUnavailable, "aucune formule payable pour cette publication")
				return
			}
			tier = selected
		} else {
			loaded, err := h.svc.GetTier(r.Context(), in.TierID)
			if errors.Is(err, ErrTierNotFound) {
				response.NotFound(w, "formule introuvable")
				return
			}
			if err != nil {
				log.Printf("[billing] lecture formule %s: %v", in.TierID, err)
				response.Internal(w)
				return
			}
			tier = loaded
		}
		if tier.PublisherID != in.PublisherID {
			response.Forbidden(w, "formule d'une autre publication")
			return
		}
		priceID, expectedCents, ok := tierPriceForInterval(tier, interval)
		if !ok {
			response.Error(w, http.StatusServiceUnavailable, "tarif Stripe non configuré pour cette formule")
			return
		}
		account, err := h.svc.PublisherStripeAccount(r.Context(), tier.PublisherID)
		if err != nil {
			log.Printf("[billing] compte Connect de %s: %v", tier.PublisherID, err)
			response.Internal(w)
			return
		}
		if account == "" {
			// Sans compte Connect, Stripe n'a nulle part où transférer : les
			// fonds resteraient sur la plateforme. On refuse la vente.
			response.ErrorCode(w, http.StatusConflict, "CONNECT_REQUIRED",
				"la publication doit connecter Stripe avant d'encaisser")
			return
		}
		// Le tarif a pu être enregistré avant cette garde (ou modifié en base) :
		// on revérifie au dernier moment que le débit correspond à l'affiché.
		price, err := h.stripe.GetPrice(r.Context(), priceID)
		if err != nil {
			log.Printf("[billing] checkout tarif illisible: %v", err)
			response.Error(w, http.StatusServiceUnavailable, "paiement indisponible")
			return
		}
		if err := ValidatePrice(price, TierPriceCheck{Cents: expectedCents, Interval: interval}); err != nil {
			log.Printf("[billing] checkout tarif incohérent tier=%s: %v", tier.ID, err)
			response.ErrorCode(w, http.StatusConflict, "PRICE_MISMATCH",
				"le tarif Stripe ne correspond pas au montant affiché")
			return
		}
		params.PriceID = priceID
		params.CreatorID = tier.PublisherID
		params.TierID = tier.ID
		params.StripeAccount = account
		// Commission : 10 % par défaut, 5 % pour une publication Pro
		// (source unique du droit : SubscriptionGrant).
		params.FeePercent = commissionPercent(h.svc.IsPro(r.Context(), tier.PublisherID))
	default:
		response.BadRequest(w, "plan inconnu")
		return
	}

	url, err := h.stripe.CreateCheckoutSession(r.Context(), params)
	if err != nil {
		log.Printf("[billing] checkout: %v", err)
		response.Error(w, http.StatusServiceUnavailable, "paiement indisponible")
		return
	}
	response.OK(w, map[string]string{"url": url})
}

// POST /v1/billing/portal — portail de facturation du lecteur.
func (h *Handler) portal(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	if userID == "" {
		response.Unauthorized(w, "Authentification requise")
		return
	}
	if h.stripe == nil || !h.stripe.Configured() {
		response.Error(w, http.StatusServiceUnavailable, "paiement non configuré")
		return
	}
	customer, err := h.svc.ReaderStripeCustomer(r.Context(), userID)
	if err != nil {
		log.Printf("[billing] client Stripe de %s: %v", userID, err)
		response.Internal(w)
		return
	}
	if customer == "" {
		response.ErrorCode(w, http.StatusConflict, "NO_CUSTOMER", "aucun abonnement Stripe pour ce compte")
		return
	}
	url, err := h.stripe.CreatePortalSession(r.Context(), customer, h.returnBaseURL+"/billing")
	if err != nil {
		log.Printf("[billing] portal: %v", err)
		response.Error(w, http.StatusServiceUnavailable, "portail indisponible")
		return
	}
	response.OK(w, map[string]string{"url": url})
}

// POST /v1/billing/tiers — crée une formule pour sa publication.
func (h *Handler) createTier(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	if userID == "" {
		response.Unauthorized(w, "Authentification requise")
		return
	}
	publisherID := strings.TrimSpace(r.URL.Query().Get("publisherId"))
	if publisherID == "" {
		response.BadRequest(w, "publisherId requis")
		return
	}

	var in CreateTierInput
	if !response.DecodeJSON(w, r, &in) {
		return
	}
	// Propriété AVANT l'appel Stripe : un non-propriétaire ne doit pas pouvoir
	// sonder des identifiants de tarifs via les messages d'erreur.
	ok, err := h.svc.CanManagePublisher(r.Context(), userID, publisherID)
	if err != nil {
		response.Internal(w)
		return
	}
	if !ok {
		response.Forbidden(w, "publication non autorisée")
		return
	}
	if err := h.validateTierPrices(r.Context(), in); err != nil {
		switch {
		case errors.Is(err, ErrNotConfigured):
			response.Error(w, http.StatusServiceUnavailable,
				"Stripe non configuré : impossible de vérifier le tarif")
		case errors.Is(err, ErrInvalidTier):
			response.BadRequest(w, "prix annuel requis pour un tarif annuel")
		case errors.Is(err, ErrPriceUnverified):
			response.BadRequest(w, "tarif Stripe introuvable ou inaccessible")
		case errors.Is(err, ErrPriceMismatch):
			response.BadRequest(w, "le tarif Stripe ne correspond pas au montant affiché")
		default:
			response.Internal(w)
		}
		return
	}
	tier, err := h.svc.CreateTier(r.Context(), userID, publisherID, in)
	if err != nil {
		switch {
		case errors.Is(err, ErrInvalidTier):
			response.BadRequest(w, "nom et prix mensuel requis")
		case errors.Is(err, ErrForbidden):
			response.Forbidden(w, "publication non autorisée")
		default:
			response.Internal(w)
		}
		return
	}
	response.Created(w, tier)
}

// POST /v1/billing/connect — démarre ou reprend l'onboarding Stripe Connect.
func (h *Handler) connectOnboarding(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	if userID == "" {
		response.Unauthorized(w, "Authentification requise")
		return
	}

	publisherID := strings.TrimSpace(r.URL.Query().Get("publisherId"))
	if publisherID == "" && r.Body != nil {
		var body struct {
			PublisherID string `json:"publisherId"`
		}
		if err := json.NewDecoder(io.LimitReader(r.Body, 1<<16)).Decode(&body); err != nil && !errors.Is(err, io.EOF) {
			response.BadRequest(w, "JSON invalide")
			return
		}
		publisherID = strings.TrimSpace(body.PublisherID)
	}
	if publisherID == "" {
		response.BadRequest(w, "publisherId requis")
		return
	}

	ok, err := h.svc.CanManagePublisher(r.Context(), userID, publisherID)
	if err != nil {
		response.Internal(w)
		return
	}
	if !ok {
		response.Forbidden(w, "publication non autorisée")
		return
	}
	if h.stripe == nil || !h.stripe.Configured() {
		response.Error(w, http.StatusServiceUnavailable, "paiement non configuré")
		return
	}

	accountID, err := h.svc.PublisherStripeAccount(r.Context(), publisherID)
	if err != nil {
		log.Printf("[billing] compte Connect de %s: %v", publisherID, err)
		response.Internal(w)
		return
	}
	if accountID == "" {
		email, _ := h.svc.UserEmail(r.Context(), userID)
		accountID, err = h.stripe.CreateConnectAccount(r.Context(), email, publisherID)
		if err != nil {
			log.Printf("[billing] connect account: %v", err)
			response.Error(w, http.StatusServiceUnavailable, "onboarding indisponible")
			return
		}
		if err := h.svc.SavePublisherStripeAccount(r.Context(), publisherID, accountID); err != nil {
			log.Printf("[billing] save connect account: %v", err)
			response.Internal(w)
			return
		}
	}

	base := strings.TrimSuffix(strings.TrimSpace(h.returnBaseURL), "/")
	if base == "" {
		base = "http://localhost:3000"
	}
	url, err := h.stripe.CreateAccountLink(
		r.Context(),
		accountID,
		base+"/monetization?connect=refresh",
		base+"/monetization?connect=return",
	)
	if err != nil {
		log.Printf("[billing] connect link: %v", err)
		response.Error(w, http.StatusServiceUnavailable, "onboarding indisponible")
		return
	}
	response.OK(w, map[string]string{
		"url":             url,
		"stripeAccountId": accountID,
	})
}
