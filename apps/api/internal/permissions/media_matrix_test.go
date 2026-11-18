package permissions

import "testing"

// mediaRoles est le vocabulaire fermé des rôles média. Les cas « vides » et
// « inconnus » sont inclus volontairement : un rôle absent, vide ou inventé ne
// doit jamais hériter d'un droit par défaut.
var mediaRoles = []string{"owner", "editor", "writer", "viewer", "", "admin", "member", "ghost", "OWNER"}

// expectedMatrix est écrite à la main, pas dérivée de rolePermissions : si
// quelqu'un élargit un rôle par mégarde, ce test doit échouer au lieu de
// constater le nouveau comportement. Toute permission absente de la carte est
// attendue à false pour tous les rôles.
var expectedMatrix = map[string]map[string]bool{
	"owner": {
		PermManageMembers: true, PermManageSettings: true, PermManageBilling: true,
		PermManageCategories: true, PermManageNewsletter: true, PermPublishAny: true,
		PermEditAny: true, PermDeleteAny: true, PermReview: true, PermViewAnalytics: true,
		PermCreateArticles: true, PermEditOwn: true, PermManageApiKeys: true,
		PermImportSubscribers: true,
	},
	"editor": {
		PermManageCategories: true, PermManageNewsletter: true, PermPublishAny: true,
		PermEditAny: true, PermDeleteAny: true, PermReview: true, PermViewAnalytics: true,
		PermCreateArticles: true, PermEditOwn: true,
	},
	"writer": {
		PermCreateArticles: true, PermEditOwn: true,
	},
	"viewer": {},
}

// TestCanMedia_FullRolePermissionMatrix couvre chaque rôle × chaque permission
// du vocabulaire (plus deux permissions hors vocabulaire). C'est la preuve que
// l'autorisation média n'est pas seulement « testée sur quelques exemples ».
func TestCanMedia_FullRolePermissionMatrix(t *testing.T) {
	permissions := append(AllMediaPermissions(), PermMediaUnknownProbe, "admin.*")
	for _, role := range mediaRoles {
		role := role
		want := expectedMatrix[role]
		for _, perm := range permissions {
			perm := perm
			t.Run(role+"/"+perm, func(t *testing.T) {
				got := CanMedia(&MediaMember{Role: role, Status: "active"}, perm)
				if got != want[perm] {
					t.Fatalf("CanMedia(role=%q, perm=%q) = %v, attendu %v", role, perm, got, want[perm])
				}
			})
		}
	}
}

// PermMediaUnknownProbe est une permission qui n'existe pas : aucun rôle ne
// doit l'accorder implicitement.
const PermMediaUnknownProbe = "media:probe:inconnue"

// TestCanMedia_StatusMatrix : seul un membre actif exerce des droits. Le statut
// vide reste toléré pour les appelants qui ne résolvent pas le statut ; tout
// autre statut (invitation en attente, suspension, révocation) est refusé.
func TestCanMedia_StatusMatrix(t *testing.T) {
	cases := []struct {
		status string
		want   bool
	}{
		{"", true},
		{"active", true},
		{"invited", false},
		{"pending", false},
		{"suspended", false},
		{"removed", false},
		{"revoked", false},
		{"ACTIVE", false}, // comparaison stricte : pas de normalisation implicite
	}
	for _, c := range cases {
		c := c
		t.Run("status="+c.status, func(t *testing.T) {
			m := &MediaMember{Role: "owner", Status: c.status}
			for _, perm := range AllMediaPermissions() {
				if got := CanMedia(m, perm); got != c.want {
					t.Fatalf("status=%q perm=%q = %v, attendu %v", c.status, perm, got, c.want)
				}
			}
			if got := IsMediaAdmin(m); got != c.want {
				t.Fatalf("IsMediaAdmin(status=%q) = %v, attendu %v (un membre non actif n'administre pas)", c.status, got, c.want)
			}
			if got := CanEditMediaArticle(m, "a", "b"); got != c.want {
				t.Fatalf("CanEditMediaArticle(status=%q) = %v, attendu %v", c.status, got, c.want)
			}
		})
	}
}

// TestCanMedia_OverrideMatrix verrouille la sémantique des overrides : « perm »
// accorde, « -perm » retire, l'ordre de la liste tranche, et un override ne
// fuit jamais vers une autre permission.
func TestCanMedia_OverrideMatrix(t *testing.T) {
	cases := []struct {
		name    string
		member  MediaMember
		perm    string
		want    bool
		explain string
	}{
		{"viewer + publish", MediaMember{Role: "viewer", Permissions: []string{PermPublishAny}}, PermPublishAny, true, "override explicite"},
		{"viewer + analytics", MediaMember{Role: "viewer", Permissions: []string{PermViewAnalytics}}, PermViewAnalytics, true, "analytics accordables par override"},
		{"writer + manage_members", MediaMember{Role: "writer", Permissions: []string{PermManageMembers}}, PermManageMembers, true, "override explicite"},
		{"owner - billing", MediaMember{Role: "owner", Permissions: []string{"-" + PermManageBilling}}, PermManageBilling, false, "retrait explicite"},
		{"owner - billing then +", MediaMember{Role: "owner", Permissions: []string{"-" + PermManageBilling, PermManageBilling}}, PermManageBilling, true, "le dernier override gagne"},
		{"owner + then -", MediaMember{Role: "owner", Permissions: []string{PermManageBilling, "-" + PermManageBilling}}, PermManageBilling, false, "le dernier override gagne"},
		{"writer + publish ne fuit pas", MediaMember{Role: "writer", Permissions: []string{PermPublishAny}}, PermDeleteAny, false, "pas d'élargissement latéral"},
		{"writer + publish ne fuit pas sur settings", MediaMember{Role: "writer", Permissions: []string{PermPublishAny}}, PermManageSettings, false, "pas d'élargissement latéral"},
		{"viewer + inconnue", MediaMember{Role: "viewer", Permissions: []string{"media:inventee"}}, "media:inventee", true, "un override inconnu reste inerte sur le reste"},
		{"viewer + inconnue ne donne rien d'autre", MediaMember{Role: "viewer", Permissions: []string{"media:inventee"}}, PermViewAnalytics, false, "override non lié"},
		{"owner - inconnue", MediaMember{Role: "owner", Permissions: []string{"-media:inventee"}}, PermManageBilling, true, "retrait d'une permission non détenue sans effet"},
		{"suspended + override", MediaMember{Role: "viewer", Status: "suspended", Permissions: []string{PermPublishAny}}, PermPublishAny, false, "le statut prime sur l'override"},
		{"invited + override", MediaMember{Role: "viewer", Status: "invited", Permissions: []string{PermManageMembers}}, PermManageMembers, false, "une invitation non acceptée n'exerce rien"},
		{"empty string override", MediaMember{Role: "writer", Permissions: []string{""}}, PermCreateArticles, true, "une chaîne vide ne casse pas le calcul"},
	}
	for _, c := range cases {
		c := c
		t.Run(c.name, func(t *testing.T) {
			m := c.member
			if got := CanMedia(&m, c.perm); got != c.want {
				t.Fatalf("CanMedia(%+v, %q) = %v, attendu %v (%s)", c.member, c.perm, got, c.want, c.explain)
			}
		})
	}
}

