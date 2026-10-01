-- =====================================================================
-- 📬 Newsletters créateurs (NewsletterIssue / NewsletterDelivery).
-- =====================================================================

-- name: CreateNewsletterIssue :one
INSERT INTO "NewsletterIssue" (id, "publicationId", subject, "previewText", html, "updatedAt")
VALUES (gen_random_uuid()::text, $1, $2, $3, $4, now())
RETURNING *;

-- name: ListNewsletterIssuesByPublication :many
SELECT *
FROM "NewsletterIssue"
WHERE "publicationId" = $1
ORDER BY "createdAt" DESC;

-- name: GetNewsletterIssue :one
SELECT *
FROM "NewsletterIssue"
WHERE id = $1;

-- name: GetNewsletterIssueWithPublication :one
SELECT i.*, p.name AS publication_name, p.subdomain AS publication_subdomain,
       p."customDomain" AS publication_custom_domain, p."logoUrl" AS publication_logo_url
FROM "NewsletterIssue" i
JOIN "Publication" p ON p.id = i."publicationId"
WHERE i.id = $1;

-- name: UpdateNewsletterIssueDraft :one
UPDATE "NewsletterIssue"
SET subject       = $2,
    "previewText" = $3,
    html          = $4,
    "updatedAt"   = now()
WHERE id = $1
  AND status = 'DRAFT'
RETURNING *;

-- name: DeleteNewsletterIssueDraft :exec
DELETE FROM "NewsletterIssue"
WHERE id = $1
  AND status = 'DRAFT';

-- name: SetNewsletterIssueSending :one
UPDATE "NewsletterIssue"
SET status     = 'SENDING',
    "updatedAt" = now()
WHERE id = $1
  AND status = 'DRAFT'
RETURNING id;

-- name: FinishNewsletterIssue :one
UPDATE "NewsletterIssue"
SET status           = $2,
    "sentCount"      = $3,
    "failedCount"    = $4,
    "totalRecipients" = $5,
    "sentAt"         = COALESCE("sentAt", now()),
    "updatedAt"      = now()
WHERE id = $1
RETURNING id;

-- name: InsertNewsletterDeliveries :exec
INSERT INTO "NewsletterDelivery" (id, "issueId", email, "subscriberId", "updatedAt")
SELECT gen_random_uuid()::text, $1, s.email, s.id, now()
FROM "Subscriber" s
WHERE s."publicationId" = $2
  AND s."isActive" = true
  AND s."receiveArticles" = true
  AND s."confirmedAt" IS NOT NULL  -- double opt-in : jamais de bulk vers un email non confirmé
  -- Opposition durable (fiche 04 §3.5) : une adresse en suppression globale
  -- ou pour cette publication n'est jamais matérialisée, même si sa ligne
  -- Subscriber est restée active (course entre désinscription et envoi).
  AND NOT EXISTS (
      SELECT 1 FROM "EmailSuppression" x
      WHERE x.email = s.email
        AND (x."scope" = 'global'
             OR (x."scope" = 'publication' AND x."publicationId" = s."publicationId"))
  )
ON CONFLICT ("issueId", email) DO NOTHING;

-- name: ListNewsletterDeliveriesByIssue :many
SELECT id, email, status, error
FROM "NewsletterDelivery"
WHERE "issueId" = $1
  AND status = 'QUEUED'
ORDER BY "createdAt" ASC
LIMIT $2;

-- name: MarkNewsletterDelivery :exec
UPDATE "NewsletterDelivery"
SET status     = $3,
    error      = $4,
    "sentAt"   = CASE WHEN $3 = 'SENT' THEN now() ELSE NULL END,
    "updatedAt" = now()
WHERE "issueId" = $1
  AND email = $2;

