// Package domainevents gère les événements de domaine centralisés de l'application.
package domainevents

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/qoefi/api/internal/notifications"
)

// DB est l'interface minimale requise pour exécuter des requêtes dans le bus d'événements.
// Elle est compatible avec *pgxpool.Pool, pgx.Tx et les mocks de test.
type DB interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

// WithTx exécute fn au sein d'une transaction PostgreSQL managée par le pool.
// Si fn renvoie une erreur ou panique, la transaction est annulée (Rollback).
// Sinon, elle est validée (Commit).
func WithTx(ctx context.Context, pool *pgxpool.Pool, fn func(tx pgx.Tx) error) (err error) {
	if pool == nil {
		return fmt.Errorf("begin transaction: pool is nil")
	}
	tx, err := pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin transaction: %w", err)
	}
	defer func() {
		if p := recover(); p != nil {
			_ = tx.Rollback(ctx)
			panic(p)
		} else if err != nil {
			_ = tx.Rollback(ctx)
		}
	}()

	if err = fn(tx); err != nil {
		return err
	}

	if err = tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit transaction: %w", err)
	}
	return nil
}

// Dispatch distribue un événement de domaine de façon synchrone sur la base de données fournie.
func Dispatch(ctx context.Context, db DB, event any) error {
	switch evt := event.(type) {
	case UserBlockedEvent:
		return handleUserBlocked(ctx, db, evt)
	case UserUnblockedEvent:
		return handleUserUnblocked(ctx, db, evt)
	case ProfileVisibilityChangedEvent:
		return handleProfileVisibilityChanged(ctx, db, evt)
	default:
		return fmt.Errorf("événement non supporté: %T", event)
	}
}

// toUUID convertit une chaîne représentant un identifiant en pgtype.UUID.
func toUUID(id string) pgtype.UUID {
	var u pgtype.UUID
	_ = u.Scan(id)
	return u
}

// handleUserBlocked nettoie l'ensemble des liens sociaux dans les deux sens lorsqu'un
// utilisateur en bloque un autre :
// - Supprime de "Follows" dans les 2 sens
// - Supprime de "FollowRequest" dans les 2 sens
// - Supprime de "Notification" (demandes de follow dans les 2 sens)
// - Supprime de "CollaborationRequest" (PENDING dans les 2 sens)
// - Supprime de "Notification" (invitations de contribution dans les 2 sens)
func handleUserBlocked(ctx context.Context, db DB, event UserBlockedEvent) error {
	if event.BlockerID == "" || event.BlockedID == "" || event.BlockerID == event.BlockedID {
		return nil
	}

	blockerUUID := toUUID(event.BlockerID)
	blockedUUID := toUUID(event.BlockedID)

	// 1. Supprime de "Follows" dans les 2 sens
	_, err := db.Exec(ctx, `
		DELETE FROM "Follows"
		WHERE ("readerId" = $1 AND "publicationId" = (SELECT "publicationId" FROM "User" WHERE id = $2))
		   OR ("readerId" = $2 AND "publicationId" = (SELECT "publicationId" FROM "User" WHERE id = $1))`,
		blockerUUID, blockedUUID)
	if err != nil {
		return fmt.Errorf("suppression follows: %w", err)
	}

	// 2. Supprime de "FollowRequest" dans les 2 sens
	_, err = db.Exec(ctx, `
		DELETE FROM "FollowRequest"
		WHERE ("requesterId" = $1 AND "publicationId" = (SELECT "publicationId" FROM "User" WHERE id = $2))
		   OR ("requesterId" = $2 AND "publicationId" = (SELECT "publicationId" FROM "User" WHERE id = $1))`,
		blockerUUID, blockedUUID)
	if err != nil {
		return fmt.Errorf("suppression follow requests: %w", err)
	}

	// 3. Supprime de "Notification" (FOLLOW_REQUEST dans les 2 sens)
	_, err = db.Exec(ctx, `
		DELETE FROM "Notification"
		WHERE type = 'FOLLOW' AND metadata->>'kind' = 'FOLLOW_REQUEST'
		  AND (("recipientId" = $1 AND "senderId" = $2) OR ("recipientId" = $2 AND "senderId" = $1))`,
		blockerUUID, blockedUUID)
	if err != nil {
		return fmt.Errorf("suppression notifications follow request: %w", err)
	}

	// 4. Supprime de "CollaborationRequest" (PENDING dans les 2 sens)
	_, err = db.Exec(ctx, `
		DELETE FROM "CollaborationRequest"
		WHERE status = 'PENDING'
		  AND (
		    ("inviterId" = $1 AND "inviteeId" = $2)
		    OR ("inviterId" = $2 AND "inviteeId" = $1)
		    OR ("inviteeId" = $1 AND "articleId" IN (SELECT id FROM "Article" WHERE "authorId" = $2))
		    OR ("inviteeId" = $2 AND "articleId" IN (SELECT id FROM "Article" WHERE "authorId" = $1))
		  )`,
		blockerUUID, blockedUUID)
	if err != nil {
		return fmt.Errorf("suppression collaboration requests: %w", err)
	}

	// 5. Supprime de "Notification" les invitations de contribution dans les 2 sens
	_, err = db.Exec(ctx, `
		DELETE FROM "Notification"
		WHERE type = 'ARTICLE_CONTRIBUTOR_INVITED'
		  AND (("recipientId" = $1 AND "senderId" = $2) OR ("recipientId" = $2 AND "senderId" = $1))`,
		blockerUUID, blockedUUID)
	if err != nil {
		return fmt.Errorf("suppression notifications article contributor invited: %w", err)
	}

	return nil
}

