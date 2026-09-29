// Noyau anti-abus — décisions graduées et explicables (fiche 06 §9).
//
// Ce fichier est PUR (aucune base, aucune horloge externe) : les règles
// reçoivent des faits et rendent un verdict. La persistance vit dans
// store.go, les plafonds par capacité dans budget.go.
//
// Le noyau ne fournit JAMAIS un bouton universel qui mêlerait « manque de
// qualité », « danger » et « défaut de consentement » : chaque règle porte un
// vocabulaire de décision fermé, des codes de raison stables, et un auteur
// (automate ou humain). Un signal faible ne punit jamais — la sortie la plus
// basse est l'observation (les faits restent requêtables, aucun verdict).
package abuse

import "time"

// Decision est un verdict du noyau. Vocabulaire fermé de la fiche 06 §9 :
// ajouter une valeur exige une migration du CHECK `RiskDecision_result_check`
// et une entrée dans Severity ci-dessous — jamais de chaîne libre.
type Decision string

const (
	DecisionAllow             Decision = "allow"
	DecisionSlow              Decision = "slow"
	DecisionChallenge         Decision = "challenge"
	DecisionNeedsReview       Decision = "needs_review"
	DecisionLimitDistribution Decision = "limit_distribution"
	DecisionPauseSending      Decision = "pause_sending"
	DecisionSuspend           Decision = "suspend"
)

// Severity ordonne les décisions : en cas de règles concurrentes, la plus
// sévère gagne et les codes de raison se cumulent (l'explication reste
// complète même quand le verdict est unique).
func Severity(d Decision) int {
	switch d {
	case DecisionAllow:
		return 0
	case DecisionSlow:
		return 1
	case DecisionChallenge:
		return 2
	case DecisionNeedsReview:
		return 3
	case DecisionLimitDistribution:
		return 4
	case DecisionPauseSending:
		return 5
	case DecisionSuspend:
		return 6
	default:
		return -1 // inconnue : ne gagne jamais contre une décision connue
	}
}

// Fact est un fait observé (miroir mémoire d'AbuseSignal) : un type, un
// sujet, un instant. Pas de verdict, pas de score de culpabilité.
type Fact struct {
	Type        string
	SubjectType string
	SubjectID   string
	ObservedAt  time.Time
}

// BurstRule détecte une rafale : au moins Threshold faits du même type sur
// le même sujet dans Window → Result avec Reason. Exemples v1 : vagues
// d'inscriptions contre une publication (ferme de comptes), essaims de
// signalements contre une cible (campagne coordonnée — qui déclenche une
// revue priorisée, JAMAIS une sanction automatique, fiche 06 §8).
type BurstRule struct {
	// Name identifie la règle dans les journaux (ex "signup-burst").
	Name string
	// SignalType et SubjectScope cadrent la règle : elle ne compte que les
	// faits de ce type sur ce type de sujet — pas de règle attrape-tout.
	SignalType   string
	SubjectScope string
	Window       time.Duration
	Threshold    int
	Result       Decision
	// Reason est un code stable (ex "burst.signup.publication"), pas un
	// libellé : il sert au support et aux tests, jamais à expliquer les
	// seuils à un attaquant.
	Reason string
}

// FutureTolerance accepte les faits jusqu'à 1 s dans le futur : TIMESTAMP(3)
// ARRONDIR à la milliseconde, donc un fait enregistré « maintenant » peut
// être relu ~1 ms après son instant de référence — sans tolérance, le fait
// le plus récent d'une rafale sortirait de sa propre fenêtre (régression
// attrapée par le smoke dev du 29/09/2026 : 10 signaux → allow). Au-delà
// d'1 s, c'est une anomalie d'horloge, pas un arrondi : exclu.
const FutureTolerance = time.Second

// Match dit si le fait relève de la règle pour CE sujet (type + portée +
// identité du sujet + récence). L'identité est vérifiée ici même si
// l'appelant a déjà filtré : un essaim contre la cible A ne doit jamais
// faire monter le compteur de la cible B (sinon une communauté active
// serait confondue avec un raid coordonné).
func (r BurstRule) Match(f Fact, subjectType, subjectID string, now time.Time) bool {
	return f.Type == r.SignalType &&
		f.SubjectType == r.SubjectScope &&
		f.SubjectType == subjectType &&
		f.SubjectID == subjectID &&
		!f.ObservedAt.After(now.Add(FutureTolerance)) &&
		now.Sub(f.ObservedAt) <= r.Window+FutureTolerance
}

// Policy est un ensemble versionné de règles : la version est persistée avec
// chaque décision (rejouabilité, audit — fiche 06 §9).
type Policy struct {
	Name    string
	Version string
	Rules   []BurstRule
}

