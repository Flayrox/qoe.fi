-- Messagerie directe : messages (tranche 1).
-- Table : Message. Pagination arrière par curseur createdAt (exclusif),
-- plus récupération incrémentale des nouveaux messages pour le polling.

-- name: InsertMessage :one
INSERT INTO "Message" (id, "conversationId", "senderId", content)
VALUES (gen_random_uuid()::text, $1, $2, $3)
RETURNING id, "senderId"::text AS sender_id, content, "createdAt", seq;

-- name: ListMessagesBefore :many
-- Messages STRICTEMENT antérieurs au curseur `beforeSeq` (ordre total par
-- `seq`, exclusif ; MaxInt64 = depuis le début), les plus récents d'abord (le
-- service inverse pour l'affichage). Le timestamp n'est plus le curseur :
-- deux messages de la même milliseconde sont ordonnés par seq.
SELECT id, "senderId"::text AS sender_id, content, "createdAt", seq
FROM "Message"
WHERE "conversationId" = sqlc.arg(conversationId)
  AND "seq" < sqlc.arg(beforeSeq)::bigint
ORDER BY "seq" DESC
LIMIT sqlc.arg(lim);

-- name: ListMessagesAfter :many
-- Nouveaux messages STRICTEMENT postérieurs au curseur `afterSeq` (polling),
-- ordre ascendant prêt à être ajouté en fin de liste.
SELECT id, "senderId"::text AS sender_id, content, "createdAt", seq
FROM "Message"
WHERE "conversationId" = sqlc.arg(conversationId) AND "seq" > sqlc.arg(afterSeq)::bigint
ORDER BY "seq" ASC
LIMIT sqlc.arg(lim);
-- name: CursorSeqBeforeTimestamp :one
-- Traduit un curseur hérité (timestamp) en curseur total : premier seq dont le
-- message est au moins aussi récent que `before`. Les pages suivantes
-- n'incluent alors que des messages strictement plus anciens, sans doublon.
SELECT COALESCE(MIN("seq"), 0)::bigint AS seq
FROM "Message"
WHERE "conversationId" = sqlc.arg(conversationId) AND "createdAt" >= sqlc.arg(before);
