// Package textutil regroupe les utilitaires de texte partagés (troncature
// UTF-8 sûre) : une seule implémentation pour la recherche et les webhooks.
package textutil

import "unicode/utf8"

// TruncateUTF8 tronque s à au plus maxBytes octets sans couper un caractère
// multi-octets en deux. maxBytes <= 0 renvoie une chaîne vide.
func TruncateUTF8(s string, maxBytes int) string {
	if maxBytes <= 0 {
		return ""
	}
	if len(s) <= maxBytes {
		return s
	}
	cut := maxBytes
	for cut > 0 && !utf8.RuneStart(s[cut]) {
		cut--
	}
	return s[:cut]
}
