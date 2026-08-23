package tracking

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/qoefi/api/internal/middleware"
	"github.com/qoefi/api/internal/response"
)

type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

func (h *Handler) RegisterProtected(r chi.Router) {
	r.Post("/v1/tracking/reading-session", h.track)
	r.Post("/v1/tracking/feed-impression", h.feedImpression)
	r.Post("/v1/feed/show-less", h.showLess)
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
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	if req.ArticleID == "" {
		response.BadRequest(w, "articleId required")
		return
	}
	scroll := 0
	if req.ScrollDepth != nil {
		scroll = *req.ScrollDepth
	}
	dwell := 0
	if req.DwellSeconds != nil {
		dwell = *req.DwellSeconds
	}
	rt := 5
	if req.ReadingTimeMinutes != nil {
		rt = *req.ReadingTimeMinutes
	}
	updated, err := h.svc.TrackReadingSession(r.Context(), userID, req.ArticleID, req.Source, req.Status, scroll, dwell, rt, req.Hostname, req.ReferrerUsername)
	if err != nil {
		response.Internal(w)
		return
	}
	response.OK(w, map[string]interface{}{"success": true, "updatedCompletionRate": updated})
}

func (h *Handler) feedImpression(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	var body struct {
		Items []FeedImpressionItem `json:"items"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
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
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		response.BadRequest(w, "JSON invalide")
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
