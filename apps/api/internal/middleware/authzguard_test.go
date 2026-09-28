package middleware

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/qoefi/api/internal/authz"
)

var guardNow = time.Date(2026, 9, 28, 12, 0, 0, 0, time.UTC)

// claimsFor construit des claims JWT Supabase minimaux pour le garde.
func claimsFor(userID, aal string, iat time.Time, methods ...string) map[string]any {
	amr := make([]any, 0, len(methods))
	for _, m := range methods {
		amr = append(amr, map[string]any{"method": m, "timestamp": float64(iat.Unix())})
	}
	return map[string]any{
		"sub":        userID,
		"session_id": "sess-guard",
		"aal":        aal,
		"iat":        float64(iat.Unix()),
		"amr":        amr,
	}
}

func guardRequest(t *testing.T, claims map[string]any, action authz.Action, opts ...AuthzOption) (*httptest.ResponseRecorder, bool) {
	t.Helper()
	reached := false
	next := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		reached = true
		w.WriteHeader(http.StatusOK)
	})

	// Les tests portent sur le refus : on force l'enforcement ici. Le défaut de
	// RequireAction est l'observation (voir TestRequireActionDefaultIsObserve).
	opts = append([]AuthzOption{
		WithAuthzClock(func() time.Time { return guardNow }),
		WithAuthzMode(AuthzEnforce),
	}, opts...)
	h := RequireAction(action, opts...)(next)

	req := httptest.NewRequest(http.MethodPost, "/v1/media/m1/members", nil)
	if claims != nil {
		req = req.WithContext(context.WithValue(req.Context(), ClaimsKey, claims))
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec, reached
}

func TestRequireActionNoSession(t *testing.T) {
	rec, reached := guardRequest(t, nil, authz.ActionMediaPublish)
	if rec.Code != http.StatusForbidden || reached {
		t.Fatalf("status=%d reached=%v, attendu 403 sans passage", rec.Code, reached)
	}
	if got := rec.Header().Get("X-Qoe-Authz-Code"); got != string(authz.CodeDenyNoSession) {
		t.Fatalf("code = %q, attendu %q", got, authz.CodeDenyNoSession)
	}
}

func TestRequireActionUnknownAction(t *testing.T) {
	claims := claimsFor("u1", "aal2", guardNow.Add(-time.Minute), authz.MethodTOTP)
	rec, reached := guardRequest(t, claims, authz.Action("action_fantome"))
	if rec.Code != http.StatusForbidden || reached {
		t.Fatalf("status=%d reached=%v", rec.Code, reached)
	}
	if got := rec.Header().Get("X-Qoe-Authz-Code"); got != string(authz.CodeDenyUnknownAction) {
		t.Fatalf("code = %q", got)
	}
}

func TestRequireActionStepUpRequired(t *testing.T) {
	// Session mot de passe seul : créer un média exige la MFA forte.
	claims := claimsFor("u1", "aal1", guardNow.Add(-time.Minute), authz.MethodPassword)
	rec, reached := guardRequest(t, claims, authz.ActionMediaCreate)
	if rec.Code != http.StatusForbidden || reached {
		t.Fatalf("status=%d reached=%v", rec.Code, reached)
	}
	if got := rec.Header().Get("X-Qoe-Authz-Code"); got != string(authz.CodeNeedsStepUp) {
		t.Fatalf("code = %q, attendu %q", got, authz.CodeNeedsStepUp)
	}
	if rec.Header().Get("X-Qoe-Authz-Level") != "N1" {
		t.Fatalf("niveau annoncé = %q", rec.Header().Get("X-Qoe-Authz-Level"))
	}
}

func TestRequireActionSMSOnlyIsNotStrong(t *testing.T) {
	// aal2 obtenu par OTP SMS : ne satisfait pas la politique passkey/TOTP.
	claims := claimsFor("u1", "aal2", guardNow.Add(-time.Minute), authz.MethodOTP)
	rec, _ := guardRequest(t, claims, authz.ActionMediaPublish,
		WithAuthzResolver(func(context.Context, *http.Request, authz.Session, authz.Action) authz.Inputs {
			return authz.Inputs{MediaPermissionResolved: true, HasMediaPermission: true}
		}))
	if rec.Code != http.StatusForbidden {
		t.Fatalf("status=%d, attendu 403", rec.Code)
	}
	if got := rec.Header().Get("X-Qoe-Authz-Code"); got != string(authz.CodeDenyWeakAuth) {
		t.Fatalf("code = %q, attendu %q", got, authz.CodeDenyWeakAuth)
	}
}

