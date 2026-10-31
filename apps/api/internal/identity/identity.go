// Package identity exposes the public nature of an account: a physical
// person (PERSONAL) or a media account (MEDIA). It is the same value consumed
// by SafeAvatar in the UI, so an avatar's shape always comes from data — never
// from the surface drawing it.
package identity

const (
	Personal = "PERSONAL"
	Media    = "MEDIA"
)

// Type returns the PUBLIC identity type for an account given whether it is an
// active member of a media. Membership is the only source of truth: a media
// publication's owner or staff member is a MEDIA identity, everyone else is a
// person.
func Type(isMedia bool) string {
	if isMedia {
		return Media
	}
	return Personal
}
