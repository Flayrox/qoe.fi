// Package publicurl centralise la racine publique des liens sortants (emails de
// confirmation, désinscriptions signées, campagnes). Une seule variable
// d'environnement la pilote, donc changer d'hôte ne touche aucun appelant.
package publicurl

import (
	"os"
	"strings"
)

// DefaultBase est l'origine de production. Elle n'est utilisée que si
// QOE_CONFIRM_BASE_URL est absent (self-host et staging la surchargent).
const DefaultBase = "https://api.qoe.fi"

// Base retourne la racine publique sans slash final ni espace parasite :
// concaténer un chemin ne peut pas produire de double slash.
func Base() string {
	base := strings.TrimSpace(os.Getenv("QOE_CONFIRM_BASE_URL"))
	if base == "" {
		base = DefaultBase
	}
	return strings.TrimRight(base, "/")
}
