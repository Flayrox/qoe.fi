-- ═══════════════════════════════════════════════════════════════════
-- ⚖️ Legal — cycle de vie (revues, publication planifiée, rappels)
--            et registre des exports signés du consentement
-- ═══════════════════════════════════════════════════════════════════

-- ─── Exports signés du registre du consentement ──────────────────────

-- name: ListLegalVersionsForExport :many
-- Le texte accepté fait partie de la preuve : on exporte la version complète
-- (corps inclus) et son empreinte SHA-256, pour qu'un vérificateur puisse
-- contrôler l'intégrité sans dépendre de notre base.
SELECT v.id, v.document_id, d.slug AS document_slug, d.category AS document_category,
       d.audience, d.requires_acceptance,
       v.locale, v.version, v.title, v.summary, v.body, v.status, v.changelog,
       v.effective_at, v.published_at, v.archived_at, v.scheduled_at, v.created_at,
       encode(sha256(convert_to(COALESCE(v.body, ''), 'UTF8')), 'hex')::text AS body_sha256,
       length(COALESCE(v.body, '')) AS body_length
FROM legal_document_version v
JOIN legal_document d ON d.id = v.document_id
WHERE (sqlc.narg(slug)::text IS NULL OR d.slug = sqlc.narg(slug)::text)
ORDER BY d.slug ASC, v.locale ASC, v.created_at ASC;

-- name: ListLegalAcceptancesForExport :many
-- Preuves de consentement. L'IP et l'agent utilisateur sont inclus : c'est
-- précisément ce qu'une autorité de contrôle demande pour établir qu'une
-- acceptation vient d'un vrai parcours, et l'export est nominatif par nature.
SELECT a.id, a.user_id, a.document_id, d.slug AS document_slug, a.version_id, a.version,
       a.locale, a.accepted_at, a.source, a.method, a.ip, a.user_agent,
       COALESCE(u.email, '')::text AS user_email
FROM legal_acceptance a
JOIN legal_document d ON d.id = a.document_id
LEFT JOIN "User" u ON u.id = a.user_id
WHERE (sqlc.narg(slug)::text IS NULL OR d.slug = sqlc.narg(slug)::text)
  AND (sqlc.narg(user_id)::uuid IS NULL OR a.user_id = sqlc.narg(user_id)::uuid)
  AND (sqlc.narg(from_at)::timestamp IS NULL OR a.accepted_at >= sqlc.narg(from_at)::timestamp)
  AND (sqlc.narg(to_at)::timestamp IS NULL OR a.accepted_at <= sqlc.narg(to_at)::timestamp)
ORDER BY a.accepted_at ASC
LIMIT sqlc.arg(limit_count);

-- name: ListCookieConsentForExport :many
-- Journal des choix de traceurs. Le consent_id est un identifiant aléatoire de
-- navigateur, pas une personne : il permet de reconstituer une suite de choix.
SELECT c.id, c.seq, c.consent_id, c.user_id, c.session_id, c.locale, c.policy_version,
       c.categories, c.source, c.country, c.ip, c.user_agent, c.created_at
FROM cookie_consent_record c
WHERE (sqlc.narg(consent_id)::text IS NULL OR c.consent_id = sqlc.narg(consent_id)::text)
  AND (sqlc.narg(from_at)::timestamp IS NULL OR c.created_at >= sqlc.narg(from_at)::timestamp)
  AND (sqlc.narg(to_at)::timestamp IS NULL OR c.created_at <= sqlc.narg(to_at)::timestamp)
ORDER BY c.seq ASC
LIMIT sqlc.arg(limit_count);

-- name: InsertLegalConsentExport :one
INSERT INTO legal_consent_export (
    scope, subject, reason, filters, requested_by, requested_by_email,
    documents_count, acceptances_count, cookie_records_count,
    content_sha256, previous_chain, chain_sha256, signature, key_id, algorithm
) VALUES (
    sqlc.arg(scope),
    sqlc.narg(subject),
    sqlc.narg(reason),
    sqlc.arg(filters),
    sqlc.narg(requested_by)::uuid,
    sqlc.narg(requested_by_email),
    sqlc.arg(documents_count),
    sqlc.arg(acceptances_count),
    sqlc.arg(cookie_records_count),
    sqlc.arg(content_sha256),
    sqlc.narg(previous_chain),
    sqlc.arg(chain_sha256),
    sqlc.arg(signature),
    sqlc.arg(key_id),
    sqlc.arg(algorithm)
)
RETURNING *;

