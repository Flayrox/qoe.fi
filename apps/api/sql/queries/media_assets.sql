-- name: GetMediaAssetBySha256 :one
-- Dédoublonnage CAS : cherche un asset existant par hash SHA-256.
SELECT * FROM "MediaAsset" WHERE "sha256" = $1 LIMIT 1;

-- name: CreateMediaAsset :one
-- Nouvel asset orphelin (DRAFT_ORPHAN, purgé dans 3 jours si non attaché).
INSERT INTO "MediaAsset" (id, sha256, url, "storagePath", bucket, "mimeType", width, height,
                          "sizeBytes", blurhash, "isNsfw", "isSensitive", "safetyScores",
                          "ownerId", "targetType", status, "purgeDueAt", "updatedAt")
VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
        'DRAFT_ORPHAN', now() + interval '3 days', now())
RETURNING *;

-- name: ReactivateMediaAsset :one
-- Réactive un asset purgé/supprimé (nouvelle fenêtre de 3 jours).
UPDATE "MediaAsset"
SET status = 'DRAFT_ORPHAN', "purgeDueAt" = now() + interval '3 days', "deletedAt" = NULL, "updatedAt" = now()
WHERE id = $1
RETURNING *;
