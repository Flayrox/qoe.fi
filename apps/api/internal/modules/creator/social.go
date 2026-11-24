package creator

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	db "github.com/qoefi/api/internal/database"
	"github.com/qoefi/api/internal/identity"
	"github.com/qoefi/api/internal/middleware"
	"github.com/qoefi/api/internal/notifications"
	"github.com/qoefi/api/internal/response"
	"github.com/qoefi/api/internal/secguard"
	"github.com/qoefi/api/internal/slug"
)

// userMe retourne le profil complet + compteurs (parité Hono /v1/users/me).
func (h *Handler) userMe(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())

	row, err := h.q.GetUserByIDFull(r.Context(), userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			// JIT Auto-provisioning : si l'utilisateur est authentifié via Supabase Auth
			// mais que la ligne User n'est pas encore créée dans la base PostgreSQL locale,
			// on la provisionne automatiquement pour auto-guérir le compte.
			claims := middleware.Claims(r.Context())
			email, _ := claims["email"].(string)
			meta, _ := claims["user_metadata"].(map[string]any)
			name := "Utilisateur"
			username := "user"
			if meta != nil {
				if n, ok := meta["full_name"].(string); ok && n != "" {
					name = n
				} else if n, ok := meta["name"].(string); ok && n != "" {
					name = n
				}
				if u, ok := meta["username"].(string); ok && u != "" {
					username = u
				}
			}
			if email != "" && username == "user" {
				username = strings.Split(email, "@")[0]
			}
			if email != "" && name == "Utilisateur" {
				name = capitalizeFirst(strings.Split(email, "@")[0])
			}

			// Provisionne la publication personnelle et la ligne User
			pubID := "pub_" + strings.ReplaceAll(userID, "-", "")
			if len(pubID) > 36 {
				pubID = pubID[:36]
			}
			slugVal := slug.Slugify(username)
			if slugVal == "" {
				slugVal = "user"
			}

			if _, err := h.pool.Exec(r.Context(), `
				INSERT INTO "Publisher" (id, type, name, slug, subdomain, "createdAt", "updatedAt")
				VALUES ($1, 'PERSONAL', $2, $3, $3, now(), now())
				ON CONFLICT (id) DO NOTHING`, pubID, name, slugVal); err != nil {
				log.Printf("[creator] userMe auto-provision publisher: %v", err)
				response.Internal(w)
				return
			}

			if _, err := h.pool.Exec(r.Context(), `
				INSERT INTO "User" (id, email, name, username, role, "publisherId", "createdAt", "updatedAt")
				VALUES ($1, $2, $3, $4, 'user', $5, now(), now())
				ON CONFLICT (id) DO UPDATE SET email = $2, name = $3, username = $4, "publisherId" = $5, "updatedAt" = now()`,
				toUUID(userID), email, name, username, pubID); err != nil {
				log.Printf("[creator] userMe auto-provision user: %v", err)
				response.Internal(w)
				return
			}

			// Re-fetch de la ligne fraîchement créée
			row, err = h.q.GetUserByIDFull(r.Context(), userID)
			if err != nil {
				log.Printf("[creator] userMe auto-provision failed: %v", err)
				response.NotFound(w, "User not found")
				return
			}
		} else {
			log.Printf("[creator] userMe: %v", err)
			response.Internal(w)
			return
		}
	}

	following, err := h.q.CountFollowing(r.Context(), toUUID(userID))
	if err != nil {
		log.Printf("[creator] userMe following: %v", err)
		response.Internal(w)
		return
	}

	var followers int32
	if row.PublisherId.Valid && row.PublisherId.String != "" {
		if n, err := h.q.CountFollowers(r.Context(), row.PublisherId.String); err == nil {
			followers = n
		}
	}

	// Avatar du compte : logo personnel (User.logoUrl), sinon logo de la
	// publication personnelle (convention PERSONAL : avatar auteur ?? logo pub).
	var publisherLogoUrl *string
	if row.PublisherId.Valid && row.PublisherId.String != "" {
		var logo pgtype.Text
		if err := h.pool.QueryRow(r.Context(), `SELECT "logoUrl" FROM "Publisher" WHERE id = $1`, row.PublisherId.String).Scan(&logo); err == nil && logo.Valid {
			publisherLogoUrl = &logo.String
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
		"publisherLogoUrl":       publisherLogoUrl,
		"publisherId":            textPtr(row.PublisherId),
		"advancedSettingsMode":   row.AdvancedSettingsMode,
		"hasCompletedOnboarding": row.HasCompletedOnboarding,
		"apiAccessStatus":        row.ApiAccessStatus,
		"apiGrants":              row.ApiGrants,
		"apiApplicationReason":   textPtr(row.ApiApplicationReason),
		"walletBalanceCents":     row.WalletBalanceCents,
		"createdAt":              timestampPtr(row.CreatedAt),
		"updatedAt":              timestampPtr(row.UpdatedAt),
		"stats":                  map[string]int32{"followingCount": following, "followersCount": followers},
	}})
}

