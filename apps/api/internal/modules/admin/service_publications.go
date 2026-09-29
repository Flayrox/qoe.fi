package admin

// Palier email Pro par publication (freemium, intérim en attendant Stripe).
// Réservé superadmin. true = personnalisation complète des emails
// transactionnels ; false = identité (nom + logo) + défauts localisés.
// La bascule est immédiate (lue en base à chaque rendu, sans cache).

import (
	"context"

	db "github.com/qoefi/api/internal/database"
)

// SetPublicationEmailPro bascule le palier email d'une publication.
// Retourne la nouvelle valeur (la console l'affiche sans relecture).
func (s *Service) SetPublicationEmailPro(ctx context.Context, userID, publicationID string, pro bool) (bool, error) {
	if err := s.checkSuperadmin(ctx, userID); err != nil {
		return false, err
	}
	return s.q.SetPublicationEmailPro(ctx, db.SetPublicationEmailProParams{
		ID:       publicationID,
		EmailPro: pro,
	})
}
