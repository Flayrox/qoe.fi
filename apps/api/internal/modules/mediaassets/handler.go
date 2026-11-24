package mediaassets

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/qoefi/api/internal/middleware"
	"github.com/qoefi/api/internal/observability"
	"github.com/qoefi/api/internal/response"
	"github.com/qoefi/api/internal/secguard"
)

type Handler struct {
	svc   *Service
	guard *secguard.Guard
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// SetSecurityGuard branche le contrôle de débit GCRA + Trust Tier sur le preflight.
func (h *Handler) SetSecurityGuard(g *secguard.Guard) *Handler {
	h.guard = g
	return h
}

func (h *Handler) Register(r chi.Router) {
	r.Post("/v1/media-assets/preflight", h.preflight)
	r.Post("/v1/media-assets", h.register)
	r.Get("/v1/media-assets", h.list)
}

// POST /v1/media-assets/preflight — contrôle rapide (rate limit GCRA, taille,
// MIME, throttle horaire, quota utilisateur) exécuté AVANT Sharp / OpenAI.
func (h *Handler) preflight(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserID(r.Context())
	if !ok || userID == "" {
		response.Unauthorized(w, "Non authentifié")
		return
	}
	var in PreflightInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		observability.Default().IncMediaPreflightRejection("validation")
		response.BadRequest(w, "JSON invalide")
		return
	}

	if h.guard != nil {
		prof := h.guard.EvaluateRequest(r.Context(), r, userID)
		if !h.guard.EnforceRateLimit(r.Context(), w, r, "media-upload", userID, prof.Tier, secguard.QuotasMediaUpload) {
			observability.Default().IncMediaPreflightRejection("rate_limit")
			return
		}
	}

	res, err := h.svc.Preflight(r.Context(), userID, in)
	if err != nil {
		var verr ValidationError
		switch {
		case errors.As(err, &verr):
			observability.Default().IncMediaPreflightRejection("validation")
		case errors.Is(err, ErrThrottled):
			observability.Default().IncMediaPreflightRejection("rate_limit")
		case errors.Is(err, ErrQuotaExceeded):
			observability.Default().IncMediaPreflightRejection("quota")
		default:
			observability.Default().IncMediaPreflightRejection("internal")
		}
		h.fail(w, "preflight", err)
		return
	}

	response.OK(w, res)
}

// GET /v1/media-assets — bibliothèque personnelle paginée du Studio.
// Filtres : `q` (URL) et `targetType`. Le propriétaire est toujours le JWT.
func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserID(r.Context())
	if !ok || userID == "" {
		response.Unauthorized(w, "Non authentifié")
		return
	}

	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit <= 0 {
		limit = int(defaultListLimit)
	}
	if limit > int(maxListLimit) {
		limit = int(maxListLimit)
	}
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	if offset < 0 {
		offset = 0
	}

	items, err := h.svc.ListByOwner(r.Context(), userID, ListOptions{
		TargetType: strings.TrimSpace(r.URL.Query().Get("targetType")),
		Query:      r.URL.Query().Get("q"),
		Limit:      int32(limit),
		Offset:     int32(offset),
	})
	if err != nil {
		h.fail(w, "list", err)
		return
	}

	response.OK(w, map[string]any{
		"items":      items,
		"nextOffset": offset + len(items),
		"hasMore":    len(items) == limit,
	})
}

// POST /v1/media-assets — enregistre un MediaAsset (déjà uploadé sur le storage)
// avec dédoublonnage CAS par SHA-256. Le propriétaire est l'utilisateur JWT.
func (h *Handler) register(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserID(r.Context())
	if !ok || userID == "" {
		response.Unauthorized(w, "Non authentifié")
		return
	}
	var in RegisterInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	asset, err := h.svc.RegisterAsset(r.Context(), userID, in)
	if err != nil {
		h.fail(w, "register", err)
		return
	}
	response.Created(w, toDTO(asset))
}

// fail mappe les refus client sur leur statut réel et ne laisse jamais fuir
// une erreur interne (message générique + journal côté serveur).
func (h *Handler) fail(w http.ResponseWriter, op string, err error) {
	var verr ValidationError
	switch {
	case errors.As(err, &verr):
		response.BadRequest(w, verr.Msg)
	case errors.Is(err, ErrThrottled):
		w.Header().Set("Retry-After", "3600")
		response.Error(w, http.StatusTooManyRequests, "Trop d'uploads, réessayez plus tard")
	case errors.Is(err, ErrQuotaExceeded):
		response.Error(w, http.StatusRequestEntityTooLarge, "Quota de stockage dépassé")
	default:
		log.Printf("[mediaassets] %s: %v", op, err)
		response.Internal(w)
	}
}
