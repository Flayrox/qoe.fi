// Ce fichier ajoute la décision d'éligibilité L43 au package eligibility.
//
// Le reste du package produit des prédicats SQL (filtres durs). Ici on décide,
// en Go pur et sans requête, si un contenu peut apparaître sur une surface
// donnée (suivis, découverte, recommandé, fil, profil, réponses), avec :
//
//   - une raison machine (`Reason`) et une raison lisible (`Why`) — plus de
//     booléen opaque ni d'exclusion muette ;
//   - un score transparent, somme pondérée de fraîcheur, d'engagement et
//     d'affinité, dont les poids viennent de `SystemConfig` (voir
//     WeightsFromConfig) avec des défauts sûrs ;
//   - un tri stable et total (score, puis date, puis id) : deux contenus de
//     même score gardent un ordre déterministe, donc paginer ne duplique ni ne
//     perd d'élément.
//
// Aucune règle n'est réimplémentée ailleurs : les appelants SQL continuent
// d'utiliser les prédicats du même package, et les appelants Go utilisent
// Decide/Rank. Une surface inconnue est refusée explicitement.
package eligibility

import (
	"errors"
	"math"
	"sort"
	"strconv"
	"strings"
	"time"
)

// ErrUnknownSurface est renvoyé pour une surface non répertoriée.
var ErrUnknownSurface = errors.New("surface inconnue")

// Surface nomme une surface de diffusion du contenu. Les valeurs reprennent
// les noms réellement utilisés par les flux et l'interface, jamais des
// synonymes inventés.
type Surface string

const (
	// SurfaceFollowing : onglet « Suivis » (abonnements).
	SurfaceFollowing Surface = "following"
	// SurfaceDiscover : onglet « Explorer » / tendances.
	SurfaceDiscover Surface = "discover"
	// SurfaceRecommended : onglet « Recommandé » (moteur personnalisé).
	SurfaceRecommended Surface = "recommended"
	// SurfaceThread : fil d'une pensée ou d'un article.
	SurfaceThread Surface = "thread"
	// SurfaceProfile : contenus d'un profil.
	SurfaceProfile Surface = "profile"
	// SurfaceReplies : onglet « Réponses » d'un profil.
	SurfaceReplies Surface = "replies"
)

// Surfaces liste les surfaces connues (ordre stable, utile aux tests et à
// l'administration).
func Surfaces() []Surface {
	return []Surface{
		SurfaceFollowing,
		SurfaceDiscover,
		SurfaceRecommended,
		SurfaceThread,
		SurfaceProfile,
		SurfaceReplies,
	}
}

// ParseSurface valide une surface demandée par un client. Une valeur vide ou
// inconnue est refusée : mieux vaut une erreur explicite qu'un défaut
// silencieux qui ferait fuiter du contenu sur la mauvaise surface.
func ParseSurface(raw string) (Surface, error) {
	s := Surface(strings.TrimSpace(strings.ToLower(raw)))
	for _, known := range Surfaces() {
		if s == known {
			return s, nil
		}
	}
	return "", ErrUnknownSurface
}

// Reason est la raison machine d'une décision (stable, journalisable).
type Reason string

const (
	ReasonEligible       Reason = "eligible"
	ReasonDeleted        Reason = "deleted"
	ReasonDraft          Reason = "draft"
	ReasonModerated      Reason = "moderated"
	ReasonHiddenByAuthor Reason = "hidden_by_author"
	ReasonSuspended      Reason = "suspended"
	ReasonRestricted     Reason = "restricted"
	ReasonBlocked        Reason = "blocked"
	ReasonMuted          Reason = "muted"
	ReasonMutedWord      Reason = "muted_word"
	ReasonPrivateProfile Reason = "private_profile"
	ReasonNotFollowing   Reason = "not_following"
	ReasonOutOfSurface   Reason = "out_of_surface"
	ReasonTooOld         Reason = "too_old"
	ReasonLowScore       Reason = "low_score"
)

