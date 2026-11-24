package feed

// =====================================================================
// 🧭 SurfaceEligibility — traversée réelle du service, sans base ni Docker
// =====================================================================
// Le service lit les candidats via le queryer (stubbé ici) puis applique la
// VRAIE chaîne : eligibility.Decide/Rank + WeightsFromConfig. Aucun moteur de
// règles parallèle n'est défini dans ce fichier : les assertions portent sur
// les décisions produites par le package eligibility.
//
// Couverture : retenus classés + exclus motivés, surface inconnue propagée,
// config partielle/invalide → défauts sûrs, zéro explicite respecté, erreurs
// de lecture propagées, bornes de limite.
// =====================================================================

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	db "github.com/qoefi/api/internal/database"
	"github.com/qoefi/api/internal/eligibility"
)

// surfaceQuerier ne fournit que les deux lectures utilisées par
// SurfaceEligibility ; l'interface db.Querier est embarquée pour le reste.
type surfaceQuerier struct {
	db.Querier

	candidates    []db.ListEligibilityCandidatesRow
	candidatesErr error

	configs    []db.SystemConfig
	configsErr error

	candidatesCalled bool
	lastLimit        int32
}

func (q *surfaceQuerier) ListEligibilityCandidates(_ context.Context, arg db.ListEligibilityCandidatesParams) ([]db.ListEligibilityCandidatesRow, error) {
	q.candidatesCalled = true
	q.lastLimit = arg.TakeCount
	return q.candidates, q.candidatesErr
}

func (q *surfaceQuerier) GetSystemConfigsByKeys(_ context.Context, _ []string) ([]db.SystemConfig, error) {
	return q.configs, q.configsErr
}

func eligibilityRow(id string, mutate func(*db.ListEligibilityCandidatesRow)) db.ListEligibilityCandidatesRow {
	row := db.ListEligibilityCandidatesRow{
		ID:                  id,
		AuthorID:            "author-" + id,
		CreatedAt:           pgtype.Timestamp{Time: time.Now().Add(-time.Hour), Valid: true},
		Visibility:          "public",
		ViewerFollowsAuthor: true,
		LikeCount:           3,
		ReplyCount:          1,
		RepostCount:         0,
	}
	if mutate != nil {
		mutate(&row)
	}
	return row
}

func TestSurfaceEligibility_RanksEligibleAndExplainsExclusions(t *testing.T) {
	q := &surfaceQuerier{
		candidates: []db.ListEligibilityCandidatesRow{
			eligibilityRow("populaire", func(r *db.ListEligibilityCandidatesRow) {
				r.LikeCount, r.ReplyCount, r.RepostCount = 40, 8, 4
			}),
			eligibilityRow("discret", nil),
			eligibilityRow("modere", func(r *db.ListEligibilityCandidatesRow) {
				r.IsHiddenByModerator = true
			}),
			eligibilityRow("commentaire", func(r *db.ListEligibilityCandidatesRow) {
				r.RootArticleID = "article-1"
			}),
		},
	}
	svc := &Service{q: q}

	res, err := svc.SurfaceEligibility(context.Background(), "discover", "viewer-1", 20)
	if err != nil {
		t.Fatalf("SurfaceEligibility: %v", err)
	}

	if res.Surface != eligibility.SurfaceDiscover {
		t.Fatalf("surface attendue discover, obtenu %q", res.Surface)
	}
	if len(res.Items) != 2 || len(res.Excluded) != 2 {
		t.Fatalf("attendu 2 retenus / 2 exclus, obtenu %d/%d", len(res.Items), len(res.Excluded))
	}
	// Le classement descend par score : l'engagement prime sur la fraîcheur égale.
	if res.Items[0].PostID != "populaire" || res.Items[1].PostID != "discret" {
		t.Fatalf("ordre des retenus inattendu : %+v", res.Items)
	}
	for _, d := range res.Items {
		if d.Why == "" || !d.Eligible || d.Reason != eligibility.ReasonEligible {
			t.Fatalf("un retenu doit être motivé : %+v", d)
		}
	}
	// Chaque exclusion porte sa raison ET son texte, jamais un booléen nu.
	reasons := map[string]eligibility.Reason{}
	for _, d := range res.Excluded {
		if d.Eligible || d.Why == "" || d.Reason == "" {
			t.Fatalf("exclusion non motivée : %+v", d)
		}
		reasons[d.PostID] = d.Reason
	}
	if reasons["modere"] != eligibility.ReasonModerated {
		t.Fatalf("raison attendue moderated pour 'modere', obtenu %q", reasons["modere"])
	}
	if reasons["commentaire"] != eligibility.ReasonOutOfSurface {
		t.Fatalf("raison attendue out_of_surface pour 'commentaire', obtenu %q", reasons["commentaire"])
	}
	if !q.candidatesCalled || q.lastLimit != 20 {
		t.Fatalf("la lecture doit être demandée une fois avec la limite reçue (appel=%v, limite=%d)", q.candidatesCalled, q.lastLimit)
	}
}

