// Package identity expose la nature publique d'un compte : une personne
// physique (PERSONAL) ou un compte média (MEDIA). C'est la même valeur que
// consomme SafeAvatar côté UI, donc la forme d'un avatar vient toujours de la
// donnée — jamais de la surface qui le dessine.
package identity

const (
	Personal = "PERSONAL"
	Media    = "MEDIA"
)

// FromPublisherType dérive l'identité publique d'un auteur d'article depuis
// le type de SA publication : MEDIA pour une publication média, PERSONAL sinon.
// C'est la seule règle correcte pour un article : un membre de média qui publie
// sur sa publication personnelle reste une personne.
func FromPublisherType(publicationType string) string {
	if publicationType == Media {
		return Media
	}
	return Personal
}