// Candidate regroupe les faits nécessaires à une décision. Il ne contient que
// des données déjà filtrées par les requêtes (aucun secret, aucun contenu) :
// la décision peut donc être journalisée sans risque.
type Candidate struct {
	PostID   string
	AuthorID string

	CreatedAt time.Time

	// Visibility reprend les valeurs de `Post.visibility` : public,
	// followers, private. Une visibilité vide est traitée comme public.
	Visibility string

	IsDraft             bool
	IsDeleted           bool
	IsHiddenByModerator bool
	IsHiddenByAuthor    bool
	AuthorSuspended     bool
	AuthorRestricted    bool
	Blocked             bool
	Muted               bool
	MutedWord           bool
	ProfilePrivate      bool
	ViewerIsAuthor      bool
	ViewerFollowsAuthor bool
	RootArticleID       string
	LikeCount           int
	ReplyCount          int
	RepostCount         int
}

// Clés SystemConfig des poids de ranking par surface. Mêmes conventions que le
// reste du moteur (`feed.*`) : une clé absente ou invalide retombe sur le
// défaut borné, sans redéploiement.
const (
	KeyFreshWeight      = "feed.rank_fresh"
	KeyEngagementWeight = "feed.rank_engagement"
	KeyAffinityWeight   = "feed.rank_affinity"
	KeyMinScore         = "feed.rank_min_score"
	KeyMaxAgeDays       = "feed.rank_max_age_days"
)

// Weights est la pondération transparente du ranking d'une surface.
type Weights struct {
	Fresh      float64 `json:"fresh"`
	Engagement float64 `json:"engagement"`
	Affinity   float64 `json:"affinity"`
	// MinScore écarte les contenus dont le score est strictement inférieur au
	// seuil. 0 = pas de seuil (un score nul reste éligible).
	MinScore float64 `json:"minScore"`
	// MaxAgeDays borne l'âge accepté. 0 = pas de limite d'âge.
	MaxAgeDays int `json:"maxAgeDays"`
}

// DefaultWeights renvoie des poids sûrs : l'engagement domine légèrement la
// fraîcheur, l'affinité ne pénalise personne, aucun seuil n'exclut à tort.
func DefaultWeights() Weights {
	return Weights{Fresh: 0.35, Engagement: 0.65, Affinity: 0, MinScore: 0, MaxAgeDays: 7}
}

// WeightsFromConfig lit les clés `feed.rank_*` d'un map SystemConfig. Les
// valeurs absentes ou invalides conservent le défaut : une config partielle ne
// casse jamais le ranking.
func WeightsFromConfig(values map[string]string) Weights {
	w := DefaultWeights()
	if v, ok := values[KeyFreshWeight]; ok {
		w.Fresh = parseUnit(v, w.Fresh)
	}
	if v, ok := values[KeyEngagementWeight]; ok {
		w.Engagement = parseUnit(v, w.Engagement)
	}
	if v, ok := values[KeyAffinityWeight]; ok {
		w.Affinity = parseUnit(v, w.Affinity)
	}
	if v, ok := values[KeyMinScore]; ok {
		w.MinScore = parseUnit(v, w.MinScore)
	}
	if v, ok := values[KeyMaxAgeDays]; ok {
		w.MaxAgeDays = parseNonNegativeInt(v, w.MaxAgeDays)
	}
	return w
}

// parseUnit lit un poids dans [0,1] ; toute autre valeur rend le défaut.
func parseUnit(raw string, def float64) float64 {
	f, err := strconv.ParseFloat(strings.TrimSpace(raw), 64)
	if err != nil || math.IsNaN(f) || math.IsInf(f, 0) || f < 0 || f > 1 {
		return def
	}
	return f
}

// parseNonNegativeInt lit un entier >= 0 ; toute autre valeur rend le défaut.
func parseNonNegativeInt(raw string, def int) int {
	n, err := strconv.Atoi(strings.TrimSpace(raw))
	if err != nil || n < 0 {
		return def
	}
	return n
}

// Decision est le verdict pour un contenu sur une surface.
type Decision struct {
	Surface  Surface `json:"surface"`
	PostID   string  `json:"postId"`
	Eligible bool    `json:"eligible"`
	Reason   Reason  `json:"reason"`
	// Why est la raison lisible, prête à afficher (état vide, debug, admin).
	Why   string  `json:"why"`
	Score float64 `json:"score"`
}

