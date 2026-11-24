package eligibility

import (
	"errors"
	"math"
	"testing"
	"time"
)

func baseCandidate() Candidate {
	return Candidate{
		PostID:      "post-1",
		AuthorID:    "author-1",
		CreatedAt:   time.Date(2026, 11, 24, 10, 0, 0, 0, time.UTC),
		Visibility:  "public",
		LikeCount:   4,
		ReplyCount:  1,
		RepostCount: 0,
	}
}

var fixedNow = time.Date(2026, 11, 24, 12, 0, 0, 0, time.UTC)

func TestParseSurface(t *testing.T) {
	for _, raw := range []string{"following", "DISCOVER", " Recommended ", "thread", "profile", "replies"} {
		if _, err := ParseSurface(raw); err != nil {
			t.Fatalf("surface %q refusée : %v", raw, err)
		}
	}
	for _, raw := range []string{"", "home", "feed", "explore"} {
		if _, err := ParseSurface(raw); !errors.Is(err, ErrUnknownSurface) {
			t.Fatalf("surface %q devrait être refusée (err=%v)", raw, err)
		}
	}
}

func TestRank_UnknownSurfaceRejectedWithoutPanic(t *testing.T) {
	res, err := Rank(Surface("home"), []Candidate{baseCandidate()}, DefaultWeights(), fixedNow)
	if !errors.Is(err, ErrUnknownSurface) {
		t.Fatalf("erreur attendue ErrUnknownSurface, obtenu %v", err)
	}
	if len(res.Items) != 0 || len(res.Excluded) != 0 {
		t.Fatalf("un classement refusé ne doit rien renvoyer : %+v", res)
	}
}

func TestDecide_NominalExplainsRetention(t *testing.T) {
	c := baseCandidate()
	c.ViewerFollowsAuthor = true

	d := Decide(SurfaceFollowing, c, DefaultWeights(), fixedNow)

	if !d.Eligible || d.Reason != ReasonEligible {
		t.Fatalf("candidat suivi attendu éligible : %+v", d)
	}
	if d.Why != "Vous suivez l’auteur." {
		t.Fatalf("why inattendu : %q", d.Why)
	}
	if d.Score <= 0 || d.Score > 1 {
		t.Fatalf("score hors bornes : %v", d.Score)
	}
}

func TestDecide_HardFiltersGiveASpecificReason(t *testing.T) {
	cases := []struct {
		name   string
		mutate func(*Candidate)
		reason Reason
		why    string
	}{
		{"supprimé", func(c *Candidate) { c.IsDeleted = true }, ReasonDeleted, "Message supprimé par son auteur."},
		{"brouillon", func(c *Candidate) { c.IsDraft = true }, ReasonDraft, "Brouillon non publié."},
		{"modération", func(c *Candidate) { c.IsHiddenByModerator = true }, ReasonModerated, "Masqué par la modération."},
		{"masqué auteur", func(c *Candidate) { c.IsHiddenByAuthor = true }, ReasonHiddenByAuthor, "Masqué par l’auteur."},
		{"suspendu", func(c *Candidate) { c.AuthorSuspended = true }, ReasonSuspended, "Compte suspendu : contenu masqué."},
		{"restreint", func(c *Candidate) { c.AuthorRestricted = true }, ReasonRestricted, "Compte restreint : contenu masqué jusqu’à réexamen."},
		{"bloqué", func(c *Candidate) { c.Blocked = true }, ReasonBlocked, "Compte bloqué : contenu masqué."},
		{"sourdine", func(c *Candidate) { c.Muted = true }, ReasonMuted, "Vous masquez les contenus de ce compte."},
		{"mot masqué", func(c *Candidate) { c.MutedWord = true }, ReasonMutedWord, "Contient un mot que vous avez masqué."},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			c := baseCandidate()
			c.ViewerFollowsAuthor = true
			tc.mutate(&c)
			d := Decide(SurfaceFollowing, c, DefaultWeights(), fixedNow)
			if d.Eligible || d.Reason != tc.reason {
				t.Fatalf("décision attendue %s : %+v", tc.reason, d)
			}
			if d.Why != tc.why {
				t.Fatalf("why attendu %q, obtenu %q", tc.why, d.Why)
			}
		})
	}
}

func TestDecide_DeletedBeatsModeration(t *testing.T) {
	c := baseCandidate()
	c.IsDeleted = true
	c.IsHiddenByModerator = true
	if d := Decide(SurfaceThread, c, DefaultWeights(), fixedNow); d.Reason != ReasonDeleted {
		t.Fatalf("la règle la plus factuelle doit gagner, obtenu %s", d.Reason)
	}
}