// Outcome est le verdict : la décision la plus sévère des règles déclenchées
// (allow si aucune), avec tous les codes de raison.
type Outcome struct {
	Decision Decision
	Reasons  []string
	Policy   string
	Version  string
}

// Evaluate applique la politique au sujet donné, sur des faits déjà chargés.
// Pure et déterministe : mêmes sujet, faits et instant → même verdict. Les
// faits d'un autre sujet sont ignorés (défense en profondeur contre une
// confusion raid/communauté active).
func (p Policy) Evaluate(subjectType, subjectID string, facts []Fact, now time.Time) Outcome {
	out := Outcome{Decision: DecisionAllow, Policy: p.Name, Version: p.Version}
	for _, rule := range p.Rules {
		count := 0
		for _, f := range facts {
			if rule.Match(f, subjectType, subjectID, now) {
				count++
			}
		}
		if count >= rule.Threshold && Severity(rule.Result) > Severity(out.Decision) {
			out.Decision = rule.Result
		}
		if count >= rule.Threshold {
			out.Reasons = append(out.Reasons, rule.Reason)
		}
	}
	return out
}

// Politique v1 : deux règles d'observation qui déclenchent une revue humaine
// priorisée (needs_review), jamais une sanction. Les seuils restent côté
// serveur — la fiche 06 §10 l'exige : ne pas aider l'attaquant à calibrer
// sous le radar. Constantes documentées, pas arbitraires :
//
//   - signup-burst : 100 inscriptions en 10 minutes sur UNE publication, c'est
//     10× le rythme d'un lancement réussi ; en dessous, c'est le succès, pas
//     une attaque. Sujet = la publication visée (ferme de comptes gonflant
//     une audience), pas les adresses (on ne punit pas des victimes).
//   - report-swarm : 10 signalements en 1 heure contre LA MÊME cible, c'est
//     le gabarit d'un raid coordonné (scénario fiche 06 §11 : « 100
//     signalements synchronisés ») ; en dessous, c'est le fonctionnement
//     normal de la modération communautaire.
//   - report-volume : 10 signalements en 1 heure par LE MÊME reporter (toutes
//     cibles), c'est le gabarit d'un raid de signalement (fiche 06 §10) —
//     l'arme est le volume du plaignant, pas la culpabilité des cibles. Le
//     dossier s'ouvre sur le reporter, jamais sur ses cibles.
var PolicyV1 = Policy{
	Name:    "abuse-core",
	Version: "v1",
	Rules: []BurstRule{
		{
			Name:         "signup-burst",
			SignalType:   SignalSignupAttempt,
			SubjectScope: SubjectPublication,
			Window:       10 * time.Minute,
			Threshold:    100,
			Result:       DecisionNeedsReview,
			Reason:       "burst.signup.publication",
		},
		{
			Name:         "report-swarm",
			SignalType:   SignalReportFiled,
			SubjectScope: SubjectReportTarget,
			Window:       time.Hour,
			Threshold:    10,
			Result:       DecisionNeedsReview,
			Reason:       "swarm.report.target",
		},
		{
			Name:         "report-volume",
			SignalType:   SignalReportVolume,
			SubjectScope: SubjectUser,
			Window:       time.Hour,
			Threshold:    10,
			Result:       DecisionNeedsReview,
			Reason:       "swarm.report.reporter",
		},
	},
}

// ValidHumanResult dit si un verdict humain clôt une revue : soit `allow`
// (classé sans suite — le faux positif mesuré de la fiche 06 §11), soit une
// escalade réelle (limitation, pause d'envois, suspension — appliquée par les
// chemins de modération existants, ici seulement tracée). `slow`,
// `challenge` et `needs_review` ne clôturent rien (ce sont des états
// transitoires, pas des verdicts) et sont refusés.
func ValidHumanResult(d Decision) bool {
	switch d {
	case DecisionAllow, DecisionLimitDistribution, DecisionPauseSending, DecisionSuspend:
		return true
	default:
		return false
	}
}

