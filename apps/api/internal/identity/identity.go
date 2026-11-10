// Package identity exposes the public nature of an account: a physical
// person (PERSONAL) or a media account (MEDIA). It is the same value consumed
// by SafeAvatar in the UI, so an avatar's shape always comes from data — never
// from the surface drawing it.
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
