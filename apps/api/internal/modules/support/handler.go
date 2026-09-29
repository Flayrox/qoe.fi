package support

// Routes support côté utilisateur (authentifié, Y COMPRIS restreint :
// demander de l'aide reste possible — tranche 6).

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/qoefi/api/internal/middleware"
	"github.com/qoefi/api/internal/response"
	internalsupport "github.com/qoefi/api/internal/support"
	"github.com/redis/go-redis/v9"
)

// Handler expose les routes support.
type Handler struct {
	svc *Service
	// publicLimiter (optionnel) : rate-limit Redis du formulaire public
	// (vitrine, sans compte — première barrière, le budget est la seconde).
	rc     *redis.Client
	window time.Duration
	max    int
}

// SetPublicRateLimit branche le rate-limit du formulaire public (no-op si
// Redis absent — le budget atomique reste la barrière).
func (h *Handler) SetPublicRateLimit(rc *redis.Client, window time.Duration, max int) {
	h.rc = rc
	h.window = window
	h.max = max
}

// publicLimiter enveloppe le dépôt public du limiteur branché (même
// pattern que home.subscribeLimiter : .ServeHTTP à l'enregistrement).
func (h *Handler) publicLimiter(next http.HandlerFunc) http.Handler {
	if h.rc == nil || h.max <= 0 {
		return next
	}
	return middleware.RateLimit("support-public", h.rc, h.window, h.max, false)(next)
}

// NewHandler construit le handler.
func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

func (h *Handler) userID(w http.ResponseWriter, r *http.Request) (string, bool) {
	uid, ok := middleware.UserID(r.Context())
	if !ok || uid == "" {
		response.Unauthorized(w, "Authentification requise")
		return "", false
	}
	return uid, true
}

// RegisterProtected enregistre les routes (groupe authentifié).
func (h *Handler) RegisterProtected(r chi.Router) {
	r.Get("/v1/support/tickets", h.list)
	r.Post("/v1/support/tickets", h.open)
	r.Get("/v1/support/tickets/{id}", h.detail)
	r.Post("/v1/support/tickets/{id}/messages", h.addMessage)
}

// RegisterPublic enregistre le dépôt public (vitrine, SANS compte obligatoire
// — le cas « compte perdu »). Auth optionnelle : si un JWT est présent,
// le dossier est ouvert AU COMPTE (openedBy = userID) ; sinon en invité
// (guest:<email>). Réponse avec la référence (UUID non devinable) à conserver.
func (h *Handler) RegisterPublic(r chi.Router) {
	r.Post("/v1/support/public/tickets", h.publicLimiter(h.openPublic).ServeHTTP)
	// Articles d'aide publiés (centre d'aide — sans auth, cacheable).
	r.Get("/v1/support/articles", h.listArticles)
}

// GET /v1/support/articles — articles publiés, ordre voulu puis récents.
func (h *Handler) listArticles(w http.ResponseWriter, r *http.Request) {
	items, err := h.svc.ListArticles(r.Context())
	if err != nil {
		response.Internal(w)
		return
	}
	if items == nil {
		items = []internalsupport.Article{}
	}
	response.OK(w, map[string]any{"items": items})
}

// POST /v1/support/public/tickets — dépôt public.
// Body : { name?, email, kind, subject, message }. 409 si un dossier est
// déjà ouvert (même adresse+motif — écrire dedans après connexion ou
// nouveau motif), 429 si plafond journalier atteint.
func (h *Handler) openPublic(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Name    string `json:"name"`
		Email   string `json:"email"`
		Kind    string `json:"kind"`
		Subject string `json:"subject"`
		Message string `json:"message"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	uid, _ := middleware.UserID(r.Context()) // absent = invité (pas une erreur)
	t, err := h.svc.OpenPublicTicket(r.Context(), uid, in.Name, in.Email, in.Kind, in.Subject, in.Message)
	if err != nil {
		switch {
		case errors.Is(err, internalsupport.ErrPublicBudgetExhausted):
			w.Header().Set("Retry-After", "86400")
			response.Error(w, http.StatusTooManyRequests, err.Error())
		case errors.Is(err, internalsupport.ErrPublicSuspended):
			w.Header().Set("Retry-After", "300")
			response.Error(w, http.StatusServiceUnavailable, err.Error())
		default:
			h.mapErr(w, err)
		}
		return
	}
	response.OK(w, map[string]any{"success": true, "id": t.ID})
}

func (h *Handler) mapErr(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, internalsupport.ErrTicketForbidden):
		response.Forbidden(w, err.Error())
	case errors.Is(err, internalsupport.ErrTicketNotFound):
		response.NotFound(w, "Dossier introuvable.")
	case errors.Is(err, internalsupport.ErrTicketAlreadyOpen):
		response.Error(w, http.StatusConflict, err.Error())
	case errors.Is(err, internalsupport.ErrTicketClosed):
		response.Error(w, http.StatusGone, err.Error())
	case errors.Is(err, internalsupport.ErrInvalidTicket):
		response.BadRequest(w, err.Error())
	default:
		response.Internal(w)
	}
}

// GET /v1/support/tickets — mes dossiers.
func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	uid, ok := h.userID(w, r)
	if !ok {
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	items, total, err := h.svc.ListTickets(r.Context(), uid, limit, offset)
	if err != nil {
		h.mapErr(w, err)
		return
	}
	response.OK(w, map[string]any{"items": items, "total": total})
}

// POST /v1/support/tickets — ouvrir un dossier.
// Body : { kind, subject, message, relatedType?, relatedId? }.
// L'ouverture NE CHANGE RIEN (ni suspension levée, ni permission accordée).
func (h *Handler) open(w http.ResponseWriter, r *http.Request) {
	uid, ok := h.userID(w, r)
	if !ok {
		return
	}
	var in struct {
		Kind        string `json:"kind"`
		Subject     string `json:"subject"`
		Message     string `json:"message"`
		RelatedType string `json:"relatedType"`
		RelatedID   string `json:"relatedId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil || in.Kind == "" || in.Subject == "" {
		response.BadRequest(w, "JSON invalide (kind, subject et message requis)")
		return
	}
	t, err := h.svc.OpenTicket(r.Context(), uid, in.Kind, in.Subject, in.Message, in.RelatedType, in.RelatedID)
	if err != nil {
		h.mapErr(w, err)
		return
	}
	response.OK(w, t)
}

// GET /v1/support/tickets/{id} — mon dossier avec ses messages.
func (h *Handler) detail(w http.ResponseWriter, r *http.Request) {
	uid, ok := h.userID(w, r)
	if !ok {
		return
	}
	t, err := h.svc.GetTicket(r.Context(), uid, chi.URLParam(r, "id"))
	if err != nil {
		h.mapErr(w, err)
		return
	}
	response.OK(w, t)
}

// POST /v1/support/tickets/{id}/messages — écrire à mon dossier.
func (h *Handler) addMessage(w http.ResponseWriter, r *http.Request) {
	uid, ok := h.userID(w, r)
	if !ok {
		return
	}
	var in struct {
		Body string `json:"body"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil || in.Body == "" {
		response.BadRequest(w, "JSON invalide (body requis)")
		return
	}
	t, err := h.svc.AddMessage(r.Context(), uid, chi.URLParam(r, "id"), in.Body)
	if err != nil {
		h.mapErr(w, err)
		return
	}
	response.OK(w, t)
}
