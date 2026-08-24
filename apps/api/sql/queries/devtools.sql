-- DevTools — inspecteur de données (panneau dev-only des apps).
-- Rôle : lecture seule, réservé au superadmin (vérifié côté handler).

-- name: GetUserRole :one
SELECT role FROM "User" WHERE id = $1;

-- name: ListDevtoolsUsers :many
SELECT u.id, u.name, u.email, u.username, u.role, u."createdAt",
       p."subdomain", p."customDomain", p."accentColor", p."layoutStyle"
FROM "User" u
LEFT JOIN "Publication" p ON p.id = u."publicationId"
ORDER BY u."createdAt" DESC;

-- name: CountDevtoolsUsers :one
SELECT count(*) FROM "User";

-- name: CountDevtoolsArticles :one
SELECT count(*) FROM "Article";

-- name: CountDevtoolsThoughts :one
SELECT count(*) FROM "Post";

-- name: CountDevtoolsLikes :one
SELECT count(*) FROM "Like";

-- name: CountDevtoolsSubscribers :one
SELECT count(*) FROM "Subscriber";