// handleUserUnblocked gère le déblocage d'un utilisateur.
func handleUserUnblocked(ctx context.Context, db DB, event UserUnblockedEvent) error {
	return nil
}

// handleProfileVisibilityChanged gère la transition de visibilité d'un profil.
// Si NewVisibility == "PUBLIC" et (OldVisibility == "PRIVATE" ou OldVisibility == "FOLLOWERS") :
// - Insère dans "Follows" depuis "FollowRequest" PENDING
// - Clôture les "FollowRequest" en ACCEPTED (decidedAt = now())
// - Nettoie les notifications de demande reçues du propriétaire
// - Envoie la notification FOLLOW_ACCEPTED à chaque demandeur via notifications.Dispatch
func handleProfileVisibilityChanged(ctx context.Context, db DB, event ProfileVisibilityChangedEvent) error {
	if event.NewVisibility != "PUBLIC" || (event.OldVisibility != "PRIVATE" && event.OldVisibility != "FOLLOWERS") {
		return nil
	}
	if event.UserID == "" {
		return nil
	}

	userUUID := toUUID(event.UserID)

	// Résolution de la publication si non fournie dans l'événement
	pubID := event.PublicationID
	if pubID == "" {
		var pID pgtype.Text
		_ = db.QueryRow(ctx, `SELECT "publicationId" FROM "User" WHERE id = $1`, userUUID).Scan(&pID)
		if pID.Valid {
			pubID = pID.String
		}
	}

	// Récupération des demandes d'abonnement en attente
	var rows pgx.Rows
	var err error
	if pubID != "" {
		rows, err = db.Query(ctx, `
			SELECT fr."requesterId"::text, fr."publicationId"
			FROM "FollowRequest" fr
			WHERE fr."publicationId" = $1
			  AND fr.status = 'PENDING'
		`, pubID)
	} else {
		rows, err = db.Query(ctx, `
			SELECT fr."requesterId"::text, fr."publicationId"
			FROM "FollowRequest" fr
			WHERE fr."publicationId" = (SELECT "publicationId" FROM "User" WHERE id = $1)
			  AND fr.status = 'PENDING'
		`, userUUID)
	}
	if err != nil {
		return fmt.Errorf("requête follow requests en attente: %w", err)
	}

	type pendingReq struct {
		requesterID   string
		publicationID string
	}
	var pending []pendingReq
	for rows.Next() {
		var pr pendingReq
		if err := rows.Scan(&pr.requesterID, &pr.publicationID); err == nil {
			pending = append(pending, pr)
		}
	}
	rows.Close()

	if len(pending) == 0 {
		return nil
	}

	// a. Insérer dans "Follows"
	if pubID != "" {
		_, err = db.Exec(ctx, `
			INSERT INTO "Follows" (id, "readerId", "publicationId")
			SELECT gen_random_uuid()::text, fr."requesterId", fr."publicationId"
			FROM "FollowRequest" fr
			WHERE fr."publicationId" = $1
			  AND fr.status = 'PENDING'
			ON CONFLICT DO NOTHING
		`, pubID)
	} else {
		_, err = db.Exec(ctx, `
			INSERT INTO "Follows" (id, "readerId", "publicationId")
			SELECT gen_random_uuid()::text, fr."requesterId", fr."publicationId"
			FROM "FollowRequest" fr
			WHERE fr."publicationId" = (SELECT "publicationId" FROM "User" WHERE id = $1)
			  AND fr.status = 'PENDING'
			ON CONFLICT DO NOTHING
		`, userUUID)
	}
	if err != nil {
		return fmt.Errorf("insertion follows: %w", err)
	}

	// b. Clôturer "FollowRequest" en ACCEPTED
	if pubID != "" {
		_, err = db.Exec(ctx, `
			UPDATE "FollowRequest"
			SET status = 'ACCEPTED', "decidedAt" = now()
			WHERE "publicationId" = $1
			  AND status = 'PENDING'
		`, pubID)
	} else {
		_, err = db.Exec(ctx, `
			UPDATE "FollowRequest"
			SET status = 'ACCEPTED', "decidedAt" = now()
			WHERE "publicationId" = (SELECT "publicationId" FROM "User" WHERE id = $1)
			  AND status = 'PENDING'
		`, userUUID)
	}
	if err != nil {
		return fmt.Errorf("clôture follow requests: %w", err)
	}

	// c. Nettoyer les notifications de demande reçues du propriétaire
	_, err = db.Exec(ctx, `
		DELETE FROM "Notification"
		WHERE "recipientId" = $1
		  AND type = 'FOLLOW'
		  AND metadata->>'kind' = 'FOLLOW_REQUEST'
	`, userUUID)
	if err != nil {
		return fmt.Errorf("nettoyage notifications follow request: %w", err)
	}

	// d. Envoi de la notification FOLLOW_ACCEPTED à chaque demandeur via notifications.Dispatch
	for _, pr := range pending {
		reqPubID := pr.publicationID
		_ = notifications.Dispatch(ctx, db, notifications.DispatchInput{
			RecipientID:   pr.requesterID,
			SenderID:      event.UserID,
			Type:          "FOLLOW",
			PublicationID: &reqPubID,
			Metadata:      map[string]any{"kind": "FOLLOW_ACCEPTED"},
		})
	}

	return nil
}
