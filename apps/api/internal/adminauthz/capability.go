// Package adminauthz — capacités de la console d'administration.
//
// La console n'est plus binaire (« superadmin ou rien ») : chaque route
// `/v1/admin/*` déclare la CAPACITÉ qu'elle exige, et le garde refuse par
// défaut. Les capacités viennent de rôles nommés attribués à des personnes
// (tables "AdminRole", "AdminUserRole"), avec échéance optionnelle.
//
// Ce paquet est la source de vérité Go du vocabulaire ; la migration
// 00053_admin_rbac.sql en est le miroir SQL, verrouillé par un test de parité
// (migration_parity_test.go). Ajouter une capacité d'un côté sans l'autre fait
// échouer la CI.
//
// Doctrine de déploiement (voir middleware.go) :
//   - le garde de capacité est monté en OBSERVATION par défaut — il journalise
//     le refus sans le produire. Le mode suit le flag `authz-enforce`, partagé
//     avec le noyau N0–N3 de internal/authz : un seul interrupteur, aucune
//     bascule surprise ;
//   - `User."role" = 'superadmin'` continue de valoir TOUTES les capacités :
//     une promotion existante ne peut pas être verrouillée par ce chantier.
package adminauthz

import (
	"fmt"
	"sort"
	"strings"
)

// Domaines d'interface (regroupement de navigation, pas une frontière de
// sécurité : une capacité n'appartient qu'à un domaine). Le CHECK SQL
// "AdminCapability_domain_check" reprend exactement cette liste.
const (
	DomainPilotage   = "pilotage"
	DomainModeration = "moderation"
	DomainCommunaute = "communaute"
	DomainProduit    = "produit"
	DomainPlateforme = "plateforme"
)

// Domains retourne les domaines connus, dans l'ordre d'affichage.
func Domains() []string {
	return []string{DomainPilotage, DomainModeration, DomainCommunaute, DomainProduit, DomainPlateforme}
}

// Capability est une action vérifiable de la console. La valeur est stable :
// elle est journalisée (audit) et renvoyée au client — jamais un libellé.
type Capability string

// Vocabulaire FERMÉ. Toute capacité absente d'ici est refusée par le garde
// (voir Registry.Declare) et ne peut pas être semée en base (CHECK + parity).
const (
	// Pilotage
	SelfRead      Capability = "admin.self.read"
	DashboardRead Capability = "admin.dashboard.read"
	AuditRead     Capability = "admin.audit.read"

	// Modération
	UsersRead           Capability = "admin.users.read"
	UsersModerate       Capability = "admin.users.moderate"
	UsersSessionsRevoke Capability = "admin.users.sessions.revoke"
	ReportsRead         Capability = "admin.reports.read"
	ReportsWrite        Capability = "admin.reports.write"
	AbuseRead           Capability = "admin.abuse.read"
	AbuseDecide         Capability = "admin.abuse.decide"
	IncidentsRead       Capability = "admin.incidents.read"
	IncidentsWrite      Capability = "admin.incidents.write"
	AppealsRead         Capability = "admin.appeals.read"
	AppealsDecide       Capability = "admin.appeals.decide"

	// Communauté
	SupportRead        Capability = "admin.support.read"
	SupportWrite       Capability = "admin.support.write"
	SubscriptionsRead  Capability = "admin.subscriptions.read"
	SubscriptionsWrite Capability = "admin.subscriptions.write"
	ImportsRead        Capability = "admin.imports.read"
	ImportsReview      Capability = "admin.imports.review"

	// Produit
	ContentRead     Capability = "admin.content.read"
	ContentWrite    Capability = "admin.content.write"
	WidgetsRead     Capability = "admin.widgets.read"
	WidgetsWrite    Capability = "admin.widgets.write"
	DeliveriesRead  Capability = "admin.deliveries.read"
	DeliveriesRetry Capability = "admin.deliveries.retry"
	CampaignsRead   Capability = "admin.campaigns.read"
	CampaignsWrite  Capability = "admin.campaigns.write"

	// Plateforme
	ConfigRead       Capability = "admin.config.read"
	ConfigWrite      Capability = "admin.config.write"
	FlagsWrite       Capability = "admin.flags.write"
	OAuthRead        Capability = "admin.oauth.read"
	OAuthApprove     Capability = "admin.oauth.approve"
	APIRead          Capability = "admin.api.read"
	APIGrantsWrite   Capability = "admin.api.grants.write"
	LegalRead        Capability = "admin.legal.read"
	LegalWrite       Capability = "admin.legal.write"
	ComplianceRead   Capability = "admin.compliance.read"
	ComplianceExport Capability = "admin.compliance.export"

	// Accès staff : gérer les rôles DEPUIS la console.
	//
	// `AccessRead` est une capacité de lecture (suffixe `.read`) : le rôle
	// « analyst » la détient par construction, comme toute capacité sans
	// écriture. `AccessGrant` en revanche est réservée au superadmin par
	// défaut — distribuer les droits de la console est précisément l'acte
	// qu'on ne délègue pas implicitement.
	AccessRead  Capability = "admin.access.read"
	AccessGrant Capability = "admin.access.grant"
)

// capabilityPrefix distingue une capacité du reste du vocabulaire d'audit.
const capabilityPrefix = "admin."

