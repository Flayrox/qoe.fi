package middleware

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/qoefi/api/internal/authz"
)

// TestRequireAction_RefusalMatrix parcourt chaque motif de refus du garde et
// vérifie deux choses à chaque fois : le handler protégé n'est JAMAIS atteint,
// et la réponse n'est jamais 200. C'est la garantie « aucun refus ne renvoie
// 200 » demandée par la revue de sécurité.
func TestRequireAction_RefusalMatrix(t *testing.T) {
	strong := claimsFor("u1", "aal2", guardNow.Add(-time.Minute), authz.MethodTOTP)
	weak := claimsFor("u1", "aal1", guardNow.Add(-time.Minute), authz.MethodPassword)
	smsOnly := claimsFor("u1", "aal2", guardNow.Add(-time.Minute), authz.MethodOTP)
	stale := claimsFor("u1", "aal2", guardNow.Add(-2*time.Hour), authz.MethodTOTP)
	noSubject := map[string]any{"aal": "aal2", "amr": []any{map[string]any{"method": authz.MethodTOTP}}}

	grantAll := func(_ context.Context, _ *http.Request, _ authz.Session, _ authz.Action) authz.Inputs {
		return authz.Inputs{MediaPermissionResolved: true, HasMediaPermission: true, PhoneVerified: true}
	}
	grantNoPhone := func(_ context.Context, _ *http.Request, _ authz.Session, _ authz.Action) authz.Inputs {
		return authz.Inputs{MediaPermissionResolved: true, HasMediaPermission: true}
	}
	grantSuspended := func(_ context.Context, _ *http.Request, _ authz.Session, _ authz.Action) authz.Inputs {
		return authz.Inputs{MediaPermissionResolved: true, HasMediaPermission: true, Suspended: true}
	}
	grantUnresolved := func(_ context.Context, _ *http.Request, _ authz.Session, _ authz.Action) authz.Inputs {
		return authz.Inputs{HasMediaPermission: true}
	}
	grantWithout := func(_ context.Context, _ *http.Request, _ authz.Session, _ authz.Action) authz.Inputs {
		return authz.Inputs{MediaPermissionResolved: true, HasMediaPermission: false}
	}

	cases := []struct {
		name   string
		claims map[string]any
		action authz.Action
		opts   []AuthzOption
		code   authz.Code
	}{
		{"pas de claims du tout", nil, authz.ActionMediaPublish, nil, authz.CodeDenyNoSession},
		{"claims sans sub", noSubject, authz.ActionMediaPublish, nil, authz.CodeDenyNoSession},
		{"action inconnue", strong, authz.Action("action_forgee"), []AuthzOption{WithAuthzResolver(grantAll)}, authz.CodeDenyUnknownAction},
		{"membership non résolue", strong, authz.ActionMediaMembersWrite, []AuthzOption{WithAuthzResolver(grantUnresolved)}, authz.CodeDenyNoResourcePermission},
		{"aucun resolver branché", strong, authz.ActionMediaMembersWrite, nil, authz.CodeDenyNoResourcePermission},
		{"rôle sans la permission", strong, authz.ActionMediaPublish, []AuthzOption{WithAuthzResolver(grantWithout)}, authz.CodeDenyNoResourcePermission},
		{"acteur suspendu", strong, authz.ActionMediaPublish, []AuthzOption{WithAuthzResolver(grantSuspended)}, authz.CodeDenySuspended},
		{"session mot de passe seul", weak, authz.ActionMediaPublish, []AuthzOption{WithAuthzResolver(grantAll)}, authz.CodeNeedsStepUp},
		{"aal2 obtenu par SMS", smsOnly, authz.ActionMediaPublish, []AuthzOption{WithAuthzResolver(grantAll)}, authz.CodeDenyWeakAuth},
		{"téléphone non vérifié", strong, authz.ActionImportRequest, []AuthzOption{WithAuthzResolver(grantNoPhone)}, authz.CodeDenyPhoneRequired},
		{"preuve forte trop ancienne", stale, authz.ActionSubscribersExport, []AuthzOption{WithAuthzResolver(grantAll)}, authz.CodeNeedsStepUp},
	}

	for _, c := range cases {
		c := c
		t.Run(c.name, func(t *testing.T) {
			rec, reached := guardRequest(t, c.claims, c.action, c.opts...)
			if reached {
				t.Fatalf("le handler a été atteint malgré un refus attendu")
			}
			if rec.Code == http.StatusOK {
				t.Fatalf("un refus a renvoyé 200")
			}
			if rec.Code != http.StatusForbidden {
				t.Fatalf("status = %d, attendu 403", rec.Code)
			}
			if got := rec.Header().Get("X-Qoe-Authz-Code"); got != string(c.code) {
				t.Fatalf("code = %q, attendu %q", got, c.code)
			}
		})
	}
}

