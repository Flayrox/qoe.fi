package posts

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	db "github.com/qoefi/api-go/internal/database"
)

// notifyLike crée la notification LIKE (repli du comportement Prisma TS) :
// pas d'auto-notification, respect des préférences, déduplication non-lue.
func notifyLike(ctx context.Context, tq *db.Queries, postID, senderID string) error {
	return createEngagementNotification(ctx, tq, "LIKE", postID, senderID)
}

// notifyRepost crée la notification REPOST.
func notifyRepost(ctx context.Context, tq *db.Queries, postID, senderID string) error {
	return createEngagementNotification(ctx, tq, "REPOST", postID, senderID)
}

func createEngagementNotification(ctx context.Context, tq *db.Queries, kind, postID, senderID string) error {
	authorID, err := tq.GetPostAuthor(ctx, postID)
	if err != nil {
		return err
	}
	if authorID == senderID {
		return nil
	}

	authorUUID := toUUID(authorID)
	senderUUID := toUUID(senderID)

	// Préférences du destinataire (défaut : tout activé si aucune ligne).
	prefs, err := tq.GetLikePrefs(ctx, authorUUID)
	if err == nil {
		if !prefs.EmailLikes && !prefs.PushLikes {
			return nil
		}
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return err
	}

	// Déduplication : notification identique non lue déjà présente.
	exists := func() (bool, error) {
		var n int32
		var err error
		switch kind {
		case "LIKE":
			n, err = tq.ExistsUnreadLikeNotification(ctx, db.ExistsUnreadLikeNotificationParams{
				RecipientId: authorUUID, SenderId: senderUUID, ThoughtId: pgtype.Text{String: postID, Valid: true},
			})
		default:
			n, err = tq.ExistsUnreadRepostNotification(ctx, db.ExistsUnreadRepostNotificationParams{
				RecipientId: authorUUID, SenderId: senderUUID, ThoughtId: pgtype.Text{String: postID, Valid: true},
			})
		}
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return false, nil // pas de doublon non lu
			}
			return false, err
		}
		return n == 1, nil
	}
	found, err := exists()
	if err != nil {
		return err
	}
	if found {
		return nil
	}

	switch kind {
	case "LIKE":
		return tq.InsertLikeNotification(ctx, db.InsertLikeNotificationParams{
			RecipientId: authorUUID, SenderId: senderUUID, ThoughtId: pgtype.Text{String: postID, Valid: true},
		})
	default:
		return tq.InsertRepostNotification(ctx, db.InsertRepostNotificationParams{
			RecipientId: authorUUID, SenderId: senderUUID, ThoughtId: pgtype.Text{String: postID, Valid: true},
		})
	}
}

// deleteEngagementNotification supprime la notification au unlike/unrepost.
func deleteEngagementNotification(ctx context.Context, tq *db.Queries, kind, postID, senderID string) error {
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
