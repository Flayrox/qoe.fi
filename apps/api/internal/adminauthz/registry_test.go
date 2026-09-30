package adminauthz

import (
	"encoding/json"
	"testing"
)

func TestRegistry_DeclareAndLookup(t *testing.T) {
	r := NewRegistry()
	if err := r.Declare("get", "/v1/admin/users", UsersRead); err != nil {
		t.Fatalf("déclaration valide refusée : %v", err)
	}
	if err := r.Declare("POST", "/v1/admin/users", UsersModerate); err != nil {
		t.Fatalf("déclaration valide refusée : %v", err)
	}
	if r.Len() != 2 {
		t.Fatalf("Len = %d, attendu 2", r.Len())
	}
	if c, ok := r.Lookup("GET", "/v1/admin/users"); !ok || c != UsersRead {
		t.Fatalf("Lookup GET = %q/%v", c, ok)
	}
	// La méthode est normalisée en majuscules : un appelant peut ouvrir en
	// minuscules sans créer une seconde entrée.
	if c, ok := r.Lookup("post", "/v1/admin/users"); !ok || c != UsersModerate {
		t.Fatalf("Lookup post = %q/%v", c, ok)
	}
	if _, ok := r.Lookup("DELETE", "/v1/admin/users"); ok {
		t.Fatal("route non déclarée trouvée")
	}
}

// TestRegistry_RefusesDuplicate — deux capacités pour la même route =
// deux vérités sur la même porte : le démarrage doit s'arrêter.
func TestRegistry_RefusesDuplicate(t *testing.T) {
	r := NewRegistry()
	if err := r.Declare("GET", "/v1/admin/users", UsersRead); err != nil {
		t.Fatalf("première déclaration refusée : %v", err)
	}
	if err := r.Declare("GET", "/v1/admin/users", DashboardRead); err == nil {
		t.Fatal("route déclarée deux fois acceptée")
	}
	// Une seconde tentative ne doit pas écraser la première.
	if c, _ := r.Lookup("GET", "/v1/admin/users"); c != UsersRead {
		t.Fatalf("capacité écrasée par le doublon : %q", c)
	}
}

func TestRegistry_RefusesInvalidDeclaration(t *testing.T) {
	cases := []struct {
		name    string
		method  string
		pattern string
		cap     Capability
	}{
		{"capacité inconnue", "GET", "/v1/admin/x", Capability("admin.nope.read")},
		{"capacité vide", "GET", "/v1/admin/x", Capability("")},
		{"méthode vide", "", "/v1/admin/x", UsersRead},
		{"motif sans slash", "GET", "v1/admin/x", UsersRead},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			r := NewRegistry()
			if err := r.Declare(tc.method, tc.pattern, tc.cap); err == nil {
				t.Fatalf("déclaration invalide acceptée (%+v)", tc)
			}
			if r.Len() != 0 {
				t.Fatalf("registre pollué par une déclaration invalide")
			}
		})
	}
}

func TestRegistry_RoutesSortedAndCopied(t *testing.T) {
	r := NewRegistry()
	_ = r.Declare("POST", "/v1/admin/users", UsersModerate)
	_ = r.Declare("GET", "/v1/admin/users", UsersRead)
	_ = r.Declare("GET", "/v1/admin/dashboard", DashboardRead)

	routes := r.Routes()
	if len(routes) != 3 {
		t.Fatalf("Routes = %d", len(routes))
	}
	for i := 1; i < len(routes); i++ {
		if routes[i-1].Key() >= routes[i].Key() {
			t.Fatalf("Routes non triées : %v", routes)
		}
	}
	// La copie protège l'ordre interne.
	routes[0] = Route{Method: "DELETE", Pattern: "/zzz", Capability: DashboardRead}
	if again := r.Routes(); again[0].Key() == "DELETE /zzz" {
		t.Fatal("Routes a rendu la tranche interne")
	}
	if r.ForCapability(UsersRead) == nil || len(r.ForCapability(UsersRead)) != 1 {
		t.Fatalf("ForCapability(UsersRead) = %v", r.ForCapability(UsersRead))
	}
	if len(r.ForCapability(CampaignsWrite)) != 0 {
		t.Fatal("ForCapability rend des routes pour une capacité non utilisée")
	}
}