// TestRequireAction_AllowedMatrix : les seuls cas qui passent sont ceux qui
// fournissent toutes les preuves. Le passage se fait avec 200 et le handler
// exécuté — pas par une réponse vide considérée comme un succès.
func TestRequireAction_AllowedMatrix(t *testing.T) {
	strong := claimsFor("u1", "aal2", guardNow.Add(-time.Minute), authz.MethodTOTP)
	cases := []struct {
		name   string
		action authz.Action
		inputs authz.Inputs
	}{
		{"permission média accordée", authz.ActionMediaPublish, authz.Inputs{MediaPermissionResolved: true, HasMediaPermission: true}},
		{"action sans permission média", authz.ActionMediaCreate, authz.Inputs{}},
		{"téléphone vérifié", authz.ActionImportRequest, authz.Inputs{MediaPermissionResolved: true, HasMediaPermission: true, PhoneVerified: true}},
	}
	for _, c := range cases {
		c := c
		t.Run(c.name, func(t *testing.T) {
			rec, reached := guardRequest(t, strong, c.action,
				WithAuthzResolver(func(context.Context, *http.Request, authz.Session, authz.Action) authz.Inputs {
					return c.inputs
				}))
			if !reached || rec.Code != http.StatusOK {
				t.Fatalf("status=%d reached=%v, attendu 200 et handler exécuté", rec.Code, reached)
			}
		})
	}
}

// TestAuthzResourceOf_DefaultsToNone : sans déclaration explicite, aucune
// ressource n'est résolue — donc aucun droit média n'est accordé par défaut.
func TestAuthzResourceOf_DefaultsToNone(t *testing.T) {
	kind, param := AuthzResourceOf(context.Background())
	if kind != AuthzResourceNone || param != "" {
		t.Fatalf("kind=%v param=%q, attendu (none, \"\")", kind, param)
	}
}

// TestMediaIDForRoute_UnresolvedCases : les cas non identifiables ne doivent
// jamais produire d'identifiant (donc jamais de résolution de droits).
func TestMediaIDForRoute_UnresolvedCases(t *testing.T) {
	cases := []struct {
		name   string
		kind   AuthzResource
		param  string
		url    string
		expect string
	}{
		{"paramètre absent", AuthzResourceMedia, "", "/v1/media/m1", ""},
		{"média sans valeur d'URL", AuthzResourceMedia, "mediaID", "/v1/media", ""},
		{"type non déclaré", AuthzResourceNone, "mediaID", "/v1/media/m1", ""},
		{"publication inconnue", AuthzResourcePublisher, "publisherID", "/v1/publishers/p-forge", ""},
		{"newsletter inconnue", AuthzResourceNewsletter, "issueID", "/v1/newsletters/i-forge", ""},
		{"média porté par l'URL", AuthzResourceMedia, "mediaID", "/v1/media/m-42", "m-42"},
	}
	for _, c := range cases {
		c := c
		t.Run(c.name, func(t *testing.T) {
			r := httptest.NewRequest(http.MethodPost, c.url, nil)
			rctx := chi.NewRouteContext()
			if c.param != "" {
				rctx.URLParams.Add(c.param, c.expect)
			}
			r = r.WithContext(context.WithValue(r.Context(), chi.RouteCtxKey, rctx))
			// Un pool nil est volontaire : les chemins testés ici ne doivent
			// pas toucher la base avant d'avoir constaté l'absence de valeur.
			got := mediaIDForRoute(r.Context(), nil, r, c.kind, c.param)
			if got != c.expect {
				t.Fatalf("mediaIDForRoute(kind=%v, param=%q, url=%q) = %q, attendu %q", c.kind, c.param, c.url, got, c.expect)
			}
		})
	}
}