func TestDecide_PrivateProfileNeedsAuthorOrFollow(t *testing.T) {
	c := baseCandidate()
	c.ProfilePrivate = true

	if d := Decide(SurfaceProfile, c, DefaultWeights(), fixedNow); d.Eligible || d.Reason != ReasonPrivateProfile {
		t.Fatalf("profil privé sans lien attendu exclu : %+v", d)
	}

	c.ViewerFollowsAuthor = true
	if d := Decide(SurfaceProfile, c, DefaultWeights(), fixedNow); !d.Eligible {
		t.Fatalf("abonné d'un profil privé attendu éligible : %+v", d)
	}
}

func TestDecide_FollowersVisibilityIsLimitedToPrivilegedViewers(t *testing.T) {
	c := baseCandidate()
	c.Visibility = "followers"
	if d := Decide(SurfaceThread, c, DefaultWeights(), fixedNow); d.Reason != ReasonPrivateProfile {
		t.Fatalf("post followers visible par un visiteur : %+v", d)
	}
	c.ViewerIsAuthor = true
	if d := Decide(SurfaceThread, c, DefaultWeights(), fixedNow); !d.Eligible {
		t.Fatalf("l'auteur doit voir son post followers : %+v", d)
	}
}

func TestDecide_ArticleCommentOnlyOnContextSurfaces(t *testing.T) {
	c := baseCandidate()
	c.ViewerFollowsAuthor = true
	c.RootArticleID = "article-1"

	if d := Decide(SurfaceFollowing, c, DefaultWeights(), fixedNow); d.Reason != ReasonOutOfSurface {
		t.Fatalf("commentaire d'article attendu hors des feeds : %+v", d)
	}
	if d := Decide(SurfaceDiscover, c, DefaultWeights(), fixedNow); d.Reason != ReasonOutOfSurface {
		t.Fatalf("commentaire d'article attendu hors découverte : %+v", d)
	}
	for _, surface := range []Surface{SurfaceThread, SurfaceProfile, SurfaceReplies} {
		if d := Decide(surface, c, DefaultWeights(), fixedNow); !d.Eligible {
			t.Fatalf("commentaire d'article attendu éligible sur %s : %+v", surface, d)
		}
	}
}

func TestDecide_FollowingRequiresAFollow(t *testing.T) {
	d := Decide(SurfaceFollowing, baseCandidate(), DefaultWeights(), fixedNow)
	if d.Reason != ReasonNotFollowing {
		t.Fatalf("suivis sans abonnement attendu exclu : %+v", d)
	}
}

func TestDecide_AgeWindow(t *testing.T) {
	c := baseCandidate()
	c.CreatedAt = fixedNow.Add(-8 * 24 * time.Hour)

	if d := Decide(SurfaceDiscover, c, DefaultWeights(), fixedNow); d.Reason != ReasonTooOld {
		t.Fatalf("contenu de 8 jours attendu trop vieux (fenêtre 7 j) : %+v", d)
	}
	w := DefaultWeights()
	w.MaxAgeDays = 0
	if d := Decide(SurfaceDiscover, c, w, fixedNow); !d.Eligible {
		t.Fatalf("fenêtre 0 doit désactiver la limite d'âge : %+v", d)
	}
}

func TestDecide_MinScoreThresholdAndZeroThreshold(t *testing.T) {
	c := baseCandidate()
	c.CreatedAt = fixedNow // fraîcheur maximale
	w := Weights{Fresh: 0, Engagement: 0, Affinity: 0, MinScore: 0, MaxAgeDays: 0}

	// Poids nuls : score nul, mais seuil nul → éligible. Choix explicite.
	if d := Decide(SurfaceDiscover, c, w, fixedNow); !d.Eligible || d.Score != 0 {
		t.Fatalf("poids et seuil nuls : attendu éligible à score 0, obtenu %+v", d)
	}

	// Seuil strictement positif sur un score nul → exclu, avec raison lisible.
	w.MinScore = 0.1
	if d := Decide(SurfaceDiscover, c, w, fixedNow); d.Eligible || d.Reason != ReasonLowScore {
		t.Fatalf("seuil 0.1 sur score 0 : attendu exclu, obtenu %+v", d)
	}
}

