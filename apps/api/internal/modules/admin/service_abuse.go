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
