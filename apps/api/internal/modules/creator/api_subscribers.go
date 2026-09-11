package creator

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"regexp"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	db "github.com/qoefi/api/internal/database"
	"github.com/qoefi/api/internal/middleware"
	"github.com/qoefi/api/internal/response"
)

var emailFormatRegex = regexp.MustCompile(`^[^\s@]+@[^\s@]+\.[^\s@]+$`)

// ─── GET /v1/creator/subscribers ─────────────────────────────────────

type apiSubscriberItem struct {
	ID              string  `json:"id"`
	Email           string  `json:"email"`
	Status          string  `json:"status"`
	IsActive        bool    `json:"isActive"`
	IsPremium       bool    `json:"isPremium"`
	ReceiveArticles bool    `json:"receiveArticles"`
	CreatedAt       string  `json:"createdAt"`
	UpdatedAt       string  `json:"updatedAt"`
}

type apiSubscribersPage struct {
	Items   []apiSubscriberItem `json:"items"`
	Total   int64               `json:"total"`
	Limit   int                 `json:"limit"`
	Offset  int                 `json:"offset"`
	HasMore bool                `json:"hasMore"`
}

func (h *Handler) apiSubscribersList(w http.ResponseWriter, r *http.Request) {
	pubID, ok := middleware.PublicationID(r.Context())
	if !ok || pubID == "" {
		response.NotFound(w, "Publication introuvable")
		return
	}

	limit, offset := parseLimitCursor(r)

	rows, err := h.q.ListSubscribersByPublication(r.Context(), db.ListSubscribersByPublicationParams{
		PublicationId: pubID,
		Limit:         int32(limit),
		Offset:        int32(offset),
	})
	if err != nil {
		log.Printf("[creator] list subscribers: %v", err)
		response.Internal(w)
		return
	}

	total, err := h.q.CountSubscribersByPublication(r.Context(), pubID)
	if err != nil {
		log.Printf("[creator] count subscribers: %v", err)
		response.Internal(w)
		return
	}

	items := make([]apiSubscriberItem, 0, len(rows))
	for _, row := range rows {
		items = append(items, apiSubscriberItem{
			ID:              row.ID,
			Email:           row.Email,
			Status:          string(row.Status),
			IsActive:        row.IsActive,
			IsPremium:       row.IsPremium,
			ReceiveArticles: row.ReceiveArticles,
			CreatedAt:       row.CreatedAt.Time.Format("2006-01-02T15:04:05Z07:00"),
			UpdatedAt:       row.UpdatedAt.Time.Format("2006-01-02T15:04:05Z07:00"),
		})
	}

	response.OK(w, apiSubscribersPage{
		Items:   items,
		Total:   total,
		Limit:   limit,
		Offset:  offset,
		HasMore: int64(offset+len(items)) < total,
	})
}

// ─── GET /v1/creator/subscribers/stats ───────────────────────────────

type apiSubscribersStatsResponse struct {
	Total   int64 `json:"total"`
	Active  int64 `json:"active"`
	Premium int64 `json:"premium"`
}

func (h *Handler) apiSubscribersStats(w http.ResponseWriter, r *http.Request) {
	pubID, ok := middleware.PublicationID(r.Context())
	if !ok || pubID == "" {
		response.NotFound(w, "Publication introuvable")
		return
	}

	stats, err := h.q.GetSubscriberStatsByPublication(r.Context(), pubID)
	if err != nil {
		log.Printf("[creator] subscribers stats: %v", err)
		response.Internal(w)
		return
	}

	response.OK(w, apiSubscribersStatsResponse{
		Total:   stats.Total,
		Active:  stats.Active,
		Premium: stats.Premium,
	})
}

// ─── POST /v1/creator/subscribers ────────────────────────────────────

type apiSubscriberCreateBody struct {
	Email string `json:"email"`
}

func (h *Handler) apiSubscriberCreate(w http.ResponseWriter, r *http.Request) {
	pubID, ok := middleware.PublicationID(r.Context())
	if !ok || pubID == "" {
		response.NotFound(w, "Publication introuvable")
		return
	}

	var body apiSubscriberCreateBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		response.BadRequest(w, "Payload JSON invalide")
		return
	}

	cleanEmail := strings.ToLower(strings.TrimSpace(body.Email))
	if !emailFormatRegex.MatchString(cleanEmail) {
		response.BadRequest(w, "Adresse email invalide")
		return
	}

	sub, err := h.q.UpsertSubscriber(r.Context(), db.UpsertSubscriberParams{
		Email:         cleanEmail,
		PublicationID: pubID,
	})
	if err != nil {
		log.Printf("[creator] upsert subscriber: %v", err)
		response.Internal(w)
		return
	}

	w.WriteHeader(http.StatusCreated)
	response.OK(w, apiSubscriberItem{
		ID:              sub.ID,
		Email:           sub.Email,
		Status:          string(sub.Status),
		IsActive:        sub.IsActive,
		IsPremium:       sub.IsPremium,
		ReceiveArticles: sub.ReceiveArticles,
		CreatedAt:       sub.CreatedAt.Time.Format("2006-01-02T15:04:05Z07:00"),
		UpdatedAt:       sub.UpdatedAt.Time.Format("2006-01-02T15:04:05Z07:00"),
	})
}

