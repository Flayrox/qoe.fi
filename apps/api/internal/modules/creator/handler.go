// Package creator — API créateur (migration depuis Hono apps/api).
// catégories, analytics/stats (proxy Umami), users (me/:username/follow).
package creator

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	db "github.com/qoefi/api/internal/database"
	"github.com/qoefi/api/internal/middleware"
	"github.com/qoefi/api/internal/permissions"
	"github.com/qoefi/api/internal/response"
	"github.com/qoefi/api/internal/slug"
	"github.com/qoefi/api/internal/umami"
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
// ⚠️ /v1/categories N'EST PAS déclaré ici : il est enregistré une seule fois
// dans RegisterProtected (CombinedAuth accepte JWT ET clés API) pour éviter
// le double enregistrement du même chemin (le groupe clé API masquerait la
// route JWT → 401 sur le dashboard).
func (h *Handler) RegisterAPIKey(r chi.Router) {
	r.With(middleware.RequireAPIScope(middleware.ScopeAnalytics)).Get("/v1/analytics/stats", h.analyticsStats)
}

// RegisterPublic — routes publiques (auth optionnelle : le viewer connecté
// voit `isFollowing` / `viewerFollows` renseignés, sinon false).
func (h *Handler) RegisterPublic(r chi.Router) {
	r.Get("/v1/users/{username}", h.userByUsername)
	r.Get("/v1/users/{username}/followers", h.userFollowers)
	r.Get("/v1/users/{username}/following", h.userFollowing)
}

