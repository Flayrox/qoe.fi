package abuse

// Éligibilité de recommandation (fiche 06 §9) : refus dur vs limitation de
// distribution motivée — jamais de suppression silencieuse.
//
// Deux périmètres, deux effets :
//   - LIMITATION (découverte uniquement) : un verdict humain
//     `limit_distribution` non expiré retire les contenus de l'auteur / la
//     publication des surfaces de DÉCOUVERTE (discover, recommended) mais
//     les laisse dans le flux SUIVI. Le lecteur qui a choisi de suivre
//     continue de voir — la mesure freine l'amplification, pas le choix.
//   - REFUS DUR (partout, suivi inclus) : `isSuspended` (existant) ou verdict
//     humain `suspend` non expiré. Le danger documenté n'atteint personne,
//     pas même les abonnés.
//
// Les sujets éligibles sont `user:<id>` (l'auteur et tous ses contenus) et
// `publication:<id>` (tous ses contenus). L'état dérive des verdicts traçés
// (RiskDecision) : pas de booléen « trusted » dupliqué qui divergerait.
//
// RÉSIDU DOCUMENTÉ (changement produit, pas technique) : le flux suivi
// exclut encore les `isShadowbanned` sans le dire au lecteur — suppression
// silencieuse du suivi, interdite par la fiche. La mécanique ci-dessous ne
// le corrige pas : il faut une UX (« cet auteur suivi est restreint jusqu'au
// ... »), pas un filtre de plus. Voir le commentaire dans home_feed.go.
const (
	// SubjectUser : un auteur (ses articles et pensées). L'identifiant est
	// l'id texte de l'utilisateur (comparé en ::text côté SQL).
	SubjectUser = "user"
)

// discoveryResults limite la découverte ; hardBlockResults bloque partout.
var discoveryResults = []Decision{DecisionLimitDistribution, DecisionSuspend}
var hardBlockResults = []Decision{DecisionSuspend}

// exclusionFragment construit le fragment NOT EXISTS pour les alias SQL
// donnés (auteur, article-optionnel). Les résultats sont une liste fermée
// interne — jamais d'entrée externe (pas d'injection possible).
func exclusionFragment(authorAlias, articleAlias string, results []Decision) string {
	in := ""
	for i, r := range results {
		if i > 0 {
			in += ", "
		}
		in += "'" + string(r) + "'"
	}
	subject := `(rd."subjectType" = '` + SubjectUser + `' AND rd."subjectId" = ` + authorAlias + `.id::text)`
	if articleAlias != "" {
		subject += ` OR (rd."subjectType" = '` + SubjectPublication + `' AND rd."subjectId" = ` + articleAlias + `."publicationId")`
	}
	return `AND NOT EXISTS (
		  SELECT 1 FROM "RiskDecision" rd
		  WHERE rd."decidedBy" = 'human'
		    AND rd."result" IN (` + in + `)
		    AND (rd."expiresAt" IS NULL OR rd."expiresAt" > now())
		    AND (` + subject + `)
		)`
}

// DiscoveryExclusionArticle s'ajoute aux requêtes de découverte portant sur
// des articles (alias auteur `u`, alias article `a` avec publicationId) :
// retire les auteurs/publications en limitation ou refus dur.
func DiscoveryExclusionArticle(authorAlias, articleAlias string) string {
	return exclusionFragment(authorAlias, articleAlias, discoveryResults)
}

// DiscoveryExclusionThought s'ajoute aux requêtes de découverte portant sur
// des pensées (alias auteur `u`, alias pensée `p` — sans publication) : même
// effet, sujet auteur uniquement.
func DiscoveryExclusionThought(authorAlias, thoughtAlias string) string {
	_ = thoughtAlias // l'alias pensée est documenté pour l'appelant ; le sujet est l'auteur
	return exclusionFragment(authorAlias, "", discoveryResults)
}

// FollowingExclusionArticle s'ajoute aux requêtes du flux SUIVI (alias
// auteur `u`, alias article `a`) : seul le refus dur (`suspend` humain)
// s'applique — une limitation de distribution ne retire JAMAIS un contenu
// du flux suivi (c'est son sens : freiner l'amplification, pas le choix).
func FollowingExclusionArticle(authorAlias, articleAlias string) string {
	return exclusionFragment(authorAlias, articleAlias, hardBlockResults)
}

// FollowingExclusionThought : même effet pour les pensées (alias auteur
// `u`, alias pensée `p`).
func FollowingExclusionThought(authorAlias, thoughtAlias string) string {
	_ = thoughtAlias
	return exclusionFragment(authorAlias, "", hardBlockResults)
}
