package identifier

import (
	"regexp"
	"strings"
)

var (
	UsernamePattern  = regexp.MustCompile(`^[a-z0-9]+(?:[._][a-z0-9]+)*$`)
	SubdomainPattern = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)
)

var reserved = map[string]struct{}{
	"admin": {}, "api": {}, "app": {}, "auth": {}, "billing": {}, "blog": {}, "cdn": {},
	"dashboard": {}, "dev": {}, "developer": {}, "developers": {}, "docs": {}, "download": {},
	"email": {}, "feed": {}, "files": {}, "help": {}, "home": {}, "login": {}, "mail": {},
	"main": {}, "media": {}, "metrics": {}, "onboarding": {}, "payments": {}, "portal": {},
	"qoe": {}, "root": {}, "search": {}, "settings": {}, "staging": {}, "start": {},
	"static": {}, "status": {}, "store": {}, "studio": {}, "support": {}, "system": {},
	"uploads": {}, "web": {}, "www": {},
}

// reservedTenantRoutes contient tous les segments de premier niveau déjà
// utilisés par une route statique d'un site tenant (ou par l'app elle-même).
// Une catégorie portant l'un de ces slugs serait inaccessible : la route
// statique gagne toujours sur le catch-all [categorySlug].
//
// ⚠️ Toute nouvelle route statique sous apps/tenants/src/app/tenant/[domain]
// doit être ajoutée ici. Le test de parité côté tenants échoue sinon.
var reservedTenantRoutes = map[string]struct{}{
	// Routes éditoriales canoniques
	"about": {}, "team": {}, "thoughts": {}, "author": {},
	// Routes d'articles et de catégories
	"article": {}, "articles": {},
	// Routes système du tenant
	"search": {}, "support": {}, "sitemap": {}, "rss.xml": {},
	// Routes de l'app servies sur le même host
	"api": {}, "auth": {}, "tenant": {}, "robots.txt": {}, "sitemap.xml": {}, "icon.svg": {},
}

// IsReservedTenantRoute indique si un slug de catégorie entrerait en collision
// avec une route statique du site tenant.
func IsReservedTenantRoute(raw string) bool {
	_, ok := reservedTenantRoutes[strings.ToLower(strings.TrimSpace(strings.Trim(raw, "/")))]
	return ok
}

func NormalizeUsername(raw string) string {
	s := strings.TrimPrefix(strings.ToLower(strings.TrimSpace(raw)), "@")
	return s
}

func ValidUsername(raw string) bool {
	s := NormalizeUsername(raw)
	return len(s) >= 3 && len(s) <= 24 && UsernamePattern.MatchString(s)
}

func NormalizeSubdomain(raw string) string {
	return strings.ToLower(strings.TrimSpace(raw))
}

func ValidSubdomain(raw string) bool {
	s := NormalizeSubdomain(raw)
	return len(s) >= 3 && len(s) <= 30 && SubdomainPattern.MatchString(s) && !strings.Contains(s, "--")
}

func IsReserved(raw string) bool {
	_, ok := reserved[strings.ToLower(strings.TrimSpace(strings.TrimPrefix(raw, "@")))]
	return ok
}
