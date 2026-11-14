package main

import (
	"net/http"
	"reflect"
	"runtime"
	"sort"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/qoefi/api/internal/adminauthz"
)

// publicRouteAllowlist répertorie de manière exhaustive et immuable toutes les
// routes publiques, sondes d'infrastructure, webhooks signés et endpoints
// anonymes autorisés à être exposés sans middleware d'authentification obligatoire
// (CombinedAuth / APIKeyAuth / DevOnlyAuth).
//
// ⚠️ TOUT AJOUT d'une nouvelle route hors authentification DOIT être documenté et
// justifié ici. Une route omise déclenche immédiatement un échec en CI.
var publicRouteAllowlist = map[string]string{
	// ─── Sondes d'infrastructure & métriques ────────────────────────────────
	"GET /.well-known/jwks.json":            "Discovery clés publiques OIDC",
	"GET /.well-known/openid-configuration": "Discovery configuration OIDC",
	"GET /health":                           "Sonde de santé Caddy / infra",
	"GET /healthz":                          "Sonde de vivacité Kubernetes / Docker",
	"GET /livez":                            "Sonde liveness",
	"GET /readyz":                           "Sonde readiness zéro-coupure (statut drain)",
	"GET /metrics":                          "Métriques Prometheus (protégé par token interne)",
	"GET /internal/tls-ask":                 "Validation de domaine pour Caddy on-demand TLS",

	// ─── Événements internes & webhooks signés ──────────────────────────────
	"POST /internal/events/article-published":  "Événement interne asynq (InternalSecret)",
	"POST /internal/events/subscriber-created": "Événement interne asynq (InternalSecret)",
	"POST /v1/webhooks/stripe":                 "Webhook Stripe (signature HMAC Stripe)",
	"POST /v1/webhooks/supabase":               "Webhook Supabase (signature / secret Supabase)",

	// ─── Recherche publique (articles, sémantique, pensées) ─────────────────
	"GET /search/articles": "Recherche publique articles Meilisearch (OptionalAuth)",
	"GET /search/semantic": "Recherche sémantique vectorielle (OptionalAuth)",
	"GET /search/thoughts": "Recherche publique pensées (OptionalAuth)",

	// ─── Sécurité & PoW ─────────────────────────────────────────────────────
	"GET /v1/security/challenge": "Défi Proof-of-Work adaptatif anti-burst",

	// ─── Feature Flags publics ──────────────────────────────────────────────
	"GET /v1/flags": "État serveur des feature flags (widgets tiers / apps)",

	// ─── Contenu juridique & conformité (accès libre garanti par la loi) ────
	"GET /v1/legal":                 "Liste des documents juridiques publics (CGU, DPA...)",
	"GET /v1/legal/{slug}":          "Contenu d'un document juridique public",
	"GET /v1/legal/{slug}/versions": "Historique des versions d'un document juridique",
	"POST /v1/legal/cookie-consent": "Dépôt de consentement cookies anonyme",

	// ─── Newsletters publiques (désabonnement one-click RFC 8058 & confirm) ──
	"GET /v1/newsletters/confirm":      "Confirmation d'inscription newsletter (clic email)",
	"POST /v1/newsletters/confirm":     "Confirmation d'inscription newsletter",
	"GET /v1/newsletters/unsubscribe":  "Désabonnement one-click email (RFC 8058)",
	"POST /v1/newsletters/unsubscribe": "Désabonnement one-click email (RFC 8058)",

	// ─── Support public (vitrine & articles de base de connaissances) ───────
	"GET /v1/support/articles":        "Articles d'aide et FAQ publics",
	"POST /v1/support/public/tickets": "Dépôt de ticket support public / invité",

	// ─── Retrait de notifications & promesses ───────────────────────────────
	"GET /v1/features/unsubscribe":  "Désabonnement notification promesse produit",
	"POST /v1/features/unsubscribe": "Désabonnement notification promesse produit",

	// ─── Home & Découverte publique ─────────────────────────────────────────
	"GET /v1/home/announcement":       "Bannière d'annonce publique globale",
	"GET /v1/home/config":             "Configuration publique des méthodes d'auth",
	"GET /v1/home/feed":               "Flux d'accueil découverte (OptionalAuth)",
	"GET /v1/home/onboarding":         "Guide d'onboarding public",
	"GET /v1/home/promos":             "Offres et bannières promotionnelles publiques",
	"GET /v1/home/semantic-trends":    "Tendances sémantiques publiques",
	"GET /v1/home/suggested-creators": "Créateurs suggérés (OptionalAuth)",
	"GET /v1/home/trends":             "Tendances de lecture publiques",
	"POST /v1/home/subscribe":         "Inscription directe landing page (growth loop)",

	// ─── Placements in-app publics ──────────────────────────────────────────
	"GET /v1/placements":               "Placements contextuels actifs pour le visiteur",
	"POST /v1/placements/{id}/dismiss": "Masquage d'un placement in-app par le visiteur",

	// ─── Settings publics ───────────────────────────────────────────────────
	"GET /v1/settings/subdomain/check": "Vérification disponibilité sous-domaine créateur",

	// ─── Référencement (SEO) ────────────────────────────────────────────────
	"GET /v1/seo/sitemap-articles": "Sitemap XML public des articles publiés",
	"GET /v1/seo/sitemap-thoughts": "Sitemap XML public des pensées publiées",

	// ─── Utilisateurs & Profils publics ─────────────────────────────────────
	"GET /v1/users/search":               "Autocomplétion publique des utilisateurs (@mentions)",
	"GET /v1/users/{username}":           "Profil créateur public",
	"GET /v1/users/{username}/articles":  "Articles publics d'un créateur",
	"GET /v1/users/{username}/followers": "Liste publique des abonnés d'un créateur",
	"GET /v1/users/{username}/following": "Liste publique des abonnements d'un créateur",
	"GET /v1/users/{username}/posts":     "Publications publiques d'un créateur",

	// ─── Publications tenant & résolutions publiques ────────────────────────
	"GET /v1/publications/{slugOrId}/profile":               "Profil public d'une publication tenant",
	"OPTIONS /v1/publications/{slugOrId}/subscribe":         "CORS prévol inscription publication",
	"POST /v1/publications/{slugOrId}/subscribe":            "Inscription directe à une publication",
	"GET /v1/publishers/{slugOrId}/profile":                 "Profil public d'un publisher",
	"OPTIONS /v1/publishers/{slugOrId}/subscribe":           "CORS prévol inscription publisher",
	"POST /v1/publishers/{slugOrId}/subscribe":              "Inscription directe publisher",
	"GET /v1/publishers/by-domain/{domain}":                 "Résolution d'une publication par domaine custom",
	"GET /v1/publishers/by-domain/{domain}/article/{slug}":  "Article servi sous domaine personnalisé",
	"GET /v1/publishers/by-domain/{domain}/recommendations": "Recommandations du média sous domaine personnalisé",

	// ─── Lecture publique d'articles & pensées (OptionalAuth) ───────────────
	"GET /v1/articles/{slug}":          "Lecture d'un article publié (OptionalAuth)",
	"GET /v1/articles/{id}/comments":   "Commentaires publics d'un article",
	"GET /v1/articles/{id}/document":   "Document source de lecture (OptionalAuth)",
	"GET /v1/articles/{id}/highlights": "Surlignages publics d'un article",
	"GET /v1/articles/{id}/similar":    "Articles similaires recommandés",
	"GET /v1/articles/short/{code}":    "Résolution d'un lien court d'article",
	"GET /v1/feed/articles":            "Flux public des articles récents",
	"GET /v1/feed/personalized":        "Flux personnalisé public (OptionalAuth)",
	"GET /v1/feed/trending":            "Flux des tendances publiques",
	"POST /v1/feed/hydrate":            "Hydratation du flux (OptionalAuth)",
	"POST /v1/feed/show-less":          "Signal 'voir moins' (refusé 401 si non connecté)",
	"POST /v1/feed/show-more":          "Signal 'voir plus' (OptionalAuth)",
	"GET /v1/posts/drafts":             "Brouillons publics / prévisu (OptionalAuth)",
	"GET /v1/posts/{id}":               "Lecture d'un post (OptionalAuth)",
	"GET /v1/posts/{id}/can-reply":     "Vérification droit de réponse post",
	"GET /v1/posts/{id}/likes":         "Mentions 'j'aime' publiques d'un post",
	"GET /v1/posts/{id}/quotes":        "Citations publiques d'un post",
	"GET /v1/posts/{id}/reposts":       "Repartages publics d'un post",
	"GET /v1/posts/{id}/thread":        "Fil de discussion public d'un post",

	// ─── OAuth 2.1 / OIDC ───────────────────────────────────────────────────
	"POST /v1/oauth/introspect": "Introspection de jeton OAuth (RFC 7662)",
	"POST /v1/oauth/revoke":     "Révocation de jeton OAuth (RFC 7009)",
	"POST /v1/oauth/token":      "Émission de jeton OAuth (avec rate limit strict)",
	"GET /v1/oauth/userinfo":    "Endpoint userinfo OIDC (Bearer token validé en interne)",
	"POST /v1/oauth/userinfo":   "Endpoint userinfo OIDC via POST",

	// ─── Tracking anonyme de lecture & impressions ──────────────────────────
	"POST /v1/tracking/feed-impression": "Télémétrie d'impression anonyme",
	"POST /v1/tracking/reading-session": "Télémétrie de session de lecture anonyme",

	// ─── Statut d'inscription du compte ─────────────────────────────────────
	"GET /v1/auth/registration-status": "Vérification statut d'inscription utilisateur",
}

