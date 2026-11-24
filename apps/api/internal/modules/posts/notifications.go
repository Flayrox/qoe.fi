package posts

import (
	"context"
	"log"
	"regexp"

	"github.com/jackc/pgx/v5/pgtype"
	db "github.com/qoefi/api/internal/database"
	"github.com/qoefi/api/internal/notifications"
)

// mentionRe extrait les @usernames du contenu (même règle que threadgate).
var mentionRe = regexp.MustCompile(`@([a-zA-Z0-9_]+)`)

// isBlockedBetween vérifie un blocage dans un sens ou l'autre entre deux
// comptes. Toute création de notification passe par ce garde : le blocage
// doit couper les rappels, pas seulement l'affichage du feed.
func isBlockedBetween(ctx context.Context, q db.Querier, a, b string) (bool, error) {
	if a == "" || b == "" || a == b {
		return false, nil
	}
	return q.IsBlockedEitherWay(ctx, db.IsBlockedEitherWayParams{
		ReaderId:  toUUID(a),
		CreatorId: toUUID(b),
	})
}

// ensurePostNotBlocked refuse une interaction vers le contenu d'un compte
// bloqué, dans un sens ou l'autre.
func (s *Service) ensurePostNotBlocked(ctx context.Context, q db.Querier, postID, userID string) error {
	authorID, err := q.GetPostAuthor(ctx, postID)
	if err != nil {
		return err
	}
	blocked, err := isBlockedBetween(ctx, q, userID, authorID)
	if err != nil {
		return err
	}
	if blocked {
		return ErrBlockedContent
	}
	return nil
}

// notifyMentionsInContent notifie les @mentionnés d'un post (standalone OU réponse).
// Best-effort : ignore les erreurs de résolution de username.
func notifyMentionsInContent(ctx context.Context, tq db.Querier, notifDB notifications.DB, content, postID, senderID string) {
	matches := mentionRe.FindAllStringSubmatch(content, -1)
	seen := map[string]bool{}
	var usernames []string
	for _, m := range matches {
		u := m[1]
		if !seen[u] {
			seen[u] = true
			usernames = append(usernames, u)
		}
	}
	if len(usernames) == 0 {
		return
	}
	users, err := tq.GetUsersByUsernames(ctx, usernames)
	if err != nil {
		log.Printf("[posts] mention recipients: %v", err)
		return
	}
	for _, u := range users {
		if err := createReplyNotification(ctx, notifDB, "MENTION", u.UserID, senderID, postID); err != nil {
			log.Printf("[posts] mention notification: %v", err)
		}
	}
}

// notifyLike crée la notification LIKE via notifications.Dispatch.
func notifyLike(ctx context.Context, tq db.Querier, notifDB notifications.DB, postID, senderID string) error {
	return createEngagementNotification(ctx, tq, notifDB, "LIKE", postID, senderID)
}

// notifyRepost crée la notification REPOST via notifications.Dispatch.
func notifyRepost(ctx context.Context, tq db.Querier, notifDB notifications.DB, postID, senderID string) error {
	return createEngagementNotification(ctx, tq, notifDB, "REPOST", postID, senderID)
}

func createEngagementNotification(ctx context.Context, tq db.Querier, notifDB notifications.DB, kind, postID, senderID string) error {
	authorID, err := tq.GetPostAuthor(ctx, postID)
	if err != nil {
		return err
	}
	return notifications.Dispatch(ctx, notifDB, notifications.DispatchInput{
		RecipientID: authorID,
		SenderID:    senderID,
		Type:        kind,
		ThoughtID:   &postID,
	})
}

// deleteEngagementNotification supprime la notification au unlike/unrepost.
func deleteEngagementNotification(ctx context.Context, tq db.Querier, kind, postID, senderID string) error {
	authorID, err := tq.GetPostAuthor(ctx, postID)
	if err != nil {
		return err
	}
	authorUUID := toUUID(authorID)
	senderUUID := toUUID(senderID)
	if kind == "LIKE" {
		return tq.DeleteLikeNotification(ctx, db.DeleteLikeNotificationParams{
			RecipientId: authorUUID, SenderId: senderUUID, ThoughtId: pgtype.Text{String: postID, Valid: true},
		})
	}
	return tq.DeleteRepostNotification(ctx, db.DeleteRepostNotificationParams{
		RecipientId: authorUUID, SenderId: senderUUID, ThoughtId: pgtype.Text{String: postID, Valid: true},
	})
}
