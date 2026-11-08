// Package eligibility centralise les prédicats SQL d'éligibilité du contenu.
//
// Chaque flux (Suivis, Explorer, Recommandé, hydratation en passe 2, moteur
// personnalisé) filtrait jusqu'ici les mêmes invisibilités avec des chaînes
// recopiées : blocage symétrique, sourdine d'auteur, mots masqués, visibilité
// du profil. Ajouter une règle (langue, âge, domaine banni) obligeait à la
// répéter partout — et à en oublier un flux.
//
// Les constructeurs sont purs (aucune requête) : ils produisent des prédicats
// paramétrés qui s'appuient sur les fonctions SQL STABLE des migrations 00078
// et 00079. Le viewer est toujours passé en paramètre lié, jamais interpolé.
package eligibility

import "fmt"

// Aliases décrit les alias SQL d'une requête de flux.
//
//	Entity      : alias de la table de contenu ("a", "p")
//	Authors     : expressions SQL rendant les ids à filtrer ("u.id",
//	              `a."authorId"`). Un article de média en expose deux : son
//	              auteur et le propriétaire de la publication.
//	Publication : expression SQL rendant l'id de publication du contenu.
//	              Vide → la publication personnelle de l'auteur est résolue.
//	Viewer      : placeholder du viewer ("$2"). Un UUID NULL (visiteur) est
//	              accepté : les fonctions SQL rendent alors false.
//	RequirePublic : active le prédicat de visibilité du profil. Réservé aux
//	              flux de découverte : dans un flux d'abonnements, la
//	              visibilité est déjà portée par l'abonnement.
type Aliases struct {
	Entity        string
	Authors       []string
	Publication   string
	Viewer        string
	RequirePublic bool
}

// ArticlePredicates renvoie les prédicats d'éligibilité d'une table Article.
func ArticlePredicates(a Aliases) string {
	content := fmt.Sprintf("COALESCE(%s.title, '') || ' ' || COALESCE(%s.content, '')", a.Entity, a.Entity)
	return predicates(a, content)
}

// ThoughtPredicates renvoie les prédicats d'éligibilité d'une table Post
// (pensées).
func ThoughtPredicates(a Aliases) string {
	return predicates(a, fmt.Sprintf("COALESCE(%s.content, '')", a.Entity))
}

// ArticleWhereClause conserve le nom de contrat du masterplan (phase 2) pour
// les appelants qui ne manipulent qu'un seul alias d'auteur. Les flux multi-
// auteurs (article de média) utilisent ArticlePredicates avec Aliases.
func ArticleWhereClause(articleAlias, authorAlias, viewerParam string, requirePublic bool) string {
	return ArticlePredicates(Aliases{
		Entity:        articleAlias,
		Authors:       []string{authorAlias},
		Viewer:        viewerParam,
		RequirePublic: requirePublic,
	})
}

// ThoughtWhereClause conserve le nom de contrat du masterplan (phase 2).
func ThoughtWhereClause(thoughtAlias, authorAlias, viewerParam string, requirePublic bool) string {
	return ThoughtPredicates(Aliases{
		Entity:        thoughtAlias,
		Authors:       []string{authorAlias},
		Viewer:        viewerParam,
		RequirePublic: requirePublic,
	})
}

func predicates(a Aliases, contentExpr string) string {
	out := ""
	for _, author := range a.Authors {
		out += fmt.Sprintf(`
  AND NOT is_blocked_bidirectional(%s, %s)
  AND NOT is_muted_by(%s, %s)`, a.Viewer, author, a.Viewer, author)
	}
	out += fmt.Sprintf(`
  AND NOT contains_muted_word(%s, %s)`, a.Viewer, contentExpr)
	if a.RequirePublic {
		out += "\n  AND " + visibilityPredicate(a)
	}
	return out
}

// visibilityPredicate reproduit la règle historique : un contenu n'est visible
// que si le profil qui le porte est PUBLIC. Pour un article de média, c'est le
// propriétaire de la publication qui décide ; pour une pensée, c'est la
// publication personnelle de l'auteur.
func visibilityPredicate(a Aliases) string {
	author := a.Entity
	if len(a.Authors) > 0 {
		author = a.Authors[0]
	}
	pubExpr := a.Publication
	if pubExpr == "" {
		pubExpr = fmt.Sprintf(`(SELECT "publicationId" FROM "User" WHERE id = %s)`, author)
	}
	return fmt.Sprintf(`COALESCE((SELECT us."profileVisibility" FROM "UserSettings" us
	                WHERE us."userId" = COALESCE(
	                  (SELECT owner.id FROM "Publication" pv JOIN "User" owner ON owner."publicationId" = pv.id WHERE pv.id = %s LIMIT 1),
	                  %s
	                )), 'PUBLIC') = 'PUBLIC'`, pubExpr, author)
}
