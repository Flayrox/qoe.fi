package notifications

import (
	"context"
	"fmt"

	"github.com/google/uuid"
)

// DispatchMediaArticlePublishedFanout diffuse la notification MEDIA_ARTICLE_PUBLISHED
// aux abonnés d'une publication média (max 500), en appliquant les 4 gardes :
// exclusion de l'auteur, blocage/masquage, préférences média et déduplication non-lue.
func DispatchMediaArticlePublishedFanout(ctx context.Context, db DB, publisherID, articleID, senderID string) error {
	if db == nil || publisherID == "" || articleID == "" || senderID == "" {
		return nil
	}
	senderUUID, err := uuid.Parse(senderID)
	if err != nil {
		return nil
	}

	_, err = db.Exec(ctx, `
		INSERT INTO "Notification" (id, "recipientId", "senderId", type, "articleId", "publisherId")
		SELECT gen_random_uuid()::text,
		       f."readerId",
		       $3::uuid,
		       'MEDIA_ARTICLE_PUBLISHED',
		       $2,
		       f."publisherId"
		FROM "Follows" f
		JOIN "Publisher" pub ON pub.id = f."publisherId"
		LEFT JOIN "NotificationPreference" np ON np."userId" = f."readerId"
		WHERE f."publisherId" = $1
		  AND pub.type = 'MEDIA'
		  AND f."readerId" <> $3::uuid
		  AND NOT is_blocked_bidirectional(f."readerId", $3::uuid)
		  AND NOT is_muted_by(f."readerId", $3::uuid)
		  AND (COALESCE(np."emailMedia", true) OR COALESCE(np."pushMedia", true))
		  AND NOT EXISTS (
		    SELECT 1 FROM "Notification" n
		    WHERE n."recipientId" = f."readerId"
		      AND n."senderId" = $3::uuid
		      AND n.type = 'MEDIA_ARTICLE_PUBLISHED'
		      AND n."articleId" = $2
		      AND n."isRead" = false
		  )
		LIMIT 500
	`, publisherID, articleID, senderUUID)
	if err != nil {
		return fmt.Errorf("notification dispatcher: fanout published: %w", err)
	}
	return nil
}

// DispatchMediaArticleSubmittedFanout diffuse la notification MEDIA_ARTICLE_SUBMITTED
// aux membres réviseurs d'un média (max 500), en appliquant les 4 gardes.
func DispatchMediaArticleSubmittedFanout(ctx context.Context, db DB, publisherID, articleID, senderID string) error {
	if db == nil || publisherID == "" || articleID == "" || senderID == "" {
		return nil
	}
	senderUUID, err := uuid.Parse(senderID)
	if err != nil {
		return nil
	}

	_, err = db.Exec(ctx, `
		INSERT INTO "Notification" (id, "recipientId", "senderId", type, "articleId", "publisherId")
		SELECT gen_random_uuid()::text,
		       m."userId",
		       $3::uuid,
		       'MEDIA_ARTICLE_SUBMITTED',
		       $2,
		       md."publisherId"
		FROM "MediaMember" m
		JOIN "Media" md ON md.id = m."mediaId"
		LEFT JOIN "NotificationPreference" np ON np."userId" = m."userId"
		WHERE md."publisherId" = $1
		  AND m."userId" <> $3::uuid
		  AND (m.status = 'active' OR m.status = 'invited')
		  AND (
		    (m.role IN ('owner', 'editor') AND NOT (COALESCE(m.permissions, ARRAY[]::text[]) && ARRAY['-media:review']::text[]))
		    OR (COALESCE(m.permissions, ARRAY[]::text[]) && ARRAY['media:review']::text[])
		  )
		  AND NOT is_blocked_bidirectional(m."userId", $3::uuid)
		  AND NOT is_muted_by(m."userId", $3::uuid)
		  AND (COALESCE(np."emailMedia", true) OR COALESCE(np."pushMedia", true))
		  AND NOT EXISTS (
		    SELECT 1 FROM "Notification" n
		    WHERE n."recipientId" = m."userId"
		      AND n."senderId" = $3::uuid
		      AND n.type = 'MEDIA_ARTICLE_SUBMITTED'
		      AND n."articleId" = $2
		      AND n."isRead" = false
		  )
		LIMIT 500
	`, publisherID, articleID, senderUUID)
	if err != nil {
		return fmt.Errorf("notification dispatcher: fanout submitted: %w", err)
	}
	return nil
}