// userByUsername résout une publication par slug OU subdomain (parité Hono),
// avec fallback sur User.username ou User.id pour les comptes personnels.
// publicProfileIdentity dérive le type public du profil depuis SA publication.
// Aucun `MediaMember` n'entre dans cette décision : le profil personnel d'un
// membre de média reste PERSONAL, seul un profil de publication média est MEDIA.
func publicProfileIdentity(publicationType db.PublisherType) string {
	return identity.FromPublisherType(string(publicationType))
}

func (h *Handler) userByUsername(w http.ResponseWriter, r *http.Request) {
	username := chi.URLParam(r, "username")

	row, err := h.q.GetPublisherBySlugOrSubdomain(r.Context(), username)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			// Fallback : cherche si c'est un User.username ou User.id
			var pubID pgtype.Text
			var uID, uName, uUsername string
			var uBio, uLogo pgtype.Text
			var uCreatedAt pgtype.Timestamp
			errUser := h.pool.QueryRow(r.Context(), `
				SELECT id, "publisherId", COALESCE(name, username, 'Lecteur'), COALESCE(username, id::text), "onboardingText", "logoUrl", "createdAt"
				FROM "User" 
				WHERE LOWER(username) = LOWER($1) 
				   OR id::text = $1 
				   OR "publisherId" = $1
				LIMIT 1`, username).Scan(&uID, &pubID, &uName, &uUsername, &uBio, &uLogo, &uCreatedAt)
			if errUser == nil {
				if pubID.Valid && pubID.String != "" {
					row, err = h.q.GetPublisherBySlugOrSubdomain(r.Context(), pubID.String)
				} else {
					row = db.GetPublisherBySlugOrSubdomainRow{
						ID:             uID,
						Type:           db.PublisherTypePERSONAL,
						Name:           uName,
						Slug:           uUsername,
						HeroText:       uBio,
						LogoUrl:        uLogo,
						CreatedAt:      uCreatedAt,
						FollowersCount: 0,
						ArticlesCount:  0,
					}
					err = nil
				}
			}
		}
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				response.NotFound(w, "User not found")
				return
			}
			log.Printf("[creator] userByUsername: %v", err)
			response.Internal(w)
			return
		}
	}

	viewerID, _ := middleware.UserID(r.Context())

	// Nombre d'abonnements du propriétaire de la publication (CountFollowing)
	// + id du User propriétaire (isOwnProfile côté client) + pronoms (profil inclusif).
	var followingCount int32
	var ownerUserID string
	var pronouns *string
	var onboardingText *string
	displaySlug := row.Slug
	if ownerID, err := h.q.GetPublisherOwner(r.Context(), row.ID); err == nil {
		ownerUserID = ownerID
		if n, err := h.q.CountFollowing(r.Context(), toUUID(ownerID)); err == nil {
			followingCount = n
		}
		if row.Type != db.PublisherTypeMEDIA {
			if p, err := h.q.GetUserPronouns(r.Context(), ownerID); err == nil && p.Valid {
				pronouns = &p.String
			}
		}
		var uUsername, uOnboarding pgtype.Text
		if err := h.pool.QueryRow(r.Context(), `SELECT username, "onboardingText" FROM "User" WHERE id = $1`, toUUID(ownerID)).Scan(&uUsername, &uOnboarding); err == nil {
			if row.Type == db.PublisherTypePERSONAL && uUsername.Valid && uUsername.String != "" {
				displaySlug = uUsername.String
			}
			if row.Type == db.PublisherTypePERSONAL && uOnboarding.Valid && strings.TrimSpace(uOnboarding.String) != "" {
				loc := strings.TrimSpace(uOnboarding.String)
				onboardingText = &loc
			}
		}
	}

	// Un média n'emprunte ni les pronoms ni la localisation de son owner :
	// sa localisation est une métadonnée de la publication.
	if row.Type == db.PublisherTypeMEDIA {
		var mediaLocation pgtype.Text
		if err := h.pool.QueryRow(r.Context(),
			`SELECT NULLIF(BTRIM("siteOptions"->>'location'), '') FROM "Publisher" WHERE id = $1`,
			row.ID).Scan(&mediaLocation); err == nil && mediaLocation.Valid {
			onboardingText = &mediaLocation.String
		}
	}

	access, err := h.resolveProfileAccess(r.Context(), row.ID, viewerID)
	if err != nil {
		log.Printf("[creator] userByUsername access: %v", err)
		response.Internal(w)
		return
	}
	if access.Blocked {
		response.NotFound(w, "User not found")
		return
	}
	if access.OwnerID != "" {
		ownerUserID = access.OwnerID
	}

	// Métadonnées étendues de la publication (site web, supportUrl, réseaux sociaux)
	var website *string
	var supportUrl *string
	var socialLinks any

	var siteOptJSON []byte
	var supp pgtype.Text
	if err := h.pool.QueryRow(r.Context(),
		`SELECT "supportUrl", "siteOptions" FROM "Publisher" WHERE id = $1`,
		row.ID).Scan(&supp, &siteOptJSON); err == nil {
		if supp.Valid && strings.TrimSpace(supp.String) != "" {
			s := strings.TrimSpace(supp.String)
			supportUrl = &s
		}
		if len(siteOptJSON) > 0 {
			var opt map[string]any
			if json.Unmarshal(siteOptJSON, &opt) == nil {
				if w, ok := opt["website"].(string); ok && strings.TrimSpace(w) != "" {
					ws := strings.TrimSpace(w)
					website = &ws
				}
				if sl, ok := opt["socialLinks"]; ok {
					socialLinks = sl
				}
			}
		}
	}

	response.OK(w, map[string]any{"data": map[string]any{
		"id":                row.ID,
		"ownerUserId":       ownerUserID,
		"name":              row.Name,
		"slug":              displaySlug,
		"subdomain":         textPtr(row.Subdomain),
		"customDomain":      textPtr(row.CustomDomain),
		"heroText":          textPtr(row.HeroText),
		"onboardingText":    onboardingText,
		"logoUrl":           textPtr(row.LogoUrl),
		"headerImageUrl":    textPtr(row.HeaderImageUrl),
		"website":           website,
		"supportUrl":        supportUrl,
		"socialLinks":       socialLinks,
		"isCertified":       row.IsCertified,
		"isFollowing":       access.IsFollowing,
		"followRequested":   access.Requested,
		"profileVisibility": access.Visibility,
		"isPrivate":         access.Visibility == "PRIVATE",
		"canViewContent":    access.CanViewContent,
		"pronouns":          pronouns,
		"createdAt":         timestampPtr(row.CreatedAt),
		"type":              publicProfileIdentity(row.Type),
		"_count":            map[string]int32{"followers": row.FollowersCount, "following": followingCount, "articles": row.ArticlesCount},
	}})
}