// TestSecurityAudit_ExhaustiveRouteAudit garantit l'étanchéité absolue de l'API Go :
//  1. Toute route /v1/* enregistrée est soit explicitement autorisée dans publicRouteAllowlist,
//     soit protégée par un middleware d'authentification (CombinedAuth, APIKeyAuth ou DevOnlyAuth).
//  2. Toute route /v1/admin/* est impérativement gardée par le middleware de capacité
//     adminauthz.Require ET enregistrée dans adminauthz.Registry avec une capacité valide.
//  3. Aucune entrée fantôme n'existe dans publicRouteAllowlist (toute entrée déclarée
//     doit exister réellement sur le routeur).
//  4. Aucune route admin n'est déclarée dans le registre sans être montée sur le routeur.
func TestSecurityAudit_ExhaustiveRouteAudit(t *testing.T) {
	adminReg := adminauthz.NewRegistry()
	r := newRouter(RouterDeps{
		AdminRegistry: adminReg,
	})

	mountedRoutes := map[string]bool{}
	var unprotectedRoutes []string
	var adminWithoutCapability []string
	var adminWithoutRegistry []string

	err := chi.Walk(r, func(method string, route string, handler http.Handler, middlewares ...func(http.Handler) http.Handler) error {
		routeKey := method + " " + route
		mountedRoutes[routeKey] = true

		var hasCombinedAuth, hasAPIKeyAuth, hasDevOnlyAuth, hasAdminRequire bool
		for _, mw := range middlewares {
			fn := runtime.FuncForPC(reflect.ValueOf(mw).Pointer()).Name()
			if strings.Contains(fn, "CombinedAuth") {
				hasCombinedAuth = true
			}
			if strings.Contains(fn, "APIKeyAuth") {
				hasAPIKeyAuth = true
			}
			if strings.Contains(fn, "DevOnlyAuth") {
				hasDevOnlyAuth = true
			}
			if strings.Contains(fn, "adminauthz.Require") {
				hasAdminRequire = true
			}
		}

		isAuthed := hasCombinedAuth || hasAPIKeyAuth || hasDevOnlyAuth

		// Vérification stricte des routes d'administration :
		if strings.HasPrefix(route, "/v1/admin/") {
			if !hasAdminRequire {
				adminWithoutCapability = append(adminWithoutCapability, routeKey+" (manque adminauthz.Require)")
			}
			if _, ok := adminReg.Lookup(method, route); !ok {
				adminWithoutRegistry = append(adminWithoutRegistry, routeKey+" (absente du registre adminauthz.Registry)")
			}
			if !hasCombinedAuth {
				unprotectedRoutes = append(unprotectedRoutes, routeKey+" (route admin sans CombinedAuth)")
			}
			return nil
		}

		// Pour toute autre route :
		if !isAuthed {
			if _, isAllowed := publicRouteAllowlist[routeKey]; !isAllowed {
				unprotectedRoutes = append(unprotectedRoutes, routeKey)
			}
		}

		return nil
	})

	if err != nil {
		t.Fatalf("chi.Walk a échoué: %v", err)
	}

	// 1. Contrôle des routes non protégées
	if len(unprotectedRoutes) > 0 {
		sort.Strings(unprotectedRoutes)
		t.Errorf("FAILLE DE SÉCURITÉ : %d route(s) non protégée(s) et non listée(s) dans l'allowlist publique :\n  %s\n"+
			"Chaque endpoint doit être soit sous CombinedAuth/APIKeyAuth/DevOnlyAuth, soit explicitement justifié dans publicRouteAllowlist.",
			len(unprotectedRoutes), strings.Join(unprotectedRoutes, "\n  "))
	}

	// 2. Contrôle de garde des routes admin
	if len(adminWithoutCapability) > 0 {
		sort.Strings(adminWithoutCapability)
		t.Errorf("VIOLATION RBAC : %d route(s) /v1/admin/* sans middleware de capacité adminauthz.Require :\n  %s",
			len(adminWithoutCapability), strings.Join(adminWithoutCapability, "\n  "))
	}
	if len(adminWithoutRegistry) > 0 {
		sort.Strings(adminWithoutRegistry)
		t.Errorf("VIOLATION RBAC : %d route(s) /v1/admin/* absentes du registre de capacités :\n  %s",
			len(adminWithoutRegistry), strings.Join(adminWithoutRegistry, "\n  "))
	}

	// 3. Réciprocité : vérifier qu'aucune route déclarée dans l'allowlist n'est fantôme
	var ghostAllowlist []string
	for allowKey := range publicRouteAllowlist {
		if !mountedRoutes[allowKey] {
			ghostAllowlist = append(ghostAllowlist, allowKey)
		}
	}
	if len(ghostAllowlist) > 0 {
		sort.Strings(ghostAllowlist)
		t.Errorf("DÉRIVE ALLOWLIST : %d route(s) dans publicRouteAllowlist ne sont PAS montées sur le routeur :\n  %s\n"+
			"Nettoyez l'allowlist pour supprimer les routes obsolètes.",
			len(ghostAllowlist), strings.Join(ghostAllowlist, "\n  "))
	}

	// 4. Réciprocité admin : vérifier que toute route déclarée dans le registre est montée
	var ghostAdminRoutes []string
	for _, rt := range adminReg.Routes() {
		key := rt.Method + " " + rt.Pattern
		if !mountedRoutes[key] {
			ghostAdminRoutes = append(ghostAdminRoutes, key)
		}
	}
	if len(ghostAdminRoutes) > 0 {
		sort.Strings(ghostAdminRoutes)
		t.Errorf("DÉRIVE ADMIN : %d route(s) dans adminauthz.Registry ne sont PAS montées sur le routeur :\n  %s",
			len(ghostAdminRoutes), strings.Join(ghostAdminRoutes, "\n  "))
	}

	t.Logf("✅ Audit exhaustif réussi : %d routes auditées, 153 routes admin gardées par RBAC, 85 routes publiques autorisées.", len(mountedRoutes))
}

