package admin

// File de revue anti-abus (fiche 06 §8) : expose les dossiers ouverts du
// noyau (dernier verdict non trivial par sujet) et leur clôture humaine.
// Mince par construction : l'authentification (superadmin) et la persistance
// vivent ici, les règles et le SQL dans le package abuse — ce fichier ne
// décide rien, il constate qui tranche.

import (
	"context"
	"time"

	"github.com/qoefi/api/internal/abuse"
	"github.com/qoefi/api/internal/support"
)

// AbuseDecision est un dossier ouvert sérialisable pour la console staff.
type AbuseDecision struct {
	ID          string   `json:"id"`
	Policy      string   `json:"policy"`
	Version     string   `json:"version"`
	SubjectType string   `json:"subjectType"`
	SubjectID   string   `json:"subjectId"`
	Result      string   `json:"result"`
	ReasonCodes []string `json:"reasonCodes"`
	DecidedBy   string   `json:"decidedBy"`
	DeciderID   *string  `json:"deciderId"`
	CreatedAt   string   `json:"createdAt"`
	RecentFacts int      `json:"recentFacts"`
}

// ListAbuseDecisions renvoie les dossiers ouverts (superadmin uniquement).
func (s *Service) ListAbuseDecisions(ctx context.Context, userID string, limit, offset int) ([]AbuseDecision, int, error) {
	if err := s.checkSuperadmin(ctx, userID); err != nil {
		return nil, 0, err
	}
	items, total, err := abuse.ListOpenDecisions(ctx, s.pool, limit, offset, time.Now())
	if err != nil {
		return nil, 0, err
	}
	out := make([]AbuseDecision, 0, len(items))
	for _, d := range items {
		out = append(out, AbuseDecision{
			ID: d.ID, Policy: d.Policy, Version: d.Version,
			SubjectType: d.SubjectType, SubjectID: d.SubjectID,
			Result: d.Result, ReasonCodes: d.ReasonCodes,
			DecidedBy: d.DecidedBy, DeciderID: d.DeciderID,
			CreatedAt:   d.CreatedAt.UTC().Format(time.RFC3339),
			RecentFacts: d.RecentFacts,
		})
	}
	return out, total, nil
}

// AbuseMetrics expose l'instantané de santé anti-abus (fiche 06 §11,
// superadmin uniquement — données d'investigation nominatives).
func (s *Service) AbuseMetrics(ctx context.Context, userID string, days int) (abuse.Metrics, error) {
	if err := s.checkSuperadmin(ctx, userID); err != nil {
		return abuse.Metrics{}, err
	}
	return abuse.ComputeMetrics(ctx, s.pool, days, time.Now())
}

// Abuse incidents (fiche 06 §9-§10, superadmin uniquement) : le staff ouvre
// et tient les dossiers d'attaque confirmée — qualifier une attaque est un
// jugement humain, jamais un verdict automate.

// ListAbuseIncidents renvoie les dossiers (ouverts d'abord).
func (s *Service) ListAbuseIncidents(ctx context.Context, userID, status string, limit, offset int) ([]abuse.Incident, int, error) {
	if err := s.checkSuperadmin(ctx, userID); err != nil {
		return nil, 0, err
	}
	return abuse.ListIncidents(ctx, s.pool, status, limit, offset, time.Now())
}

// OpenAbuseIncident ouvre un dossier d'attaque.
func (s *Service) OpenAbuseIncident(ctx context.Context, userID, title, kind, scope, impact string) (abuse.Incident, error) {
	if err := s.checkSuperadmin(ctx, userID); err != nil {
		return abuse.Incident{}, err
	}
	return abuse.OpenIncident(ctx, s.pool, title, kind, scope, impact, userID, time.Now())
}

// UpdateAbuseIncident fait avancer un dossier (statut validé, mesure ajoutée
// horodatée avec l'auteur, jamais écrasée).
func (s *Service) UpdateAbuseIncident(ctx context.Context, userID, id, status, scope, impact, measure string) (abuse.Incident, error) {
	if err := s.checkSuperadmin(ctx, userID); err != nil {
		return abuse.Incident{}, err
	}
	return abuse.UpdateIncident(ctx, s.pool, id, userID, status, scope, impact, measure, time.Now())
}

// Abuse appeals (tranche 6, superadmin uniquement) : file des recours et
// décisions. overturned lève la mesure (verdict allow), upheld la confirme
// (verdict humain qui reprend le résultat) — les deux portent appealRef.

// ListAbuseAppeals renvoie les recours (ouverts d'abord).
func (s *Service) ListAbuseAppeals(ctx context.Context, userID, status string, limit, offset int) ([]abuse.Appeal, int, error) {
	if err := s.checkSuperadmin(ctx, userID); err != nil {
		return nil, 0, err
	}
	return abuse.ListAllAppeals(ctx, s.pool, status, limit, offset)
}

// GetAbuseAppeal relit un recours avec ses messages (console staff).
func (s *Service) GetAbuseAppeal(ctx context.Context, userID, id string) (abuse.Appeal, error) {
	if err := s.checkSuperadmin(ctx, userID); err != nil {
		return abuse.Appeal{}, err
	}
	return abuse.GetAppeal(ctx, s.pool, id)
}

