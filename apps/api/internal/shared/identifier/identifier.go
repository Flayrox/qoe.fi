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