-- name: InsertArticleReleaseDeliveries :exec
INSERT INTO "ArticleReleaseDelivery" (id, "articleId", email, "subscriberId", "updatedAt")
SELECT gen_random_uuid()::text, $1, s.email, s.id, now()
FROM "Subscriber" s
WHERE s."publicationId" = $2
  AND s."isActive" = true
  AND s."receiveArticles" = true
  AND s."confirmedAt" IS NOT NULL  -- double opt-in : jamais de bulk vers un email non confirmé
ON CONFLICT ("articleId", email) DO NOTHING;

-- name: ListQueuedArticleReleaseDeliveries :many
SELECT id, email, status, error
FROM "ArticleReleaseDelivery"
WHERE "articleId" = $1
  AND status = 'QUEUED'
ORDER BY "createdAt" ASC
LIMIT $2;

-- name: MarkArticleReleaseDelivery :exec
UPDATE "ArticleReleaseDelivery"
SET status     = $3,
    error      = $4,
    "sentAt"   = CASE WHEN $3 = 'SENT' THEN now() ELSE NULL END,
    "updatedAt" = now()
WHERE "articleId" = $1
  AND email = $2;

-- name: ResetNewsletterIssueToDraft :exec
UPDATE "NewsletterIssue"
SET status     = 'DRAFT',
    "updatedAt" = now()
WHERE id = $1
  AND status = 'SENDING';

-- name: GetArticleReleaseInfo :one
SELECT a.id, a.title, a.slug, a.visibility, a."isPremium", a.content,
       a."publicationId",
       p.name AS publication_name, p.subdomain, p."customDomain"
FROM "Article" a
JOIN "Publication" p ON p.id = a."publicationId"
WHERE a.id = $1
  AND a.published = true
  AND a.status = 'PUBLISHED';

-- name: CountArticleReleaseDeliveries :one
SELECT COUNT(*)::bigint AS total,
       COUNT(*) FILTER (WHERE status = 'SENT')::bigint   AS sent,
       COUNT(*) FILTER (WHERE status = 'FAILED')::bigint AS failed
FROM "ArticleReleaseDelivery"
WHERE "articleId" = $1;

-- name: CountNewsletterDeliveriesByIssue :one
SELECT COUNT(*)::bigint AS total,
       COUNT(*) FILTER (WHERE status = 'SENT')::bigint   AS sent,
       COUNT(*) FILTER (WHERE status = 'FAILED')::bigint AS failed
FROM "NewsletterDelivery"
WHERE "issueId" = $1;

-- name: UnsubscribeNewsletterSubscriber :exec
UPDATE "Subscriber"
SET "receiveArticles" = false,
    "updatedAt"       = now()
WHERE "publicationId" = $1
  AND email = $2;

-- name: GetUserPublicationID :one
SELECT COALESCE("publicationId", '')
FROM "User"
WHERE id = $1;

-- name: UserOwnsPublication :one
SELECT (
    EXISTS (SELECT 1 FROM "User" WHERE "User".id = $1 AND "User"."publicationId" = $2)
    OR EXISTS (SELECT 1 FROM "MediaMember" mm JOIN "Media" md ON md.id = mm."mediaId"
               WHERE mm."userId" = $1 AND md."publicationId" = $2
                 AND mm.role = 'owner' AND mm.status = 'active')
)::boolean AS owns;

-- =====================================================================
-- 👥 Gestion des abonnés (Subscribers API & Headless integrations)
-- =====================================================================

-- name: UpsertSubscriber :one
INSERT INTO "Subscriber" (
    id, email, "publicationId", status, "isActive", "receiveArticles", "createdAt", "updatedAt"
)
VALUES (
    gen_random_uuid()::text,
    LOWER(TRIM(sqlc.arg(email)::text)),
    sqlc.arg(publication_id)::text,
    'ACTIVE',
    true,
    true,
    now(),
    now()
)
ON CONFLICT ("email", "publicationId") DO UPDATE
-- Double opt-in : les canaux authentifiés (studio, API clé) confirment
-- d'office l'email — pas de friction là où la relation est déjà vérifiée.
SET "isActive" = true,
    "receiveArticles" = true,
    status = 'ACTIVE',
    "confirmedAt" = COALESCE("Subscriber"."confirmedAt", now()),
    "updatedAt" = now()
