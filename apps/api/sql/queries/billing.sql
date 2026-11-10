-- name: GetPublisherByID :one
SELECT id FROM "Publisher" WHERE id = $1;

-- name: GetPersonalPublisherByUserID :one
SELECT "publisherId" AS id FROM "User" WHERE id = $1;

-- name: GetPersonalOwnerForCredit :one
SELECT id::text AS owner_id, role AS owner_role
FROM "User"
WHERE "publisherId" = $1;

-- name: GetMediaOwnerForCredit :one
SELECT mm."userId"::text AS owner_id, 'creator' AS owner_role
FROM "MediaMember" mm
JOIN "Media" md ON md.id = mm."mediaId"
WHERE md."publisherId" = $1 AND mm.role = 'owner' AND mm.status = 'active'
LIMIT 1;

-- name: UpsertSubscriberPayment :one
-- Double opt-in : Stripe/paiement confirme d'office l'email (relation facturée
-- authentifiée) — receiveArticles reste actif sans confirmation email.
INSERT INTO "Subscriber" (id, email, "publisherId", status, "isActive", "isPremium", "ltvCents", "confirmedAt", "updatedAt")
VALUES (gen_random_uuid()::text, $1, $2, 'ACTIVE', true, true, $3, now(), now())
ON CONFLICT ("email", "publisherId") DO UPDATE SET
  "isActive" = true, "isPremium" = true,
  "ltvCents" = "Subscriber"."ltvCents" + EXCLUDED."ltvCents",
  status = 'ACTIVE',
  "receiveArticles" = true,
  "confirmedAt" = COALESCE("Subscriber"."confirmedAt", now()),
  "updatedAt" = now()
RETURNING id;

-- name: SetSubscriberPremiumStatus :exec
UPDATE "Subscriber"
SET "isActive" = $3, "isPremium" = $3, status = $4
WHERE "publisherId" = $1 AND email = $2;

-- name: IncrementWalletBalance :exec
UPDATE "User"
SET "walletBalanceCents" = "walletBalanceCents" + $2
WHERE id = $1;

-- name: CreateWalletTransaction :one
INSERT INTO "WalletTransaction" (id, "userId", "amountCents", type)
VALUES (gen_random_uuid()::text, $1, $2, $3)
RETURNING id;
