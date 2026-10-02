package adminauthz

// =====================================================================
// 🔐 Capacité × niveau de preuve (plan, Phase 3)
// =====================================================================
// Ces tests tiennent le contrat de la Phase 3 : une route peut exiger, en plus
// de sa capacité, une preuve forte RÉCENTE (N2) — et le refus doit être
// exploitable par l'écran (code `needs_step_up` / `deny_weak_auth`, niveau
// exigé), jamais un « accès refusé » muet. En observation, la décision est
// journalisée sans bloquer personne : c'est ce qui permet d'ouvrir la Phase 3
// avant d'armer le refus.
// =====================================================================

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/qoefi/api/internal/authz"
	"github.com/qoefi/api/internal/middleware"
)

// proofNow : horloge figée des tests de fraîcheur.
var proofNow = time.Date(2026, 10, 2, 9, 30, 0, 0, time.UTC)

// claimsFor construit les claims Supabase d'une session : `aal`, `iat`, et les
// méthodes réellement utilisées (`amr`). C'est exactement ce que le garde
// relit — un en-tête client ne pourrait pas les imiter.
func claimsFor(aal string, iat time.Time, methods ...map[string]any) map[string]any {
	amr := make([]any, 0, len(methods))
	for _, m := range methods {
		amr = append(amr, m)
	}
	claims := map[string]any{
		"sub":        "u-1",
		"session_id": "sess-1",
		"aal":        aal,
		"iat":        float64(iat.Unix()),
	}
	if len(amr) > 0 {
		claims["amr"] = amr
	}
	return claims
}

func method(m string, at time.Time) map[string]any {
	return map[string]any{"method": m, "timestamp": float64(at.Unix())}
}

