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

-- name: AttachMediaAssetsByUrls :many
-- Marque ATTACHED les assets référencés par les tables métier (couvertures,
-- avatars, bannières, promos…). Ne touche jamais un asset PURGED (objet déjà
-- supprimé du storage) : celui-ci sera ré-uploadé via réactivation CAS.
UPDATE "MediaAsset"
SET status = 'ATTACHED', "attachedToId" = NULLIF($1, ''), "purgeDueAt" = NULL, "deletedAt" = NULL, "updatedAt" = now()
WHERE url = ANY($2::text[]) AND status IN ('DRAFT_ORPHAN', 'SOFT_DELETED')
RETURNING id;

-- name: SoftDeleteDetachedMediaAssets :many
-- Détache les assets ATTACHED qui ne sont plus référencés nulle part
-- (image remplacée ou ligne métier supprimée) : grâce de $2 avant purge.
UPDATE "MediaAsset"
SET status = 'SOFT_DELETED', "purgeDueAt" = $2, "updatedAt" = now()
WHERE status = 'ATTACHED' AND NOT (url = ANY($1::text[]))
RETURNING id, url, "storagePath", bucket;

-- name: ListPurgeableMediaAssets :many
-- Orphelins expirés (jamais attachés) + détachés au-delà de la grâce.
SELECT id, url, "storagePath", bucket, status FROM "MediaAsset"
WHERE status IN ('DRAFT_ORPHAN', 'SOFT_DELETED') AND "purgeDueAt" < now()
ORDER BY "purgeDueAt" ASC
LIMIT $1;

-- name: MarkMediaAssetPurged :exec
-- Purge définitive : l'objet storage a été supprimé (ou était déjà absent).
UPDATE "MediaAsset"
SET status = 'PURGED', "purgeDueAt" = NULL, "deletedAt" = now(), "updatedAt" = now()
WHERE id = $1;

-- name: OwnerMediaUsage :one
-- Volume et nombre d'assets non purgés d'un utilisateur (quota de stockage).
SELECT COALESCE(SUM("sizeBytes"), 0)::bigint AS "totalBytes", COUNT(*)::bigint AS "assetCount"
FROM "MediaAsset" WHERE "ownerId" = $1 AND status <> 'PURGED';

-- name: CountRecentUploads :one
-- Nombre d'uploads d'un utilisateur depuis $2 (throttle anti-flood : borne
-- le coût Sharp + modération + storage, multi-instance safe).
SELECT COUNT(*)::bigint AS "recentCount"
FROM "MediaAsset" WHERE "ownerId" = $1 AND "createdAt" > $2;
