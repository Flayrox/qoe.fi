package adminauthz

import "sort"

// Rôles nommés (vocabulaire fermé, miroir de la migration 00053). Un rôle est
// un agrégat de capacités : il ne donne jamais de droit implicite, et l'ajout
// d'une capacité au vocabulaire ne l'accorde à personne tant que la matrice
// ci-dessous (et son miroir SQL) ne la cite pas — sauf pour `superadmin`, qui
// vaut « toutes » par définition.
const (
	RoleSuperadmin = "superadmin"
	RoleSupport    = "support"
	RoleModeration = "moderation"
	RoleContent    = "content"
	RoleOps        = "ops"
	RoleLegal      = "legal"
	// RoleAnalyst est le rôle de lecture seule : l'ensemble de ses capacités
	// est exactement celui des capacités sans écriture.
	RoleAnalyst = "analyst"
)

// roleOrder est l'ordre d'affichage des rôles (du plus large au plus étroit).
var roleOrder = []string{
	RoleSuperadmin, RoleOps, RoleModeration, RoleContent, RoleSupport, RoleLegal, RoleAnalyst,
}

// RoleCapabilities est la matrice rôle → capacités. Elle est comparée telle
// quelle aux lignes "AdminRoleCapability" de la migration par le test de
// parité : les deux copies doivent rester identiques.
//
// Choix explicites (revus en même temps que la matrice SQL) :
//   - `support` accueille et lit, mais n'engage AUCUNE mesure : pas de
//     `subscriptions.write`, pas de modération, pas d'écriture plateforme ;
//   - `moderation` traite les mesures et les recours, mais ne touche ni à la
//     configuration ni aux abonnements ;
//   - `ops` tient la plateforme (config, flags, OAuth, accès API, livraisons,
//     campagnes) sans prendre de décision sur les personnes ;
//   - `analyst` ne contient que des capacités en lecture — un test le vérifie.
var RoleCapabilities = map[string][]Capability{
	RoleSuperadmin: Capabilities(),

	RoleSupport: {
		SelfRead, DashboardRead, AuditRead,
		UsersRead, ReportsRead, AbuseRead, IncidentsRead, AppealsRead,
		SupportRead, SupportWrite, SubscriptionsRead, ImportsRead,
		ContentRead, WidgetsRead, DeliveriesRead, CampaignsRead,
		ConfigRead, OAuthRead, APIRead, LegalRead, ComplianceRead,
	},

	RoleModeration: {
		SelfRead, DashboardRead, AuditRead,
		UsersRead, UsersModerate, UsersSessionsRevoke,
		ReportsRead, ReportsWrite,
		AbuseRead, AbuseDecide,
		IncidentsRead, IncidentsWrite,
		AppealsRead, AppealsDecide,
		SupportRead,
	},

	RoleContent: {
		SelfRead, DashboardRead,
		SupportRead,
		ContentRead, ContentWrite,
		WidgetsRead, WidgetsWrite,
		LegalRead, LegalWrite, ComplianceRead,
	},

	RoleOps: {
		SelfRead, DashboardRead, AuditRead,
		ConfigRead, ConfigWrite, FlagsWrite,
		OAuthRead, OAuthApprove,
		APIRead, APIGrantsWrite,
		ImportsRead, ImportsReview,
		DeliveriesRead, DeliveriesRetry,
		CampaignsRead, CampaignsWrite,
		IncidentsRead, IncidentsWrite, ComplianceRead,
	},

	RoleLegal: {
		SelfRead, DashboardRead, AuditRead, UsersRead,
		LegalRead, LegalWrite,
		ComplianceRead, ComplianceExport,
	},

	RoleAnalyst: {
		SelfRead, DashboardRead, AuditRead,
		UsersRead, ReportsRead, AbuseRead, IncidentsRead, AppealsRead,
		SupportRead, SubscriptionsRead, ImportsRead,
		ContentRead, WidgetsRead, DeliveriesRead, CampaignsRead,
		ConfigRead, OAuthRead, APIRead, LegalRead, ComplianceRead,
	},
}

// Roles retourne les rôles connus, dans l'ordre d'affichage.
func Roles() []string {
	out := make([]string, len(roleOrder))
	copy(out, roleOrder)
	return out
}

// ValidRole dit si le rôle appartient au vocabulaire fermé.
func ValidRole(role string) bool {
	_, ok := RoleCapabilities[role]
	return ok
}

// RoleSet retourne les capacités d'un rôle. Un rôle inconnu rend un ensemble
// vide : l'absence de rôle n'accorde jamais de droit.
func RoleSet(role string) Set {
	out := Set{}
	for _, c := range RoleCapabilities[role] {
		out[c] = true
	}
	return out
}

// AllCapabilities retourne l'ensemble complet (rôle superadmin).
func AllCapabilities() Set {
	out := Set{}
	for _, c := range vocabulary {
		out[c] = true
	}
	return out
}

// RoleCapabilitiesSorted retourne les capacités d'un rôle, triées — forme
// stable pour les tests, l'audit et l'interface.
func RoleCapabilitiesSorted(role string) []Capability {
	caps := append([]Capability(nil), RoleCapabilities[role]...)
	sort.Slice(caps, func(i, j int) bool { return caps[i] < caps[j] })
	return caps
}
