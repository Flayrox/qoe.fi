package adminauthz

import "testing"

// TestRoleCapabilitiesMatrix verrouille la matrice rôle → capacités sur des
// points explicites plutôt que dérivés de la carte elle-même : élargir un rôle
// par mégarde doit faire échouer ce test, pas être constaté.
func TestRoleCapabilitiesMatrix(t *testing.T) {
	type probe struct {
		role string
		cap  Capability
		want bool
		why  string
	}
	probes := []probe{
		// superadmin détient tout, par définition.
		{RoleSuperadmin, AccessGrant, true, "superadmin détient toutes les capacités"},
		{RoleSuperadmin, ConfigWrite, true, "superadmin détient toutes les capacités"},
		{RoleSuperadmin, LegalWrite, true, "superadmin détient toutes les capacités"},

		// support accueille et lit, n'engage aucune mesure.
		{RoleSupport, SupportWrite, true, "support répond aux demandes"},
		{RoleSupport, UsersRead, true, "support lit les comptes"},
		{RoleSupport, UsersModerate, false, "support ne modère pas"},
		{RoleSupport, SubscriptionsWrite, false, "support ne touche pas aux abonnements"},
		{RoleSupport, ReportsWrite, false, "support n'écrit pas de signalement"},
		{RoleSupport, ConfigWrite, false, "support ne configure pas la plateforme"},
		{RoleSupport, AccessGrant, false, "distribuer les droits n'est pas délégué"},

		// moderation traite les mesures et les recours.
		{RoleModeration, ReportsWrite, true, "modération traite les signalements"},
		{RoleModeration, AbuseDecide, true, "modération décide des abus"},
		{RoleModeration, AppealsDecide, true, "modération traite les recours"},
		{RoleModeration, UsersSessionsRevoke, true, "modération peut révoquer des sessions"},
		{RoleModeration, ConfigWrite, false, "modération ne configure pas"},
		{RoleModeration, SubscriptionsWrite, false, "modération ne touche pas aux abonnements"},
		{RoleModeration, ContentWrite, false, "modération n'édite pas le contenu"},
		{RoleModeration, AccessGrant, false, "modération ne distribue aucun droit"},

		// content édite le produit éditorial, pas le juridique.
		{RoleContent, ContentWrite, true, "content édite le contenu"},
		{RoleContent, WidgetsWrite, true, "content gère les widgets"},
		{RoleContent, LegalWrite, false, "un rôle éditorial ne publie pas un texte opposable"},
		{RoleContent, UsersModerate, false, "content ne modère pas"},
		{RoleContent, ConfigWrite, false, "content ne configure pas"},

		// ops tient la plateforme, pas les personnes.
		{RoleOps, ConfigWrite, true, "ops configure la plateforme"},
		{RoleOps, FlagsWrite, true, "ops pilote les flags"},
		{RoleOps, OAuthApprove, true, "ops approuve les clients OAuth"},
		{RoleOps, APIGrantsWrite, true, "ops gère les accès API"},
		{RoleOps, UsersModerate, false, "ops ne modère pas les personnes"},
		{RoleOps, IncidentsWrite, false, "ops ne traite pas les incidents"},
		{RoleOps, LegalWrite, false, "ops n'écrit pas le juridique"},
		{RoleOps, AccessGrant, false, "ops ne distribue pas les droits de la console"},

		// legal : lecture des comptes, écriture du juridique.
		{RoleLegal, LegalWrite, true, "legal écrit les textes opposables"},
		{RoleLegal, ComplianceExport, true, "legal exporte la conformité"},
		{RoleLegal, UsersRead, true, "legal lit les comptes"},
		{RoleLegal, UsersModerate, false, "legal ne modère pas"},
		{RoleLegal, ConfigWrite, false, "legal ne configure pas"},

		// analyst : lecture seule, sans exception.
		{RoleAnalyst, UsersRead, true, "analyst lit"},
		{RoleAnalyst, AuditRead, true, "analyst lit l'audit"},
		{RoleAnalyst, AccessRead, true, "analyst lit les accès"},
		{RoleAnalyst, ContentWrite, false, "analyst n'écrit pas"},
		{RoleAnalyst, SupportWrite, false, "analyst n'écrit pas"},
		{RoleAnalyst, FlagsWrite, false, "analyst n'écrit pas"},
		{RoleAnalyst, AccessGrant, false, "analyst n'accorde rien"},

		// Rôles absents du vocabulaire : aucun droit, jamais un défaut permissif.
		{"", ConfigRead, false, "rôle vide"},
		{"admin", ConfigWrite, false, "« admin » n'est pas un rôle nommé"},
		{"member", SupportRead, false, "« member » n'est pas un rôle de console"},
		{"superadmin ", ConfigWrite, false, "pas de normalisation implicite des rôles"},
	}
	for _, p := range probes {
		p := p
		t.Run(p.role+"/"+string(p.cap), func(t *testing.T) {
			got := Set(capabilitiesForRole(p.role)).Has(p.cap)
			if got != p.want {
				t.Fatalf("rôle=%q capacité=%q = %v, attendu %v (%s)", p.role, p.cap, got, p.want, p.why)
			}
		})
	}
}

