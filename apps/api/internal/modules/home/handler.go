package home

import (
	"encoding/json"
	"log"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/qoefi/api/internal/middleware"
	"github.com/qoefi/api/internal/response"
	"github.com/redis/go-redis/v9"
)

// emailRegex compilée UNE fois au chargement du package (sinon recompilée
// à chaque requête sur l'endpoint le plus exposé du growth loop).
var emailRegex = regexp.MustCompile(`^[^\s@]+@[^\s@]+\.[^\s@]+$`)

type Handler struct {
	svc *Service

	// subscribeLimiter (optionnel) : rate-limit Redis dédié de l'inscription
	// newsletter — anti-abus d'un endpoint PUBLIC d'écriture (pollution de
	// la base Subscriber, délivrabilité email, stats fausses). Miroir du
	// pattern SetSendRateLimit du module newsletters. Défaut si non branché
	// (tests, rc nil) : aucun.
	rc     *redis.Client
	window time.Duration
	max    int
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// SetSubscribeRateLimit branche le rate-limit anti-abus de POST /subscribe
// (par IP, fenêtre fixe — la boucle de croissance est le point d'entrée
// privilégié des bots sur les sites tenants).
func (h *Handler) SetSubscribeRateLimit(rc *redis.Client, window time.Duration, max int) {
	h.rc = rc
	h.window = window
	h.max = max
}

// subscribeLimiter enveloppe h.subscribe du limiteur branché (no-op sinon).
func (h *Handler) subscribeLimiter(next http.HandlerFunc) http.Handler {
	if h.rc == nil || h.max <= 0 {
		return next
	}
	return middleware.RateLimit("home-subscribe", h.rc, h.window, h.max, false)(next)
}

func (h *Handler) RegisterPublic(r chi.Router) {
	r.Route("/v1/home", func(r chi.Router) {
		r.Get("/config", h.getConfig)
		r.Get("/announcement", h.getAnnouncement)
		r.Get("/trends", h.getTrends)
		r.Get("/promos", h.getPromos)
		// Widgets lecteur (auth optionnelle — le cas vectoriel utilise le userID) :
		r.Get("/onboarding", h.getOnboarding)
		r.Get("/suggested-creators", h.getSuggestedCreators)
		r.Get("/semantic-trends", h.getSemanticTrends)
		r.Post("/subscribe", h.subscribeLimiter(h.subscribe).ServeHTTP)
	})
}

func (h *Handler) getConfig(w http.ResponseWriter, r *http.Request) {
	cfg, err := h.svc.GetSystemConfig(r.Context())
	if err != nil {
		response.Internal(w)
		return
	}
	response.OK(w, cfg)
}

func (h *Handler) getAnnouncement(w http.ResponseWriter, r *http.Request) {
	announcement, err := h.svc.GetGlobalAnnouncement(r.Context())
	if err != nil {
		response.Internal(w)
		return
	}
	response.OK(w, announcement)
}

func (h *Handler) getTrends(w http.ResponseWriter, r *http.Request) {
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	trends, err := h.svc.GetTrends(r.Context(), limit)
	if err != nil {
		response.Internal(w)
		return
	}
	response.OK(w, trends)
}

func (h *Handler) getPromos(w http.ResponseWriter, r *http.Request) {
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	promos, err := h.svc.GetPromos(r.Context(), limit)
	if err != nil {
		response.Internal(w)
		return
	}
	response.OK(w, promos)
}

// GET /v1/home/onboarding — catégories + créateurs suggérés pour l'onboarding.
func (h *Handler) getOnboarding(w http.ResponseWriter, r *http.Request) {
	response.OK(w, h.svc.GetOnboardingData(r.Context()))
}

// GET /v1/home/suggested-creators — créateurs recommandés (similarité
// vectorielle si connecté, cold-start sinon). ?limit=N
func (h *Handler) getSuggestedCreators(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	creators, err := h.svc.GetSuggestedCreators(r.Context(), userID, limit)
	if err != nil {
		log.Printf("[home] suggested-creators: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, creators)
}

// GET /v1/home/semantic-trends — tendances sémantiques (croissance par catégorie).
func (h *Handler) getSemanticTrends(w http.ResponseWriter, r *http.Request) {
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	trends, err := h.svc.GetSemanticTrends(r.Context(), limit)
	if err != nil {
		log.Printf("[home] semantic-trends: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, trends)
}

// POST /v1/home/subscribe — inscription newsletter d'une publication (public).
// Body : { email, publicationId }. Idempotent (upsert isActive=true).
func (h *Handler) subscribe(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email         string `json:"email"`
		PublicationID string `json:"publicationId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	body.Email = strings.TrimSpace(strings.ToLower(body.Email))
	if body.Email == "" || body.PublicationID == "" {
		response.BadRequest(w, "email et publicationId requis")
		return
	}
	if !emailRegex.MatchString(body.Email) {
		response.BadRequest(w, "Veuillez saisir une adresse email valide.")
		return
	}
	// Langue de l'abonné : ?locale= explicite puis Accept-Language, bornée
	// à fr/en (défaut fr) — pilote la langue des emails transactionnels.
	locale := normalizeSubscribeLocale(r)
	if _, err := h.svc.SubscribeToNewsletter(r.Context(), body.Email, body.PublicationID, locale); err != nil {
		log.Printf("[home] subscribe: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, map[string]bool{"success": true})
}

// normalizeSubscribeLocale résout la locale d'inscription : ?locale= puis
// Accept-Language, bornée aux deux locales supportées des emails (fr/en).
func normalizeSubscribeLocale(r *http.Request) string {
	if v := strings.TrimSpace(r.URL.Query().Get("locale")); v != "" {
		return normalizeSubscribeLocaleRaw(v)
	}
	if v := r.Header.Get("Accept-Language"); v != "" {
		return normalizeSubscribeLocaleRaw(strings.Split(v, ",")[0])
	}
	return "fr"
}

// normalizeSubscribeLocaleRaw réduit une locale HTTP à fr/en (défaut fr).
func normalizeSubscribeLocaleRaw(raw string) string {
	l := strings.ToLower(strings.TrimSpace(raw))
	if i := strings.IndexAny(l, "-_,;"); i > 0 {
		l = l[:i]
	}
	if l == "en" {
		return "en"
	}
	return "fr"
}