func TestSurfaceEligibility_FollowingRequiresFollowAndExplainsIt(t *testing.T) {
	q := &surfaceQuerier{
		candidates: []db.ListEligibilityCandidatesRow{
			eligibilityRow("suivi", nil),
			eligibilityRow("inconnu", func(r *db.ListEligibilityCandidatesRow) {
				r.ViewerFollowsAuthor = false
			}),
		},
	}
	svc := &Service{q: q}

	res, err := svc.SurfaceEligibility(context.Background(), " following ", "viewer-1", 10)
	if err != nil {
		t.Fatalf("SurfaceEligibility: %v", err)
	}
	if res.Surface != eligibility.SurfaceFollowing {
		t.Fatalf("surface attendue following, obtenu %q", res.Surface)
	}
	if len(res.Items) != 1 || res.Items[0].Why != "Vous suivez l’auteur." {
		t.Fatalf("le retenu doit expliquer le suivi : %+v", res.Items)
	}
	if len(res.Excluded) != 1 || res.Excluded[0].Reason != eligibility.ReasonNotFollowing {
		t.Fatalf("l'auteur non suivi doit être exclu avec sa raison : %+v", res.Excluded)
	}
}

func TestSurfaceEligibility_UnknownSurfaceIsPropagatedWithoutReading(t *testing.T) {
	q := &surfaceQuerier{}
	svc := &Service{q: q}

	if _, err := svc.SurfaceEligibility(context.Background(), "home", "viewer-1", 20); !errors.Is(err, eligibility.ErrUnknownSurface) {
		t.Fatalf("erreur attendue ErrUnknownSurface, obtenu %v", err)
	}
	if q.candidatesCalled {
		t.Fatal("une surface inconnue ne doit pas déclencher de lecture")
	}
}

func TestSurfaceEligibility_ClampsLimit(t *testing.T) {
	cases := []struct {
		requested int
		expected  int32
	}{
		{0, EligibilityDefaultLimit},
		{-5, EligibilityDefaultLimit},
		{500, 100},
		{30, 30},
	}
	for _, tc := range cases {
		q := &surfaceQuerier{}
		svc := &Service{q: q}
		if _, err := svc.SurfaceEligibility(context.Background(), "discover", "viewer-1", tc.requested); err != nil {
			t.Fatalf("limite %d : %v", tc.requested, err)
		}
		if q.lastLimit != tc.expected {
			t.Fatalf("limite %d : attendu %d, obtenu %d", tc.requested, tc.expected, q.lastLimit)
		}
	}
}

func TestSurfaceEligibility_PartialConfigKeepsSafeDefaults(t *testing.T) {
	q := &surfaceQuerier{
		candidates: []db.ListEligibilityCandidatesRow{eligibilityRow("post-1", nil)},
		configs: []db.SystemConfig{
			{Key: eligibility.KeyFreshWeight, Value: "0.9"},
		},
	}
	svc := &Service{q: q}
	def := eligibility.DefaultWeights()

	res, err := svc.SurfaceEligibility(context.Background(), "discover", "viewer-1", 10)
	if err != nil {
		t.Fatalf("SurfaceEligibility: %v", err)
	}
	if res.Weights.Fresh != 0.9 {
		t.Fatalf("poids fraîcheur attendu 0.9, obtenu %v", res.Weights.Fresh)
	}
	if res.Weights.Engagement != def.Engagement || res.Weights.MaxAgeDays != def.MaxAgeDays {
		t.Fatalf("les clés absentes doivent garder les défauts : %+v", res.Weights)
	}
}

