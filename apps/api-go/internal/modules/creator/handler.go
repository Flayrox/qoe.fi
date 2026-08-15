// Package creator — API créateur (migration depuis Hono apps/api).
// catégories, analytics/stats (proxy Umami), users (me/:username/follow).
package creator

import (
	"context"
	"errors"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	db "github.com/qoefi/api-go/internal/database"
	"github.com/qoefi/api-go/internal/middleware"
	"github.com/qoefi/api-go/internal/response"
	"github.com/qoefi/api-go/internal/umami"
)

type Handler struct {
	pool       *pgxpool.Pool
	q          *db.Queries
	umami      *umami.Client
	defaultWeb string
}

func NewHandler(pool *pgxpool.Pool, umamiCli *umami.Client, defaultWebsiteID string) *Handler {
	return &Handler{pool: pool, q: db.New(pool), umami: umamiCli, defaultWeb: defaultWebsiteID}
}

// RegisterAPIKey — routes créateur authentifiées par clé API (qoe_live_…).
func (h *Handler) RegisterAPIKey(r chi.Router) {
	r.Get("/v1/categories", h.categories)
	r.Get("/v1/analytics/stats", h.analyticsStats)
}

// RegisterPublic — routes publiques.
func (h *Handler) RegisterPublic(r chi.Router) {
	r.Get("/v1/users/{username}", h.userByUsername)
}

// RegisterProtected — routes créateur authentifiées JWT.
func (h *Handler) RegisterProtected(r chi.Router) {
	r.Get("/v1/users/me", h.userMe)
	r.Post("/v1/users/{id}/follow", h.followToggle)
}

// category est la forme API d'une catégorie (parité Hono).
type category struct {
	ID            string  `json:"id"`
	Name          string  `json:"name"`
	Slug          string  `json:"slug"`
	Description   *string `json:"description"`
	ArticlesCount int32   `json:"articlesCount"`
}

func (h *Handler) categories(w http.ResponseWriter, r *http.Request) {
	pubID, ok := middleware.PublicationID(r.Context())
	if !ok || pubID == "" {
		response.NotFound(w, "Publication not found")
		return
	}

	rows, err := h.q.ListCategoriesByPublication(r.Context(), pubID)
	if err != nil {
		log.Printf("[creator] categories: %v", err)
		response.Internal(w)
		return
	}

	out := make([]category, 0, len(rows))
	for _, row := range rows {
		desc := (*string)(nil)
		if row.Description.Valid {
			desc = &row.Description.String
		}
		out = append(out, category{
			ID:            row.ID,
			Name:          row.Name,
			Slug:          row.Slug,
			Description:   desc,
			ArticlesCount: row.ArticlesCount,
		})
	}
	response.OK(w, map[string]any{"data": out})
}

// analyticsStats proxi Umami (stats + topPages) pour la publication du créateur.
func (h *Handler) analyticsStats(w http.ResponseWriter, r *http.Request) {
	websiteID, ok := middleware.UmamiWebsiteID(r.Context())
	if !ok || websiteID == "" {
		websiteID = h.defaultWeb
	}

	now := time.Now()
	startAt := r.URL.Query().Get("startAt")
	endAt := r.URL.Query().Get("endAt")

	start := now.AddDate(0, 0, -30).UnixMilli()
	end := now.UnixMilli()
	if v, err := strconv.ParseInt(startAt, 10, 64); err == nil {
		start = v
	}
	if v, err := strconv.ParseInt(endAt, 10, 64); err == nil {
		end = v
	}

	if websiteID == "" {
		response.OK(w, map[string]any{"data": map[string]any{
			"stats":    map[string]int{"pageviews": 0, "visitors": 0, "visits": 0, "bounces": 0, "totaltime": 0},
			"topPages": []umami.PageMetric{},
		}})
		return
	}

	ctx := r.Context()
	stats, err := h.umami.WebsiteStats(ctx, websiteID, start, end)
	if err != nil {
		log.Printf("[creator] umami stats: %v", err)
	}
	topPages, err := h.umami.TopPages(ctx, websiteID, start, end, 10)
	if err != nil {
		log.Printf("[creator] umami topPages: %v", err)
	}
	if topPages == nil {
		topPages = []umami.PageMetric{}
	}

	response.OK(w, map[string]any{"data": map[string]any{"stats": stats, "topPages": topPages}})
}

