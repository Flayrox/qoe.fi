// Routes billing — formules, Checkout, portail abonné.
//
// Le front ne fabrique jamais un prix ni une commission : il envoie un plan
// (ou une formule) et reçoit une URL Stripe. Toute la confiance est ici.
package billing

import (
	"errors"
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
// CombinedAuth) : Checkout, portail et création de formule.
func (h *Handler) RegisterProtected(r chi.Router) {
	r.Post("/v1/billing/checkout", h.checkout)
	r.Post("/v1/billing/portal", h.portal)
	r.Post("/v1/billing/tiers", h.createTier)
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

// commissionPercent centralise le barème (une seule définition, testée).
func commissionPercent(isPro bool) int {
	if isPro {
		return 5
	}
	return 10
}

type checkoutInput struct {
	// Plan : "plus" (bundle lecteur) ou "publication" (formule du créateur).
	Plan        string `json:"plan"`
	PublisherID string `json:"publisherId"`
	TierID      string `json:"tierId"`
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
			found := false
			for _, candidate := range tiers {
				if candidate.StripePriceIDMonthly != "" {
					tier = candidate
					found = true
					break
				}
			}
			if !found {
				response.Error(w, http.StatusServiceUnavailable, "aucune formule payable pour cette publication")
				return
			}
		} else {
			loaded, err := h.svc.GetTier(r.Context(), in.TierID)
			if err != nil {
				response.NotFound(w, "formule introuvable")
				return
			}
			tier = loaded
		}
		if tier.PublisherID != in.PublisherID {
			response.Forbidden(w, "formule d'une autre publication")
			return
		}
		if tier.StripePriceIDMonthly == "" {
			response.Error(w, http.StatusServiceUnavailable, "tarif Stripe non configuré pour cette formule")
			return
		}
		params.PriceID = tier.StripePriceIDMonthly
		params.CreatorID = tier.PublisherID
		params.TierID = tier.ID
		params.StripeAccount = h.svc.PublisherStripeAccount(r.Context(), tier.PublisherID)
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
	customer := h.svc.ReaderStripeCustomer(r.Context(), userID)
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