func TestSurfaceEligibility_InvalidConfigFallsBackToDefaults(t *testing.T) {
	q := &surfaceQuerier{
		candidates: []db.ListEligibilityCandidatesRow{eligibilityRow("post-1", nil)},
		configs: []db.SystemConfig{
			{Key: eligibility.KeyFreshWeight, Value: "beaucoup"},
			{Key: eligibility.KeyEngagementWeight, Value: "-1"},
			{Key: eligibility.KeyAffinityWeight, Value: "2"},
			{Key: eligibility.KeyMinScore, Value: "NaN"},
			{Key: eligibility.KeyMaxAgeDays, Value: "-3"},
		},
	}
	svc := &Service{q: q}

	res, err := svc.SurfaceEligibility(context.Background(), "discover", "viewer-1", 10)
	if err != nil {
		t.Fatalf("SurfaceEligibility: %v", err)
	}
	if res.Weights != eligibility.DefaultWeights() {
		t.Fatalf("valeurs absurdes attendues ignorées, obtenu %+v", res.Weights)
	}
	if len(res.Items) != 1 {
		t.Fatalf("un contenu sain reste éligible malgré la config absurde : %+v", res.Excluded)
	}
}

func TestSurfaceEligibility_ExplicitZeroAndThresholdAreRespected(t *testing.T) {
	q := &surfaceQuerier{
		candidates: []db.ListEligibilityCandidatesRow{
			eligibilityRow("post-1", func(r *db.ListEligibilityCandidatesRow) {
				r.CreatedAt = pgtype.Timestamp{Time: time.Now(), Valid: true}
			}),
		},
		configs: []db.SystemConfig{
			{Key: eligibility.KeyFreshWeight, Value: "0"},
			{Key: eligibility.KeyEngagementWeight, Value: "0"},
			{Key: eligibility.KeyMinScore, Value: "1"},
		},
	}
	svc := &Service{q: q}

	res, err := svc.SurfaceEligibility(context.Background(), "discover", "viewer-1", 10)
	if err != nil {
		t.Fatalf("SurfaceEligibility: %v", err)
	}
	if res.Weights.Engagement != 0 || res.Weights.Fresh != 0 {
		t.Fatalf("un zéro explicite doit être conservé : %+v", res.Weights)
	}
	if len(res.Items) != 0 || len(res.Excluded) != 1 {
		t.Fatalf("seuil 1 sur score nul : attendu un exclu, obtenu %+v", res)
	}
	if res.Excluded[0].Reason != eligibility.ReasonLowScore {
		t.Fatalf("raison attendue low_score, obtenu %+v", res.Excluded[0])
	}
}

func TestSurfaceEligibility_ConfigReadErrorFallsBackToDefaults(t *testing.T) {
	q := &surfaceQuerier{
		candidates: []db.ListEligibilityCandidatesRow{eligibilityRow("post-1", nil)},
		configsErr: errors.New("SystemConfig indisponible"),
	}
	svc := &Service{q: q}

	res, err := svc.SurfaceEligibility(context.Background(), "discover", "viewer-1", 10)
	if err != nil {
		t.Fatalf("une config illisible ne doit pas vider l'écran : %v", err)
	}
	if res.Weights != eligibility.DefaultWeights() {
		t.Fatalf("défauts attendus quand la config est illisible : %+v", res.Weights)
	}
	if len(res.Items) != 1 {
		t.Fatalf("le contenu sain reste renvoyé : %+v", res)
	}
}

func TestSurfaceEligibility_CandidateReadErrorIsPropagated(t *testing.T) {
	boom := errors.New("lecture impossible")
	q := &surfaceQuerier{candidatesErr: boom}
	svc := &Service{q: q}

	if _, err := svc.SurfaceEligibility(context.Background(), "discover", "viewer-1", 10); !errors.Is(err, boom) {
		t.Fatalf("erreur de lecture attendue propagée, obtenu %v", err)
	}
}