// userMe retourne le profil complet + compteurs (parité Hono /v1/users/me).
func (h *Handler) userMe(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())

	row, err := h.q.GetUserByIDFull(r.Context(), userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			response.NotFound(w, "User not found")
			return
		}
		log.Printf("[creator] userMe: %v", err)
		response.Internal(w)
		return
	}

	following, err := h.q.CountFollowing(r.Context(), toUUID(userID))
	if err != nil {
		log.Printf("[creator] userMe following: %v", err)
		response.Internal(w)
		return
	}

	var followers int32
	if row.PublicationId.Valid && row.PublicationId.String != "" {
		if n, err := h.q.CountFollowers(r.Context(), row.PublicationId.String); err == nil {
			followers = n
		}
	}

	response.OK(w, map[string]any{"data": map[string]any{
		"id":                     row.UserID,
		"email":                  row.Email,
		"username":               textPtr(row.Username),
		"name":                   textPtr(row.Name),
		"role":                   row.Role,
		"isCertified":            row.IsCertified,
		"isShadowbanned":         row.IsShadowbanned,
		"isSuspended":            row.IsSuspended,
		"suspendReason":          textPtr(row.SuspendReason),
		"forceStandardTheme":     row.ForceStandardTheme,
		"onboardingText":         textPtr(row.OnboardingText),
		"logoUrl":                textPtr(row.LogoUrl),
		"publicationId":          textPtr(row.PublicationId),
		"advancedSettingsMode":   row.AdvancedSettingsMode,
		"hasCompletedOnboarding": row.HasCompletedOnboarding,
		"apiAccessStatus":        row.ApiAccessStatus,
		"apiApplicationReason":   textPtr(row.ApiApplicationReason),
		"walletBalanceCents":     row.WalletBalanceCents,
		"createdAt":              timestampPtr(row.CreatedAt),
		"updatedAt":              timestampPtr(row.UpdatedAt),
		"stats":                  map[string]int32{"followingCount": following, "followersCount": followers},
	}})
}

// userByUsername résout une publication par slug OU subdomain (parité Hono).
func (h *Handler) userByUsername(w http.ResponseWriter, r *http.Request) {
	username := chi.URLParam(r, "username")

	row, err := h.q.GetPublicationBySlugOrSubdomain(r.Context(), username)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			response.NotFound(w, "User not found")
			return
		}
		log.Printf("[creator] userByUsername: %v", err)
		response.Internal(w)
		return
	}

	response.OK(w, map[string]any{"data": map[string]any{
		"id":             row.ID,
		"name":           row.Name,
		"slug":           row.Slug,
		"subdomain":      textPtr(row.Subdomain),
		"customDomain":   textPtr(row.CustomDomain),
		"heroText":       textPtr(row.HeroText),
		"logoUrl":        textPtr(row.LogoUrl),
		"headerImageUrl": textPtr(row.HeaderImageUrl),
		"isCertified":    row.IsCertified,
		"createdAt":      timestampPtr(row.CreatedAt),
		"type":           string(row.Type),
		"_count":         map[string]int32{"followers": row.FollowersCount, "articles": row.ArticlesCount},
	}})
}