// followActor est un utilisateur listé dans followers/following.
type followActor struct {
	ID            string  `json:"id"`
	PublisherID   *string `json:"publisherId"`
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

	pub, err := h.q.GetPublisherBySlugOrSubdomain(r.Context(), username)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			var userPubID pgtype.Text
			if errUser := h.pool.QueryRow(r.Context(), `SELECT "publisherId" FROM "User" WHERE id::text = $1 OR lower(username) = lower($1)`, username).Scan(&userPubID); errUser == nil && userPubID.Valid && userPubID.String != "" {
				pub, err = h.q.GetPublisherBySlugOrSubdomain(r.Context(), userPubID.String)
			}
		}
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				response.NotFound(w, "User not found")
				return
			}
			response.Internal(w)
			return
		}
	}

	access, err := h.resolveProfileAccess(r.Context(), pub.ID, userID)
	if err != nil {
		log.Printf("[creator] followers access: %v", err)
		response.Internal(w)
		return
	}
	if access.Blocked {
		response.NotFound(w, "User not found")
		return
	}
	if !access.CanViewContent {
		response.Forbidden(w, "Ce compte est privé.")
		return
	}

	rows, err := h.q.ListFollowersByPublisher(r.Context(), db.ListFollowersByPublisherParams{
		PublisherId: pub.ID,
		ViewerID:    toUUID(userID),
		Limit:       int32(limit + 1),
		Offset:      int32(offset),
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
		pubID := row.UserPublisherID
		items = append(items, followActor{
			ID:            row.UserID,
			PublisherID:   &pubID,
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

	pub, err := h.q.GetPublisherBySlugOrSubdomain(r.Context(), username)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			var userPubID pgtype.Text
			if errUser := h.pool.QueryRow(r.Context(), `SELECT "publisherId" FROM "User" WHERE id::text = $1 OR lower(username) = lower($1)`, username).Scan(&userPubID); errUser == nil && userPubID.Valid && userPubID.String != "" {
				pub, err = h.q.GetPublisherBySlugOrSubdomain(r.Context(), userPubID.String)
			}
		}
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				response.NotFound(w, "User not found")
				return
			}
			response.Internal(w)
			return
		}
	}
	ownerID, err := h.q.GetPublisherOwner(r.Context(), pub.ID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			response.NotFound(w, "User not found")
			return
		}
		response.Internal(w)
		return
	}

	access, err := h.resolveProfileAccess(r.Context(), pub.ID, userID)
	if err != nil {
		log.Printf("[creator] following access: %v", err)
		response.Internal(w)
		return
	}
	if access.Blocked {
		response.NotFound(w, "User not found")
		return
	}
	if !access.CanViewContent {
		response.Forbidden(w, "Ce compte est privé.")
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
		pubID := row.UserPublisherID
		items = append(items, followActor{
			ID:            row.UserID,
			PublisherID:   &pubID,
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
	limit = middleware.ClampLimit(r.URL.Query().Get("limit"), 50, 100)
	if c := r.URL.Query().Get("cursor"); c != "" {
		offset, _ = strconv.Atoi(c)
	}
	if offset < 0 {
		offset = 0
	}
	return limit, offset
}

// followToggle suit/se désabonne d'une publication (parité Hono /v1/users/{id}/follow).
// Un compte PRIVATE transforme le follow en demande à approuver ; un second
// clic sur « Demandé » annule la demande.
func (h *Handler) followToggle(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserID(r.Context())
	// Défense en profondeur : la route est derrière CombinedAuth, mais un
	// contexte sans session ne doit jamais atteindre le SQL (sinon 500).
	if !ok || userID == "" {
		response.Unauthorized(w, "Non authentifié")
		return
	}
	ctx := r.Context()
	prof := h.sec.EvaluateRequest(ctx, r, userID)
	if !h.sec.EnforceRateLimit(ctx, w, r, "follow", userID, prof.Tier, secguard.QuotasFollow) {
		return
	}
	targetID := chi.URLParam(r, "id")

	// Résout targetID vers l'ID de publication si un slug, username ou User.id est passé
	pubID := targetID
	if pub, err := h.q.GetPublisherBySlugOrSubdomain(ctx, targetID); err == nil {
		pubID = pub.ID
	} else {
		var userPubID pgtype.Text
		if errUser := h.pool.QueryRow(ctx, `SELECT "publisherId" FROM "User" WHERE id::text = $1 OR lower(username) = lower($1)`, targetID).Scan(&userPubID); errUser == nil && userPubID.Valid && userPubID.String != "" {
			pubID = userPubID.String
		}
	}

	access, err := h.resolveProfileAccess(ctx, pubID, userID)
	if err != nil {
		log.Printf("[creator] follow access: %v", err)
		response.Internal(w)
		return
	}
	if access.OwnerID == "" {
		response.NotFound(w, "User not found")
		return
	}
	if access.Blocked {
		response.Forbidden(w, "Action impossible avec cet utilisateur.")
		return
	}
	if access.OwnerID == userID {
		pubTypeRow, errPub := h.q.GetPublisherTypeByID(ctx, pubID)
		if errPub != nil || pubTypeRow.Type != db.PublisherTypeMEDIA {
			response.BadRequest(w, "You cannot follow yourself")
			return
		}
	}

	params := db.GetExistingFollowParams{ReaderId: toUUID(userID), PublisherId: pubID}

	if _, err := h.q.GetExistingFollow(ctx, params); err == nil {
		if err := h.q.DeleteFollow(ctx, db.DeleteFollowParams{ReaderId: toUUID(userID), PublisherId: pubID}); err != nil {
			log.Printf("[creator] unfollow: %v", err)
			response.Internal(w)
			return
		}
		if err := deleteFollowNotification(ctx, h.q, pubID, userID); err != nil {
			log.Printf("[creator] delete follow notification: %v", err)
		}
		h.cancelFollowRequest(ctx, userID, pubID)
		h.sec.TrackFollowAction(ctx, userID, targetID)
		h.invalidateFollowTrust(ctx, userID, access.OwnerID)
		response.OK(w, h.followPayload(ctx, pubID, false, false))
		return
	} else if !errors.Is(err, pgx.ErrNoRows) {
		log.Printf("[creator] follow check: %v", err)
		response.Internal(w)
		return
	}

	// Une demande est déjà en attente : le clic l'annule.
	if access.Requested {
		h.cancelFollowRequest(ctx, userID, pubID)
		h.sec.TrackFollowAction(ctx, userID, targetID)
		h.invalidateFollowTrust(ctx, userID, access.OwnerID)
		response.OK(w, h.followPayload(ctx, pubID, false, false))
		return
	}

	// Compte privé : le follow devient une demande à approuver.
	if access.Visibility == "PRIVATE" {
		if err := h.q.InsertFollowRequest(ctx, db.InsertFollowRequestParams{
			RequesterId: toUUID(userID),
			PublisherId: pubID,
		}); err != nil {
			log.Printf("[creator] follow request: %v", err)
			response.Internal(w)
			return
		}
		if err := notifyFollowRequest(ctx, h.q, h.pool, pubID, userID); err != nil {
			log.Printf("[creator] follow request notification: %v", err)
		}
		h.sec.TrackFollowAction(ctx, userID, targetID)
		h.invalidateFollowTrust(ctx, userID, access.OwnerID)
		response.OK(w, h.followPayload(ctx, pubID, false, true))
		return
	}

	if err := h.q.InsertFollow(ctx, db.InsertFollowParams{ReaderId: toUUID(userID), PublisherId: pubID}); err != nil {
		log.Printf("[creator] follow: %v", err)
		response.Internal(w)
		return
	}
	if err := notifyFollow(ctx, h.q, h.pool, pubID, userID); err != nil {
		log.Printf("[creator] follow notification: %v", err)
	}
	h.sec.TrackFollowAction(ctx, userID, targetID)
	h.invalidateFollowTrust(ctx, userID, access.OwnerID)
	response.OK(w, h.followPayload(ctx, pubID, true, false))
}

// followPayload construit l'état de suivi. Si le comptage échoue, il est
// omis plutôt que fabriqué à 0 : l'appelant ne lit pas une fausse valeur.
func (h *Handler) followPayload(ctx context.Context, pubID string, following, requested bool) map[string]any {
	data := map[string]any{"following": following, "requested": requested}
	if count, err := h.q.CountFollowers(ctx, pubID); err == nil {
		data["followersCount"] = count
	} else {
		log.Printf("[creator] count followers: %v", err)
	}
	return map[string]any{"data": data}
}

// notifyFollow crée la notification FOLLOW au propriétaire d'une publication
// (PERSONAL → créateur, MEDIA → membre owner) via notifications.Dispatch.
func notifyFollow(ctx context.Context, tq ServiceQuerier, notifDB notifications.DB, publisherID, senderID string) error {
	ownerID, err := tq.GetPublisherOwner(ctx, publisherID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil
		}
		return err
	}
	if ownerID == "" || ownerID == senderID {
		return nil
	}

	return notifications.Dispatch(ctx, notifDB, notifications.DispatchInput{
		RecipientID: ownerID,
		SenderID:    senderID,
		Type:        "FOLLOW",
		PublisherID: &publisherID,
	})
}

// deleteFollowNotification supprime la notification FOLLOW lors d'un unfollow.
func deleteFollowNotification(ctx context.Context, tq ServiceQuerier, publisherID, senderID string) error {
	ownerID, err := tq.GetPublisherOwner(ctx, publisherID)
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
		RecipientId: toUUID(ownerID),
		SenderId:    toUUID(senderID),
		PublisherId: pgtype.Text{String: publisherID, Valid: true},
	})
}

