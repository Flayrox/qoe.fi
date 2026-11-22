// Package publicurl centralise les racines publiques des liens sortants (emails de
// confirmation, désinscriptions signées, campagnes, notifications). Chacune est
// pilotée par une seule variable d'environnement : changer d'hôte ne touche
// aucun appelant, et un déploiement self-hosté n'envoie jamais ses liens vers
// l'origine de production.
package publicurl

import (
	"net/url"
	"os"
	"strings"
)

// Défauts de production. Ils ne servent que si la variable correspondante est
// absente (self-host et staging la surchargent).
const (
	// DefaultBase : origine de l'API (chemins /v1/confirm, /v1/features/…).
	DefaultBase = "https://api.qoe.fi"
	// DefaultReader : origine de lecture publique (articles, profils).
	DefaultReader = "https://qoe.fi"
	// DefaultStudio : origine du studio créateur (édition, médias).
	DefaultStudio = "https://studio.qoe.fi"
)

// Base retourne la racine publique de l'API sans slash final ni espace parasite.
func Base() string { return origin("QOE_CONFIRM_BASE_URL", DefaultBase) }

// Reader retourne l'origine publique de lecture (liens d'e-mail de notification).
func Reader() string { return origin("QOE_PUBLIC_URL", DefaultReader) }

// Studio retourne l'origine du studio créateur (liens d'édition).
func Studio() string { return origin("QOE_STUDIO_URL", DefaultStudio) }

// origin lit une origine absolue http(s) et retombe sur le défaut sinon : une
// valeur sans schéma ou relative produirait des liens inutilisables dans un
// client mail (concaténation d'un chemin sur un hôte nu).
func origin(envKey, def string) string {
	raw := strings.TrimSpace(os.Getenv(envKey))
	if raw == "" {
		return def
	}
	u, err := url.Parse(raw)
	if err != nil || u.Host == "" || (u.Scheme != "http" && u.Scheme != "https") || u.User != nil {
		return def
	}
	return strings.TrimRight(raw, "/")
}