func TestRequireActionAllowedWithResourcePermission(t *testing.T) {
	claims := claimsFor("u1", "aal2", guardNow.Add(-time.Minute), "mfa/webauthn")
	rec, reached := guardRequest(t, claims, authz.ActionMediaPublish,
		WithAuthzResolver(func(context.Context, *http.Request, authz.Session, authz.Action) authz.Inputs {
			return authz.Inputs{MediaPermissionResolved: true, HasMediaPermission: true}
		}))
	if !reached || rec.Code != http.StatusOK {
		t.Fatalf("status=%d reached=%v, attendu passage", rec.Code, reached)
	}
}

func TestRequireActionDeniedWithoutResourcePermission(t *testing.T) {
	claims := claimsFor("u1", "aal2", guardNow.Add(-time.Minute), authz.MethodTOTP)
	rec, reached := guardRequest(t, claims, authz.ActionMediaMembersWrite,
		WithAuthzResolver(func(context.Context, *http.Request, authz.Session, authz.Action) authz.Inputs {
			return authz.Inputs{MediaPermissionResolved: true, HasMediaPermission: false}
		}))
	if rec.Code != http.StatusForbidden || reached {
		t.Fatalf("status=%d reached=%v", rec.Code, reached)
	}
	if got := rec.Header().Get("X-Qoe-Authz-Code"); got != string(authz.CodeDenyNoResourcePermission) {
		t.Fatalf("code = %q", got)
	}
}

func TestRequireActionUnresolvedPermissionDenies(t *testing.T) {
	// Aucun resolver branché sur une action qui exige une permission média :
	// refus par défaut, pas d'autorisation implicite.
	claims := claimsFor("u1", "aal2", guardNow.Add(-time.Minute), authz.MethodTOTP)
	rec, reached := guardRequest(t, claims, authz.ActionMediaMembersWrite)
	if rec.Code != http.StatusForbidden || reached {
		t.Fatalf("status=%d reached=%v", rec.Code, reached)
	}
	if got := rec.Header().Get("X-Qoe-Authz-Code"); got != string(authz.CodeDenyNoResourcePermission) {
		t.Fatalf("code = %q", got)
	}
}

func TestRequireActionPhoneRequirement(t *testing.T) {
	claims := claimsFor("u1", "aal2", guardNow.Add(-time.Minute), authz.MethodTOTP)
	grant := func(phone bool) AuthzResolver {
		return func(context.Context, *http.Request, authz.Session, authz.Action) authz.Inputs {
			return authz.Inputs{MediaPermissionResolved: true, HasMediaPermission: true, PhoneVerified: phone}
		}
	}

	rec, _ := guardRequest(t, claims, authz.ActionImportRequest, WithAuthzResolver(grant(false)))
	if rec.Code != http.StatusForbidden || rec.Header().Get("X-Qoe-Authz-Code") != string(authz.CodeDenyPhoneRequired) {
		t.Fatalf("sans téléphone: status=%d code=%q", rec.Code, rec.Header().Get("X-Qoe-Authz-Code"))
	}

	rec, reached := guardRequest(t, claims, authz.ActionImportRequest, WithAuthzResolver(grant(true)))
	if !reached || rec.Code != http.StatusOK {
		t.Fatalf("avec téléphone: status=%d reached=%v", rec.Code, reached)
	}
}

func TestRequireActionStaleProofNeedsStepUp(t *testing.T) {
	// Preuve forte d'il y a deux heures : insuffisante pour un export d'abonnés.
	claims := claimsFor("u1", "aal2", guardNow.Add(-2*time.Hour), authz.MethodTOTP)
	rec, reached := guardRequest(t, claims, authz.ActionSubscribersExport,
		WithAuthzResolver(func(context.Context, *http.Request, authz.Session, authz.Action) authz.Inputs {
			return authz.Inputs{MediaPermissionResolved: true, HasMediaPermission: true}
		}))
	if rec.Code != http.StatusForbidden || reached {
		t.Fatalf("status=%d reached=%v", rec.Code, reached)
	}
	if got := rec.Header().Get("X-Qoe-Authz-Code"); got != string(authz.CodeNeedsStepUp) {
		t.Fatalf("code = %q", got)
	}
}

func TestRequireActionObserveModeLetsThrough(t *testing.T) {
	claims := claimsFor("u1", "aal1", guardNow.Add(-time.Minute), authz.MethodPassword)
	var seen []authz.Code
	rec, reached := guardRequest(t, claims, authz.ActionMediaCreate,
		WithAuthzMode(AuthzObserve),
		WithAuthzObserver(func(_ authz.Action, d authz.Decision, _ authz.Session) {
			seen = append(seen, d.Code)
		}))
	if !reached || rec.Code != http.StatusOK {
		t.Fatalf("mode observe: status=%d reached=%v, attendu passage", rec.Code, reached)
	}
	if len(seen) != 1 || seen[0] != authz.CodeNeedsStepUp {
		t.Fatalf("décision observée = %v, attendu [needs_step_up]", seen)
	}
}

