package posts

import (
	"context"
	"errors"
	"log"
	"regexp"

	"github.com/jackc/pgx/v5"
	db "github.com/qoefi/api/internal/database"
	"github.com/qoefi/api/internal/notifications"
)

// CanReplyResult reflète le contrôle Threadgate (miroir de threadgates.ts).
type CanReplyResult struct {
	CanReply bool
	// Blocked distingue un refus de blocage (403) d'une restriction de
	// threadgate classique (400).
	Blocked     bool
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
	// Blocage symétrique : aucune réponse ne part vers un compte bloqué.
	blocked, err := isBlockedBetween(ctx, s.q, userID, gate.AuthorID)
	if err != nil {
		return CanReplyResult{}, err
	}
	if blocked {
		return CanReplyResult{Blocked: true, Reason: "Ce contenu n'est pas disponible.", Restriction: restriction}, nil
	}
	if userID == gate.AuthorID {
		return CanReplyResult{CanReply: true, Restriction: restriction}, nil
	}
	if restriction == "everyone" {
		return CanReplyResult{CanReply: true, Restriction: restriction}, nil
	}

	switch restriction {
	case "subscribers":
		authorPub, err := s.q.GetPersonalPublisherID(ctx, gate.AuthorID)
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return CanReplyResult{}, err
		}
		if authorPub.Valid {
			ok, err := s.q.GetActiveSubscriptionForReply(ctx, db.GetActiveSubscriptionForReplyParams{
				PublisherId: authorPub.String, UserId: toUUID(userID),
			})
			if err != nil && !errors.Is(err, pgx.ErrNoRows) {
				return CanReplyResult{}, err
			}
			if ok == 1 {
				return CanReplyResult{CanReply: true, Restriction: restriction}, nil
			}
		}
		return CanReplyResult{
			Reason: "Seuls les abonnés de l'auteur peuvent répondre à ce message.", Restriction: restriction,
		}, nil

	case "following":
		replyingPub, err := s.q.GetPersonalPublisherID(ctx, userID)
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return CanReplyResult{}, err
		}
		if replyingPub.Valid {
			ok, err := s.q.GetFollowForReply(ctx, db.GetFollowForReplyParams{
				ReaderId: toUUID(gate.AuthorID), PublisherId: replyingPub.String,
			})
			if err != nil && !errors.Is(err, pgx.ErrNoRows) {
				return CanReplyResult{}, err
			}
			if ok == 1 {
				return CanReplyResult{CanReply: true, Restriction: restriction}, nil
			}
		}
		return CanReplyResult{
			Reason: "Seuls les comptes suivis par l'auteur peuvent répondre.", Restriction: restriction,
		}, nil

	case "mentioned":
		username, err := s.q.GetUserUsername(ctx, userID)
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return CanReplyResult{}, err
		}
		if username.Valid && username.String != "" {
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
func (s *Service) replyNotifications(ctx context.Context, tq db.Querier, notifDB notifications.DB, replyID, replyAuthor string, parentID, rootID string, content string) error {
	recipients := make(map[string]string) // userId -> type

	add := func(uid, kind string) {
		if uid != "" && uid != replyAuthor {
			if _, exists := recipients[uid]; !exists {
				recipients[uid] = kind
			}
		}
	}

	// Parent + root auteurs (best-effort : la réponse est déjà écrite, une
	// notification manquée ne doit pas la faire échouer — mais elle est tracée).
	if parentID != "" {
		if parent, err := s.q.GetPostAuthor(ctx, parentID); err == nil {
			add(parent, "REPLY")
		} else {
			log.Printf("[posts] reply notification parent: %v", err)
		}
	}
	if rootID != "" && rootID != parentID {
		if root, err := s.q.GetPostAuthor(ctx, rootID); err == nil {
			add(root, "REPLY")
		} else {
			log.Printf("[posts] reply notification root: %v", err)
		}
	}

	// @mentions → MENTION (remplace REPLY pour les mentionnés)
	notifyMentionsInContent(ctx, tq, notifDB, content, replyID, replyAuthor)

	for uid, kind := range recipients {
		if err := createReplyNotification(ctx, notifDB, kind, uid, replyAuthor, replyID); err != nil {
			log.Printf("[posts] reply notification %s: %v", kind, err)
		}
	}
	return nil
}

// createReplyNotification insère REPLY/MENTION via notifications.Dispatch.
func createReplyNotification(ctx context.Context, notifDB notifications.DB, kind, recipientID, senderID, thoughtID string) error {
	return notifications.Dispatch(ctx, notifDB, notifications.DispatchInput{
		RecipientID: recipientID,
		SenderID:    senderID,
		Type:        kind,
		ThoughtID:   &thoughtID,
	})
}