// vocabulary est la liste ordonnée du vocabulaire fermé (ordre d'affichage :
// domaine par domaine). C'est elle que parcourent les tests et le garde.
var vocabulary = []Capability{
	SelfRead, DashboardRead, AuditRead,

	UsersRead, UsersModerate, UsersSessionsRevoke,
	ReportsRead, ReportsWrite,
	AbuseRead, AbuseDecide,
	IncidentsRead, IncidentsWrite,
	AppealsRead, AppealsDecide,

	SupportRead, SupportWrite,
	SubscriptionsRead, SubscriptionsWrite,
	ImportsRead, ImportsReview,

	ContentRead, ContentWrite,
	WidgetsRead, WidgetsWrite,
	DeliveriesRead, DeliveriesRetry,
	CampaignsRead, CampaignsWrite,

	ConfigRead, ConfigWrite, FlagsWrite,
	OAuthRead, OAuthApprove,
	APIRead, APIGrantsWrite,
	LegalRead, LegalWrite,
	ComplianceRead, ComplianceExport,
	AccessRead, AccessGrant,
}

// domains associe chaque capacité à son domaine d'interface. Tenue à part de
// la liste ordonnée pour que l'ordre d'affichage et la classification restent
// deux décisions distinctes.
var domains = map[Capability]string{
	SelfRead:      DomainPilotage,
	DashboardRead: DomainPilotage,
	AuditRead:     DomainPilotage,

	UsersRead:           DomainModeration,
	UsersModerate:       DomainModeration,
	UsersSessionsRevoke: DomainModeration,
	ReportsRead:         DomainModeration,
	ReportsWrite:        DomainModeration,
	AbuseRead:           DomainModeration,
	AbuseDecide:         DomainModeration,
	IncidentsRead:       DomainModeration,
	IncidentsWrite:      DomainModeration,
	AppealsRead:         DomainModeration,
	AppealsDecide:       DomainModeration,

	SupportRead:        DomainCommunaute,
	SupportWrite:       DomainCommunaute,
	SubscriptionsRead:  DomainCommunaute,
	SubscriptionsWrite: DomainCommunaute,
	ImportsRead:        DomainCommunaute,
	ImportsReview:      DomainCommunaute,

	ContentRead:     DomainProduit,
	ContentWrite:    DomainProduit,
	WidgetsRead:     DomainProduit,
	WidgetsWrite:    DomainProduit,
	DeliveriesRead:  DomainProduit,
	DeliveriesRetry: DomainProduit,
	CampaignsRead:   DomainProduit,
	CampaignsWrite:  DomainProduit,

	ConfigRead:       DomainPlateforme,
	ConfigWrite:      DomainPlateforme,
	FlagsWrite:       DomainPlateforme,
	OAuthRead:        DomainPlateforme,
	OAuthApprove:     DomainPlateforme,
	APIRead:          DomainPlateforme,
	APIGrantsWrite:   DomainPlateforme,
	LegalRead:        DomainPlateforme,
	LegalWrite:       DomainPlateforme,
	ComplianceRead:   DomainPlateforme,
	ComplianceExport: DomainPlateforme,
	AccessRead:       DomainPlateforme,
	AccessGrant:      DomainPlateforme,
}

// Capabilities retourne le vocabulaire fermé, dans l'ordre d'affichage. La
// copie protège la liste interne : un appelant ne peut pas élargir le
// vocabulaire en la modifiant.
func Capabilities() []Capability {
	out := make([]Capability, len(vocabulary))
	copy(out, vocabulary)
	return out
}

// CapabilitiesByDomain regroupe le vocabulaire par domaine, dans l'ordre
// d'affichage — c'est ce que consomme l'interface pour bâtir la navigation
// selon les capacités réellement détenues.
func CapabilitiesByDomain() map[string][]Capability {
	out := map[string][]Capability{}
	for _, c := range vocabulary {
		d := c.Domain()
		out[d] = append(out[d], c)
	}
	return out
}

// String rend la capacité sous sa forme stable (clé).
func (c Capability) String() string { return string(c) }

// Valid dit si la capacité appartient au vocabulaire fermé.
func (c Capability) Valid() bool {
	_, ok := domains[c]
	return ok
}

// Domain retourne le domaine d'interface ("" si la capacité est inconnue).
func (c Capability) Domain() string { return domains[c] }

// IsReadOnly dit si la capacité n'ouvre aucune écriture. Convention de
// vocabulaire (suffixe `.read`) : le rôle « analyst » est bâti dessus, et un
// test vérifie qu'aucune capacité en lecture seule ne porte un autre suffixe.
func (c Capability) IsReadOnly() bool {
	return strings.HasSuffix(string(c), ".read")
}

// ReadOnlyCapabilities retourne les capacités sans écriture.
func ReadOnlyCapabilities() []Capability {
	out := []Capability{}
	for _, c := range vocabulary {
		if c.IsReadOnly() {
			out = append(out, c)
		}
	}
	return out
}

// ValidateCapabilities vérifie qu'une liste ne contient que des capacités du
// vocabulaire, sans doublon. Utilisé au démarrage (matrice de rôles) : une
// faute de frappe doit arrêter le boot, pas accorder un droit fantôme.
func ValidateCapabilities(caps []Capability) error {
	seen := map[Capability]bool{}
	for _, c := range caps {
		if !c.Valid() {
			return fmt.Errorf("capacité inconnue %q (vocabulaire fermé)", c)
		}
		if seen[c] {
			return fmt.Errorf("capacité %q déclarée deux fois", c)
		}
		seen[c] = true
	}
	return nil
}

// DomainCapabilities retourne les capacités d'un domaine, triées.
func DomainCapabilities(domain string) []Capability {
	out := CapabilitiesByDomain()[domain]
	sort.Slice(out, func(i, j int) bool { return out[i] < out[j] })
	return out
}
