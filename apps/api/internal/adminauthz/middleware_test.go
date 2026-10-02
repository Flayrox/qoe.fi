package adminauthz

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/qoefi/api/internal/authz"
	"github.com/qoefi/api/internal/middleware"
)

// plainLookup est un Lookup sans politique d'application : il sert à tester le
// mode statique du garde (WithMode).
type plainLookup struct {
	access Access
	err    error
}

func (l *plainLookup) Access(ctx context.Context, userID string) (Access, error) {
	if l.err != nil {
		return Access{}, l.err
	}
	return l.access, nil
}

// policyLookup porte sa politique, comme *Service (branchée sur le flag
// `authz-enforce`).
type policyLookup struct {
	plainLookup
	enforce bool
}

func (l *policyLookup) Enforce(ctx context.Context) bool { return l.enforce }

func accessWith(caps ...Capability) Access {
	set := Set{}
	for _, c := range caps {
		set[c] = true
	}
	return Access{UserID: "u-1", Roles: []string{RoleSupport}, Capabilities: set}
}

// serve monte le garde devant un handler qui répond 200, et rejoue une requête
// portant (ou non) une identité.
func serve(t *testing.T, lookup Lookup, capability Capability, userID string, opts ...Option) *httptest.ResponseRecorder {
	t.Helper()
	next := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"ok":true}`))
	})
	h := Require(lookup, capability, opts...)(next)
	req := httptest.NewRequest(http.MethodGet, "/v1/admin/x", nil)
	if userID != "" {
		req = req.WithContext(context.WithValue(req.Context(), middleware.UserIDKey, userID))
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)
	return w
}

func decodeDenied(t *testing.T, w *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var body map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("corps non JSON : %v (%s)", err, w.Body.String())
	}
	return body
}

// TestRequire_DefaultIsObserve — une console se câble sans se verrouiller : le
// défaut est l'observation, le refus est journalisé mais la requête passe.
func TestRequire_DefaultIsObserve(t *testing.T) {
	// Un membre du staff qui DÉTIENT d'autres capacités mais pas celle-ci : sans
	// aucune capacité, ce ne serait plus un membre de la console du tout (voir
	// TestRequire_NoStaffIsRefusedEvenInObserve).
	w := serve(t, &plainLookup{access: accessWith(SubscriptionsRead)}, UsersModerate, "u-1")
	if w.Code != http.StatusOK {
		t.Fatalf("mode observation = %d, attendu 200 (%s)", w.Code, w.Body.String())
	}
}

// TestRequire_EnforceDeniesWithCode — en mode refus, une capacité absente
// produit un 403 exploitable : corps avec code + capacité, et en-tête
// X-Qoe-Authz-Code pour les proxys qui réécrivent le corps.
func TestRequire_EnforceDeniesWithCode(t *testing.T) {
	w := serve(t, &policyLookup{plainLookup: plainLookup{access: accessWith(SubscriptionsRead)}, enforce: true},
		SubscriptionsWrite, "u-1")
	if w.Code != http.StatusForbidden {
		t.Fatalf("mode refus = %d, attendu 403", w.Code)
	}
	if got := w.Header().Get("X-Qoe-Authz-Code"); got != string(authz.CodeDenyMissingCapability) {
		t.Fatalf("X-Qoe-Authz-Code = %q, attendu %q", got, authz.CodeDenyMissingCapability)
	}
	body := decodeDenied(t, w)
	if body["code"] != string(authz.CodeDenyMissingCapability) {
		t.Fatalf("corps code = %v", body["code"])
	}
	if body["capability"] != string(SubscriptionsWrite) {
		t.Fatalf("corps capability = %v, attendu %q", body["capability"], SubscriptionsWrite)
	}
}

// TestRequire_NoStaffIsRefusedEvenInObserve — un compte sans le moindre rôle
// n'a rien à faire dans la console, quel que soit le mode : l'observation
// protège un personnel légitime pendant la bascule, elle n'ouvre pas le journal
// d'audit ni les dossiers de comptes à n'importe quel porteur de jeton.
func TestRequire_NoStaffIsRefusedEvenInObserve(t *testing.T) {
	outsider := &plainLookup{access: Access{UserID: "u-1"}}
	w := serve(t, outsider, UsersRead, "u-1")
	if w.Code != http.StatusForbidden {
		t.Fatalf("compte sans rôle en observation = %d, attendu 403 (%s)", w.Code, w.Body.String())
	}
	if got := w.Header().Get("X-Qoe-Authz-Code"); got != string(authz.CodeDenyMissingCapability) {
		t.Fatalf("X-Qoe-Authz-Code = %q, attendu %q", got, authz.CodeDenyMissingCapability)
	}
}

// TestRequire_EnforceAllowsHeldCapability — détenir la capacité passe, y
// compris en mode refus.
func TestRequire_EnforceAllowsHeldCapability(t *testing.T) {
	w := serve(t, &policyLookup{plainLookup: plainLookup{access: accessWith(SubscriptionsWrite)}, enforce: true},
		SubscriptionsWrite, "u-1")
	if w.Code != http.StatusOK {
		t.Fatalf("capacité détenue = %d, attendu 200", w.Code)
	}
}

// TestRequire_GrantedElsewhereStillDenied — le garde teste la capacité EXACTE,
// jamais un niveau de rôle.
func TestRequire_GrantedElsewhereStillDenied(t *testing.T) {
	w := serve(t, &policyLookup{plainLookup: plainLookup{access: accessWith(SubscriptionsRead, SubscriptionsWrite)}, enforce: true},
		UsersModerate, "u-1")
	if w.Code != http.StatusForbidden {
		t.Fatalf("capacité voisine = %d, attendu 403", w.Code)
	}
}

// TestRequire_NoSessionAlwaysUnauthorized — sans identité il n'y a rien à
// observer : 401 dans les deux modes, quel que soit le Lookup.
func TestRequire_NoSessionAlwaysUnauthorized(t *testing.T) {
	for _, lookup := range []Lookup{
		nil,
		&plainLookup{access: accessWith(SelfRead)},
		&policyLookup{plainLookup: plainLookup{access: accessWith(SelfRead)}, enforce: true},
	} {
		for _, opts := range [][]Option{nil, {WithMode(ModeEnforce)}, {WithMode(ModeObserve)}} {
			w := serve(t, lookup, SelfRead, "", opts...)
			if w.Code != http.StatusUnauthorized {
				t.Fatalf("sans session (lookup %T, opts %v) = %d, attendu 401", lookup, opts, w.Code)
			}
			if got := w.Header().Get("X-Qoe-Authz-Code"); got != string(authz.CodeDenyNoSession) {
				t.Fatalf("code = %q, attendu %q", got, authz.CodeDenyNoSession)
			}
		}
	}
}

// TestRequire_NilLookupIsInert — un service non branché ne verrouille pas la
// console : la garde superadmin des services reste la défense en profondeur.
func TestRequire_NilLookupIsInert(t *testing.T) {
	for _, opts := range [][]Option{nil, {WithMode(ModeEnforce)}} {
		w := serve(t, nil, UsersModerate, "u-1", opts...)
		if w.Code != http.StatusOK {
			t.Fatalf("lookup nil (opts %v) = %d, attendu 200", opts, w.Code)
		}
	}
}

// TestRequire_LookupErrorObserveVsEnforce — une résolution impossible n'affirme
// rien : en observation on trace et on passe, en refus on refuse (un droit non
// prouvé n'est pas accordé).
func TestRequire_LookupErrorObserveVsEnforce(t *testing.T) {
	boom := errors.New("db down")

	w := serve(t, &plainLookup{err: boom}, UsersRead, "u-1")
	if w.Code != http.StatusOK {
		t.Fatalf("erreur en observation = %d, attendu 200", w.Code)
	}

	w = serve(t, &policyLookup{plainLookup: plainLookup{err: boom}, enforce: true}, UsersRead, "u-1")
	if w.Code != http.StatusForbidden {
		t.Fatalf("erreur en refus = %d, attendu 403", w.Code)
	}
	if got := w.Header().Get("X-Qoe-Authz-Code"); got != string(authz.CodeDenyCapabilityLookup) {
		t.Fatalf("code = %q, attendu %q", got, authz.CodeDenyCapabilityLookup)
	}
}

// TestRequire_ModeResolverOverridesLookupPolicy — le resolver du garde gagne
// sur la politique portée par le Lookup (bascule par route si besoin).
func TestRequire_ModeResolverOverridesLookupPolicy(t *testing.T) {
	lookup := &policyLookup{plainLookup: plainLookup{access: accessWith(SubscriptionsRead)}, enforce: false}
	w := serve(t, lookup, UsersModerate, "u-1",
		WithModeResolver(func(context.Context) bool { return true }))
	if w.Code != http.StatusForbidden {
		t.Fatalf("resolver enforce = %d, attendu 403", w.Code)
	}

	lookup = &policyLookup{plainLookup: plainLookup{access: accessWith(SubscriptionsRead)}, enforce: true}
	w = serve(t, lookup, UsersModerate, "u-1",
		WithModeResolver(func(context.Context) bool { return false }))
	if w.Code != http.StatusOK {
		t.Fatalf("resolver observe = %d, attendu 200", w.Code)
	}
}

// TestRequire_ObserverSeesDecisions — la supervision reçoit chaque décision,
// y compris en observation : c'est ce qui permet de mesurer avant de basculer.
func TestRequire_ObserverSeesDecisions(t *testing.T) {
	var got []Decision
	obs := func(d Decision, userID string) {
		if userID == "" {
			t.Error("observateur appelé sans identité")
		}
		got = append(got, d)
	}

	// Refus observé (staff sans cette capacité précise).
	serve(t, &plainLookup{access: accessWith(SubscriptionsRead)}, UsersModerate, "u-1", WithObserver(obs))
	if len(got) != 1 || got[0].Allowed {
		t.Fatalf("décision observée = %+v", got)
	}
	if got[0].Capability != UsersModerate || got[0].Code != authz.CodeDenyMissingCapability {
		t.Fatalf("décision = %+v", got[0])
	}
	if got[0].Mode != ModeObserve {
		t.Fatalf("mode = %s, attendu observe", got[0].Mode)
	}

	// Autorisation observée.
	got = nil
	serve(t, &plainLookup{access: accessWith(UsersModerate)}, UsersModerate, "u-1", WithObserver(obs))
	if len(got) != 1 || !got[0].Allowed || got[0].Code != authz.CodeAllow {
		t.Fatalf("décision = %+v", got)
	}
}

// TestRequire_SuperadminPassesEverywhere — le rôle superadmin (toutes les
// capacités) franchit le garde pour CHAQUE capacité du vocabulaire, en mode
// refus.
func TestRequire_SuperadminPassesEverywhere(t *testing.T) {
	super := Access{UserID: "u-root", Roles: []string{RoleSuperadmin}, Capabilities: AllCapabilities()}
	lookup := &policyLookup{plainLookup: plainLookup{access: super}, enforce: true}
	for _, c := range Capabilities() {
		w := serve(t, lookup, c, "u-root")
		if w.Code != http.StatusOK {
			t.Fatalf("superadmin refusé sur %q = %d", c, w.Code)
		}
	}
}

// TestRequire_ReadOnlyRoleDeniedEveryWrite — un rôle en lecture seule franchit
// chaque capacité de lecture et se fait refuser chaque écriture : la frontière
// est la capacité, pas une liste tenue à la main.
func TestRequire_ReadOnlyRoleDeniedEveryWrite(t *testing.T) {
	analyst := Access{UserID: "u-an", Roles: []string{RoleAnalyst}, Capabilities: RoleSet(RoleAnalyst)}
	lookup := &policyLookup{plainLookup: plainLookup{access: analyst}, enforce: true}
	for _, c := range Capabilities() {
		w := serve(t, lookup, c, "u-an")
		switch {
		case c.IsReadOnly() && w.Code != http.StatusOK:
			t.Fatalf("analyst refusé sur la lecture %q = %d", c, w.Code)
		case !c.IsReadOnly() && w.Code != http.StatusForbidden:
			t.Fatalf("analyst autorisé sur l'écriture %q = %d", c, w.Code)
		}
	}
}

// TestModeString — le mode est lisible tel quel dans les journaux.
func TestModeString(t *testing.T) {
	if ModeObserve.String() != "observe" {
		t.Fatalf("observe = %q", ModeObserve.String())
	}
	if ModeEnforce.String() != "enforce" {
		t.Fatalf("enforce = %q", ModeEnforce.String())
	}
}