RETURNING id, email, status, "isActive", "isPremium", "receiveArticles", "createdAt", "updatedAt", "publicationId";

-- name: UpsertSubscriberPending :one
-- Inscription en attente de confirmation (double opt-in) : crée un abonné
-- NON destinataire (receiveArticles = false, confirmedAt NULL) porteur d'un
-- jeton à usage unique, et ne réactive jamais silencieusement un désabonné.
--
-- Pourquoi : UpsertSubscriber ci-dessus active immédiatement (confirmedAt =
-- now()), donc toute route qui l'appelle avec une adresse arbitraire — clé API
-- créateur, formulaire public — fabrique des destinataires sans preuve. Ces
-- routes doivent passer par ici : l'abonné ne devient destinataire qu'au clic
-- sur le lien (ConfirmSubscriberByToken), jamais à l'inscription.
--
-- Sur conflit :
--   * déjà actif ET confirmé : état et token inchangés (pas de confirmation à
--     renvoyer, le handler le détecte via les flags retournés) ;
--   * sinon : isActive remis à true (seul, il ne rend jamais destinataire :
--     il faut aussi receiveArticles ET confirmedAt) + token frais. Un
--     désabonné n'est donc réactivé que par son propre clic, jamais par une
--     nouvelle saisie.
INSERT INTO "Subscriber" (
    id, email, "publicationId", status, "isActive", "receiveArticles",
    "confirmationToken", "createdAt", "updatedAt"
)
VALUES (
    gen_random_uuid()::text,
    LOWER(TRIM(sqlc.arg(email)::text)),
    sqlc.arg(publication_id)::text,
    'ACTIVE',
    true,
    false,
    sqlc.arg(token)::text,
    now(),
    now()
)
ON CONFLICT ("email", "publicationId") DO UPDATE SET
    "isActive" = true,
    "confirmationToken" = CASE
        WHEN "Subscriber"."confirmedAt" IS NOT NULL
         AND "Subscriber"."receiveArticles" = true THEN NULL
        ELSE EXCLUDED."confirmationToken" END,
    -- La preuve repart à zéro avec le jeton : tant que le nouveau clic n'a pas
    -- eu lieu, l'adresse n'est PAS confirmée. Garder la confirmation d'une vie
    -- antérieure (désabonné qui se réinscrit) laisserait une ligne « en
    -- attente » qui se déclare vérifiée — les envois et le rattachement à un
    -- compte tiendraient la preuve pour acquise sans aucun clic. Même
    -- condition que le jeton : seul un abonné DÉJÀ destinataire la garde.
    "confirmedAt" = CASE
        WHEN "Subscriber"."confirmedAt" IS NOT NULL
         AND "Subscriber"."receiveArticles" = true THEN "Subscriber"."confirmedAt"
        ELSE NULL END,
    "updatedAt" = now()
RETURNING id, email, status, "isActive", "isPremium", "receiveArticles",
    ("confirmedAt" IS NOT NULL) AS confirmed,
    "createdAt", "updatedAt", "publicationId";

-- name: ListSubscribersByPublication :many
SELECT id, email, status, "isActive", "isPremium", "receiveArticles", "createdAt", "updatedAt"
FROM "Subscriber"
WHERE "publicationId" = $1
ORDER BY "createdAt" DESC
LIMIT $2 OFFSET $3;

-- name: CountSubscribersByPublication :one
SELECT COUNT(*)::bigint
FROM "Subscriber"
WHERE "publicationId" = $1;