// RegisterProtected — routes créateur authentifiées JWT (ou clé API via
// CombinedAuth). requireScope applique le moindre privilège aux clés API
// (les requêtes JWT passent : couvertes par le RBAC publication).
func (h *Handler) RegisterProtected(r chi.Router, requireScope func(string) func(http.Handler) http.Handler) {
	r.Get("/v1/users/me", h.userMe)
	r.Post("/v1/users/{id}/follow", h.followToggle)
	r.With(requireScope(middleware.ScopeRead)).Get("/v1/categories", h.categories)
	r.With(requireScope(middleware.ScopeWrite)).Post("/v1/categories", h.createCategory)
	r.With(requireScope(middleware.ScopeWrite)).Patch("/v1/categories/{id}", h.updateCategory)
	r.With(requireScope(middleware.ScopeWrite)).Delete("/v1/categories/{id}", h.deleteCategory)
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
	pubID := r.URL.Query().Get("publicationId")
	if pubID == "" {
		pubID, _ = middleware.PublicationID(r.Context())
	}
	if pubID == "" {
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

// authorizeCategories vérifie que l'utilisateur peut gérer les catégories de la publication.
func (h *Handler) authorizeCategories(ctx context.Context, userID, publicationID string) error {
	if personal, err := h.q.GetUserPersonalPublication(ctx, userID); err == nil && personal.String == publicationID {
		return nil
	}
	member, err := h.q.GetMediaMemberContext(ctx, db.GetMediaMemberContextParams{
		PublicationId: publicationID, UserId: toUUID(userID),
	})
	if err != nil {
		return errForbidden
	}
	if !permissions.CanMedia(&permissions.MediaMember{
		Role: member.Role, Permissions: member.Permissions, Status: member.Status,
	}, permissions.PermManageCategories) {
		return errForbidden
	}
	return nil
}

// categoryInput est la charge utile de création/édition d'une catégorie.
type categoryInput struct {
	PublicationID string  `json:"publicationId"`
	Name          string  `json:"name"`
	Slug          string  `json:"slug"`
	Description   *string `json:"description"`
}

func (h *Handler) createCategory(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	var in categoryInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	if in.PublicationID == "" || in.Name == "" {
		response.BadRequest(w, "publicationId et name requis")
		return
	}
	if err := h.authorizeCategories(r.Context(), userID, in.PublicationID); err != nil {
		response.Forbidden(w, "Accès refusé à cette publication.")
		return
	}

	finalSlug := in.Slug
	if finalSlug == "" {
		finalSlug = slug.Slugify(in.Name)
	}
	if finalSlug == "" {
		finalSlug = "cat-" + slug.ShortID(8)
	}
	exists, err := h.q.CheckCategorySlugExists(r.Context(), db.CheckCategorySlugExistsParams{
		PublicationId: in.PublicationID, Slug: finalSlug, ID: "",
	})
	if err == nil && exists {
		response.BadRequest(w, fmt.Sprintf("Le slug %q est déjà utilisé par une autre de vos catégories.", finalSlug))
		return
	}

	row, err := h.q.CreateCategory(r.Context(), db.CreateCategoryParams{
		Name: in.Name, Slug: finalSlug, Description: textVal(in.Description), PublicationId: in.PublicationID,
	})
	if err != nil {
		log.Printf("[creator] createCategory: %v", err)
		response.Internal(w)
		return
	}
	response.Created(w, row)
}

func (h *Handler) updateCategory(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	id := chi.URLParam(r, "id")
	var in categoryInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}

	existing, err := h.q.GetCategoryByID(r.Context(), id)
	if err != nil {
		response.NotFound(w, "Catégorie introuvable.")
		return
	}
	if err := h.authorizeCategories(r.Context(), userID, existing.PublicationId); err != nil {
		response.Forbidden(w, "Vous n'êtes pas autorisé à modifier cette catégorie.")
		return
	}

	finalSlug := in.Slug
	if finalSlug == "" {
		finalSlug = slug.Slugify(in.Name)
	}
	if finalSlug == "" {
		finalSlug = "cat-" + slug.ShortID(8)
	}
	exists, err := h.q.CheckCategorySlugExists(r.Context(), db.CheckCategorySlugExistsParams{
		PublicationId: existing.PublicationId, Slug: finalSlug, ID: id,
	})
	if err == nil && exists {
		response.BadRequest(w, fmt.Sprintf("Le slug %q est déjà utilisé par une autre de vos catégories.", finalSlug))
		return
	}

	if err := h.q.UpdateCategory(r.Context(), db.UpdateCategoryParams{
		ID: id, Name: in.Name, Slug: finalSlug, Description: textVal(in.Description),
	}); err != nil {
		log.Printf("[creator] updateCategory: %v", err)
		response.Internal(w)
		return
	}
	row, err := h.q.GetCategoryByID(r.Context(), id)
	if err != nil {
		response.OK(w, map[string]bool{"success": true})
		return
	}
	response.OK(w, row)
}

func (h *Handler) deleteCategory(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	id := chi.URLParam(r, "id")

	existing, err := h.q.GetCategoryByID(r.Context(), id)
	if err != nil {
		response.NotFound(w, "Catégorie introuvable.")
		return
	}
	if err := h.authorizeCategories(r.Context(), userID, existing.PublicationId); err != nil {
		response.Forbidden(w, "Vous n'êtes pas autorisé à supprimer cette catégorie.")
		return
	}
	if err := h.q.DeleteCategory(r.Context(), id); err != nil {
		log.Printf("[creator] deleteCategory: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, map[string]bool{"success": true})
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
// Si le viewer est connecté, `isFollowing` indique s'il suit déjà la
// publication (lecture best-effort — échec → false).
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

	isFollowing := false
	if userID, ok := middleware.UserID(r.Context()); ok && userID != "" {
		_, err := h.q.GetExistingFollow(r.Context(), db.GetExistingFollowParams{
			ReaderId:      toUUID(userID),
			PublicationId: row.ID,
		})
		if err == nil {
			isFollowing = true
		}
	}

	// Nombre d'abonnements du propriétaire de la publication (CountFollowing)
	// + id du User propriétaire (isOwnProfile côté client) + pronoms (profil inclusif).
	var followingCount int32
	var ownerUserID string
	var pronouns *string
	if ownerID, err := h.q.GetPublicationOwner(r.Context(), row.ID); err == nil {
		ownerUserID = ownerID
		if n, err := h.q.CountFollowing(r.Context(), toUUID(ownerID)); err == nil {
			followingCount = n
		}
		if p, err := h.q.GetUserPronouns(r.Context(), ownerID); err == nil && p.Valid {
			pronouns = &p.String
		}
	}

	response.OK(w, map[string]any{"data": map[string]any{
		"id":             row.ID,
		"ownerUserId":    ownerUserID,
		"name":           row.Name,
		"slug":           row.Slug,
		"subdomain":      textPtr(row.Subdomain),
		"customDomain":   textPtr(row.CustomDomain),
		"heroText":       textPtr(row.HeroText),
		"logoUrl":        textPtr(row.LogoUrl),
		"headerImageUrl": textPtr(row.HeaderImageUrl),
		"isCertified":    row.IsCertified,
		"isFollowing":    isFollowing,
		"pronouns":       pronouns,
		"createdAt":      timestampPtr(row.CreatedAt),
		"type":           string(row.Type),
		"_count":         map[string]int32{"followers": row.FollowersCount, "following": followingCount, "articles": row.ArticlesCount},
	}})
}

// followActor est un utilisateur listé dans followers/following.
type followActor struct {
	ID            string  `json:"id"`
	PublicationID *string `json:"publicationId"`
	Name          *string `json:"name"`
	Username      *string `json:"username"`
	LogoURL       *string `json:"logoUrl"`
	IsCertified   bool    `json:"isCertified"`
	FollowedAt    string  `json:"followedAt"`
	ViewerFollows bool    `json:"viewerFollows"`
}

// followPage est une page d'abonnés/abonnements paginée.
type followPage struct {
	Items      []followActor `json:"items"`
	NextCursor string        `json:"nextCursor"`
	HasMore    bool          `json:"hasMore"`
}

// userFollowers — GET /v1/users/{username}/followers : abonnés d'une publication.
func (h *Handler) userFollowers(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	username := chi.URLParam(r, "username")
	limit, offset := parseFollowPage(r)

	pub, err := h.q.GetPublicationBySlugOrSubdomain(r.Context(), username)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			response.NotFound(w, "User not found")
			return
		}
		response.Internal(w)
		return
	}

	rows, err := h.q.ListFollowersByPublication(r.Context(), db.ListFollowersByPublicationParams{
		PublicationId: pub.ID,
		ViewerID:      toUUID(userID),
		Limit:         int32(limit + 1),
		Offset:        int32(offset),
	})
	if err != nil {
		log.Printf("[creator] followers: %v", err)
		response.Internal(w)
		return
	}

	hasMore := len(rows) > limit
	if hasMore {
		rows = rows[:limit]
	}
	items := make([]followActor, 0, len(rows))
	for _, row := range rows {
		pubID := row.UserPublicationID
		items = append(items, followActor{
			ID:            row.UserID,
			PublicationID: &pubID,
			Name:          textPtr(row.UserName),
			Username:      textPtr(row.UserUsername),
			LogoURL:       textPtr(row.UserLogo),
			IsCertified:   row.UserCertified,
			FollowedAt:    row.FollowedAt.Time.Format(time.RFC3339),
			ViewerFollows: row.ViewerFollows,
		})
	}

	page := followPage{Items: items, HasMore: hasMore}
	if hasMore {
		page.NextCursor = fmt.Sprintf("%d", offset+len(rows))
	}
	response.OK(w, page)
}

// userFollowing — GET /v1/users/{username}/following : abonnements d'un user.
func (h *Handler) userFollowing(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	username := chi.URLParam(r, "username")
	limit, offset := parseFollowPage(r)

	pub, err := h.q.GetPublicationBySlugOrSubdomain(r.Context(), username)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			response.NotFound(w, "User not found")
			return
		}
		response.Internal(w)
		return
	}
	ownerID, err := h.q.GetPublicationOwner(r.Context(), pub.ID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			response.NotFound(w, "User not found")
			return
		}
		response.Internal(w)
		return
	}

	rows, err := h.q.ListFollowingByUser(r.Context(), db.ListFollowingByUserParams{
		ReaderId: toUUID(ownerID),
		ViewerID: toUUID(userID),
		Limit:    int32(limit + 1),
		Offset:   int32(offset),
	})
	if err != nil {
		log.Printf("[creator] following: %v", err)
		response.Internal(w)
		return
	}

	hasMore := len(rows) > limit
	if hasMore {
		rows = rows[:limit]
	}
	items := make([]followActor, 0, len(rows))
	for _, row := range rows {
		pubID := row.UserPublicationID
		items = append(items, followActor{
			ID:            row.UserID,
			PublicationID: &pubID,
			Name:          stringPtr(row.UserName),
			Username:      stringPtr(row.UserUsername),
			LogoURL:       textPtr(row.UserLogo),
			IsCertified:   row.UserCertified,
			FollowedAt:    row.FollowedAt.Time.Format(time.RFC3339),
			ViewerFollows: row.ViewerFollows,
		})
	}

	page := followPage{Items: items, HasMore: hasMore}
	if hasMore {
		page.NextCursor = fmt.Sprintf("%d", offset+len(rows))
	}
	response.OK(w, page)
}

