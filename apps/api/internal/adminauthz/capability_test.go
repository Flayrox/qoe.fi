package adminauthz

import (
	"strings"
	"testing"
)

// ─── Vocabulaire fermé ─────────────────────────────────────────────────

func TestVocabulary_WellFormed(t *testing.T) {
	caps := Capabilities()
	if len(caps) == 0 {
		t.Fatal("vocabulaire vide")
	}
	seen := map[Capability]bool{}
	for _, c := range caps {
		if seen[c] {
			t.Fatalf("capacité %q déclarée deux fois dans le vocabulaire", c)
		}
		seen[c] = true
		if !c.Valid() {
			t.Fatalf("capacité %q du vocabulaire non valide (absente de domains)", c)
		}
		if !strings.HasPrefix(string(c), capabilityPrefix) {
			t.Fatalf("capacité %q sans préfixe %q", c, capabilityPrefix)
		}
		if c.Domain() == "" {
			t.Fatalf("capacité %q sans domaine", c)
		}
	}
	// Aucune entrée morte dans la classification : domains couvre exactement le
	// vocabulaire, dans les deux sens.
	if len(domains) != len(caps) {
		t.Fatalf("domains=%d entrées, vocabulaire=%d : une capacité a un domaine orphelin ou manquant", len(domains), len(caps))
	}
	for c := range domains {
		if !seen[c] {
			t.Fatalf("domains classe %q qui n'est pas dans le vocabulaire", c)
		}
	}
}

func TestVocabulary_DomainsAreClosed(t *testing.T) {
	known := map[string]bool{}
	for _, d := range Domains() {
		known[d] = true
	}
	for _, c := range Capabilities() {
		if !known[c.Domain()] {
			t.Fatalf("capacité %q : domaine %q hors de la liste fermée", c, c.Domain())
		}
	}
	byDomain := CapabilitiesByDomain()
	for d := range byDomain {
		if !known[d] {
			t.Fatalf("CapabilitiesByDomain expose un domaine inconnu %q", d)
		}
	}
	// Chaque domaine annoncé porte au moins une capacité (sinon l'interface
	// afficherait une section vide).
	for d := range known {
		if len(byDomain[d]) == 0 {
			t.Fatalf("domaine %q sans capacité", d)
		}
	}
}

func TestReadOnlySuffix(t *testing.T) {
	// L'ensemble « lecture seule » est défini par le suffixe .read ; le rôle
	// analyst est bâti dessus. Un nom mal suffixé élargirait silencieusement
	// l'accès en écriture d'un analyste.
	read := ReadOnlyCapabilities()
	if len(read) == 0 {
		t.Fatal("aucune capacité en lecture seule")
	}
	for _, c := range read {
		if !strings.HasSuffix(string(c), ".read") {
			t.Fatalf("%q classée lecture seule sans suffixe .read", c)
		}
	}
	for _, c := range Capabilities() {
		if strings.HasSuffix(string(c), ".read") && !c.IsReadOnly() {
			t.Fatalf("%q porte .read mais n'est pas classée lecture seule", c)
		}
	}
}

func TestValidateCapabilities(t *testing.T) {
	if err := ValidateCapabilities(Capabilities()); err != nil {
		t.Fatalf("vocabulaire complet refusé : %v", err)
	}
	if err := ValidateCapabilities([]Capability{Capability("admin.nope.read")}); err == nil {
		t.Fatal("capacité inconnue acceptée")
	}
	if err := ValidateCapabilities([]Capability{SelfRead, SelfRead}); err == nil {
		t.Fatal("doublon accepté")
	}
	if err := ValidateCapabilities(nil); err != nil {
		t.Fatalf("liste vide refusée : %v", err)
	}
}

func TestDomainCapabilities(t *testing.T) {
	for _, d := range Domains() {
		caps := DomainCapabilities(d)
		if len(caps) == 0 {
			t.Fatalf("domaine %q vide", d)
		}
		for i := 1; i < len(caps); i++ {
			if caps[i-1] > caps[i] {
				t.Fatalf("domaine %q non trié : %v", d, caps)
			}
		}
	}
	if got := DomainCapabilities("inconnu"); len(got) != 0 {
		t.Fatalf("domaine inconnu rendu non vide : %v", got)
	}
}

// ─── Rôles ─────────────────────────────────────────────────────────────

func TestRoles_WellFormed(t *testing.T) {
	roles := Roles()
	if len(roles) != len(RoleCapabilities) {
		t.Fatalf("%d rôles affichés, %d rôles dans la matrice", len(roles), len(RoleCapabilities))
	}
	for _, r := range roles {
		if !ValidRole(r) {
			t.Fatalf("rôle %q affiché mais absent de la matrice", r)
		}
		caps := RoleCapabilities[r]
		if len(caps) == 0 {
			t.Fatalf("rôle %q sans capacité", r)
		}
		if err := ValidateCapabilities(caps); err != nil {
			t.Fatalf("rôle %q : %v", r, err)
		}
	}
	if ValidRole("root") {
		t.Fatal("rôle inconnu accepté")
	}
	if !RoleSet("root").Empty() {
		t.Fatal("rôle inconnu accorde des capacités")
	}
}

// TestSuperadminHoldsEverything — le rôle superadmin vaut TOUTES les
// capacités : ajouter une capacité au vocabulaire sans l'énumérer ne doit pas
// créer de trou pour lui.
func TestSuperadminHoldsEverything(t *testing.T) {
	for _, c := range Capabilities() {
		if !RoleSet(RoleSuperadmin).Has(c) {
			t.Fatalf("superadmin ne détient pas %q", c)
		}
		if !AllCapabilities().Has(c) {
			t.Fatalf("AllCapabilities ne détient pas %q", c)
		}
	}
	if len(RoleCapabilitiesSorted(RoleSuperadmin)) != len(Capabilities()) {
		t.Fatalf("superadmin = %d capacités, vocabulaire = %d", len(RoleCapabilitiesSorted(RoleSuperadmin)), len(Capabilities()))
	}
}