// DecideAbuseAppeal tranche un recours : prise en main (under_review) ou
// clôture (decided + outcome). Seule overturned lève la mesure — l'ouverture
// n'a jamais rien levé (verrouillé par test).
func (s *Service) DecideAbuseAppeal(ctx context.Context, userID, id, status, outcome, staffNote, reply string) (abuse.Appeal, error) {
	if err := s.checkSuperadmin(ctx, userID); err != nil {
		return abuse.Appeal{}, err
	}
	return abuse.DecideAppeal(ctx, s.pool, id, userID, status, outcome, staffNote, reply, time.Now())
}

// Support général (tranche 6, superadmin uniquement) : file, détail,
// assignation, avancement, clôture, charge. L'ouverture n'a jamais rien
// changé ; la clôture ne lève ni suspension ni permission (les actes
// passent par les chemins existants). Conflit d'intérêts refusé : on ne
// clôt jamais son propre dossier.

// ListSupportTickets renvoie les dossiers (ouverts d'abord).
func (s *Service) ListSupportTickets(ctx context.Context, userID, status string, limit, offset int) ([]support.Ticket, int, error) {
	if err := s.checkSuperadmin(ctx, userID); err != nil {
		return nil, 0, err
	}
	return support.ListAllTickets(ctx, s.pool, status, limit, offset)
}

// GetSupportTicket relit un dossier avec ses messages.
func (s *Service) GetSupportTicket(ctx context.Context, userID, id string) (support.Ticket, error) {
	if err := s.checkSuperadmin(ctx, userID); err != nil {
		return support.Ticket{}, err
	}
	return support.GetTicket(ctx, s.pool, id)
}

// AssignSupportTicket assigne (prise en main, passe en under_review).
func (s *Service) AssignSupportTicket(ctx context.Context, userID, id string) (support.Ticket, error) {
	if err := s.checkSuperadmin(ctx, userID); err != nil {
		return support.Ticket{}, err
	}
	return support.AssignTicket(ctx, s.pool, id, userID, time.Now())
}

// UpdateSupportTicket fait avancer (statut validé, note ajoutée, réponse).
func (s *Service) UpdateSupportTicket(ctx context.Context, userID, id, status, staffNote, reply string) (support.Ticket, error) {
	if err := s.checkSuperadmin(ctx, userID); err != nil {
		return support.Ticket{}, err
	}
	return support.UpdateTicket(ctx, s.pool, id, userID, status, staffNote, reply, time.Now())
}

// SupportMetrics expose la charge (tableau de bord staff).
func (s *Service) SupportMetrics(ctx context.Context, userID string) (support.Metrics, error) {
	if err := s.checkSuperadmin(ctx, userID); err != nil {
		return support.Metrics{}, err
	}
	return support.ComputeMetrics(ctx, s.pool, time.Now())
}

// Articles d'aide (tranche 6, superadmin uniquement) : publier, corriger,
// ordonner SANS déploiement. Même slug qu'une entrée statique = la version
// console la remplace (override — le statique reste le repli).

// ListSupportArticles renvoie tout (brouillons inclus).
func (s *Service) ListSupportArticles(ctx context.Context, userID string, limit, offset int) ([]support.Article, int, error) {
	if err := s.checkSuperadmin(ctx, userID); err != nil {
		return nil, 0, err
	}
	return support.ListAllArticles(ctx, s.pool, limit, offset)
}

// GetSupportArticle relit un article (brouillon inclus — prévisualisation).
func (s *Service) GetSupportArticle(ctx context.Context, userID, id string) (support.Article, error) {
	if err := s.checkSuperadmin(ctx, userID); err != nil {
		return support.Article{}, err
	}
	return support.GetArticle(ctx, s.pool, id)
}

// CreateSupportArticle crée un brouillon (publier est un acte séparé).
func (s *Service) CreateSupportArticle(ctx context.Context, userID, slug, titleFr, titleEn, bodyFr, bodyEn string, position int) (support.Article, error) {
	if err := s.checkSuperadmin(ctx, userID); err != nil {
		return support.Article{}, err
	}
	return support.CreateArticle(ctx, s.pool, slug, titleFr, titleEn, bodyFr, bodyEn, position, time.Now())
}

// UpdateSupportArticle modifie (contenu, position, published).
func (s *Service) UpdateSupportArticle(ctx context.Context, userID, id, titleFr, titleEn, bodyFr, bodyEn string, position *int, published *bool) (support.Article, error) {
	if err := s.checkSuperadmin(ctx, userID); err != nil {
		return support.Article{}, err
	}
	return support.UpdateArticle(ctx, s.pool, id, titleFr, titleEn, bodyFr, bodyEn, position, published, time.Now())
}

// ResolveAbuseDecision clôt un dossier par un verdict humain tracé
// (superadmin uniquement). `result` ∈ {allow, limit_distribution,
// pause_sending, suspend} — le reste est refusé (abuse.ErrInvalidHumanResult).
// Rappel : le verdict ne fait qu'écrire la trace ; l'acte de modération
// (suspension, limitation...) passe par les chemins existants avec leurs
// propres gardes.
func (s *Service) ResolveAbuseDecision(ctx context.Context, userID, subjectType, subjectID, result, note string) (string, error) {
	if err := s.checkSuperadmin(ctx, userID); err != nil {
		return "", err
	}
	return abuse.ResolveDecision(ctx, s.pool, subjectType, subjectID, userID, abuse.Decision(result), note, time.Now())
}
