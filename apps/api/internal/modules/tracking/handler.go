package tracking

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"log"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/qoefi/api/internal/middleware"
	"github.com/qoefi/api/internal/response"
)

type Handler struct {
	svc *Service
	// anonSecret est la clé HMAC dédiée au hachage journalier des sessions
	// anonymes. Vide → pas d'anonHash (aucune clé de repli, cf. config).
	anonSecret string
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// SetAnalyticsAnonSecret injecte la clé dédiée (ANALYTICS_ANON_SECRET).
func (h *Handler) SetAnalyticsAnonSecret(secret string) *Handler {
	h.anonSecret = strings.TrimSpace(secret)
	return h
}

func (h *Handler) RegisterProtected(r chi.Router) {
	r.Post("/v1/tracking/reading-session", h.track)
	r.Post("/v1/tracking/feed-impression", h.feedImpression)
	r.Post("/v1/feed/show-less", h.showLess)
	r.Post("/v1/feed/show-more", h.showMore)
}

// RegisterReader ajoute les routes du parcours lecteur connecté (auth requise).
func (h *Handler) RegisterReader(r chi.Router) {
	r.Get("/v1/me/reading-history", h.readingHistory)
}

func (h *Handler) readingHistory(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	if userID == "" {
		response.Unauthorized(w, "Authentification requise")
		return
	}
	days := middleware.ClampLimit(r.URL.Query().Get("days"), 14, 365)
	sessions, err := h.svc.ReadingHistory(r.Context(), userID, days)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "historique de lecture indisponible")
		return
	}
	response.JSON(w, http.StatusOK, map[string]any{"sessions": sessions, "count": len(sessions)})
}

type trackRequest struct {
	ArticleID          string  `json:"articleId"`
	Source             string  `json:"source"`
	Status             string  `json:"status"`
	ScrollDepth        *int    `json:"scrollDepth"`
	DwellSeconds       *int    `json:"dwellSeconds"`
	ReadingTimeMinutes *int    `json:"readingTimeMinutes"`
	Hostname           *string `json:"hostname"`
	ReferrerUsername   *string `json:"referrerUsername"`
}

func (h *Handler) track(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	// Also allow anonymous (userID may be empty) — article completionRate still updated
	var req trackRequest
	if !response.DecodeJSON(w, r, &req) {
		return
	}
	if req.ArticleID == "" || len(req.ArticleID) > 128 {
		response.BadRequest(w, "articleId invalide")
		return
	}
	scroll := 0
	if req.ScrollDepth != nil {
		scroll = max(0, min(100, *req.ScrollDepth))
	}
	dwell := 0
	if req.DwellSeconds != nil {
		dwell = max(0, min(86400, *req.DwellSeconds))
	}
	rt := 5
	if req.ReadingTimeMinutes != nil {
		rt = max(1, min(240, *req.ReadingTimeMinutes))
	}
	anonHash := ""
	if userID == "" {
		anonHash = h.dailyAnonHash(r)
	}
	updated, err := h.svc.TrackReadingSessionWithAnon(r.Context(), userID, anonHash, req.ArticleID, req.Source, req.Status, scroll, dwell, rt, req.Hostname, req.ReferrerUsername)
	if err != nil {
		response.Internal(w)
		return
	}
	response.OK(w, map[string]interface{}{"success": true, "updatedCompletionRate": updated})
}

// warnAnonSecretOnce n'avertit qu'une fois par processus (pas de spam de logs
// à chaque lecture anonyme).
var warnAnonSecretOnce sync.Once

// dailyAnonHash calcule un hash journalier HMAC SHA-256 non-identifiant
// (IP client + User-Agent + date UTC du jour) sans cookie ni PII stockée.
//
// La clé est dédiée (ANALYTICS_ANON_SECRET) : pas de repli sur la clé JWT ni
// sur une constante publique, sinon le hash serait recalculable par un tiers
// et la promesse « non identifiant » serait fausse. Clé absente → chaîne vide
// (session enregistrée sans anonHash, comptage des visiteurs uniques indisponible).
func (h *Handler) dailyAnonHash(r *http.Request) string {
	secret := h.anonSecret
	if secret == "" {
		warnAnonSecretOnce.Do(func() {
			log.Printf("[tracking] ANALYTICS_ANON_SECRET absent : sessions anonymes enregistrées sans anonHash (visiteurs uniques indisponibles)")
		})
		return ""
	}
	ip := ""
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		if first, _, ok := strings.Cut(xff, ","); ok {
			ip = strings.TrimSpace(first)
		} else {
			ip = strings.TrimSpace(xff)
		}
	}
	if ip == "" {
		ip = strings.TrimSpace(r.Header.Get("X-Real-IP"))
	}
	if ip == "" {
		host, _, err := net.SplitHostPort(r.RemoteAddr)
		if err == nil {
			ip = host
		} else {
			ip = r.RemoteAddr
		}
	}
	day := time.Now().UTC().Format("2006-01-02")
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = fmt.Fprintf(mac, "%s|%s|%s", day, ip, r.UserAgent())
	return hex.EncodeToString(mac.Sum(nil))[:32]
}

func (h *Handler) feedImpression(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	var body struct {
		Items []FeedImpressionItem `json:"items"`
	}
	if !response.DecodeJSON(w, r, &body) {
		return
	}
	if len(body.Items) > 100 {
		body.Items = body.Items[:100]
	}
	inserted, err := h.svc.TrackFeedImpression(r.Context(), userID, body.Items)
	if err != nil {
		response.OK(w, map[string]interface{}{"success": false})
		return
	}
	response.OK(w, map[string]interface{}{"success": true, "inserted": inserted})
}

func (h *Handler) showLess(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	if userID == "" {
		response.Unauthorized(w, "Non authentifié")
		return
	}
	var body struct {
		ArticleID *string `json:"articleId"`
		ThoughtID *string `json:"thoughtId"`
	}
	if !response.DecodeJSON(w, r, &body) {
		return
	}
	articleID := ""
	if body.ArticleID != nil {
		articleID = *body.ArticleID
	}
	thoughtID := ""
	if body.ThoughtID != nil {
		thoughtID = *body.ThoughtID
	}
	if articleID == "" && thoughtID == "" {
		response.BadRequest(w, "articleId ou thoughtId requis")
		return
	}
	feedbackID, vectorAdjusted, err := h.svc.TrackShowLess(r.Context(), userID, articleID, thoughtID)
	if err != nil {
		response.Internal(w)
		return
	}
	response.OK(w, map[string]interface{}{"success": true, "hidden": true, "vectorAdjusted": vectorAdjusted, "feedbackId": feedbackID})
}

func (h *Handler) showMore(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	if userID == "" {
		response.Unauthorized(w, "Non authentifié")
		return
	}
	var body struct {
		ArticleID *string `json:"articleId"`
		ThoughtID *string `json:"thoughtId"`
	}
	if !response.DecodeJSON(w, r, &body) {
		return
	}
	articleID := ""
	if body.ArticleID != nil {
		articleID = *body.ArticleID
	}
	thoughtID := ""
	if body.ThoughtID != nil {
		thoughtID = *body.ThoughtID
	}
	if articleID == "" && thoughtID == "" {
		response.BadRequest(w, "articleId ou thoughtId requis")
		return
	}
	feedbackID, vectorAdjusted, err := h.svc.TrackShowMore(r.Context(), userID, articleID, thoughtID)
	if err != nil {
		response.Internal(w)
		return
	}
	response.OK(w, map[string]interface{}{"success": true, "featured": true, "vectorAdjusted": vectorAdjusted, "feedbackId": feedbackID})
}