-- name: GetSubscriberStatsByPublication :one
SELECT 
    COUNT(*)::bigint AS total,
    COUNT(*) FILTER (WHERE "isActive" = true)::bigint AS active,
    COUNT(*) FILTER (WHERE "isActive" = true AND "isPremium" = true)::bigint AS premium
FROM "Subscriber"
WHERE "publicationId" = $1;

-- name: DeactivateSubscriber :one
UPDATE "Subscriber"
SET "isActive" = false,
    "receiveArticles" = false,
    status = 'CANCELED',
    "updatedAt" = now()
WHERE "publicationId" = sqlc.arg(publication_id)::text
  AND (id = sqlc.arg(id)::text OR LOWER(email) = LOWER(TRIM(sqlc.arg(id)::text)))
RETURNING id;

-- name: ResolvePublicationIDBySlugOrID :one
SELECT id
FROM "Publication"
WHERE id = $1
   OR LOWER(slug) = LOWER($1)
   OR LOWER(COALESCE(subdomain, '')) = LOWER($1)
LIMIT 1;

-- name: GetPublicationMetadataByID :one
SELECT 
    p.id,
    p.type,
    p.name,
    p.slug,
    p.bio,
    p.subdomain,
    p."customDomain",
    p."heroText",
    p."footerText",
    p."logoUrl",
    p."headerImageUrl",
    p."accentColor",
    p."themeMode",
    p."layoutStyle",
    p."fontFamily",
    p."supportUrl",
    p."seoTitle",
    p."seoDescription",
    p."allowIndexing",
    p."allowPublicAnnotations",
    p."allowComments",
    p."isCertified",
    p."createdAt",
    p."updatedAt"
FROM "Publication" p
WHERE p.id = $1;


-- =====================================================================
-- ✅ Double opt-in — email de confirmation des inscriptions publiques
-- =====================================================================

-- name: GetSubscriberLocale :one
-- Locale d'un abonné (même confirmé ou sans token) : sert les pages de
-- confirmation (succès comme erreur) dans la langue de l'abonné. Défaut
-- géré côté Go ("fr" si ligne absente).
SELECT s.locale FROM "Subscriber" s
WHERE s.email = $1
  AND s."publicationId" = $2;

-- name: GetPendingConfirmation :one
SELECT s.email, s."publicationId", s.locale,
       s."confirmationToken",
       p.name AS publication_name, p.subdomain, p."customDomain", p."accentColor",
       p."logoUrl", p."emailSettings"
FROM "Subscriber" s
JOIN "Publication" p ON p.id = s."publicationId"
WHERE s.email = $1
  AND s."publicationId" = $2
  AND s."confirmationToken" IS NOT NULL;

-- name: GetSubscriberEmailContext :one
-- Contexte complet pour les emails transactionnels (bienvenue) :
-- locale de l'abonné + personnalisation de la publication.
SELECT s.email, s.locale, s."confirmedAt",
       p.name AS publication_name, p.subdomain, p."customDomain", p."accentColor",
       p."logoUrl", p."emailSettings"
FROM "Subscriber" s
JOIN "Publication" p ON p.id = s."publicationId"
WHERE s.email = $1
  AND s."publicationId" = $2;

-- name: ConfirmSubscriberByToken :one
UPDATE "Subscriber"
SET "receiveArticles" = true,
    "confirmedAt" = now(),
    "confirmationToken" = NULL,
    "updatedAt" = now()
WHERE email = $1
  AND "publicationId" = $2
  AND "confirmationToken" = $3
RETURNING id;