// followToggle suit/se désabonne d'une publication (parité Hono /v1/users/{id}/follow).
func (h *Handler) followToggle(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	targetID := chi.URLParam(r, "id")

	if userID == targetID {
		response.BadRequest(w, "You cannot follow yourself")
		return
	}

	ctx := r.Context()
	params := db.GetExistingFollowParams{ReaderId: toUUID(userID), PublicationId: targetID}

	_, err := h.q.GetExistingFollow(ctx, params)
	if err == nil {
		if err := h.q.DeleteFollow(ctx, db.DeleteFollowParams{ReaderId: toUUID(userID), PublicationId: targetID}); err != nil {
			log.Printf("[creator] unfollow: %v", err)
			response.Internal(w)
			return
		}
		if err := deleteFollowNotification(ctx, h.q, targetID, userID); err != nil {
			log.Printf("[creator] delete follow notification: %v", err)
		}
		count, err := h.q.CountFollowers(ctx, targetID)
		if err != nil {
			count = 0
		}
		response.OK(w, map[string]any{"data": map[string]any{"following": false, "followersCount": count}})
		return
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		log.Printf("[creator] follow check: %v", err)
		response.Internal(w)
		return
	}

	if err := h.q.InsertFollow(ctx, db.InsertFollowParams{ReaderId: toUUID(userID), PublicationId: targetID}); err != nil {
		log.Printf("[creator] follow: %v", err)
		response.Internal(w)
		return
	}
	if err := notifyFollow(ctx, h.q, targetID, userID); err != nil {
		log.Printf("[creator] follow notification: %v", err)
	}
	count, err := h.q.CountFollowers(ctx, targetID)
	if err != nil {
		count = 0
	}
	response.OK(w, map[string]any{"data": map[string]any{"following": true, "followersCount": count}})
}

// notifyFollow crée la notification FOLLOW au propriétaire d'une publication
// (PERSONAL → créateur, MEDIA → membre owner). Best-effort, respecte les
// préférences du destinataire et déduplique les suivis non lus.
func notifyFollow(ctx context.Context, tq *db.Queries, publicationID, senderID string) error {
	ownerID, err := tq.GetPublicationOwner(ctx, publicationID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil
		}
		return err
	}
	if ownerID == "" || ownerID == senderID {
		return nil
	}

	ownerUUID := toUUID(ownerID)
	senderUUID := toUUID(senderID)

	prefs, err := tq.GetFollowPrefs(ctx, ownerUUID)
	if err == nil {
		if !prefs.EmailFollows && !prefs.PushFollows {
			return nil
		}
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return err
	}

	exists, err := tq.ExistsUnreadFollowNotification(ctx, db.ExistsUnreadFollowNotificationParams{
		RecipientId:   ownerUUID,
		SenderId:      senderUUID,
		PublicationId: pgtype.Text{String: publicationID, Valid: true},
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			exists = 0
		} else {
			return err
		}
	}
	if exists == 1 {
		return nil
	}

	return tq.InsertFollowNotification(ctx, db.InsertFollowNotificationParams{
		RecipientId:   ownerUUID,
		SenderId:      senderUUID,
		PublicationId: pgtype.Text{String: publicationID, Valid: true},
	})
}

// deleteFollowNotification supprime la notification FOLLOW lors d'un unfollow.
func deleteFollowNotification(ctx context.Context, tq *db.Queries, publicationID, senderID string) error {
	ownerID, err := tq.GetPublicationOwner(ctx, publicationID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil
		}
		return err
	}
	if ownerID == "" || ownerID == senderID {
		return nil
	}

	return tq.DeleteFollowNotification(ctx, db.DeleteFollowNotificationParams{
		RecipientId:   toUUID(ownerID),
		SenderId:      toUUID(senderID),
		PublicationId: pgtype.Text{String: publicationID, Valid: true},
	})
}

// toUUID convertit un id texte en pgtype.UUID (readerId UUID).
func toUUID(id string) pgtype.UUID {
	uuid := pgtype.UUID{}
	_ = uuid.Scan(id)
	return uuid
}

func textPtr(t pgtype.Text) *string {
	if !t.Valid {
		return nil
	}
	return &t.String
}

func timestampPtr(t pgtype.Timestamp) *string {
	if !t.Valid {
		return nil
	}
	s := t.Time.Format(time.RFC3339)
	return &s
}
