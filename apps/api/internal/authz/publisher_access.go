package authz

import (
	"context"

	"github.com/jackc/pgx/v5"
)

// PublisherQuerier est la surface minimale nécessaire pour vérifier la
// propriété d'une publication (*pgxpool.Pool, *pgx.Conn, doubles de test).
type PublisherQuerier interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

// canManagePublisherSQL : publication personnelle de l'utilisateur (User.publisherId)
// ou média dont il est propriétaire actif. Règle unique du dépôt : exports,
// books et billing la consomment ici au lieu d'en recopier le SQL — trois
// copies divergentes étaient le vrai risque (une correction de règle en
// oubliait toujours une).
const canManagePublisherSQL = `
	SELECT EXISTS(
		SELECT 1 FROM "User" u WHERE u.id = $1::uuid AND u."publisherId" = $2
		UNION
		SELECT 1 FROM "MediaMember" mm
		JOIN "Media" m ON m.id = mm."mediaId"
		WHERE mm."userId" = $1::uuid AND mm.role = 'owner' AND mm.status = 'active'
		  AND m."publisherId" = $2
	)`

// CanManagePublisher indique si l'utilisateur peut administrer la publication
// (export complet, compilation de livre, facturation). Un identifiant vide ou
// un queryer absent vaut refus ; une panne DB remonte telle quelle.
func CanManagePublisher(ctx context.Context, q PublisherQuerier, userID, publisherID string) (bool, error) {
	if q == nil || userID == "" || publisherID == "" {
		return false, nil
	}
	var ok bool
	if err := q.QueryRow(ctx, canManagePublisherSQL, userID, publisherID).Scan(&ok); err != nil {
		return false, err
	}
	return ok, nil
}