// ─── DELETE /v1/creator/subscribers/{idOrEmail} ──────────────────────

func (h *Handler) apiSubscriberDelete(w http.ResponseWriter, r *http.Request) {
	pubID, ok := middleware.PublicationID(r.Context())
	if !ok || pubID == "" {
		response.NotFound(w, "Publication introuvable")
		return
	}

	target := chi.URLParam(r, "idOrEmail")
	if target == "" {
		response.BadRequest(w, "Identifiant ou email requis")
		return
	}

	_, err := h.q.DeactivateSubscriber(r.Context(), db.DeactivateSubscriberParams{
		PublicationID: pubID,
		ID:            target,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			response.NotFound(w, "Abonné introuvable pour cette publication")
			return
		}
		log.Printf("[creator] deactivate subscriber: %v", err)
		response.Internal(w)
		return
	}

	response.OK(w, map[string]bool{"success": true})
}

// ─── GET /v1/creator/publication ─────────────────────────────────────

func (h *Handler) apiPublicationMetadata(w http.ResponseWriter, r *http.Request) {
	pubID, ok := middleware.PublicationID(r.Context())
	if !ok || pubID == "" {
		response.NotFound(w, "Publication introuvable")
		return
	}

	meta, err := h.q.GetPublicationMetadataByID(r.Context(), pubID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			response.NotFound(w, "Publication introuvable")
			return
		}
		log.Printf("[creator] get publication metadata: %v", err)
		response.Internal(w)
		return
	}

	response.OK(w, map[string]any{
		"id":                     meta.ID,
		"type":                   meta.Type,
		"name":                   meta.Name,
		"slug":                   meta.Slug,
		"bio":                    textPtr(meta.Bio),
		"subdomain":              textPtr(meta.Subdomain),
		"customDomain":           textPtr(meta.CustomDomain),
		"heroText":               textPtr(meta.HeroText),
		"footerText":             textPtr(meta.FooterText),
		"logoUrl":                textPtr(meta.LogoUrl),
		"headerImageUrl":         textPtr(meta.HeaderImageUrl),
		"accentColor":            textPtr(meta.AccentColor),
		"themeMode":              textPtr(meta.ThemeMode),
		"layoutStyle":            textPtr(meta.LayoutStyle),
		"fontFamily":             textPtr(meta.FontFamily),
		"supportUrl":             textPtr(meta.SupportUrl),
		"seoTitle":               textPtr(meta.SeoTitle),
		"seoDescription":         textPtr(meta.SeoDescription),
		"allowIndexing":          meta.AllowIndexing,
		"allowPublicAnnotations": meta.AllowPublicAnnotations,
		"allowComments":          meta.AllowComments,
		"isCertified":            meta.IsCertified,
		"createdAt":              meta.CreatedAt.Time.Format("2006-01-02T15:04:05Z07:00"),
		"updatedAt":              meta.UpdatedAt.Time.Format("2006-01-02T15:04:05Z07:00"),
	})
}

// ─── POST /v1/publications/{slugOrId}/subscribe (Public with CORS) ───

func (h *Handler) publicSubscribeOptions(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) publicSubscribe(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

	slugOrID := chi.URLParam(r, "slugOrId")
	if slugOrID == "" {
		response.BadRequest(w, "Identifiant ou slug de publication requis")
		return
	}

	pubID, err := h.q.ResolvePublicationIDBySlugOrID(r.Context(), slugOrID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			response.NotFound(w, "Publication introuvable")
			return
		}
		log.Printf("[public subscribe] resolve publication: %v", err)
		response.Internal(w)
		return
	}

	var body struct {
		Email string `json:"email"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		response.BadRequest(w, "Payload JSON invalide")
		return
	}

	cleanEmail := strings.ToLower(strings.TrimSpace(body.Email))
	if !emailFormatRegex.MatchString(cleanEmail) {
		response.BadRequest(w, "Adresse email invalide")
		return
	}

	_, err = h.q.UpsertSubscriber(r.Context(), db.UpsertSubscriberParams{
		Email:         cleanEmail,
		PublicationID: pubID,
	})
	if err != nil {
		log.Printf("[public subscribe] upsert subscriber: %v", err)
		response.Internal(w)
		return
	}

	response.OK(w, map[string]any{
		"success":       true,
		"publicationId": pubID,
	})
}