// PolicyV2 ajoute la détection d'engagement inauthentique (tranche 5 :
// contrôles contre les likes coordonnés) aux règles v1, inchangées (les
// verdicts historiques restent rejouables en v1 — c'est le sens du
// versionnement : on n'édite jamais une politique, on en publie une).
//
// Seuils likes (conservateurs — un like est un acte faible et courant) :
//   - like-swarm : 50 likes en 10 min sur LA MÊME pensée. Une viralité
//     légitime peut l'atteindre (d'où needs_review et jamais de sanction),
//     mais à l'échelle d'une petite structure c'est le gabarit d'une ferme
//     d'engagement ; en dessous, c'est le succès.
//   - like-volume : 100 likes en 1 h par le MÊME liker (toutes cibles).
//     Scroller vite est humain, liker 100 contenus/heure ne l'est
//     raisonnablement pas — et si c'est un gros lecteur, la revue le
//     classe (faux positif mesuré, pas puni).
var PolicyV2 = Policy{
	Name:    "abuse-core",
	Version: "v2",
	Rules: []BurstRule{
		PolicyV1.Rules[0],
		PolicyV1.Rules[1],
		PolicyV1.Rules[2],
		{
			Name:         "like-swarm",
			SignalType:   SignalLikeCast,
			SubjectScope: SubjectLikeTarget,
			Window:       10 * time.Minute,
			Threshold:    50,
			Result:       DecisionNeedsReview,
			Reason:       "swarm.like.target",
		},
		{
			Name:         "like-volume",
			SignalType:   SignalLikeVolume,
			SubjectScope: SubjectUser,
			Window:       time.Hour,
			Threshold:    100,
			Result:       DecisionNeedsReview,
			Reason:       "swarm.like.liker",
		},
	},
}

// CurrentPolicy est la politique appliquée par le noyau (persistance +
// évaluation). V1 reste testée et rejouable pour l'audit historique.
var CurrentPolicy = PolicyV2

const (
	// SignalLikeCast : un like a été AJOUTÉ sur une pensée (les retraits ne
	// comptent pas — retirer n'amplifie rien). Fait constaté.
	SignalLikeCast = "like.cast"
	// SignalLikeVolume : le MÊME utilisateur a liké (sujet = le liker).
	// Détecte les fermes d'engagement côté acteur.
	SignalLikeVolume = "like.volume"

	// SubjectLikeTarget : l'essaim vise une pensée likée. Le sujet réel
	// (post:<id>) est dans SubjectID.
	SubjectLikeTarget = "like_target"
)

// LikeSignalRetention : 24 h — une ferme d'engagement frappe vite ; au
// delà, les faits bruts n'apprennent plus rien (même régime que signup).
const LikeSignalRetention = 24 * time.Hour

// Types de signaux et portées de sujet (codes stables, persistés en base).
const (
	// SignalSignupAttempt : une inscription (quelque voie que ce soit) a été
	// enregistrée pour une publication. Fait constaté par nos soins.
	SignalSignupAttempt = "signup.attempt"
	// SignalReportFiled : un utilisateur a signalé une cible. Alerte, pas
	// preuve : confiance basse par construction (fiche 06 §8).
	SignalReportFiled = "report.filed"
	// SignalReportVolume : le MÊME utilisateur a signalé (sujet = le
	// reporter, pas la cible). Détecte les raids de signalement (fiche 06
	// §10) : arroser N cibles en 1 h n'est pas un usage normal — un lecteur
	// ordinaire signale rarement plus de 2-3 contenus par heure. Fait
	// constaté par nos soins (compte exact de nos propres lignes).
	SignalReportVolume = "report.volume"

	// SubjectPublication : la rafale vise une publication (son audience).
	SubjectPublication = "publication"
	// SubjectReportTarget : l'essaim vise une cible signalée. Le sujet réel
	// est dans SubjectID sous la forme reçue du signalement (<type>:<id>,
	// ex article:xxx). Convention générale : partout ailleurs, SubjectID
	// est l'identifiant BRUT et SubjectType dit de quoi il s'agit.
	SubjectReportTarget = "report_target"
)

// Confiance par source (0-100) : ce que vaut le TÉMOIN, pas la culpabilité
// de la cible. Un fait que nous constatons nous-mêmes vaut plus qu'une
// alerte dont l'auteur peut être coordonné.
const (
	// ConfidenceObserved : fait constaté par le serveur (inscription écrite).
	ConfidenceObserved = 70
	// ConfidenceUserReport : alerte d'un utilisateur (peut être un raid).
	ConfidenceUserReport = 30
)

// Rétention des signaux (minimisation fiche 06 §9 : pas de fichier
// comportemental perpétuel). Les verdicts (RiskDecision) vivent plus
// longtemps : ce sont des actes traçables, pas des observations.
const (
	// SignupSignalRetention : 24 h — une ferme de comptes frappe vite ; au
	// delà, les faits bruts n'apprennent plus rien.
	SignupSignalRetention = 24 * time.Hour
	// ReportSignalRetention : 7 jours — une campagne de signalements peut
	// s'étaler sur plusieurs jours avant le pic.
	ReportSignalRetention = 7 * 24 * time.Hour
)
