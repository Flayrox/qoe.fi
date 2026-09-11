-- ═══════════════════════════════════════════════════════════════════
-- ⚖️ Legal — documents juridiques versionnés
--   Public  : lecture des versions publiées + consentement du lecteur
--   Admin   : CRUD superadmin (brouillons, publication, archivage, preuves)
-- ═══════════════════════════════════════════════════════════════════

-- ─── Public ─────────────────────────────────────────────────────────

-- name: ListPublishedLegalDocuments :many
-- Sommaire public : uniquement les documents actifs ayant une version
-- publiée dans la locale demandée.
SELECT d.id, d.slug, d.category, d.audience, d.requires_acceptance, d.sort_order,
       v.id AS version_id, v.version, v.title, v.summary, v.changelog,
       v.locale, v.effective_at, v.published_at, v.updated_at
FROM legal_document d
JOIN legal_document_version v
  ON v.document_id = d.id AND v.status = 'PUBLISHED' AND v.locale = sqlc.arg(locale)
WHERE d.is_active = true
ORDER BY d.sort_order ASC, d.slug ASC;

-- name: GetPublishedLegalDocument :one
-- Contenu complet d'un document publié (markdown).
SELECT d.id, d.slug, d.category, d.audience, d.requires_acceptance,
       v.id AS version_id, v.version, v.title, v.summary, v.body, v.changelog,
       v.locale, v.effective_at, v.published_at, v.updated_at
FROM legal_document d
JOIN legal_document_version v
  ON v.document_id = d.id AND v.status = 'PUBLISHED' AND v.locale = sqlc.arg(locale)
WHERE d.slug = sqlc.arg(slug) AND d.is_active = true;

-- name: ListPublishedLegalVersions :many
-- Historique public (transparence) : versions publiées/archivées, jamais les brouillons.
SELECT v.id, v.document_id, v.locale, v.version, v.title, v.summary, v.status,
       v.changelog, v.effective_at, v.published_at, v.archived_at, v.created_at
FROM legal_document_version v
JOIN legal_document d ON d.id = v.document_id
WHERE d.slug = sqlc.arg(slug) AND v.locale = sqlc.arg(locale) AND v.status <> 'DRAFT'
ORDER BY v.published_at DESC NULLS LAST, v.created_at DESC;

-- name: ListPendingLegalAcceptances :many
-- Documents qui exigent une acceptation et que l'utilisateur n'a pas encore
-- acceptés dans leur version publiée courante (déclencheur de re-consentement
-- après une nouvelle version).
SELECT d.id, d.slug, d.category, d.audience, v.id AS version_id, v.version,
       v.title, v.effective_at
FROM legal_document d
JOIN legal_document_version v
  ON v.document_id = d.id AND v.status = 'PUBLISHED' AND v.locale = sqlc.arg(locale)
LEFT JOIN legal_acceptance a
  ON a.version_id = v.id AND a.user_id = sqlc.arg(user_id)::uuid
WHERE d.is_active = true AND d.requires_acceptance = true AND a.id IS NULL
ORDER BY d.sort_order ASC;

-- name: GetLegalAcceptance :one
SELECT * FROM legal_acceptance
WHERE user_id = sqlc.arg(user_id)::uuid AND version_id = sqlc.arg(version_id);

