package creator

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	db "github.com/qoefi/api/internal/database"
	"github.com/qoefi/api/internal/middleware"
	"github.com/qoefi/api/internal/response"
)

type apiRecommendationItem struct {
	ID                      string  `json:"id"`
	PublicationID           string  `json:"publicationId"`
	PublicationName         string  `json:"name"`
	PublicationSlug         string  `json:"slug"`
	PublicationSubdomain    *string `json:"subdomain"`
	PublicationCustomDomain *string `json:"customDomain"`
	PublicationBio          *string `json:"bio"`
	PublicationLogoURL      *string `json:"logoUrl"`
	Description             *string `json:"description"`
	CreatedAt               string  `json:"createdAt"`
}

type apiRecommendationInput struct {
	PublicationID string  `json:"publicationId"`
	RecommendedID string  `json:"recommendedId"`
	Description   *string `json:"description"`
}

// resolveTargetPublicationId résout l'identifiant de la publication ciblée (paramètre d'URL, contexte ou publication personnelle).
func (h *Handler) resolveTargetPublicationId(r *http.Request) (string, error) {
	pubID := r.URL.Query().Get("publicationId")
	if pubID != "" {
		return pubID, nil
	}
	if ctxPubID, ok := middleware.PublicationID(r.Context()); ok && ctxPubID != "" {
		return ctxPubID, nil
	}
	if userID, ok := middleware.UserID(r.Context()); ok && userID != "" {
		if personal, err := h.q.GetUserPersonalPublication(r.Context(), userID); err == nil && personal.Valid && personal.String != "" {
			return personal.String, nil
		}
	}
	return "", errors.New("publicationId requis")
}

// apiRecommendationsList — GET /v1/creator/recommendations
func (h *Handler) apiRecommendationsList(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	pubID, err := h.resolveTargetPublicationId(r)
	if err != nil {
		response.BadRequest(w, err.Error())
		return
	}

	if userID != "" {
		if err := h.authorizeCategories(r.Context(), userID, pubID); err != nil {
			response.Forbidden(w, "Accès refusé à cette publication")
			return
		}
	}

	rows, err := h.q.ListRecommendationsByPublication(r.Context(), pubID)
	if err != nil {
		log.Printf("[creator] list recommendations: %v", err)
		response.Internal(w)
		return
	}

	items := make([]apiRecommendationItem, 0, len(rows))
	for _, row := range rows {
		sub := (*string)(nil)
		if row.PublicationSubdomain.Valid {
			sub = &row.PublicationSubdomain.String
		}
		custom := (*string)(nil)
		if row.PublicationCustomDomain.Valid {
			custom = &row.PublicationCustomDomain.String
		}
		bio := (*string)(nil)
		if row.PublicationBio.Valid {
			bio = &row.PublicationBio.String
		}
		logo := (*string)(nil)
		if row.PublicationLogoUrl.Valid {
			logo = &row.PublicationLogoUrl.String
		}
		desc := (*string)(nil)
		if row.Description.Valid {
			desc = &row.Description.String
		}

		items = append(items, apiRecommendationItem{
			ID:                      row.ID,
			PublicationID:           row.PublicationID,
			PublicationName:         row.PublicationName,
			PublicationSlug:         row.PublicationSlug,
			PublicationSubdomain:    sub,
			PublicationCustomDomain: custom,
			PublicationBio:          bio,
			PublicationLogoURL:      logo,
			Description:             desc,
			CreatedAt:               row.CreatedAt.Time.Format("2006-01-02T15:04:05Z07:00"),
		})
	}

	response.OK(w, map[string]any{"items": items})
}

// apiRecommendationAdd — POST /v1/creator/recommendations
func (h *Handler) apiRecommendationAdd(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())

	var in apiRecommendationInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}

	in.PublicationID = strings.TrimSpace(in.PublicationID)
	in.RecommendedID = strings.TrimSpace(in.RecommendedID)

	if in.PublicationID == "" || in.RecommendedID == "" {
		response.BadRequest(w, "publicationId et recommendedId requis")
		return
	}

	// 🛡️ Interdiction formelle de s'auto-recommander
	if in.PublicationID == in.RecommendedID {
		response.BadRequest(w, "Une publication ne peut pas se recommander elle-même")
		return
	}

	if userID != "" {
		if err := h.authorizeCategories(r.Context(), userID, in.PublicationID); err != nil {
			response.Forbidden(w, "Accès refusé à cette publication")
			return
		}
	}

	// Vérification de l'existence de la publication recommandée
	var targetExists int
	err := h.pool.QueryRow(r.Context(), `SELECT 1 FROM "Publication" WHERE id = $1 LIMIT 1`, in.RecommendedID).Scan(&targetExists)
	if errors.Is(err, pgx.ErrNoRows) {
		response.NotFound(w, "Publication recommandée introuvable")
		return
	}
	if err != nil {
		log.Printf("[creator] check recommended pub: %v", err)
		response.Internal(w)
		return
	}

	descText := pgtype.Text{}
	if in.Description != nil && *in.Description != "" {
		descText = pgtype.Text{String: *in.Description, Valid: true}
	}

	rec, err := h.q.AddRecommendation(r.Context(), db.AddRecommendationParams{
		RecommenderId: in.PublicationID,
		RecommendedId: in.RecommendedID,
		Description:   descText,
	})
	if err != nil {
		log.Printf("[creator] add recommendation: %v", err)
		response.Internal(w)
		return
	}

	response.OK(w, map[string]any{
		"success": true,
		"recommendation": map[string]any{
			"id":            rec.ID,
			"recommenderId": rec.RecommenderId,
			"recommendedId": rec.RecommendedId,
		},
	})
}

// apiRecommendationRemove — DELETE /v1/creator/recommendations/{recommendedId}?publicationId=
func (h *Handler) apiRecommendationRemove(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	pubID, err := h.resolveTargetPublicationId(r)
	if err != nil {
		response.BadRequest(w, err.Error())
		return
	}

	recommendedID := strings.TrimSpace(chi.URLParam(r, "recommendedId"))
	if recommendedID == "" {
		response.BadRequest(w, "recommendedId requis dans l'URL")
		return
	}

	if userID != "" {
		if err := h.authorizeCategories(r.Context(), userID, pubID); err != nil {
			response.Forbidden(w, "Accès refusé à cette publication")
			return
		}
	}

	if err := h.q.RemoveRecommendation(r.Context(), db.RemoveRecommendationParams{
		RecommenderId: pubID,
		RecommendedId: recommendedID,
	}); err != nil {
		log.Printf("[creator] remove recommendation: %v", err)
		response.Internal(w)
		return
	}

	response.OK(w, map[string]bool{"success": true})
}