// serveProof monte le garde devant un handler qui répond 200, avec une session
// portant les claims fournis.
func serveProof(t *testing.T, lookup Lookup, capability Capability, claims map[string]any, opts ...Option) *httptest.ResponseRecorder {
	t.Helper()
	next := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"ok":true}`))
	})
	all := append([]Option{WithClock(func() time.Time { return proofNow })}, opts...)
	h := Require(lookup, capability, all...)(next)

	req := httptest.NewRequest(http.MethodGet, "/v1/admin/x", nil)
	ctx := context.WithValue(req.Context(), middleware.UserIDKey, "u-1")
	if claims != nil {
		ctx = context.WithValue(ctx, middleware.ClaimsKey, claims)
	}
	req = req.WithContext(ctx)

	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)
	return w
}

func enforcingProofLookup(caps ...Capability) *policyLookup {
	return &policyLookup{plainLookup: plainLookup{access: accessWith(caps...)}, enforce: true}
}

// TestRequire_ProofLevelObservedByDefault — sans refus armé, une preuve
// insuffisante ne bloque pas : elle est journalisée. C'est la doctrine de
// déploiement de la console (observer, mesurer, puis armer).
func TestRequire_ProofLevelObservedByDefault(t *testing.T) {
	var seen []Decision
	// Un Lookup SANS politique : c'est le mode statique du garde (observation)
	// qu'on éprouve ici, pas le resolver du service.
	w := serveProof(t, &plainLookup{access: accessWith(UsersModerate)}, UsersModerate,
		claimsFor("aal2", proofNow.Add(-4*time.Hour), method("totp", proofNow.Add(-4*time.Hour))),
		WithProofLevel(authz.Level2),
		WithObserver(func(d Decision, _ string) { seen = append(seen, d) }),
	)
	if w.Code != http.StatusOK {
		t.Fatalf("observation = %d, attendu 200 (%s)", w.Code, w.Body.String())
	}
	if len(seen) != 1 {
		t.Fatalf("décisions observées = %d, attendu 1", len(seen))
	}
	if seen[0].Allowed || seen[0].Code != authz.CodeNeedsStepUp {
		t.Fatalf("décision = %+v, attendu refus observé needs_step_up", seen[0])
	}
	if seen[0].ProofLevel != "N2" {
		t.Fatalf("niveau tracé = %q, attendu N2", seen[0].ProofLevel)
	}
}

// TestRequire_ProofLevelEnforceNeedsStepUp — critère de sortie de la Phase 3 :
// une session `aal2` ouverte le matin ne peut pas expédier un acte N2
// l'après-midi. Le refus est explicite (403, code + niveau pour le client).
func TestRequire_ProofLevelEnforceNeedsStepUp(t *testing.T) {
	morning := proofNow.Add(-4 * time.Hour)
	w := serveProof(t, enforcingProofLookup(UsersModerate), UsersModerate,
		claimsFor("aal2", morning, method("totp", morning)),
		WithProofLevel(authz.Level2),
		WithMode(ModeEnforce),
	)
	if w.Code != http.StatusForbidden {
		t.Fatalf("preuve ancienne = %d, attendu 403 (%s)", w.Code, w.Body.String())
	}
	if got := w.Header().Get("X-Qoe-Authz-Code"); got != string(authz.CodeNeedsStepUp) {
		t.Fatalf("X-Qoe-Authz-Code = %q, attendu %q", got, authz.CodeNeedsStepUp)
	}
	body := decodeDenied(t, w)
	if body["code"] != string(authz.CodeNeedsStepUp) {
		t.Errorf("corps code = %v", body["code"])
	}
	if body["level"] != "N2" {
		t.Errorf("corps level = %v, attendu N2 (l'écran doit savoir QUEL niveau demander)", body["level"])
	}
	if body["capability"] != string(UsersModerate) {
		t.Errorf("corps capability = %v", body["capability"])
	}
}

// TestRequire_ProofLevelEnforceDenyWeakAuth — un `aal2` obtenu par SMS n'est
// pas une preuve forte : le motif est distinct (`deny_weak_auth`) pour que
// l'écran propose d'enrôler un facteur autorisé plutôt qu'un simple step-up.
func TestRequire_ProofLevelEnforceDenyWeakAuth(t *testing.T) {
	w := serveProof(t, enforcingProofLookup(UsersModerate), UsersModerate,
		claimsFor("aal2", proofNow.Add(-time.Minute), method("sms", proofNow.Add(-time.Minute))),
		WithProofLevel(authz.Level2),
		WithMode(ModeEnforce),
	)
	if w.Code != http.StatusForbidden {
		t.Fatalf("aal2 SMS = %d, attendu 403 (%s)", w.Code, w.Body.String())
	}
	if got := w.Header().Get("X-Qoe-Authz-Code"); got != string(authz.CodeDenyWeakAuth) {
		t.Fatalf("X-Qoe-Authz-Code = %q, attendu %q", got, authz.CodeDenyWeakAuth)
	}
}

// TestRequire_ProofLevelEnforceAllowsFreshProof — un TOTP vérifié il y a deux
// minutes ouvre l'acte, et la trace porte le niveau réellement exigé.
func TestRequire_ProofLevelEnforceAllowsFreshProof(t *testing.T) {
	var seen []Decision
	w := serveProof(t, enforcingProofLookup(UsersModerate), UsersModerate,
		claimsFor("aal2", proofNow.Add(-2*time.Minute), method("totp", proofNow.Add(-2*time.Minute))),
		WithProofLevel(authz.Level2),
		WithMode(ModeEnforce),
		WithObserver(func(d Decision, _ string) { seen = append(seen, d) }),
	)
	if w.Code != http.StatusOK {
		t.Fatalf("preuve fraîche = %d, attendu 200 (%s)", w.Code, w.Body.String())
	}
	if len(seen) != 1 || !seen[0].Allowed || seen[0].ProofLevel != "N2" {
		t.Fatalf("décision = %+v, attendu accord tracé en N2", seen)
	}
}

// TestRequire_ProofLevelN3NeedsApproval — un acte N3 exige une preuve fraîche
// ET une seconde validation. Sans mécanisme d'approbation branché, le garde
// refuse (`needs_review`) : une double validation qu'on ne peut pas vérifier
// n'est pas une double validation.
func TestRequire_ProofLevelN3NeedsApproval(t *testing.T) {
	fresh := claimsFor("aal2", proofNow.Add(-time.Minute), method("webauthn", proofNow.Add(-time.Minute)))

	t.Run("aucun mécanisme branché", func(t *testing.T) {
		w := serveProof(t, enforcingProofLookup(LegalWrite), LegalWrite, fresh,
			WithProofLevel(authz.Level3), WithMode(ModeEnforce))
		if w.Code != http.StatusForbidden {
			t.Fatalf("N3 sans approbation = %d, attendu 403 (%s)", w.Code, w.Body.String())
		}
		if got := w.Header().Get("X-Qoe-Authz-Code"); got != string(authz.CodeNeedsReview) {
			t.Fatalf("X-Qoe-Authz-Code = %q, attendu %q", got, authz.CodeNeedsReview)
		}
	})

	t.Run("acte non nommé", func(t *testing.T) {
		// Une approbation sans acte nommé validerait n'importe quoi : refus.
		w := serveProof(t, enforcingProofLookup(LegalWrite), LegalWrite, fresh,
			WithProofLevel(authz.Level3), WithMode(ModeEnforce),
			WithApproval(func(context.Context, string, authz.Action) bool { return true }))
		if w.Code != http.StatusForbidden {
			t.Fatalf("N3 sans acte = %d, attendu 403 (%s)", w.Code, w.Body.String())
		}
	})

	t.Run("approbation absente", func(t *testing.T) {
		w := serveProof(t, enforcingProofLookup(LegalWrite), LegalWrite, fresh,
			WithProofLevel(authz.Level3), WithMode(ModeEnforce),
			WithApprovalAct(authz.ActionLegalPublish),
			WithApproval(func(context.Context, string, authz.Action) bool { return false }))
		if w.Code != http.StatusForbidden {
			t.Fatalf("N3 non approuvé = %d, attendu 403 (%s)", w.Code, w.Body.String())
		}
	})

	t.Run("approbation présente", func(t *testing.T) {
		var seenAct authz.Action
		w := serveProof(t, enforcingProofLookup(LegalWrite), LegalWrite, fresh,
			WithProofLevel(authz.Level3), WithMode(ModeEnforce),
			WithApprovalAct(authz.ActionLegalPublish),
			WithApproval(func(_ context.Context, _ string, act authz.Action) bool {
				seenAct = act
				return true
			}))
		if w.Code != http.StatusOK {
			t.Fatalf("N3 approuvé = %d, attendu 200 (%s)", w.Code, w.Body.String())
		}
		if seenAct != authz.ActionLegalPublish {
			t.Fatalf("acte transmis = %q, attendu %q", seenAct, authz.ActionLegalPublish)
		}
	})
}

// TestRequire_ProofCheckedAfterCapability — le droit d'abord : sans la
// capacité, le motif est `deny_missing_capability`. On n'invite pas une
// personne à un step-up coûteux pour un acte qu'elle ne peut pas expédier.
func TestRequire_ProofCheckedAfterCapability(t *testing.T) {
	w := serveProof(t, enforcingProofLookup(UsersRead), UsersModerate,
		claimsFor("aal1", proofNow.Add(-time.Hour)),
		WithProofLevel(authz.Level2), WithMode(ModeEnforce))
	if w.Code != http.StatusForbidden {
		t.Fatalf("sans capacité = %d, attendu 403 (%s)", w.Code, w.Body.String())
	}
	if got := w.Header().Get("X-Qoe-Authz-Code"); got != string(authz.CodeDenyMissingCapability) {
		t.Fatalf("X-Qoe-Authz-Code = %q, attendu %q", got, authz.CodeDenyMissingCapability)
	}
}

// TestRequire_N0RouteIgnoresProof — une route N0 (le défaut de la console) ne
// demande rien de plus que la capacité : la preuve forte ne doit pas se
// répandre par accident sur cent routes de lecture.
func TestRequire_N0RouteIgnoresProof(t *testing.T) {
	w := serveProof(t, enforcingProofLookup(DashboardRead), DashboardRead,
		claimsFor("aal1", proofNow.Add(-time.Hour)),
		WithProofLevel(authz.Level0), WithMode(ModeEnforce))
	if w.Code != http.StatusOK {
		t.Fatalf("route N0 = %d, attendu 200 (%s)", w.Code, w.Body.String())
	}
}