func TestRequireActionEnforceObservesDecisions(t *testing.T) {
	claims := claimsFor("u1", "aal1", guardNow.Add(-time.Minute), authz.MethodPassword)
	var seen []authz.Code
	rec, _ := guardRequest(t, claims, authz.ActionMediaCreate,
		WithAuthzObserver(func(_ authz.Action, d authz.Decision, _ authz.Session) {
			seen = append(seen, d.Code)
		}))
	if rec.Code != http.StatusForbidden {
		t.Fatalf("status=%d", rec.Code)
	}
	if len(seen) != 1 {
		t.Fatalf("observateur non appelé en mode enforce: %v", seen)
	}
}

func TestRequireActionDefaultIsObserve(t *testing.T) {
	// Un garde monté sans option ne bloque rien : c'est ce qui permet de
	// câbler les routes avant que le refus ne soit activé.
	claims := claimsFor("u1", "aal1", guardNow.Add(-time.Minute), authz.MethodPassword)

	reached := false
	next := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		reached = true
		w.WriteHeader(http.StatusOK)
	})
	h := RequireAction(authz.ActionMediaCreate,
		WithAuthzClock(func() time.Time { return guardNow }))(next)

	req := httptest.NewRequest(http.MethodPost, "/v1/media/", nil)
	req = req.WithContext(context.WithValue(req.Context(), ClaimsKey, claims))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if !reached || rec.Code != http.StatusOK {
		t.Fatalf("défaut: status=%d reached=%v, attendu passage", rec.Code, reached)
	}
}

func TestRequireActionModeResolverDrivesEnforcement(t *testing.T) {
	claims := claimsFor("u1", "aal1", guardNow.Add(-time.Minute), authz.MethodPassword)

	// Resolver à vrai → enforcement : la requête est refusée.
	rec, reached := guardRequest(t, claims, authz.ActionMediaCreate,
		WithAuthzModeResolver(func(context.Context) bool { return true }))
	if rec.Code != http.StatusForbidden || reached {
		t.Fatalf("enforce: status=%d reached=%v", rec.Code, reached)
	}

	// Resolver à faux → observation : la requête passe malgré le refus.
	rec, reached = guardRequest(t, claims, authz.ActionMediaCreate,
		WithAuthzModeResolver(func(context.Context) bool { return false }))
	if rec.Code != http.StatusOK || !reached {
		t.Fatalf("observe: status=%d reached=%v", rec.Code, reached)
	}
}

func TestRequireActionDeclaresResourceForResolver(t *testing.T) {
	claims := claimsFor("u1", "aal2", guardNow.Add(-time.Minute), authz.MethodTOTP)

	var kind AuthzResource
	var param string
	_, _ = guardRequest(t, claims, authz.ActionMediaMembersWrite,
		WithAuthzResource(AuthzResourceMedia, "id"),
		WithAuthzResolver(func(ctx context.Context, _ *http.Request, _ authz.Session, _ authz.Action) authz.Inputs {
			kind, param = AuthzResourceOf(ctx)
			return authz.Inputs{MediaPermissionResolved: true, HasMediaPermission: true}
		}))
	if kind != AuthzResourceMedia || param != "id" {
		t.Fatalf("ressource déclarée = (%v, %q), attendu (media, id)", kind, param)
	}

	// Sans déclaration, le resolver ne voit aucune ressource : une action qui
	// exige une permission média ne peut donc pas être autorisée par défaut.
	kind, param = AuthzResourceMedia, "id"
	_, _ = guardRequest(t, claims, authz.ActionReadContent,
		WithAuthzResolver(func(ctx context.Context, _ *http.Request, _ authz.Session, _ authz.Action) authz.Inputs {
			kind, param = AuthzResourceOf(ctx)
			return authz.Inputs{}
		}))
	if kind != AuthzResourceNone || param != "" {
		t.Fatalf("ressource non déclarée = (%v, %q), attendu (none, \"\")", kind, param)
	}
}

func TestRequireActionDenialBodyIsExploitable(t *testing.T) {
	rec, _ := guardRequest(t, nil, authz.ActionMediaCreate)
	body := rec.Body.String()
	if body == "" || body[0] != '{' {
		t.Fatalf("corps de refus inattendu: %q", body)
	}
	var parsed map[string]any
	if err := json.Unmarshal([]byte(body), &parsed); err != nil {
		t.Fatalf("corps non JSON: %v (%q)", err, body)
	}
	for _, key := range []string{"error", "code", "action", "level"} {
		if _, ok := parsed[key]; !ok {
			t.Fatalf("clé %q absente du refus: %v", key, parsed)
		}
	}
}
