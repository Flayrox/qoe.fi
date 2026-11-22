// Package clientip résout l'adresse IP d'un client HTTP derrière un proxy.
//
// `X-Forwarded-For` est contrôlé par le client : notre proxy y **ajoute** son
// pair, il ne remplace pas la valeur reçue. Une lecture naïve (« premier
// élément ») laisse donc un attaquant choisir son IP — et changer de seau de
// rate-limiting à chaque requête. On lit donc la chaîne **à l'envers**, en
// sautant les sauts de proxys de confiance (TRUSTED_PROXY_HOPS), et on ne garde
// que des adresses IP valides : une entrée fantaisiste est ignorée plutôt que
// propagée dans les clés de quota et les journaux d'audit.
package clientip

import (
	"net"
	"net/http"
	"net/netip"
	"os"
	"strconv"
	"strings"
)

// EnvTrustedHops nomme la variable qui décrit le nombre de proxys devant l'API.
const EnvTrustedHops = "TRUSTED_PROXY_HOPS"

// DefaultTrustedHops correspond au déploiement standard : Caddy en frontal.
const DefaultTrustedHops = 1

// maxHops borne la configuration : au-delà, un en-tête forgé ferait lire
// n'importe quelle position de la chaîne.
const maxHops = 16

// Hops lit TRUSTED_PROXY_HOPS (défaut 1, borné entre 1 et maxHops).
func Hops() int {
	n, err := strconv.Atoi(strings.TrimSpace(os.Getenv(EnvTrustedHops)))
	if err != nil || n < 1 {
		return DefaultTrustedHops
	}
	if n > maxHops {
		return maxHops
	}
	return n
}

// FromRequest résout l'IP client avec le nombre de sauts configuré.
func FromRequest(r *http.Request) string {
	return FromRequestHops(r, Hops())
}

// FromRequestHops résout l'IP client en sautant `hops` proxys de confiance.
// Règle : le dernier saut est celui de notre proxy ; on remonte la chaîne de
// `hops` entrées valides. À défaut d'en-tête exploitable, on retombe sur
// l'adresse de la connexion TCP (jamais falsifiable).
func FromRequestHops(r *http.Request, hops int) string {
	if r == nil {
		return "unknown"
	}
	if hops < 1 {
		hops = DefaultTrustedHops
	}
	if ip := forwarded(r.Header.Values("X-Forwarded-For"), hops); ip != "" {
		return ip
	}
	if ip := parseIP(r.Header.Get("X-Real-IP")); ip != "" {
		return ip
	}
	if host := strings.TrimSpace(r.RemoteAddr); host != "" {
		if parsed, _, err := net.SplitHostPort(host); err == nil {
			if ip := parseIP(parsed); ip != "" {
				return ip
			}
			return parsed
		}
		return host
	}
	return "unknown"
}

// forwarded lit toutes les lignes X-Forwarded-For, ne garde que les adresses
// valides, et retourne celle située `hops` positions avant la fin.
func forwarded(values []string, hops int) string {
	if len(values) == 0 {
		return ""
	}
	entries := make([]string, 0, len(values)*2)
	for _, raw := range values {
		for _, part := range strings.Split(raw, ",") {
			if ip := parseIP(part); ip != "" {
				entries = append(entries, ip)
			}
		}
	}
	if len(entries) == 0 {
		return ""
	}
	idx := len(entries) - hops
	if idx < 0 {
		// Chaîne plus courte que le nombre de proxys attendus : on prend le
		// premier saut valide plutôt que de refuser toute la requête.
		idx = 0
	}
	return entries[idx]
}

// parseIP rend la forme canonique d'une adresse IP, ou "" si l'entrée n'en est
// pas une (port, hostname, valeur arbitraire).
func parseIP(raw string) string {
	value := strings.TrimSpace(raw)
	if value == "" {
		return ""
	}
	if addr, err := netip.ParseAddr(value); err == nil {
		return addr.Unmap().WithZone("").String()
	}
	// Forme « IP:port » tolérée (certains proxys recopient l'adresse distante).
	if host, _, err := net.SplitHostPort(value); err == nil {
		if addr, parseErr := netip.ParseAddr(strings.TrimSpace(host)); parseErr == nil {
			return addr.Unmap().WithZone("").String()
		}
	}
	return ""
}