-- name: UpsertLegalAcceptance :one
-- Idempotent : un re-clic ne crée pas de doublon, il rafraîchit la preuve.
INSERT INTO legal_acceptance (user_id, document_id, version_id, version, locale, ip, user_agent, source, method)
VALUES (
  sqlc.arg(user_id)::uuid,
  sqlc.arg(document_id),
  sqlc.arg(version_id),
  sqlc.arg(version),
  sqlc.arg(locale),
  sqlc.narg(ip),
  sqlc.narg(user_agent),
  sqlc.arg(source),
  sqlc.arg(method)
)
-- La preuve est immuable : un re-clic renvoie la première acceptation sans
-- la réécrire (sinon une source par défaut écraserait la preuve d'origine).
ON CONFLICT (user_id, version_id) DO UPDATE
  SET source = legal_acceptance.source,
      method = legal_acceptance.method
RETURNING *;

-- name: ListUserLegalAcceptances :many
SELECT a.id, a.document_id, a.version_id, a.version, a.locale, a.accepted_at,
       a.source, a.method, d.slug, d.category
FROM legal_acceptance a
JOIN legal_document d ON d.id = a.document_id
WHERE a.user_id = sqlc.arg(user_id)::uuid
ORDER BY a.accepted_at DESC;

-- ─── Superadmin ─────────────────────────────────────────────────────

-- name: ListLegalDocumentsAdmin :many
SELECT d.id, d.slug, d.category, d.audience, d.requires_acceptance, d.is_active,
       d.sort_order, d.created_at, d.updated_at,
       (SELECT count(*) FROM legal_document_version v WHERE v.document_id = d.id) AS versions_count,
       (SELECT count(*) FROM legal_document_version v WHERE v.document_id = d.id AND v.status = 'DRAFT') AS drafts_count,
       (SELECT count(*) FROM legal_acceptance a WHERE a.document_id = d.id) AS acceptances_count,
       COALESCE(pub.version, '') AS published_version,
       COALESCE(pub.locale, '') AS published_locale,
       COALESCE((SELECT v2.title FROM legal_document_version v2 WHERE v2.document_id = d.id AND v2.status = 'PUBLISHED' LIMIT 1), '')::text AS published_title
FROM legal_document d
LEFT JOIN LATERAL (
    SELECT v.version, v.locale FROM legal_document_version v
    WHERE v.document_id = d.id AND v.status = 'PUBLISHED'
    LIMIT 1
) pub ON true
ORDER BY d.sort_order ASC, d.slug ASC;

-- name: GetLegalDocumentByID :one
SELECT * FROM legal_document WHERE id = sqlc.arg(id);

-- name: GetLegalDocumentBySlug :one
SELECT * FROM legal_document WHERE slug = sqlc.arg(slug);

-- name: InsertLegalDocument :one
INSERT INTO legal_document (slug, category, audience, requires_acceptance, is_active, sort_order)
VALUES (sqlc.arg(slug), sqlc.arg(category), sqlc.arg(audience), sqlc.arg(requires_acceptance), sqlc.arg(is_active), sqlc.arg(sort_order))
RETURNING *;

-- name: UpdateLegalDocument :one
UPDATE legal_document
SET slug = sqlc.arg(slug),
    category = sqlc.arg(category),
    audience = sqlc.arg(audience),
    requires_acceptance = sqlc.arg(requires_acceptance),
    is_active = sqlc.arg(is_active),
    sort_order = sqlc.arg(sort_order),
    updated_at = CURRENT_TIMESTAMP
WHERE id = sqlc.arg(id)
RETURNING *;

-- name: DeleteLegalDocument :exec
DELETE FROM legal_document WHERE id = sqlc.arg(id);

-- name: ListLegalDocumentVersions :many
SELECT v.id, v.document_id, v.locale, v.version, v.title, v.summary, v.body, v.status,
       v.changelog, v.effective_at, v.published_at, v.archived_at, v.created_by,
       v.created_at, v.updated_at, u.name AS created_by_name
FROM legal_document_version v
LEFT JOIN "User" u ON u.id = v.created_by
WHERE v.document_id = sqlc.arg(document_id)
ORDER BY v.locale ASC, v.created_at DESC;

-- name: GetLegalDocumentVersion :one
SELECT * FROM legal_document_version WHERE id = sqlc.arg(id);

-- name: InsertLegalDocumentVersion :one
INSERT INTO legal_document_version (document_id, locale, version, title, summary, body, status, changelog, effective_at, created_by)
VALUES (
  sqlc.arg(document_id),
  sqlc.arg(locale),
  sqlc.arg(version),
  sqlc.arg(title),
  sqlc.arg(summary),
  sqlc.arg(body),
  'DRAFT',
  sqlc.narg(changelog),
  sqlc.narg(effective_at),
  sqlc.narg(created_by)
)
RETURNING *;

-- name: UpdateLegalDocumentVersion :one
-- Un brouillon est éditable ; une version publiée est immuable (on publie une
-- nouvelle version, l'ancienne reste archivée comme preuve légale).
UPDATE legal_document_version
SET title = sqlc.arg(title),
    summary = sqlc.arg(summary),
    body = sqlc.arg(body),
    changelog = sqlc.narg(changelog),
    effective_at = sqlc.narg(effective_at),
    updated_at = CURRENT_TIMESTAMP
WHERE id = sqlc.arg(id) AND status = 'DRAFT'
RETURNING *;

-- name: ArchivePublishedLegalVersions :exec
UPDATE legal_document_version
SET status = 'ARCHIVED', archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
WHERE document_id = sqlc.arg(document_id) AND locale = sqlc.arg(locale) AND status = 'PUBLISHED';

-- name: PublishLegalDocumentVersion :one
UPDATE legal_document_version
SET status = 'PUBLISHED', published_at = CURRENT_TIMESTAMP, archived_at = NULL, updated_at = CURRENT_TIMESTAMP
WHERE id = sqlc.arg(id) AND status = 'DRAFT'
RETURNING *;

-- name: ArchiveLegalDocumentVersion :one
UPDATE legal_document_version
SET status = 'ARCHIVED', archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
WHERE id = sqlc.arg(id) AND status = 'PUBLISHED'
RETURNING *;

-- name: DeleteLegalDocumentVersion :exec
DELETE FROM legal_document_version WHERE id = sqlc.arg(id) AND status = 'DRAFT';

-- name: CountLegalDocuments :one
SELECT count(*) FROM legal_document;

-- name: ListLegalAcceptancesAdmin :many
SELECT a.id, a.user_id, a.document_id, a.version, a.locale, a.accepted_at, a.ip,
       a.user_agent, a.source, a.method, u.email AS user_email, d.slug AS document_slug
FROM legal_acceptance a
LEFT JOIN "User" u ON u.id = a.user_id
JOIN legal_document d ON d.id = a.document_id
WHERE (sqlc.arg(slug)::text = '' OR d.slug = sqlc.arg(slug)::text)
ORDER BY a.accepted_at DESC
LIMIT sqlc.arg(limit_count);

-- name: LegalAcceptanceStats :many
-- Preuve d'acceptation agrégée par document : combien d'utilisateurs ont
-- accepté la version publiée courante (et combien ne l'ont pas encore fait).
SELECT d.id, d.slug, d.requires_acceptance,
       (SELECT count(*) FROM legal_acceptance a WHERE a.document_id = d.id) AS acceptances,
       (SELECT count(*) FROM legal_acceptance a WHERE a.document_id = d.id AND a.accepted_at > CURRENT_TIMESTAMP - INTERVAL '30 days') AS acceptances_30d,
       (SELECT count(*) FROM legal_document_version v WHERE v.document_id = d.id) AS versions_count
FROM legal_document d
ORDER BY d.sort_order ASC;