// Result est le classement complet d'une surface : retenus et exclus, chacun
// avec sa raison. Les exclus ne sont jamais renvoyés au lecteur par les flux
// publics ; ce type sert aux surfaces d'explication (admin, debug, tests).
type Result struct {
	Surface  Surface    `json:"surface"`
	Weights  Weights    `json:"weights"`
	Items    []Decision `json:"items"`
	Excluded []Decision `json:"excluded"`
}

// Decide tranche l'éligibilité d'un contenu sur une surface et explique la
// décision. L'ordre des règles est significatif : la première raison gagne, du
// plus factuel (supprimé) au plus contextuel (surface).
func Decide(surface Surface, c Candidate, w Weights, now time.Time) Decision {
	d := Decision{Surface: surface, PostID: c.PostID, Score: c.score(w, now)}

	reject := func(reason Reason) Decision {
		d.Eligible = false
		d.Reason = reason
		d.Why = WhyFor(reason, surface)
		return d
	}

	switch {
	case c.IsDeleted:
		return reject(ReasonDeleted)
	case c.IsDraft:
		return reject(ReasonDraft)
	case c.IsHiddenByModerator:
		return reject(ReasonModerated)
	case c.IsHiddenByAuthor:
		return reject(ReasonHiddenByAuthor)
	case c.AuthorSuspended:
		return reject(ReasonSuspended)
	case c.AuthorRestricted:
		return reject(ReasonRestricted)
	case c.Blocked:
		return reject(ReasonBlocked)
	case c.Muted:
		return reject(ReasonMuted)
	case c.MutedWord:
		return reject(ReasonMutedWord)
	}

	// Visibilité : un profil privé (ou un post réservé aux abonnés) n'est
	// lisible que par l'auteur et ses abonnés.
	visibility := strings.ToLower(strings.TrimSpace(c.Visibility))
	if visibility == "" {
		visibility = "public"
	}
	privileged := c.ViewerIsAuthor || c.ViewerFollowsAuthor
	if (c.ProfilePrivate || visibility == "private" || visibility == "followers") && !privileged {
		return reject(ReasonPrivateProfile)
	}

	// Un commentaire d'article n'a de sens que là où son contexte est rendu :
	// le fil, le profil et ses réponses. Les feeds généraux l'excluent tant
	// que le contexte d'article n'y est pas assemblé (L43 le nomme).
	if c.RootArticleID != "" && isFeedSurface(surface) {
		return reject(ReasonOutOfSurface)
	}

	if surface == SurfaceFollowing && !privileged {
		return reject(ReasonNotFollowing)
	}

	if w.MaxAgeDays > 0 {
		maxAge := time.Duration(w.MaxAgeDays) * 24 * time.Hour
		if !c.CreatedAt.IsZero() && now.Sub(c.CreatedAt) > maxAge {
			return reject(ReasonTooOld)
		}
	}

	if w.MinScore > 0 && d.Score < w.MinScore {
		return reject(ReasonLowScore)
	}

	d.Eligible = true
	d.Reason = ReasonEligible
	d.Why = WhyFor(ReasonEligible, surface)
	return d
}

// Rank classe les contenus d'une surface. Les retenus sortent triés par score
// décroissant, puis par date décroissante, puis par id décroissant : l'ordre
// est total, donc stable d'une page à l'autre même à score égal. Les exclus
// sont rendus séparément avec leur raison, jamais mélangés aux retenus.
func Rank(surface Surface, candidates []Candidate, w Weights, now time.Time) (Result, error) {
	if _, err := ParseSurface(string(surface)); err != nil {
		return Result{}, err
	}
	res := Result{Surface: surface, Weights: w, Items: []Decision{}, Excluded: []Decision{}}
	for _, c := range candidates {
		d := Decide(surface, c, w, now)
		if d.Eligible {
			res.Items = append(res.Items, d)
		} else {
			res.Excluded = append(res.Excluded, d)
		}
	}
	byScore := func(list []Decision) {
		sort.SliceStable(list, func(i, j int) bool {
			if list[i].Score != list[j].Score {
				return list[i].Score > list[j].Score
			}
			ti, tj := candidateTime(candidates, list[i].PostID), candidateTime(candidates, list[j].PostID)
			if !ti.Equal(tj) {
				return ti.After(tj)
			}
			return list[i].PostID > list[j].PostID
		})
	}
	byScore(res.Items)
	byScore(res.Excluded)
	return res, nil
}