func TestRegistry_CapabilitiesUsed(t *testing.T) {
	r := NewRegistry()
	_ = r.Declare("GET", "/v1/admin/a", UsersRead)
	_ = r.Declare("GET", "/v1/admin/b", UsersRead)
	_ = r.Declare("POST", "/v1/admin/c", UsersModerate)
	used := r.CapabilitiesUsed()
	if len(used) != 2 {
		t.Fatalf("CapabilitiesUsed = %v", used)
	}
	if used[0] != UsersModerate || used[1] != UsersRead {
		t.Fatalf("CapabilitiesUsed non trié : %v", used)
	}
}

func TestRouteKey(t *testing.T) {
	if got := RouteKey("get", "/v1/admin/x"); got != "GET /v1/admin/x" {
		t.Fatalf("RouteKey = %q", got)
	}
	if got := RouteKey("  Post ", "/v1/admin/x"); got != "POST /v1/admin/x" {
		t.Fatalf("RouteKey = %q", got)
	}
	if got := (Route{Method: "GET", Pattern: "/v1/admin/x", Capability: UsersRead}).String(); got != "GET /v1/admin/x → admin.users.read" {
		t.Fatalf("String = %q", got)
	}
}

// ─── Set / Access : contrat JSON ───────────────────────────────────────

// TestSetListsAreNeverNil — une liste vide doit se sérialiser en [] et jamais
// en null : c'est ce null qui avait fait tomber la console (« This page
// couldn't load »).
func TestSetListsAreNeverNil(t *testing.T) {
	var empty Set
	if empty.List() == nil {
		t.Fatal("Set.List nul")
	}
	if empty.Keys() == nil {
		t.Fatal("Set.Keys nul")
	}
	var zero Access
	if zero.RoleKeys() == nil {
		t.Fatal("Access.RoleKeys nul")
	}
	if zero.CapabilityKeys() == nil {
		t.Fatal("Access.CapabilityKeys nul")
	}

	payload, err := json.Marshal(struct {
		Roles        []string `json:"roles"`
		Capabilities []string `json:"capabilities"`
	}{zero.RoleKeys(), zero.CapabilityKeys()})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	want := `{"roles":[],"capabilities":[]}`
	if string(payload) != want {
		t.Fatalf("JSON = %s, attendu %s", payload, want)
	}
}

func TestSetUnionAndHas(t *testing.T) {
	a := Set{UsersRead: true}
	b := Set{UsersModerate: true}
	u := a.Union(b)
	if !u.Has(UsersRead) || !u.Has(UsersModerate) {
		t.Fatalf("Union incomplète : %v", u)
	}
	if a.Has(UsersModerate) {
		t.Fatal("Union a modifié l'ensemble d'origine")
	}
	if (Set{UsersRead: false}).Has(UsersRead) {
		t.Fatal("une entrée à false accorde la capacité")
	}
	if !(Set{}).Empty() {
		t.Fatal("Set vide non vide")
	}
}

func TestAccessHelpers(t *testing.T) {
	a := Access{UserID: "u", Roles: []string{RoleSupport, RoleSuperadmin}, Capabilities: Set{SelfRead: true}}
	if !a.IsSuperadmin() {
		t.Fatal("IsSuperadmin faux")
	}
	if a.RoleKeys()[0] != RoleSuperadmin {
		t.Fatalf("RoleKeys non trié : %v", a.RoleKeys())
	}
	if !a.Has(SelfRead) || a.Has(UsersModerate) {
		t.Fatal("Has incohérent")
	}
	plain := Access{Roles: []string{RoleAnalyst}}
	if plain.IsSuperadmin() {
		t.Fatal("analyst vu comme superadmin")
	}
}