-- name: SetLegalConsentExportSignature :one
-- L'identifiant et le numéro de séquence ne sont connus qu'après insertion :
-- on écrit donc d'abord la ligne (dans la transaction), puis on y scelle
-- l'empreinte du contenu, le maillon précédent et la signature. Tant que la
-- transaction n'est pas validée, personne ne voit d'export non signé.
UPDATE legal_consent_export
SET content_sha256 = sqlc.arg(content_sha256),
    previous_chain = sqlc.narg(previous_chain),
    chain_sha256   = sqlc.arg(chain_sha256),
    signature      = sqlc.arg(signature),
    key_id         = sqlc.arg(key_id),
    algorithm      = sqlc.arg(algorithm)
WHERE id = sqlc.arg(id)
RETURNING *;

-- name: GetLatestLegalConsentExport :one
SELECT * FROM legal_consent_export ORDER BY seq DESC LIMIT 1;

-- name: ListLegalConsentExports :many
SELECT * FROM legal_consent_export ORDER BY seq DESC LIMIT sqlc.arg(limit_count);

-- name: ListLegalConsentExportsForVerify :many
-- Chaîne complète, du plus ancien au plus récent : c'est l'ordre dans lequel
-- les signatures doivent être recomputées pour vérifier qu'aucun maillon n'a
-- été retiré ni réécrit.
SELECT * FROM legal_consent_export ORDER BY seq ASC;

-- ─── Revues périodiques ──────────────────────────────────────────────

-- name: UpsertLegalReview :one
-- Ouvre (ou retrouve) la revue d'une échéance. `DO UPDATE` sans effet permet
-- de récupérer la ligne existante : une même échéance n'ouvre qu'une revue,
-- quel que soit le nombre de passages du worker.
INSERT INTO legal_review (document_id, rule_key, due_at, status, notes)
VALUES (
    sqlc.arg(document_id),
    sqlc.arg(rule_key),
    sqlc.arg(due_at),
    'OPEN',
    sqlc.narg(notes)
)
ON CONFLICT (document_id, rule_key, due_at) DO UPDATE
    SET updated_at = legal_review.updated_at
RETURNING *;

-- name: GetLegalDocumentBySlugAdmin :one
SELECT * FROM legal_document WHERE slug = sqlc.arg(slug);

-- name: GetReferencePublishedVersion :one
-- Version publiée de référence d'un document (FR en priorité : c'est le texte
-- qui fait foi). Sert de base au brouillon de revue.
SELECT v.* FROM legal_document_version v
WHERE v.document_id = sqlc.arg(document_id) AND v.status = 'PUBLISHED'
ORDER BY (v.locale = 'fr') DESC, v.published_at DESC NULLS LAST
LIMIT 1;

-- name: ListOpenLegalReviews :many
SELECT r.id, r.document_id, r.rule_key, r.due_at, r.status, r.draft_version_id,
       r.opened_at, r.completed_at,
       d.slug AS document_slug, d.audience, d.category, d.requires_acceptance,
       COALESCE(v.version, '')::text AS draft_version,
       v.scheduled_at AS draft_scheduled_at
FROM legal_review r
JOIN legal_document d ON d.id = r.document_id
LEFT JOIN legal_document_version v ON v.id = r.draft_version_id
WHERE r.status IN ('OPEN', 'DRAFTED')
ORDER BY r.due_at ASC;

-- name: SetLegalReviewDraft :one
UPDATE legal_review
SET draft_version_id = sqlc.arg(draft_version_id),
    status = 'DRAFTED',
    updated_at = now()
WHERE id = sqlc.arg(id) AND draft_version_id IS NULL
RETURNING *;

-- name: CompleteLegalReviewsForVersion :exec
-- Publier le brouillon d'une revue clôt la revue : la boucle est bouclée sans
-- qu'un humain ait à cocher quoi que ce soit en plus.
UPDATE legal_review
SET status = 'PUBLISHED', completed_at = now(), updated_at = now()
WHERE draft_version_id = sqlc.arg(version_id) AND status = 'DRAFTED';

-- name: DismissLegalReview :one
UPDATE legal_review
SET status = 'DISMISSED', completed_at = now(), notes = COALESCE(sqlc.narg(notes), notes), updated_at = now()
WHERE id = sqlc.arg(id) AND status IN ('OPEN', 'DRAFTED')
RETURNING *;

-- name: ListLegalReviewsAdmin :many
SELECT r.id, r.document_id, d.slug AS document_slug, d.audience, r.rule_key, r.due_at,
       r.status, r.notes, r.opened_at, r.completed_at,
       COALESCE(v.version, '')::text AS draft_version,
       v.scheduled_at AS draft_scheduled_at,
       (SELECT count(*) FROM legal_review_reminder rr WHERE rr.review_id = r.id) AS reminders,
       (SELECT count(*) FROM legal_review_reminder rr WHERE rr.review_id = r.id AND rr.status = 'SENT') AS reminders_sent
