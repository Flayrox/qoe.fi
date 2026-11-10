package creator

import (
	"context"
	"errors"
	"log"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	db "github.com/qoefi/api/internal/database"
	"github.com/qoefi/api/internal/middleware"
	"github.com/qoefi/api/internal/notifications"
	"github.com/qoefi/api/internal/response"
)

// followRequestActor est le demandeur affiché dans les réglages du compte
// privé (nom, handle, avatar) + la date de la demande.
type followRequestActor struct {
	ID            string  `json:"id"`
	RequestID     string  `json:"requestId"`
	PublisherID *string `json:"publisherId"`
	Name          *string `json:"name"`
	Username      *string `json:"username"`
	LogoURL       *string `json:"logoUrl"`
	IsCertified   bool    `json:"isCertified"`
	RequestedAt   string  `json:"requestedAt"`
}

// followRequests — GET /v1/me/follow-requests : demandes en attente pour les
// publications que l'utilisateur possède (compte personnel + médias
// owner/admin).
func (h *Handler) followRequests(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserID(r.Context())
	if !ok || userID == "" {
		response.Unauthorized(w, "Non authentifié")
		return
	}
	limit, offset := parseFollowPage(r)

	rows, err := h.pool.Query(r.Context(), `
		SELECT fr.id,
		       fr."createdAt",
		       u.id::text,
		       u.name,
		       u.username,
		       u."logoUrl",
		       u."isCertified",
		       u."publisherId"::text
		FROM "FollowRequest" fr
		JOIN "User" u ON u.id = fr."requesterId"
		WHERE fr.status = 'PENDING'
		  AND (
		    EXISTS (
		      SELECT 1 FROM "User" me
		      WHERE me.id = $1 AND me."publisherId" = fr."publisherId"
		    )
		    OR EXISTS (
		      SELECT 1
		      FROM "MediaMember" mm
		      JOIN "Media" md ON md.id = mm."mediaId"
		      WHERE md."publisherId" = fr."publisherId"
		        AND mm."userId" = $1
		        AND mm.status = 'active'
		        AND mm.role IN ('owner', 'admin')
		    )
		  )
		ORDER BY fr."createdAt" DESC, fr.id DESC
		LIMIT $2 OFFSET $3`, toUUID(userID), limit+1, offset)
	if err != nil {
		log.Printf("[creator] follow requests: %v", err)
		response.Internal(w)
		return
	}
	defer rows.Close()

	items := make([]followRequestActor, 0, limit)
	for rows.Next() {
		var item followRequestActor
		var createdAt pgtype.Timestamp
		var name, username, logo, publisherID pgtype.Text
		if err := rows.Scan(&item.RequestID, &createdAt, &item.ID, &name, &username, &logo, &item.IsCertified, &publisherID); err != nil {
			log.Printf("[creator] follow requests scan: %v", err)
			response.Internal(w)
			return
		}
		item.Name = textPtr(name)
		item.Username = textPtr(username)
		item.LogoURL = textPtr(logo)
		item.PublisherID = textPtr(publisherID)
		if createdAt.Valid {
			item.RequestedAt = createdAt.Time.Format(time.RFC3339)
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		log.Printf("[creator] follow requests rows: %v", err)
		response.Internal(w)
		return
	}

	hasMore := len(items) > limit
	if hasMore {
		items = items[:limit]
	}
	page := map[string]any{"items": items, "hasMore": hasMore}
	if hasMore {
		page["nextCursor"] = offset + len(items)
	} else {
		page["nextCursor"] = nil
	}
	response.OK(w, page)
}

// acceptFollowRequest — POST /v1/me/follow-requests/{id}/accept : crée le
// follow et clôt la demande. Idempotent (ON CONFLICT DO NOTHING).
func (h *Handler) acceptFollowRequest(w http.ResponseWriter, r *http.Request) {
	userID, requesterID, publisherID, ok := h.loadFollowRequestForDecision(w, r)
	if !ok {
		return
	}
	if !h.canManagePublisher(r.Context(), userID, publisherID) {
		response.Forbidden(w, "Vous ne pouvez pas accepter cette demande.")
		return
	}

	if _, err := h.pool.Exec(r.Context(), `
		INSERT INTO "Follows" (id, "readerId", "publisherId")
		VALUES (gen_random_uuid()::text, $1, $2)
		ON CONFLICT DO NOTHING`, toUUID(requesterID), publisherID); err != nil {
		log.Printf("[creator] accept follow request insert: %v", err)
		response.Internal(w)
		return
	}
	if err := h.q.AcceptFollowRequest(r.Context(), chi.URLParam(r, "id")); err != nil {
		log.Printf("[creator] accept follow request: %v", err)
		response.Internal(w)
		return
	}
	h.deleteFollowRequestNotification(r.Context(), userID, requesterID, publisherID)
	h.notifyFollowAccepted(r.Context(), publisherID, userID, requesterID)
	response.OK(w, map[string]any{"accepted": true})
}

// rejectFollowRequest — POST /v1/me/follow-requests/{id}/reject : refuse la
// demande sans créer de follow.
func (h *Handler) rejectFollowRequest(w http.ResponseWriter, r *http.Request) {
	userID, requesterID, publisherID, ok := h.loadFollowRequestForDecision(w, r)
	if !ok {
		return
	}
	if !h.canManagePublisher(r.Context(), userID, publisherID) {
		response.Forbidden(w, "Vous ne pouvez pas refuser cette demande.")
		return
	}
	if err := h.q.RejectFollowRequest(r.Context(), chi.URLParam(r, "id")); err != nil {
		log.Printf("[creator] reject follow request: %v", err)
		response.Internal(w)
		return
	}
	h.deleteFollowRequestNotification(r.Context(), userID, requesterID, publisherID)
	response.OK(w, map[string]any{"rejected": true})
}

// loadFollowRequestForDecision charge une demande PENDING et vérifie
// l'authentification. Retourne ok=false si la réponse HTTP est déjà écrite.
func (h *Handler) loadFollowRequestForDecision(w http.ResponseWriter, r *http.Request) (userID, requesterID, publisherID string, ok bool) {
	userID, authed := middleware.UserID(r.Context())
	if !authed || userID == "" {
		response.Unauthorized(w, "Non authentifié")
		return "", "", "", false
	}
	id := chi.URLParam(r, "id")
	err := h.pool.QueryRow(r.Context(), `
		SELECT "requesterId"::text, "publisherId"
		FROM "FollowRequest"
		WHERE id = $1 AND status = 'PENDING'`, id).Scan(&requesterID, &publisherID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			response.NotFound(w, "Demande introuvable")
			return "", "", "", false
		}
		log.Printf("[creator] load follow request: %v", err)
		response.Internal(w)
		return "", "", "", false
	}
	return userID, requesterID, publisherID, true
}

