package config

// =====================================================================
// 🔐 Origine Supabase — garde « un process local ne vise pas la prod »
// =====================================================================
// Pourquoi ce fichier existe : `Load()` dérivait `SupabaseAuthURL` et
// `SupabaseURL` directement de `SUPABASE_AUTH_URL` / `SUPABASE_URL` /
// `NEXT_PUBLIC_SUPABASE_URL`. Un `.env` de poste pointant l'infra partagée
// (`http://116.203.158.47:54321`) faisait donc valider les JWT RS256,
// interroger GoTrue et servir le storage depuis la production pendant un run
// local — la même fuite que celle corrigée côté TypeScript au lot L20i
// (`packages/supabase/src/url.ts`), mais ici en serveur à serveur : aucune
// page ne la déclenche, c'est l'API elle-même qui appelle le VPS.
//
// La règle est identique à celle du résolveur TS :
//
//   • origine Supabase vers la boucle locale (`127.0.0.1`, `localhost`…) ou un
//     domaine de dev (`*.localhost`, `lvh.me`, `qoe.test`) → conservée ;
//   • origine **distante** alors que l'origine applicative de ce process est
//     locale (`NEXT_PUBLIC_APP_URL` = localhost / *.localhost / *.lvh.me /
//     *.qoe.test) → remplacée par le stack Supabase local ;
//   • origine distante sur un process de production → honorée telle quelle ;
//   • valeur absente, non-URL ou ambiguë → repli local, jamais propagée.
// =====================================================================

import (
	"net"
	"net/url"
	"strings"
)

// SupabaseLocalURL est l'API du stack Supabase local (`supabase start`).
// `127.0.0.1` plutôt que `localhost` : aucune résolution DNS ni bascule
// IPv6 → IPv4 au moment de l'appel.
const SupabaseLocalURL = "http://127.0.0.1:54321"

// defaultAppOrigin est le même défaut que `BILLING_RETURN_BASE_URL` : un
// process sans origine applicative explicite est un process de poste.
const defaultAppOrigin = "http://localhost:3000"

// AppOrigin lit l'origine applicative de ce process (poste ou production).
func AppOrigin() string {
	return envOr("NEXT_PUBLIC_APP_URL", defaultAppOrigin)
}

// resolveSupabaseOrigin applique la règle d'origine des clients Supabase.
//
// `raw` est la valeur configurée (SUPABASE_URL, SUPABASE_AUTH_URL ou leur repli
// `NEXT_PUBLIC_SUPABASE_URL`), `appOrigin` l'origine applicative du process.
func resolveSupabaseOrigin(raw, appOrigin string) string {
	value := strings.TrimSpace(raw)
	host, ok := hostnameOf(value)
	if !ok {
		// Valeur absente, relative ou non-URL : on ne propage rien.
		return SupabaseLocalURL
	}
	if isLocalHostname(host) {
		return value
	}
	if isLocalHostname(hostnameOfOrEmpty(appOrigin)) {
		return SupabaseLocalURL
	}
	return value
}

// hostnameOf extrait l'hôte d'une URL absolue (`ok=false` sinon).
func hostnameOf(raw string) (string, bool) {
	if raw == "" {
		return "", false
	}
	u, err := url.Parse(raw)
	if err != nil || u.Host == "" || (u.Scheme != "http" && u.Scheme != "https") {
		return "", false
	}
	return u.Hostname(), true
}

func hostnameOfOrEmpty(raw string) string {
	host, _ := hostnameOf(raw)
	return host
}

// isLocalHostname reconnaît la boucle locale et les domaines de dev.
func isLocalHostname(host string) bool {
	h := strings.Trim(strings.ToLower(strings.TrimSpace(host)), "[]")
	if h == "" {
		return false
	}
	if h == "localhost" || h == "0.0.0.0" {
		return true
	}
	if ip := net.ParseIP(h); ip != nil {
		return ip.IsLoopback()
	}
	return strings.HasSuffix(h, ".localhost") ||
		h == "lvh.me" || strings.HasSuffix(h, ".lvh.me") ||
		h == "qoe.test" || strings.HasSuffix(h, ".qoe.test")
}
