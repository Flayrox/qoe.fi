package posts

import (
	"context"
	"errors"
	"regexp"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	db "github.com/qoefi/api/internal/database"
)

// CanReplyResult reflète le contrôle Threadgate (miroir de threadgates.ts).
type CanReplyResult struct {
	CanReply    bool
	Reason      string
	Restriction string
}

// CanReply vérifie si l'utilisateur a le droit de répondre au thought.
func (s *Service) CanReply(ctx context.Context, thoughtID, userID string) (CanReplyResult, error) {
	gate, err := s.q.GetThoughtReplyGate(ctx, thoughtID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return CanReplyResult{Reason: "Pensée introuvable.", Restriction: "everyone"}, nil
		}
		return CanReplyResult{}, err
	}

	restriction := gate.ReplyRestriction
	if restriction == "" {
		restriction = "everyone"
	}
	if userID == gate.AuthorID {
		return CanReplyResult{CanReply: true, Restriction: restriction}, nil
	}
	if restriction == "everyone" {
		return CanReplyResult{CanReply: true, Restriction: restriction}, nil
	}

	switch restriction {
	case "subscribers":
		authorPub, err := s.q.GetPersonalPublicationID(ctx, gate.AuthorID)
		if err == nil && authorPub.Valid {
			ok, err := s.q.GetActiveSubscriptionForReply(ctx, db.GetActiveSubscriptionForReplyParams{
				PublicationId: authorPub.String, UserId: toUUID(userID),
			})
			if err == nil && ok == 1 {
				return CanReplyResult{CanReply: true, Restriction: restriction}, nil
			}
		}
		return CanReplyResult{
			Reason: "Seuls les abonnés de l'auteur peuvent répondre à ce message.", Restriction: restriction,
		}, nil

	case "following":
		replyingPub, err := s.q.GetPersonalPublicationID(ctx, userID)
		if err == nil && replyingPub.Valid {
			ok, err := s.q.GetFollowForReply(ctx, db.GetFollowForReplyParams{
				ReaderId: toUUID(gate.AuthorID), PublicationId: replyingPub.String,
			})
			if err == nil && ok == 1 {
				return CanReplyResult{CanReply: true, Restriction: restriction}, nil
			}
		}
		return CanReplyResult{
			Reason: "Seuls les comptes suivis par l'auteur peuvent répondre.", Restriction: restriction,
		}, nil

	case "mentioned":
		username, err := s.q.GetUserUsername(ctx, userID)
		if err == nil && username.Valid && username.String != "" {
			esc := regexp.QuoteMeta(username.String)
			re := regexp.MustCompile("(?i)@" + esc + `\b`)
			if re.MatchString(gate.Content) {
				return CanReplyResult{CanReply: true, Restriction: restriction}, nil
			}
		}
		return CanReplyResult{
			Reason: "Seules les personnes mentionnées peuvent répondre.", Restriction: restriction,
		}, nil
	}

	return CanReplyResult{CanReply: true, Restriction: "everyone"}, nil
}

// replyNotifications notifie les participants du fil (REPLY) et les @mentions (MENTION).
func (s *Service) replyNotifications(ctx context.Context, tq db.Querier, replyID, replyAuthor string, parentID, rootID string, content string) error {
	recipients := make(map[string]string) // userId -> type

	add := func(uid, kind string) {
		if uid != "" && uid != replyAuthor {
			if _, exists := recipients[uid]; !exists {
				recipients[uid] = kind
			}
		}
	}

	// Parent + root auteurs
	if parentID != "" {
		if parent, err := s.q.GetPostAuthor(ctx, parentID); err == nil {
			add(parent, "REPLY")
		}
	}
	if rootID != "" && rootID != parentID {
		if root, err := s.q.GetPostAuthor(ctx, rootID); err == nil {
			add(root, "REPLY")
		}
	}

	// @mentions → MENTION (remplace REPLY pour les mentionnés)
	notifyMentionsInContent(ctx, tq, content, replyID, replyAuthor)

	for uid, kind := range recipients {
		_ = createReplyNotification(ctx, tq, kind, uid, replyAuthor, replyID)
	}
	return nil
}

// createReplyNotification insère REPLY/MENTION (dédup + préférences).
func createReplyNotification(ctx context.Context, tq db.Querier, kind, recipientID, senderID, thoughtID string) error {
	recipientUUID := toUUID(recipientID)
	senderUUID := toUUID(senderID)

	prefs, err := tq.GetReplyPrefs(ctx, recipientUUID)
	if err == nil {
		if kind == "MENTION" {
			if !prefs.EmailMentions && !prefs.PushMentions {
				return nil
			}
		} else if !prefs.EmailReplies && !prefs.PushReplies {
			return nil
		}
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return err
	}

	var exists int32
	if kind == "MENTION" {
		exists, err = tq.ExistsUnreadMentionNotification(ctx, db.ExistsUnreadMentionNotificationParams{
			RecipientId: recipientUUID, SenderId: senderUUID, ThoughtId: pgtype.Text{String: thoughtID, Valid: true},
		})
	} else {
		exists, err = tq.ExistsUnreadReplyNotification(ctx, db.ExistsUnreadReplyNotificationParams{
			RecipientId: recipientUUID, SenderId: senderUUID, ThoughtId: pgtype.Text{String: thoughtID, Valid: true},
		})
	}
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return err
	}
	if exists == 1 {
		return nil
	}

	if kind == "MENTION" {
		return tq.InsertMentionNotification(ctx, db.InsertMentionNotificationParams{
			RecipientId: recipientUUID, SenderId: senderUUID, ThoughtId: pgtype.Text{String: thoughtID, Valid: true},
		})
	}
	return tq.InsertReplyNotification(ctx, db.InsertReplyNotificationParams{
		RecipientId: recipientUUID, SenderId: senderUUID, ThoughtId: pgtype.Text{String: thoughtID, Valid: true},
	})
}
