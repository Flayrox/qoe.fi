// Package netguard fournit des garde-fous réseau et média (anti-SSRF et
// vérification des signatures binaires / magic bytes).
package netguard

import (
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"strings"
	"syscall"
	"time"

	"github.com/qoefi/api/internal/observability"
)

const maxRedirects = 3

// ErrUnsafeURL signale une URL rejetée par la politique anti-SSRF.
var ErrUnsafeURL = errors.New("URL cible non autorisée")

var (
	reservedV4CIDRs = mustParseCIDRs([]string{
		"0.0.0.0/8",       // Réseau courant (RFC 1122)
		"10.0.0.0/8",      // Privé RFC 1918
		"100.64.0.0/10",   // CGNAT (RFC 6598)
		"127.0.0.0/8",     // Loopback
		"169.254.0.0/16",  // Link-local / métadonnées cloud
		"172.16.0.0/12",   // Privé RFC 1918
		"192.0.0.0/24",    // Assignations protocole IETF
		"192.0.2.0/24",    // TEST-NET-1
		"192.88.99.0/24",  // Relais anycast 6to4
		"192.168.0.0/16",  // Privé RFC 1918
		"198.18.0.0/15",   // Benchmarking
		"198.51.100.0/24", // TEST-NET-2
		"203.0.113.0/24",  // TEST-NET-3
		"224.0.0.0/4",     // Multicast
		"240.0.0.0/4",     // Réservé / broadcast
	})

	reservedV6CIDRs = mustParseCIDRs([]string{
		"::/96",          // Unspecified, loopback et IPv4-compatible déprécié
		"64:ff9b::/96",   // NAT64
		"64:ff9b:1::/48", // NAT64 local
		"100::/64",       // Discard-Only
		"2001::/32",      // Teredo
		"2001:2::/48",    // Benchmarking IPv6
		"2001:db8::/32",  // Documentation IPv6
		"fc00::/7",       // Unique Local IPv6 (RFC 4193)
		"fe80::/10",      // Link-local IPv6
		"fec0::/10",      // Site-local déprécié
		"ff00::/8",       // Multicast IPv6
	})
)

func mustParseCIDRs(specs []string) []*net.IPNet {
	nets := make([]*net.IPNet, 0, len(specs))
	for _, s := range specs {
		_, ipNet, err := net.ParseCIDR(s)
		if err != nil {
			panic(fmt.Sprintf("netguard: CIDR invalide %q: %v", s, err))
		}
		nets = append(nets, ipNet)
	}
	return nets
}

// IsPublicIP indique si ip est une adresse routable publique (hors loopback,
// privé RFC 1918 / RFC 4193, link-local, multicast, unspecified, CGNAT et
// plages réservées). Les adresses IPv4-mapped IPv6 sont normalisées via To4().
func IsPublicIP(ip net.IP) bool {
	if ip == nil {
		return false
	}
	cidrs := reservedV6CIDRs
	if ip4 := ip.To4(); ip4 != nil {
		ip = ip4
		cidrs = reservedV4CIDRs
	}
	if ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() ||
		ip.IsLinkLocalMulticast() || ip.IsMulticast() || ip.IsUnspecified() ||
		!ip.IsGlobalUnicast() {
		return false
	}
	for _, cidr := range cidrs {
		if cidr.Contains(ip) {
			return false
		}
	}
	return true
}

// ValidateExternalURL vérifie qu'une URL est sûre pour une requête sortante :
// schéma http/https, hôte non vide sans userinfo, pas de nom interne
// (localhost, *.local, *.internal, *.localhost) ni d'IP privée/réservée.
func ValidateExternalURL(rawURL string) error {
	if rawURL == "" {
		return fmt.Errorf("%w : URL vide", ErrUnsafeURL)
	}
	u, err := url.Parse(rawURL)
	if err != nil {
		return fmt.Errorf("%w : URL malformée", ErrUnsafeURL)
	}
	scheme := strings.ToLower(u.Scheme)
	if scheme != "http" && scheme != "https" {
		return fmt.Errorf("%w : schéma %q refusé (http ou https requis)", ErrUnsafeURL, u.Scheme)
	}
	if u.User != nil {
		return fmt.Errorf("%w : les identifiants dans l'URL sont interdits", ErrUnsafeURL)
	}

	host := strings.ToLower(strings.TrimSuffix(u.Hostname(), "."))
	if host == "" {
		return fmt.Errorf("%w : hôte manquant", ErrUnsafeURL)
	}
	if strings.Contains(host, "%") {
		return fmt.Errorf("%w : identifiant de zone IPv6 interdit", ErrUnsafeURL)
	}
	if isBlockedHostname(host) {
		return fmt.Errorf("%w : hôte interne interdit (%s)", ErrUnsafeURL, host)
	}

	if ip := net.ParseIP(host); ip != nil && !IsPublicIP(ip) {
		return fmt.Errorf("%w : adresse IP privée ou réservée (%s)", ErrUnsafeURL, host)
	}
	return nil
}

func isBlockedHostname(host string) bool {
	if host == "localhost" || host == "local" || host == "internal" {
		return true
	}
	return strings.HasSuffix(host, ".localhost") ||
		strings.HasSuffix(host, ".local") ||
		strings.HasSuffix(host, ".internal")
}

// SafeHTTPClient retourne un *http.Client protégé contre le SSRF et le DNS
// rebinding : le dialer vérifie l'IP résolue au moment de la connexion via
// Control, les proxies d'environnement sont désactivés, et les redirections
// sont revalidées (max 3 sauts).
func SafeHTTPClient(timeout time.Duration) *http.Client {
	if timeout <= 0 {
		timeout = 10 * time.Second
	}
	dialer := &net.Dialer{
		Timeout:   timeout,
		KeepAlive: 30 * time.Second,
		Control: func(_, address string, _ syscall.RawConn) error {
			host, _, err := net.SplitHostPort(address)
			if err != nil {
				return fmt.Errorf("%w : adresse cible invalide", ErrUnsafeURL)
			}
			if strings.Contains(host, "%") {
				return fmt.Errorf("%w : identifiant de zone IPv6 interdit", ErrUnsafeURL)
			}
			ip := net.ParseIP(host)
			if !IsPublicIP(ip) {
				observability.Default().IncNetGuardSSRFBlocked()
				return fmt.Errorf("%w : connexion vers une adresse non publique bloquée (%s)", ErrUnsafeURL, host)
			}
			return nil
		},
	}

	transport := &http.Transport{
		DialContext:         dialer.DialContext,
		Proxy:               nil,
		ForceAttemptHTTP2:   true,
		MaxIdleConns:        10,
		IdleConnTimeout:     30 * time.Second,
		TLSHandshakeTimeout: timeout,
	}

	return &http.Client{
		Timeout:   timeout,
		Transport: transport,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) > maxRedirects {
				return fmt.Errorf("%w : trop de redirections (max %d)", ErrUnsafeURL, maxRedirects)
			}
			return ValidateExternalURL(req.URL.String())
		},
	}
}
