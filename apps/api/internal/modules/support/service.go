// Package support — dossiers du support général côté utilisateur (tranche 6).
// Mince : l'identité vient du JWT, les règles vivent dans internal/support.
package support

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	internalsupport "github.com/qoefi/api/internal/support"
)

// Service porte les opérations support côté utilisateur.
type Service struct {
	pool *pgxpool.Pool
}

// NewService construit le service.
func NewService(pool *pgxpool.Pool) *Service { return &Service{pool: pool} }

// OpenTicket ouvre un dossier (Y COMPRIS compte restreint). L'ouverture NE
// CHANGE RIEN : seule une action staff explicite agit, par les chemins
// existants, jamais ici.
func (s *Service) OpenTicket(ctx context.Context, userID, kind, subject, message, relatedType, relatedID string) (internalsupport.Ticket, error) {
	return internalsupport.OpenTicket(ctx, s.pool, kind, subject, userID, message, relatedType, relatedID, time.Now())
}

// ListTickets : les dossiers de l'utilisateur (les siens uniquement).
func (s *Service) ListTickets(ctx context.Context, userID string, limit, offset int) ([]internalsupport.Ticket, int, error) {
	return internalsupport.ListUserTickets(ctx, s.pool, userID, limit, offset)
}

// GetTicket : un dossier de l'utilisateur (pas ceux d'autrui : 404).
func (s *Service) GetTicket(ctx context.Context, userID, id string) (internalsupport.Ticket, error) {
	t, err := internalsupport.GetTicket(ctx, s.pool, id)
	if err != nil {
		return internalsupport.Ticket{}, err
	}
	if t.OpenedBy != userID {
		return internalsupport.Ticket{}, internalsupport.ErrTicketNotFound
	}
	return t, nil
}

// AddMessage : écrire à SON dossier (clos = refusé).
func (s *Service) AddMessage(ctx context.Context, userID, id, body string) (internalsupport.Ticket, error) {
	t, err := s.GetTicket(ctx, userID, id)
	if err != nil {
		return internalsupport.Ticket{}, err
	}
	return internalsupport.AddUserMessage(ctx, s.pool, t.ID, userID, body, time.Now())
}
