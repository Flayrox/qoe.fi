-- Messagerie directe : messages (tranche 1).
-- Table : Message. Pagination arrière par curseur createdAt (exclusif),
-- plus récupération incrémentale des nouveaux messages pour le polling.

-- name: InsertMessage :one
INSERT INTO "Message" (id, "conversationId", "senderId", content)
VALUES (gen_random_uuid()::text, $1, $2, $3)
RETURNING id, "senderId"::text AS sender_id, content, "createdAt";

-- name: ListMessagesBefore :many
-- Messages STRICTEMENT antérieurs à `before` (curseur exclusif, NULL = depuis
-- le début), les plus récents d'abord (le service inverse pour l'affichage).
SELECT id, "senderId"::text AS sender_id, content, "createdAt"
FROM "Message"
WHERE "conversationId" = $1
  AND ($2::timestamp IS NULL OR "createdAt" < $2)
ORDER BY "createdAt" DESC, id DESC
LIMIT $3;

-- name: ListMessagesAfter :many
-- Nouveaux messages STRICTEMENT postérieurs à `after` (polling), ordre
-- ascendant prêt à être ajouté en fin de liste.
SELECT id, "senderId"::text AS sender_id, content, "createdAt"
FROM "Message"
WHERE "conversationId" = $1 AND "createdAt" > $2
ORDER BY "createdAt" ASC, id ASC
LIMIT $3;