func TestWeightsFromConfig_PartialAndInvalidValuesKeepDefaults(t *testing.T) {
	def := DefaultWeights()

	partial := WeightsFromConfig(map[string]string{KeyFreshWeight: "0.9"})
	if partial.Fresh != 0.9 {
		t.Fatalf("poids fraîcheur non appliqué : %v", partial.Fresh)
	}
	if partial.Engagement != def.Engagement || partial.MaxAgeDays != def.MaxAgeDays {
		t.Fatalf("une config partielle doit garder les défauts : %+v", partial)
	}

	invalid := WeightsFromConfig(map[string]string{
		KeyFreshWeight:      "beaucoup",
		KeyEngagementWeight: "-1",
		KeyAffinityWeight:   "2",
		KeyMinScore:         "NaN",
		KeyMaxAgeDays:       "-3",
	})
	if invalid != def {
		t.Fatalf("valeurs invalides attendues ignorées : %+v", invalid)
	}

	zero := WeightsFromConfig(map[string]string{KeyEngagementWeight: "0", KeyMaxAgeDays: "0"})
	if zero.Engagement != 0 || zero.MaxAgeDays != 0 || zero.Fresh != def.Fresh {
		t.Fatalf("zéro explicite doit être conservé : %+v", zero)
	}
}

func TestDecide_ZeroConfigKeepsContentEligible(t *testing.T) {
	w := WeightsFromConfig(map[string]string{KeyFreshWeight: "0", KeyEngagementWeight: "0"})
	if d := Decide(SurfaceRecommended, baseCandidate(), w, fixedNow); !d.Eligible {
		t.Fatalf("poids nuls sans seuil : contenu attendu éligible, obtenu %+v", d)
	}
}

func TestRank_StableTiesAreDeterministic(t *testing.T) {
	w := Weights{Fresh: 0, Engagement: 0, Affinity: 0, MaxAgeDays: 0}
	same := fixedNow
	mk := func(id string, at time.Time) Candidate {
		c := baseCandidate()
		c.PostID = id
		c.CreatedAt = at
		return c
	}
	candidates := []Candidate{
		mk("post-a", same),
		mk("post-c", same.Add(-time.Hour)),
		mk("post-b", same),
	}

	first, err := Rank(SurfaceProfile, candidates, w, fixedNow)
	if err != nil {
		t.Fatal(err)
	}
	second, err := Rank(SurfaceProfile, candidates, w, fixedNow)
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"post-b", "post-a", "post-c"}
	for i := range want {
		if first.Items[i].PostID != want[i] {
			t.Fatalf("ordre stable attendu %v, obtenu %+v", want, first.Items)
		}
		if second.Items[i].PostID != want[i] {
			t.Fatalf("deux appels doivent rendre le même ordre : %+v vs %+v", first.Items, second.Items)
		}
	}
}

func TestRank_ScoresBeforeDatesAndExcludedAreSeparate(t *testing.T) {
	old := baseCandidate()
	old.PostID = "old-popular"
	old.CreatedAt = fixedNow.Add(-2 * 24 * time.Hour)
	old.LikeCount = 80
	old.ReplyCount = 12
	old.RepostCount = 6

	fresh := baseCandidate()
	fresh.PostID = "fresh-quiet"
	fresh.CreatedAt = fixedNow

	hidden := baseCandidate()
	hidden.PostID = "hidden"
	hidden.ViewerFollowsAuthor = true
	hidden.IsHiddenByModerator = true

	res, err := Rank(SurfaceDiscover, []Candidate{old, fresh, hidden}, DefaultWeights(), fixedNow)
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Items) != 2 || len(res.Excluded) != 1 {
		t.Fatalf("attendu 2 retenus / 1 exclu, obtenu %d/%d", len(res.Items), len(res.Excluded))
	}
	if res.Items[0].PostID != "old-popular" {
		t.Fatalf("le score d'engagement doit primer sur la fraîcheur seule : %+v", res.Items)
	}
	if res.Excluded[0].Reason != ReasonModerated || res.Excluded[0].Why == "" {
		t.Fatalf("l'exclusion doit porter sa raison : %+v", res.Excluded[0])
	}
}

func TestDecide_ScoreStaysBounded(t *testing.T) {
	c := baseCandidate()
	c.LikeCount, c.ReplyCount, c.RepostCount = 100000, 100000, 100000
	c.ViewerIsAuthor = true
	w := Weights{Fresh: 1, Engagement: 1, Affinity: 1, MaxAgeDays: 7}
	d := Decide(SurfaceProfile, c, w, fixedNow)
	if math.IsNaN(d.Score) || d.Score < 0 || d.Score > 1 {
		t.Fatalf("score hors [0,1] : %v", d.Score)
	}
}