func (h *Handler) deleteFollowRequestNotification(ctx context.Context, ownerID, requesterID, publisherID string) {
	if err := h.q.DeleteFollowRequestNotification(ctx, db.DeleteFollowRequestNotificationParams{
		RecipientId:   toUUID(ownerID),
		SenderId:      toUUID(requesterID),
		PublisherId: pgtype.Text{String: publisherID, Valid: true},
	}); err != nil {
		log.Printf("[creator] delete follow request notification: %v", err)
	}
}

// notifyFollowAccepted envoie la notification FOLLOW_ACCEPTED au demandeur dont
// la demande vient d'être validée.
func (h *Handler) notifyFollowAccepted(ctx context.Context, publisherID, userID, requesterID string) {
	if err := notifications.Dispatch(ctx, h.pool, notifications.DispatchInput{
		RecipientID:   requesterID,
		SenderID:      userID,
		Type:          "FOLLOW",
		PublisherID: &publisherID,
		Metadata:      map[string]any{"kind": "FOLLOW_ACCEPTED"},
	}); err != nil {
		log.Printf("[creator] notify follow accepted: %v", err)
	}
}

// notifyFollowRequest crée la notification de demande d'abonnement. Le type
// reste FOLLOW (pas de migration d'enum) et metadata.kind distingue la
// demande côté UI. Best-effort, respecte les préférences du destinataire.
func notifyFollowRequest(ctx context.Context, tq ServiceQuerier, publisherID, senderID string) error {
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
		PublisherId: pgtype.Text{String: publisherID, Valid: true},
	})
	if err != nil {
		if !errors.Is(err, pgx.ErrNoRows) {
			return err
		}
		exists = 0
	}
	if exists == 1 {
		return nil
	}

	requestID, err := tq.GetPendingFollowRequestID(ctx, db.GetPendingFollowRequestIDParams{
		RequesterId:   senderUUID,
		PublisherId: publisherID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil
		}
		return err
	}

	return tq.InsertFollowRequestNotification(ctx, db.InsertFollowRequestNotificationParams{
		RecipientID:   ownerUUID,
		SenderID:      senderUUID,
		PublisherID: pgtype.Text{String: publisherID, Valid: true},
		RequestID:     requestID,
	})
}

// cancelFollowRequest annule la demande PENDING du viewer et sa notification.
func (h *Handler) cancelFollowRequest(ctx context.Context, requesterID, publisherID string) {
	if err := h.q.CancelFollowRequest(ctx, db.CancelFollowRequestParams{
		RequesterId:   toUUID(requesterID),
		PublisherId: publisherID,
	}); err != nil {
		log.Printf("[creator] cancel follow request: %v", err)
	}
	if ownerID, err := h.q.GetPublisherOwner(ctx, publisherID); err == nil {
		h.deleteFollowRequestNotification(ctx, ownerID, requesterID, publisherID)
	}
}
