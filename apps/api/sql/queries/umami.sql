-- Provisionnement automatique des websites Umami par publication.
-- Chaque publication (blog créateur) a son propre website Umami pour que
-- le créateur voie SES stats (visites, sources, pages, temps passé) sans
-- aucun lien manuel — le worker `provisioner` crée le website et stocke
-- l'id dans Publication."umamiWebsiteId".

-- name: ListPublicationsWithoutUmami :many
SELECT p.id,
       p.slug,
       p.name,
       COALESCE(p.subdomain, p.slug) AS tenant_domain
FROM "Publication" p
WHERE (p."umamiWebsiteId" IS NULL OR p."umamiWebsiteId" = '')
ORDER BY p."createdAt" ASC
LIMIT $1;

-- name: SetPublicationUmamiWebsite :exec
UPDATE "Publication"
SET "umamiWebsiteId" = $2,
    "updatedAt"      = now()
WHERE id = $1;
