package admin

// Palier email Pro par publication : désormais un OCTROI (source unique —
// fini la colonne miroir). Même route, même forme qu'avant (compatibilité
// console) : {emailPro:true} octroie Pro sans fin (idempotent : si déjà
// effectif, ne crée pas de doublon), {emailPro:false} révoque tous les
// octrois Pro effectifs (fin immédiate, historique conservé). Retourne
// l'état effectif (la console l'affiche sans relecture). Dates programmées
// et historique fin : routes grants dédiées (service_abuse.go).

import (
	"context"
	"time"

	"github.com/qoefi/api/internal/subscriptions"
)

// SetPublicationEmailPro bascule le palier email d'une publication via les
// octrois (staff uniquement). Effet immédiat (lu à chaque rendu, sans cache).
func (s *Service) SetPublicationEmailPro(ctx context.Context, userID, publicationID string, pro bool) (bool, error) {
	if err := s.checkSuperadmin(ctx, userID); err != nil {
		return false, err
	}
	now := time.Now()
	if pro {
		if subscriptions.HasPro(ctx, s.pool, publicationID, now) {
			return true, nil // déjà effectif : idempotent, pas de doublon
		}
		if _, err := subscriptions.GrantPlan(ctx, s.pool,
			subscriptions.SubjectPublication, publicationID, subscriptions.PlanPro,
			now, nil, userID, "bascule console (toggle)", now); err != nil {
			return false, err
		}
		return true, nil
	}
	effective, err := subscriptions.ListGrants(ctx, s.pool,
		subscriptions.SubjectPublication, publicationID, true, 100, now)
	if err != nil {
		return false, err
	}
	for _, g := range effective {
		if g.Plan != subscriptions.PlanPro {
			continue
		}
		if _, err := subscriptions.RevokeGrant(ctx, s.pool, g.ID, now); err != nil {
			return false, err
		}
	}
	return subscriptions.HasPro(ctx, s.pool, publicationID, now), nil
}