-- name: SubscribePending :exec
-- Demande d'abonnement en attente (parcours invité et connecté non vérifié,
-- fiche 01) : crée un abonné NON destinataire (receiveArticles = false,
-- confirmedAt NULL) porteur d'un jeton à usage unique. Sur conflit avec un
-- abonné déjà actif et confirmé : état et token inchangés (rien à renvoyer).
-- Sur conflit avec un désabonné : nouveau token, jamais de réactivation — seul
-- son propre clic réactive (ConfirmSubscriberByToken).
INSERT INTO "Subscriber" (
    id, email, "publicationId", status, "isActive", "receiveArticles",
    "confirmationToken", "createdAt", "updatedAt"
)
VALUES (
    gen_random_uuid()::text,
    LOWER(TRIM(sqlc.arg(email)::text)),
    sqlc.arg(publication_id)::text,
    'ACTIVE',
    true,
    false,
    sqlc.arg(token)::text,
    now(),
    now()
)
ON CONFLICT ("email", "publicationId") DO UPDATE SET
    "isActive" = true,
    "confirmationToken" = CASE
        WHEN "Subscriber"."confirmedAt" IS NOT NULL
         AND "Subscriber"."receiveArticles" = true THEN NULL
        ELSE EXCLUDED."confirmationToken" END,
    -- Même règle que UpsertSubscriberPending : la preuve repart à zéro avec le
    -- jeton — une ligne en attente n'est jamais « déjà confirmée ».
    "confirmedAt" = CASE
        WHEN "Subscriber"."confirmedAt" IS NOT NULL
         AND "Subscriber"."receiveArticles" = true THEN "Subscriber"."confirmedAt"
        ELSE NULL END,
    "updatedAt" = now();

-- name: ActivateVerifiedSubscriber :exec
-- Activation directe réservée au parcours connecté à adresse vérifiée
-- (fiche 01 §2 : adresse confirmée côté fournisseur + action explicite +
-- session). C'est le SEUL cas, avec le paiement, où `confirmedAt` est posé
-- sans clic sur un lien — et la preuve préexiste dans les deux cas.
-- Rattache aussi l'abonnement au compte (userId) : pas de doublon possible
-- (unicité email+publication), pas de réactivation silencieuse ici puisque
-- l'adresse est vérifiée et l'action explicite.
INSERT INTO "Subscriber" (
    id, email, "publicationId", status, "isActive", "receiveArticles",
    "confirmedAt", "userId", "createdAt", "updatedAt"
)
VALUES (
    gen_random_uuid()::text,
    LOWER(TRIM(sqlc.arg(email)::text)),
    sqlc.arg(publication_id)::text,
    'ACTIVE',
    true,
    true,
    now(),
    sqlc.arg(user_id)::uuid,
    now(),
    now()
)
ON CONFLICT ("email", "publicationId") DO UPDATE SET
    "isActive" = true,
    "receiveArticles" = true,
    "confirmedAt" = COALESCE("Subscriber"."confirmedAt", now()),
    "userId" = COALESCE("Subscriber"."userId", EXCLUDED."userId"),
    "updatedAt" = now();

-- name: GetPublicationPublicProfile :one
-- Profil public minimal d'une publication pour les intégrations externes
-- (fiche 02) : nom + logo uniquement. Rien de sensible, aucune adresse,
-- aucun compteur — le site tiers n'a pas besoin d'en savoir plus pour
-- afficher « Confirmer l'abonnement à [publication] ».
SELECT id, name, "logoUrl"
FROM "Publication"
WHERE id = $1 OR slug = $1
LIMIT 1;

-- name: AttachSubscriberToAccount :exec
-- Rattache un abonnement confirmé au compte qui utilise cette adresse
-- (fiche 01 §4). Conditions strictes : le userId n'est posé que s'il est
-- encore NULL (jamais d'écrasement), et seul l'identifiant est copié — ni les
-- statuts, ni les dates, ni quoi que ce soit qui réactiverait un choix passé.
-- `User.email` est unique (User_email_key) : au plus un compte récupère.
UPDATE "Subscriber" s
SET "userId" = u.id,
    "updatedAt" = now()
FROM "User" u
WHERE s.email = $1
  AND s."publicationId" = $2
  AND s."userId" IS NULL
  AND LOWER(u.email) = LOWER(s.email);