func parseFollowPage(r *http.Request) (limit, offset int) {
	limit, _ = strconv.Atoi(r.URL.Query().Get("limit"))
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	if c := r.URL.Query().Get("cursor"); c != "" {
		offset, _ = strconv.Atoi(c)
	}
	if offset < 0 {
		offset = 0
	}
	return limit, offset
}

// followToggle suit/se désabonne d'une publication (parité Hono /v1/users/{id}/follow).
func (h *Handler) followToggle(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	targetID := chi.URLParam(r, "id")
	ctx := r.Context()

	// Résout targetID vers l'ID de publication si un slug/username est passé
	pubID := targetID
	if pub, err := h.q.GetPublicationBySlugOrSubdomain(ctx, targetID); err == nil {
		pubID = pub.ID
	}

	if ownerID, err := h.q.GetPublicationOwner(ctx, pubID); err == nil && ownerID == userID {
		response.BadRequest(w, "You cannot follow yourself")
		return
	}

	params := db.GetExistingFollowParams{ReaderId: toUUID(userID), PublicationId: pubID}

	_, err := h.q.GetExistingFollow(ctx, params)
	if err == nil {
		if err := h.q.DeleteFollow(ctx, db.DeleteFollowParams{ReaderId: toUUID(userID), PublicationId: pubID}); err != nil {
			log.Printf("[creator] unfollow: %v", err)
			response.Internal(w)
			return
		}
		if err := deleteFollowNotification(ctx, h.q, pubID, userID); err != nil {
			log.Printf("[creator] delete follow notification: %v", err)
		}
		count, err := h.q.CountFollowers(ctx, pubID)
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

	if err := h.q.InsertFollow(ctx, db.InsertFollowParams{ReaderId: toUUID(userID), PublicationId: pubID}); err != nil {
		log.Printf("[creator] follow: %v", err)
		response.Internal(w)
		return
	}
	if err := notifyFollow(ctx, h.q, pubID, userID); err != nil {
		log.Printf("[creator] follow notification: %v", err)
	}
	count, err := h.q.CountFollowers(ctx, pubID)
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

func textVal(p *string) pgtype.Text {
	if p == nil || *p == "" {
		return pgtype.Text{}
	}
	return pgtype.Text{String: *p, Valid: true}
}

var errForbidden = errors.New("permission insuffisante")

func textPtr(t pgtype.Text) *string {
	if !t.Valid {
		return nil
	}
	return &t.String
}

func stringPtr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func timestampPtr(t pgtype.Timestamp) *string {
	if !t.Valid {
		return nil
	}
	s := t.Time.Format(time.RFC3339)
	return &s
}
