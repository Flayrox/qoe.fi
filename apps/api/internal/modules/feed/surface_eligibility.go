package feed

// ─────────────────────────────────────────────────────────────────────────────
// Éligibilité par surface (lot L43) — lecture des faits, décision, explication.
// ─────────────────────────────────────────────────────────────────────────────
// Le package `eligibility` porte les règles pures (Decide/Rank) ; ce fichier ne
// fait que :
//   1. charger les faits des contenus récents en UNE requête (jamais de N+1) ;
//   2. charger les poids `feed.rank_*` de SystemConfig, avec défauts sûrs ;
//   3. rendre un Result (retenus classés + exclus motivés).
// Aucun contenu ne sort d'ici : ids, raisons, scores. La surface est validée
// strictement — une valeur inconnue est refusée (ErrUnknownSurface → 400).
// ─────────────────────────────────────────────────────────────────────────────

import (
	"context"
	"time"

	db "github.com/qoefi/api/internal/database"
	"github.com/qoefi/api/internal/eligibility"
)

// EligibilityDefaultLimit borne la lecture quand le client n'en demande pas.
const EligibilityDefaultLimit = 50

// EligibilityMaxLimit est le plafond dur d'une page de décisions.
const EligibilityMaxLimit = 100

// SurfaceEligibility rend les décisions d'éligibilité d'une surface pour un
// viewer donné. Sert l'administration, le debug et les états vides motivés :
// chaque contenu retenu ou exclu porte sa raison (`reason`) et son texte
// (`why`), jamais un booléen opaque.
func (s *Service) SurfaceEligibility(ctx context.Context, rawSurface, viewerID string, limit int) (eligibility.Result, error) {
	surface, err := eligibility.ParseSurface(rawSurface)
	if err != nil {
		return eligibility.Result{}, err
	}
	// Une demande absente prend le défaut ; une demande trop grande est
	// PLAFONNÉE (pas rabattue sur le défaut) : 500 doit rendre 100, sinon un
	// client qui demande plus reçoit moins que le plafond annoncé.
	switch {
	case limit <= 0:
		limit = EligibilityDefaultLimit
	case limit > EligibilityMaxLimit:
		limit = EligibilityMaxLimit
	}

	rows, err := s.q.ListEligibilityCandidates(ctx, db.ListEligibilityCandidatesParams{
		ViewerID:  toUUID(viewerID),
		TakeCount: int32(limit),
	})
	if err != nil {
		return eligibility.Result{}, err
	}

	candidates := make([]eligibility.Candidate, 0, len(rows))
	for _, row := range rows {
		candidates = append(candidates, eligibility.Candidate{
			PostID:              row.ID,
			AuthorID:            row.AuthorID,
			CreatedAt:           row.CreatedAt.Time,
			Visibility:          row.Visibility,
			IsDraft:             row.IsDraft,
			IsDeleted:           row.IsDeleted,
			IsHiddenByModerator: row.IsHiddenByModerator,
			IsHiddenByAuthor:    row.IsHiddenByAuthor,
			AuthorSuspended:     row.AuthorSuspended,
			AuthorRestricted:    row.AuthorRestricted,
			Blocked:             row.Blocked,
			Muted:               row.Muted,
			MutedWord:           row.MutedWord,
			ProfilePrivate:      row.ProfilePrivate,
			ViewerIsAuthor:      row.ViewerIsAuthor,
			ViewerFollowsAuthor: row.ViewerFollowsAuthor,
			RootArticleID:       row.RootArticleID,
			LikeCount:           int(row.LikeCount),
			ReplyCount:          int(row.ReplyCount),
			RepostCount:         int(row.RepostCount),
		})
	}

	return eligibility.Rank(surface, candidates, s.rankingWeights(ctx), time.Now())
}

// rankingWeights charge les poids de ranking d'un coup. Toute erreur de lecture
// rend les défauts : une base indisponible ne doit pas vider un écran
// d'explication ni bloquer un flux.
func (s *Service) rankingWeights(ctx context.Context) eligibility.Weights {
	keys := []string{
		eligibility.KeyFreshWeight,
		eligibility.KeyEngagementWeight,
		eligibility.KeyAffinityWeight,
		eligibility.KeyMinScore,
		eligibility.KeyMaxAgeDays,
	}
	// Même requête sqlc que l'administration des configs : la couche service
	// reste testable sans base (queryer stubbé), et il n'existe pas une seconde
	// façon de lire SystemConfig.
	rows, err := s.q.GetSystemConfigsByKeys(ctx, keys)
	if err != nil {
		return eligibility.DefaultWeights()
	}

	values := make(map[string]string, len(rows))
	for _, row := range rows {
		values[row.Key] = row.Value
	}
	return eligibility.WeightsFromConfig(values)
}