// candidateTime retrouve la date de création d'un candidat déjà décidé.
// Les ids sont uniques par page (contrainte des requêtes de flux) ; en cas de
// doublon, la première occurrence fait foi, ce qui reste déterministe.
func candidateTime(candidates []Candidate, id string) time.Time {
	for _, c := range candidates {
		if c.PostID == id {
			return c.CreatedAt
		}
	}
	return time.Time{}
}

// isFeedSurface indique les surfaces générales, où un commentaire d'article
// n'a pas encore son contexte de rendu.
func isFeedSurface(surface Surface) bool {
	switch surface {
	case SurfaceFollowing, SurfaceDiscover, SurfaceRecommended:
		return true
	default:
		return false
	}
}

// score calcule le score transparent d'un candidat. Les poids sont normalisés
// quand leur somme est positive ; une pondération nulle rend un score nul (et
// laisse le tri à la date et à l'id), ce qui est un choix explicite de config.
func (c Candidate) score(w Weights, now time.Time) float64 {
	fresh := clamp01(w.Fresh)
	engagement := clamp01(w.Engagement)
	affinity := clamp01(w.Affinity)
	sum := fresh + engagement + affinity
	if sum <= 0 {
		return 0
	}

	freshScore := 0.0
	if w.MaxAgeDays > 0 && !c.CreatedAt.IsZero() {
		age := now.Sub(c.CreatedAt)
		window := time.Duration(w.MaxAgeDays) * 24 * time.Hour
		freshScore = clamp01(1 - age.Hours()/window.Hours())
	} else if c.CreatedAt.IsZero() {
		freshScore = 0
	} else {
		freshScore = 1
	}

	raw := float64(c.LikeCount) + 2*float64(c.ReplyCount) + 3*float64(c.RepostCount)
	engagementScore := clamp01(math.Log1p(raw) / math.Log1p(100))

	affinityScore := 0.0
	if c.ViewerIsAuthor || c.ViewerFollowsAuthor {
		affinityScore = 1
	}

	return (fresh*freshScore + engagement*engagementScore + affinity*affinityScore) / sum
}

// clamp01 ramène une valeur dans [0,1] (les configs négatives ne doivent pas
// inverser le classement).
func clamp01(v float64) float64 {
	if math.IsNaN(v) || v < 0 {
		return 0
	}
	if v > 1 {
		return 1
	}
	return v
}

// WhyFor rend la raison lisible d'une décision, en français, sans jargon
// interne. Une raison inconnue rend un texte neutre plutôt qu'un code brut.
func WhyFor(reason Reason, surface Surface) string {
	switch reason {
	case ReasonDeleted:
		return "Message supprimé par son auteur."
	case ReasonDraft:
		return "Brouillon non publié."
	case ReasonModerated:
		return "Masqué par la modération."
	case ReasonHiddenByAuthor:
		return "Masqué par l’auteur."
	case ReasonSuspended:
		return "Compte suspendu : contenu masqué."
	case ReasonRestricted:
		return "Compte restreint : contenu masqué jusqu’à réexamen."
	case ReasonBlocked:
		return "Compte bloqué : contenu masqué."
	case ReasonMuted:
		return "Vous masquez les contenus de ce compte."
	case ReasonMutedWord:
		return "Contient un mot que vous avez masqué."
	case ReasonPrivateProfile:
		return "Profil privé : contenu réservé aux abonnés."
	case ReasonNotFollowing:
		return "Vous ne suivez pas ce compte."
	case ReasonOutOfSurface:
		return "Commentaire d’article : hors de cette surface."
	case ReasonTooOld:
		return "Trop ancien pour cette surface."
	case ReasonLowScore:
		return "Score insuffisant pour cette surface."
	case ReasonEligible:
		switch surface {
		case SurfaceFollowing:
			return "Vous suivez l’auteur."
		case SurfaceDiscover:
			return "Sélectionné pour la découverte."
		case SurfaceRecommended:
			return "Recommandé pour vous."
		case SurfaceThread:
			return "Réponse visible dans ce fil."
		case SurfaceProfile, SurfaceReplies:
			return "Publié par ce compte."
		}
		return "Éligible sur cette surface."
	default:
		return "Contenu non disponible."
	}
}