// TestEffectivePermissions_NeverEscalates vérifie que l'ensemble effectif ne
// contient jamais une permission absente du rôle sauf override explicite, et
// qu'il reste déterministe et sans doublon.
func TestEffectivePermissions_NeverEscalates(t *testing.T) {
	allowed := map[string]map[string]bool{}
	for _, role := range mediaRoles {
		allowed[role] = expectedMatrix[role]
	}
	for _, role := range mediaRoles {
		role := role
		m := &MediaMember{Role: role, Status: "active"}
		got := EffectivePermissions(m)
		seen := map[string]bool{}
		for _, p := range got {
			if seen[p] {
				t.Fatalf("role=%q : permission dupliquée %q dans %v", role, p, got)
			}
			seen[p] = true
			if !allowed[role][p] {
				t.Fatalf("role=%q : permission %q accordée sans override", role, p)
			}
		}
		for _, p := range AllMediaPermissions() {
			if allowed[role][p] && !seen[p] {
				t.Fatalf("role=%q : permission %q manquante dans %v", role, p, got)
			}
		}
	}

	if got := EffectivePermissions(&MediaMember{Role: "owner", Status: "suspended"}); len(got) != 0 {
		t.Fatalf("membre suspendu : %v, attendu aucune permission", got)
	}
	if got := EffectivePermissions(nil); len(got) != 0 {
		t.Fatalf("nil : %v, attendu aucune permission", got)
	}
	if got := EffectivePermissions(&MediaMember{Role: "viewer", Permissions: []string{PermReview}}); len(got) != 1 || got[0] != PermReview {
		t.Fatalf("override seul : %v, attendu [%s]", got, PermReview)
	}
}

// TestCanEditMediaArticle_Matrix couvre la double règle edit:any / edit:own.
func TestCanEditMediaArticle_Matrix(t *testing.T) {
	cases := []struct {
		role      string
		status    string
		author    string
		member    string
		want      bool
		rationale string
	}{
		{"owner", "active", "someoneelse", "me", true, "owner édite tout"},
		{"editor", "active", "someoneelse", "me", true, "editor édite tout"},
		{"writer", "active", "me", "me", true, "writer édite le sien"},
		{"writer", "active", "someoneelse", "me", false, "writer n'édite pas celui d'autrui"},
		{"writer", "", "me", "me", true, "statut vide toléré"},
		{"viewer", "active", "me", "me", false, "viewer ne crée pas"},
		{"", "active", "me", "me", false, "rôle vide"},
		{"ghost", "active", "me", "me", false, "rôle inconnu"},
		{"owner", "invited", "me", "me", false, "invitation non acceptée"},
		{"editor", "suspended", "me", "me", false, "suspension"},
	}
	for _, c := range cases {
		c := c
		t.Run(c.role+"/"+c.status+"/"+c.author+"="+c.member, func(t *testing.T) {
			m := &MediaMember{Role: c.role, Status: c.status}
			if got := CanEditMediaArticle(m, c.author, c.member); got != c.want {
				t.Fatalf("CanEditMediaArticle(role=%q, status=%q, author=%q, member=%q) = %v, attendu %v (%s)",
					c.role, c.status, c.author, c.member, got, c.want, c.rationale)
			}
		})
	}
	if CanEditMediaArticle(nil, "me", "me") {
		t.Fatal("nil ne doit jamais éditer")
	}
}

// TestIsMediaAdmin_Matrix : seul owner/editor administre, et jamais un membre
// non actif.
func TestIsMediaAdmin_Matrix(t *testing.T) {
	cases := []struct {
		role string
		want bool
	}{
		{"owner", true}, {"editor", true}, {"writer", false}, {"viewer", false},
		{"", false}, {"ghost", false}, {"admin", false}, {"OWNER", false},
	}
	for _, c := range cases {
		if got := IsMediaAdmin(&MediaMember{Role: c.role, Status: "active"}); got != c.want {
			t.Errorf("IsMediaAdmin(role=%q) = %v, attendu %v", c.role, got, c.want)
		}
	}
	if IsMediaAdmin(nil) {
		t.Error("nil ne doit pas être admin")
	}
}