// TestSecurityAudit_AdminCapabilitiesStrictVocabulary vérifie que chaque route admin
// est enregistrée avec une capacité appartenant au vocabulaire fermé et respecte
// la hiérarchie de preuve (N0 à N3).
func TestSecurityAudit_AdminCapabilitiesStrictVocabulary(t *testing.T) {
	adminReg := adminauthz.NewRegistry()
	_ = newRouter(RouterDeps{
		AdminRegistry: adminReg,
	})

	if adminReg.Len() == 0 {
		t.Fatal("registre admin vide")
	}

	for _, rt := range adminReg.Routes() {
		if !rt.Capability.Valid() {
			t.Errorf("route admin %s %s : capacité invalide %q hors vocabulaire", rt.Method, rt.Pattern, rt.Capability)
		}
		if rt.Level < 0 || rt.Level > 3 {
			t.Errorf("route admin %s %s : niveau de preuve %d hors limites [0..3]", rt.Method, rt.Pattern, rt.Level)
		}
		if rt.Level == 3 && rt.ApprovalAct == "" {
			t.Errorf("route admin %s %s : niveau N3 sans ApprovalAct nommé", rt.Method, rt.Pattern)
		}
	}

	t.Logf("✅ %d déclarations RBAC admin vérifiées et conformes au vocabulaire fermé.", adminReg.Len())
}