// removeFollower — DELETE /v1/me/followers/{userId} : retire un abonné de la
// publication de l'utilisateur (compte perso ou publication active).
func (h *Handler) removeFollower(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserID(r.Context())
	if !ok || userID == "" {
		response.Unauthorized(w, "Non authentifié")
		return
	}
	targetUserID := chi.URLParam(r, "userId")
	if targetUserID == "" {
		response.BadRequest(w, "Identifiant utilisateur requis")
		return
	}

	pubID, _ := middleware.PublisherID(r.Context())
	if pubID == "" {
		var userPubID pgtype.Text
		err := h.pool.QueryRow(r.Context(), `SELECT "publisherId" FROM "User" WHERE id = $1::uuid`, toUUID(userID)).Scan(&userPubID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				response.NotFound(w, "Utilisateur introuvable")
				return
			}
			log.Printf("[creator] remove follower get user: %v", err)
			response.Internal(w)
			return
		}
		if userPubID.Valid {
			pubID = userPubID.String
		}
	}
	if pubID == "" {
		response.NotFound(w, "Publisher introuvable")
		return
	}

	tag, err := h.pool.Exec(r.Context(), `
		DELETE FROM "Follows"
		WHERE "readerId" = $1::uuid AND "publisherId" = $2
	`, toUUID(targetUserID), pubID)
	if err != nil {
		log.Printf("[creator] remove follower: %v", err)
		response.Internal(w)
		return
	}
	if tag.RowsAffected() == 0 {
		// Aucun abonnement retiré : ne pas répondre « removed » à tort.
		response.NotFound(w, "Abonné introuvable")
		return
	}

	// Suppression d'éventuelles notifications d'abonnement en attente.
	_ = deleteFollowNotification(r.Context(), h.q, pubID, targetUserID)
	h.invalidateFollowTrust(r.Context(), userID, targetUserID)

	response.OK(w, map[string]any{"removed": true})
}
