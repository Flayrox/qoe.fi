// Package appeals — recours des utilisateurs contre les mesures anti-abus
// visant leur compte (tranche 6, amorce). Mince par construction :
// l'identité vient du JWT, les règles vivent dans le package abuse — ce
// module ne décide rien, il constate qui parle.
package appeals

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/qoefi/api/internal/abuse"
)

// Service porte les opérations recours côté utilisateur.
type Service struct {
	pool *pgxpool.Pool
}

// NewService construit le service (pool concret : requêtes multi-lignes).
func NewService(pool *pgxpool.Pool) *Service { return &Service{pool: pool} }

// OpenAppeal ouvre un recours pour soi (le sujet contesté doit être soi-même
// — vérifié dans abuse, pas ici : même en forgeant le corps, on ne conteste
// que pour soi). L'ouverture NE LÈVE RIEN.
func (s *Service) OpenAppeal(ctx context.Context, userID, subjectType, subjectID, message string) (abuse.Appeal, error) {
	return abuse.OpenAppeal(ctx, s.pool, subjectType, subjectID, userID, message, time.Now())
}

// ListAppeals renvoie les dossiers de l'utilisateur (les siens uniquement).
func (s *Service) ListAppeals(ctx context.Context, userID string, limit, offset int) ([]abuse.Appeal, int, error) {
	return abuse.ListUserAppeals(ctx, s.pool, userID, limit, offset)
}

// GetAppeal relit un dossier de l'utilisateur (pas ceux d'autrui : 404, pas
// de fuite d'existence — l'identifiant est un UUID non devinable).
func (s *Service) GetAppeal(ctx context.Context, userID, id string) (abuse.Appeal, error) {
	a, err := abuse.GetAppeal(ctx, s.pool, id)
	if err != nil {
		return abuse.Appeal{}, err
	}
	if a.OpenedBy != userID {
		return abuse.Appeal{}, abuse.ErrAppealNotFound
	}
	return a, nil
}

// AddMessage ajoute un message de l'utilisateur à SON dossier (clos = refusé,
// rouvrir = nouveau recours).
func (s *Service) AddMessage(ctx context.Context, userID, id, body string) (abuse.Appeal, error) {
	a, err := s.GetAppeal(ctx, userID, id)
	if err != nil {
		return abuse.Appeal{}, err
	}
	return abuse.AddUserMessage(ctx, s.pool, a.ID, userID, body, time.Now())
}