// capabilitiesForRole matérialise la résolution rôle → ensemble, en refusant
// par défaut un rôle inconnu.
func capabilitiesForRole(role string) Set {
	out := Set{}
	for _, c := range RoleCapabilities[role] {
		out[c] = true
	}
	return out
}

// superadminOnly documente les capacités volontairement réservées au
// superadmin. Toute autre capacité détenue par le seul superadmin est un oubli
// de matrice : le test échoue pour forcer une décision explicite (déléguer ou
// documenter ici avec sa raison).
var superadminOnly = map[Capability]string{
	AccessGrant:        "distribuer les droits de la console ne se délègue pas implicitement",
	SubscriptionsWrite: "les abonnements engagent de l'argent : superadmin seul par défaut",
	ImportsReview:      "faire entrer des adresses dans un périmètre d'envoi est un acte fort",
	DeliveriesRetry:    "relancer une livraison peut dupliquer un envoi : superadmin seul",
	CampaignsWrite:     "écrire une campagne de masse est un acte d'envoi, pas de support",
}

// TestRoleCapabilities_ExhaustiveCouverture vérifie que chaque capacité du
// vocabulaire est soit déléguée à un rôle nommé, soit documentée comme
// superadmin-only. Une capacité oubliée est inutilisable en pratique.
func TestRoleCapabilities_ExhaustiveCouverture(t *testing.T) {
	delegated := map[Capability]bool{}
	for role, caps := range RoleCapabilities {
		if role == RoleSuperadmin {
			continue
		}
		for _, c := range caps {
			if !isKnownCapability(c) {
				t.Fatalf("rôle %q cite la capacité inconnue %q", role, c)
			}
			delegated[c] = true
		}
	}
	for _, c := range Capabilities() {
		_, documented := superadminOnly[c]
		if delegated[c] && documented {
			t.Errorf("capacité %q documentée superadmin-only mais déléguée à un rôle nommé : mettre à jour la documentation", c)
		}
		if !delegated[c] && !documented {
			t.Errorf("capacité %q détenue uniquement par superadmin sans décision documentée", c)
		}
	}
	// Une capacité superadmin-only doit l'être réellement.
	for c := range superadminOnly {
		if !isKnownCapability(c) {
			t.Fatalf("superadminOnly cite la capacité inconnue %q", c)
		}
		for role, caps := range RoleCapabilities {
			if role == RoleSuperadmin {
				continue
			}
			for _, granted := range caps {
				if granted == c {
					t.Fatalf("%q est documentée superadmin-only mais accordée au rôle %q", c, role)
				}
			}
		}
	}
}

func isKnownCapability(c Capability) bool {
	for _, known := range Capabilities() {
		if known == c {
			return true
		}
	}
	return false
}