// TestAnalystIsStrictlyReadOnly — analyste ne peut RIEN écrire. L'ensemble de
// ses capacités est exactement l'ensemble des capacités sans écriture.
func TestAnalystIsStrictlyReadOnly(t *testing.T) {
	analyst := RoleSet(RoleAnalyst)
	for _, c := range Capabilities() {
		if c.IsReadOnly() {
			if !analyst.Has(c) {
				t.Fatalf("analyst devrait détenir %q (lecture seule)", c)
			}
			continue
		}
		if analyst.Has(c) {
			t.Fatalf("analyst détient une capacité d'écriture %q", c)
		}
	}
}

// TestSupportCannotWriteSubscriptions — le cœur de la demande : un agent
// support accueille et lit, mais n'octroie ni ne révoque un palier (et ne
// touche pas à l'email Pro).
func TestSupportCannotWriteSubscriptions(t *testing.T) {
	support := RoleSet(RoleSupport)
	if !support.Has(SubscriptionsRead) {
		t.Fatal("support devrait pouvoir LIRE les abonnements")
	}
	if support.Has(SubscriptionsWrite) {
		t.Fatal("support ne doit pas pouvoir ÉCRIRE les abonnements")
	}
	// Les autres actes d'engagement restent fermés au support.
	for _, c := range []Capability{
		UsersModerate, UsersSessionsRevoke,
		ReportsWrite, AbuseDecide,
		IncidentsWrite, AppealsDecide,
		ImportsReview,
		ContentWrite, WidgetsWrite,
		DeliveriesRetry, CampaignsWrite,
		ConfigWrite, FlagsWrite,
		OAuthApprove, APIGrantsWrite,
		LegalWrite, ComplianceExport,
	} {
		if support.Has(c) {
			t.Fatalf("support détient l'acte %q alors qu'il ne doit engager aucune mesure", c)
		}
	}
}

// TestRoleCapabilityMatrix — la matrice attendue, rôle par rôle, capacité par
// capacité. Un changement de matrice doit être un choix explicite, pas un
// effet de bord d'un refactor.
func TestRoleCapabilityMatrix(t *testing.T) {
	type roleCase struct {
		role     string
		holds    []Capability
		refuses  []Capability
		readOnly bool
	}
	cases := []roleCase{
		{
			role:    RoleSupport,
			holds:   []Capability{SelfRead, DashboardRead, AuditRead, UsersRead, ReportsRead, SupportWrite, SubscriptionsRead, ImportsRead, ConfigRead, LegalRead, ComplianceRead},
			refuses: []Capability{SubscriptionsWrite, UsersModerate, ImportsReview, ContentWrite, WidgetsWrite, ConfigWrite, FlagsWrite, ComplianceExport},
		},
		{
			role:    RoleModeration,
			holds:   []Capability{UsersModerate, UsersSessionsRevoke, ReportsWrite, AbuseDecide, IncidentsWrite, AppealsDecide, UsersRead},
			refuses: []Capability{SubscriptionsWrite, ConfigWrite, ContentWrite, WidgetsWrite, LegalWrite, ImportsReview, ComplianceExport, SupportWrite},
		},
		{
			role:    RoleContent,
			holds:   []Capability{ContentWrite, ContentRead, WidgetsWrite, WidgetsRead, LegalWrite, SupportRead},
			refuses: []Capability{UsersModerate, SubscriptionsWrite, ConfigWrite, FlagsWrite, OAuthApprove, ImportsReview, ComplianceExport},
		},
		{
			role:    RoleOps,
			holds:   []Capability{ConfigWrite, ConfigRead, FlagsWrite, OAuthApprove, OAuthRead, APIGrantsWrite, ImportsReview, DeliveriesRetry, CampaignsWrite, IncidentsWrite},
			refuses: []Capability{UsersModerate, UsersSessionsRevoke, SubscriptionsWrite, ReportsWrite, ContentWrite, LegalWrite, ComplianceExport},
		},
		{
			role:    RoleLegal,
			holds:   []Capability{LegalRead, LegalWrite, ComplianceRead, ComplianceExport, AuditRead, UsersRead},
			refuses: []Capability{UsersModerate, ReportsWrite, SubscriptionsWrite, ConfigWrite, ContentWrite, ImportsReview},
		},
		{
			role:     RoleAnalyst,
			holds:    []Capability{SelfRead, DashboardRead, AuditRead, UsersRead, SubscriptionsRead, ImportsRead, ComplianceRead},
			refuses:  []Capability{SubscriptionsWrite, UsersModerate, ReportsWrite, ConfigWrite, ContentWrite, WidgetsWrite, ImportsReview, FlagsWrite},
			readOnly: true,
		},
	}
	for _, tc := range cases {
		t.Run(tc.role, func(t *testing.T) {
			set := RoleSet(tc.role)
			for _, c := range tc.holds {
				if !set.Has(c) {
					t.Errorf("%s devrait détenir %q", tc.role, c)
				}
			}
			for _, c := range tc.refuses {
				if set.Has(c) {
					t.Errorf("%s ne devrait pas détenir %q", tc.role, c)
				}
			}
			if tc.readOnly {
				for c := range set {
					if !c.IsReadOnly() {
						t.Errorf("%s détient %q, hors lecture seule", tc.role, c)
					}
				}
			}
		})
	}
}
