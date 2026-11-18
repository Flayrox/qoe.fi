package authz

import (
	"testing"
	"time"

	"github.com/qoefi/api/internal/permissions"
)

// matrixRoles est le vocabulaire fermé des rôles média, complété des cas
// dégénérés (vide, inconnu, inconnu en majuscules) : aucun ne doit ouvrir une
// action qui exige une permission média.
var matrixRoles = []string{"owner", "editor", "writer", "viewer", "", "member", "ghost", "OWNER"}

// TestEvaluate_ActionRoleMatrix croise **toutes** les actions du registre avec
// tous les rôles média. C'est la preuve que le registre et les permissions ne
// peuvent pas diverger silencieusement : chaque action qui exige une
// permission média doit refuser tout rôle qui ne la détient pas, et n'accepter
// que ceux qui la détiennent.
func TestEvaluate_ActionRoleMatrix(t *testing.T) {
	// Session fraîche et forte : tout refus observé vient donc de la
	// permission, jamais du niveau d'authentification.
	session := sessionWith("u1", "aal2", ago(time.Minute), totp(ago(time.Minute)))
	now := testNow

	actions := Actions()
	if len(actions) == 0 {
		t.Fatal("registre d'actions vide : le test ne prouve rien")
	}

	for _, action := range actions {
		rule, ok := Lookup(action)
		if !ok {
			t.Fatalf("Actions() contient %q absent de Lookup", action)
		}
		for _, role := range matrixRoles {
			role := role
			hasPermission := rule.MediaPermission != "" && permissions.CanMedia(
				&permissions.MediaMember{Role: role, Status: "active"}, rule.MediaPermission)
			in := Inputs{
				MediaPermissionResolved: true,
				HasMediaPermission:      hasPermission,
				PhoneVerified:           true,
				SecondApproval:          true,
			}
			d := Evaluate(session, action, in, now)

			t.Run(string(action)+"/"+role, func(t *testing.T) {
				if rule.MediaPermission == "" {
					// Aucune permission média exigée : la résolution ne doit
					// jamais produire un refus de ressource.
					if d.Code == CodeDenyNoResourcePermission {
						t.Fatalf("action %q sans permission média refusée pour permission manquante", action)
					}
					return
				}
				if !hasPermission {
					if d.Allowed || d.Code != CodeDenyNoResourcePermission {
						t.Fatalf("role=%q sur %q (permission %q) : allowed=%v code=%q, attendu refus %q",
							role, action, rule.MediaPermission, d.Allowed, d.Code, CodeDenyNoResourcePermission)
					}
					return
				}
				if !d.Allowed {
					t.Fatalf("role=%q sur %q (permission %q) : refusé code=%q alors que la permission est détenue",
						role, action, rule.MediaPermission, d.Code)
				}
			})
		}
	}
}

// TestEvaluate_UnresolvedPermissionMatrix : même avec une session parfaite,
// l'absence de résolution de la membership n'autorise aucune action qui exige
// une permission média. C'est le cœur du refus par défaut.
func TestEvaluate_UnresolvedPermissionMatrix(t *testing.T) {
	session := sessionWith("u1", "aal2", ago(time.Minute), totp(ago(time.Minute)))
	for _, action := range Actions() {
		rule, ok := Lookup(action)
		if !ok || rule.MediaPermission == "" {
			continue
		}
		d := Evaluate(session, action, Inputs{PhoneVerified: true, SecondApproval: true}, testNow)
		if d.Allowed || d.Code != CodeDenyNoResourcePermission {
			t.Errorf("action %q non résolue : allowed=%v code=%q, attendu refus %q",
				action, d.Allowed, d.Code, CodeDenyNoResourcePermission)
		}
	}
}

// TestEvaluate_NoRoleEverBypasses : pour chaque action à permission média, un
// membre « owner » privé de cette permission (override négatif) est refusé.
// Cela prouve que le rôle lui-même n'est jamais consulté directement par
// l'évaluateur : seule la résolution compte.
func TestEvaluate_OwnerOverrideRevokeMatrix(t *testing.T) {
	session := sessionWith("u1", "aal2", ago(time.Minute), totp(ago(time.Minute)))
	for _, action := range Actions() {
		rule, ok := Lookup(action)
		if !ok || rule.MediaPermission == "" {
			continue
		}
		revoked := &permissions.MediaMember{
			Role:        "owner",
			Status:      "active",
			Permissions: []string{"-" + rule.MediaPermission},
		}
		has := permissions.CanMedia(revoked, rule.MediaPermission)
		if has {
			t.Fatalf("l'override négatif n'a pas retiré %q", rule.MediaPermission)
		}
		d := Evaluate(session, action, Inputs{
			MediaPermissionResolved: true,
			HasMediaPermission:      has,
			PhoneVerified:           true,
			SecondApproval:          true,
		}, testNow)
		if d.Allowed || d.Code != CodeDenyNoResourcePermission {
			t.Errorf("action %q avec permission révoquée : allowed=%v code=%q", action, d.Allowed, d.Code)
		}
	}
}
