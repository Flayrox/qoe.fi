-- =====================================================================
-- 00076_backfill_follow_request_notification_metadata.sql
-- =====================================================================
-- Les notifications de demande d'abonnement créées avant l'ajout de
-- metadata.requestId ne peuvent pas être acceptées/refusées depuis le centre
-- de notifications. On rattache les demandes encore PENDING à leur
-- notification existante, sans toucher aux autres notifications.
-- =====================================================================

-- +goose Up
UPDATE "Notification" n
SET metadata = jsonb_set(n.metadata, '{requestId}', to_jsonb(fr.id))
FROM "FollowRequest" fr
WHERE n.type = 'FOLLOW'
  AND n.metadata->>'kind' = 'FOLLOW_REQUEST'
  AND (n.metadata->>'requestId') IS NULL
  AND fr."requesterId" = n."senderId"
  AND fr."publicationId" = n."publicationId"
  AND fr.status = 'PENDING';

-- +goose Down
-- Le code précédent ignore metadata.requestId : on retire la clé ajoutée par
-- ce backfill (les nouvelles notifications la recréeront au prochain follow).
UPDATE "Notification"
SET metadata = metadata - 'requestId'
WHERE type = 'FOLLOW'
  AND metadata->>'kind' = 'FOLLOW_REQUEST'
  AND metadata ? 'requestId';