FROM legal_review r
JOIN legal_document d ON d.id = r.document_id
LEFT JOIN legal_document_version v ON v.id = r.draft_version_id
ORDER BY r.due_at ASC
LIMIT sqlc.arg(limit_count);

-- ─── Publication planifiée ───────────────────────────────────────────

-- name: ScheduleLegalDocumentVersion :one
-- Programme (ou déprogramme, si la date est nulle) la publication automatique
-- d'un brouillon. Refusé sur une version déjà publiée.
UPDATE legal_document_version
SET scheduled_at = sqlc.narg(scheduled_at),
    updated_at = now()
WHERE id = sqlc.arg(id) AND status = 'DRAFT'
RETURNING *;

-- name: LockDueScheduledLegalVersion :one
-- Réclame UN brouillon arrivé à échéance, verrouillé jusqu'à la fin de la
-- transaction : la publication et le déverrouillage sont donc atomiques, et
-- deux workers ne peuvent pas publier la même version.
SELECT v.id, v.document_id, v.locale, v.version, v.title, v.changelog, v.scheduled_at
FROM legal_document_version v
WHERE v.status = 'DRAFT' AND v.scheduled_at IS NOT NULL AND v.scheduled_at <= now()
ORDER BY v.scheduled_at ASC
FOR UPDATE SKIP LOCKED
LIMIT 1;

-- name: CountDueScheduledLegalVersions :one
SELECT count(*) FROM legal_document_version
WHERE status = 'DRAFT' AND scheduled_at IS NOT NULL AND scheduled_at <= now();

-- ─── Rappels aux superadmins ─────────────────────────────────────────

-- name: GetLegalActorEmail :one
-- L'email de l'auteur d'un export : le registre doit dire QUI a produit la
-- pièce, pas seulement quel compte technique.
SELECT COALESCE(email, '')::text FROM "User" WHERE id = sqlc.arg(id)::uuid;

-- name: ListLegalSuperadmins :many
SELECT id, COALESCE(email, '')::text AS email, COALESCE(name, username, '')::text AS name
FROM "User"
WHERE role = 'superadmin' AND "isSuspended" = false AND email IS NOT NULL AND email <> ''
ORDER BY email ASC;

-- name: InsertLegalReviewReminder :execrows
-- Le nombre de lignes réellement insérées compte : un rappel déjà émis n'est
-- pas un rappel émis, et le rapport du cycle doit le dire honnêtement.
INSERT INTO legal_review_reminder (review_id, user_id, email, stage)
VALUES (sqlc.arg(review_id), sqlc.arg(user_id)::uuid, sqlc.arg(email), sqlc.arg(stage))
ON CONFLICT (review_id, user_id, stage) DO NOTHING;

-- name: ClaimLegalReviewReminders :many
WITH candidates AS (
  SELECT id FROM legal_review_reminder
  WHERE status = 'QUEUED' AND available_at <= now()
  ORDER BY created_at ASC
  FOR UPDATE SKIP LOCKED
  LIMIT sqlc.arg(batch_size)
)
UPDATE legal_review_reminder r
SET status = 'PROCESSING', attempts = r.attempts + 1, updated_at = now()
FROM candidates c
WHERE r.id = c.id
RETURNING r.id, r.review_id, r.user_id, r.email, r.stage, r.attempts;

-- name: MarkLegalReviewReminder :exec
UPDATE legal_review_reminder
SET status = sqlc.arg(status),
    provider = sqlc.narg(provider),
    last_error = sqlc.narg(last_error),
    sent_at = sqlc.narg(sent_at),
    available_at = COALESCE(sqlc.narg(available_at), available_at),
    updated_at = now()
WHERE id = sqlc.arg(id);

-- name: GetLegalReviewReminderContext :one
SELECT rr.id, rr.stage, rr.email, rr.attempts,
       r.id AS review_id, r.due_at, r.status AS review_status, r.notes,
       d.slug AS document_slug, d.category, d.audience,
       -- Titre lisible pour l'email : le libellé publié, à défaut le slug.
       COALESCE((SELECT v2.title FROM legal_document_version v2
                  WHERE v2.document_id = d.id AND v2.status = 'PUBLISHED'
                  ORDER BY (v2.locale = 'fr') DESC, v2.published_at DESC NULLS LAST
                  LIMIT 1), d.slug)::text AS document_title,
       COALESCE(v.version, '')::text AS draft_version,
       v.scheduled_at AS draft_scheduled_at,
       COALESCE(u.name, u.username, '')::text AS recipient_name
FROM legal_review_reminder rr
JOIN legal_review r ON r.id = rr.review_id
JOIN legal_document d ON d.id = r.document_id
LEFT JOIN legal_document_version v ON v.id = r.draft_version_id
LEFT JOIN "User" u ON u.id = rr.user_id
WHERE rr.id = sqlc.arg(id);
