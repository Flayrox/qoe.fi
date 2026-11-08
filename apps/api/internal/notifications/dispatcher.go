// Package notifications — distribution et dispatching centralisé des notifications in-app.
package notifications

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// DB est l'interface minimale requise pour exécuter les requêtes de notification.
// Satisfaite par *pgxpool.Pool, pgx.Tx et les mocks de test.
type DB interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

// DispatchInput rassemble les paramètres d'une notification à distribuer.
type DispatchInput struct {
	RecipientID   string
	SenderID      string
	Type          string // Ex: "FOLLOW", "LIKE", "REPOST", "COMMENT", "REPLY", "MENTION", etc.
	ArticleID     *string
	ThoughtID     *string
	PublicationID *string
	CommentID     *string
	Metadata      map[string]any
}

// Dispatch applique les 4 gardes fondamentales (auto-notification, blocage,
// préférences, déduplication non-lue) avant d'insérer la notification.
// Toute notification bloquée par une garde est ignorée silencieusement (retour nil).
func Dispatch(ctx context.Context, db DB, in DispatchInput) error {
	// Garde 1 : destinataire absent ou auto-notification (sauf émission système sans sender).
	if in.RecipientID == "" {
		return nil
	}
	if in.SenderID != "" && in.RecipientID == in.SenderID {
		return nil
	}

	recipientUUID, err := uuid.Parse(in.RecipientID)
	if err != nil {
		// Destinataire invalide : ignoré silencieusement.
		return nil
	}

	var senderUUID *uuid.UUID
	if in.SenderID != "" {
		sUUID, err := uuid.Parse(in.SenderID)
		if err != nil {
			// Sender ID invalide : ignoré silencieusement.
			return nil
		}
		senderUUID = &sUUID
	}

	// Garde 2 (Blocage) : relation de blocage dans l'un ou l'autre sens.
	if senderUUID != nil {
		var blocked bool
		err := db.QueryRow(ctx, `
			SELECT EXISTS (
				SELECT 1 FROM "BlockedUser"
				WHERE ("creatorId" = $1 AND "readerId" = $2)
				   OR ("creatorId" = $2 AND "readerId" = $1)
			)
		`, recipientUUID, *senderUUID).Scan(&blocked)
		if err != nil {
			return fmt.Errorf("notification dispatcher: vérification blocage: %w", err)
		}
		if blocked {
			return nil
		}
	}

	// Garde 3 (Préférences) : vérifie si le destinataire autorise cette notification.
	allowed, err := allowsNotification(ctx, db, recipientUUID, in.Type)
	if err != nil {
		return fmt.Errorf("notification dispatcher: vérification préférences: %w", err)
	}
	if !allowed {
		return nil
	}

	// Garde 4 (Déduplication) : notification identique non lue déjà en attente.
	var metaKind *string
	if in.Metadata != nil {
		if k, ok := in.Metadata["kind"].(string); ok && k != "" {
			metaKind = &k
		}
	}

	var exists bool
	err = db.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM "Notification"
			WHERE "recipientId" = $1
			  AND "type"::text = $2
			  AND "isRead" = false
			  AND (($3::uuid IS NULL AND "senderId" IS NULL) OR ("senderId" = $3))
			  AND (($4::text IS NULL AND "articleId" IS NULL) OR ("articleId" = $4))
			  AND (($5::text IS NULL AND "thoughtId" IS NULL) OR ("thoughtId" = $5))
			  AND (($6::text IS NULL AND "publicationId" IS NULL) OR ("publicationId" = $6))
			  AND (($7::text IS NULL AND "commentId" IS NULL) OR ("commentId" = $7))
			  AND (($8::text IS NULL AND (metadata IS NULL OR metadata->>'kind' IS NULL)) OR (metadata->>'kind' = $8))
		)
	`, recipientUUID, in.Type, senderUUID, in.ArticleID, in.ThoughtID, in.PublicationID, in.CommentID, metaKind).Scan(&exists)
	if err != nil {
		return fmt.Errorf("notification dispatcher: vérification doublon: %w", err)
	}
	if exists {
		return nil
	}

	// Insertion avec identifiant préfixé "notif_" et métadonnées JSONB.
	notifID := "notif_" + strings.ReplaceAll(uuid.New().String(), "-", "")
	var metaJSON []byte
	if in.Metadata != nil && len(in.Metadata) > 0 {
		metaJSON, err = json.Marshal(in.Metadata)
		if err != nil {
			return fmt.Errorf("notification dispatcher: encodage metadata: %w", err)
		}
	}

	_, err = db.Exec(ctx, `
		INSERT INTO "Notification" (
			"id",
			"recipientId",
			"senderId",
			"type",
			"articleId",
			"thoughtId",
			"publicationId",
			"commentId",
			"metadata",
			"isRead",
			"createdAt"
		) VALUES (
			$1,
			$2,
			$3,
			$4::"NotificationType",
			$5,
			$6,
			$7,
			$8,
			$9,
			false,
			now()
		)
	`, notifID, recipientUUID, senderUUID, in.Type, in.ArticleID, in.ThoughtID, in.PublicationID, in.CommentID, metaJSON)
	if err != nil {
		return fmt.Errorf("notification dispatcher: insertion: %w", err)
	}

	return nil
}

// allowsNotification contrôle les préférences de notification du destinataire.
func allowsNotification(ctx context.Context, db DB, recipientID uuid.UUID, notifType string) (bool, error) {
	var (
		emailLikes, pushLikes                   bool
		emailReplies, pushReplies               bool
		emailMentions, pushMentions             bool
		emailFollows, pushFollows               bool
		emailReposts, pushReposts               bool
		emailComments, pushComments             bool
		emailMedia, pushMedia                   bool
		emailCollaborations, pushCollaborations bool
	)

	err := db.QueryRow(ctx, `
		SELECT "emailLikes", "pushLikes",
		       "emailReplies", "pushReplies",
		       "emailMentions", "pushMentions",
		       "emailFollows", "pushFollows",
		       "emailReposts", "pushReposts",
		       "emailComments", "pushComments",
		       "emailMedia", "pushMedia",
		       "emailCollaborations", "pushCollaborations"
		FROM "NotificationPreference"
		WHERE "userId" = $1
	`, recipientID).Scan(
		&emailLikes, &pushLikes,
		&emailReplies, &pushReplies,
		&emailMentions, &pushMentions,
		&emailFollows, &pushFollows,
		&emailReposts, &pushReposts,
		&emailComments, &pushComments,
		&emailMedia, &pushMedia,
		&emailCollaborations, &pushCollaborations,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		// Pas d'enregistrement : préférences par défaut = activées.
		return true, nil
	}
	if err != nil {
		// Erreur SQL / table indisponible : best-effort pour ne pas bloquer.
		return true, nil
	}

	switch notifType {
	case "LIKE":
		return emailLikes || pushLikes, nil
	case "REPLY":
		return emailReplies || pushReplies, nil
	case "MENTION":
		return emailMentions || pushMentions, nil
	case "FOLLOW":
		return emailFollows || pushFollows, nil
	case "REPOST":
		return emailReposts || pushReposts, nil
	case "COMMENT":
		return emailComments || pushComments, nil
	case "MEDIA_INVITE", "MEDIA_MEMBER_JOINED", "MEDIA_ARTICLE_PUBLISHED",
		"MEDIA_ARTICLE_SUBMITTED", "MEDIA_ARTICLE_APPROVED", "MEDIA_ARTICLE_REJECTED":
		return emailMedia || pushMedia, nil
	case "ARTICLE_CONTRIBUTOR_INVITED", "ARTICLE_CONTRIBUTOR_ACCEPTED",
		"ARTICLE_CONTRIBUTOR_DECLINED", "ARTICLE_CONTRIBUTOR_REMOVED":
		return emailCollaborations || pushCollaborations, nil
	default:
		return true, nil
	}
}
