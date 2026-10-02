package authz

import (
	"encoding/json"
	"testing"
	"time"
)

var testNow = time.Date(2026, 9, 28, 12, 0, 0, 0, time.UTC)

func ago(d time.Duration) time.Time { return testNow.Add(-d) }

// sessionWith construit une session de test avec une méthode et un horodatage.
func sessionWith(userID, aal string, iat time.Time, methods ...AMREntry) Session {
	return Session{UserID: userID, SessionID: "sess-1", AAL: aal, Methods: methods, IssuedAt: iat}
}

func totp(t time.Time) AMREntry    { return AMREntry{Method: MethodTOTP, Timestamp: t} }
func sms(t time.Time) AMREntry     { return AMREntry{Method: MethodOTP, Timestamp: t} }
func passkey(t time.Time) AMREntry { return AMREntry{Method: MethodWebAuthn, Timestamp: t} }

func TestEvaluateDefaultDeny(t *testing.T) {
	tests := []struct {
		name    string
		session Session
		action  Action
		in      Inputs
		want    Code
	}{
		{
			name:    "action inconnue refusée",
			session: sessionWith("u1", "aal2", ago(time.Minute), totp(ago(time.Minute))),
			action:  Action("action_qui_nexiste_pas"),
			want:    CodeDenyUnknownAction,
		},
		{
			name:    "session absente",
			session: Session{},
			action:  ActionMediaPublish,
			want:    CodeDenyNoSession,
		},
		{
			name:    "lecture N0 sans MFA",
			session: sessionWith("u1", "aal1", ago(time.Hour)),
			action:  ActionReadContent,
			want:    CodeAllow,
		},
		{
			name:    "brouillon média N0 sans MFA",
			session: sessionWith("u1", "aal1", ago(time.Hour)),
			action:  ActionMediaDraftWrite,
			want:    CodeAllow,
		},
		{
			name:    "acteur suspendu",
			session: sessionWith("u1", "aal2", ago(time.Minute), totp(ago(time.Minute))),
			action:  ActionReadContent,
			in:      Inputs{Suspended: true},
			want:    CodeDenySuspended,
		},
		{
			name:    "publication média avec TOTP frais",
			session: sessionWith("u1", "aal2", ago(5*time.Minute), totp(ago(5*time.Minute))),
			action:  ActionMediaPublish,
			in:      Inputs{MediaPermissionResolved: true, HasMediaPermission: true},
			want:    CodeAllow,
		},
		{
			name:    "publication média avec passkey préfixée mfa/",
			session: sessionWith("u1", "aal2", ago(5*time.Minute), AMREntry{Method: "mfa/webauthn", Timestamp: ago(5 * time.Minute)}),
			action:  ActionMediaPublish,
			in:      Inputs{MediaPermissionResolved: true, HasMediaPermission: true},
			want:    CodeAllow,
		},
		{
			name:    "aal2 par SMS seulement ne satisfait pas N1",
			session: sessionWith("u1", "aal2", ago(time.Minute), sms(ago(time.Minute))),
			action:  ActionMediaPublish,
			in:      Inputs{MediaPermissionResolved: true, HasMediaPermission: true},
			want:    CodeDenyWeakAuth,
		},
		{
			name:    "session partielle sans facteur : step-up",
			session: sessionWith("u1", "aal1", ago(time.Minute), AMREntry{Method: MethodPassword, Timestamp: ago(time.Minute)}),
			action:  ActionMediaCreate,
			want:    CodeNeedsStepUp,
		},
		{
			name:    "permission média non résolue par l'appelant",
			session: sessionWith("u1", "aal2", ago(time.Minute), totp(ago(time.Minute))),
			action:  ActionMediaPublish,
			in:      Inputs{MediaPermissionResolved: false, HasMediaPermission: true},
			want:    CodeDenyNoResourcePermission,
		},
		{
			name:    "permission média absente sur la ressource",
			session: sessionWith("u1", "aal2", ago(time.Minute), totp(ago(time.Minute))),
			action:  ActionMediaPublish,
			in:      Inputs{MediaPermissionResolved: true, HasMediaPermission: false},
			want:    CodeDenyNoResourcePermission,
		},
		{
			name:    "export abonnés N2 avec step-up frais",
			session: sessionWith("u1", "aal2", ago(time.Minute), totp(ago(time.Minute))),
			action:  ActionSubscribersExport,
			in:      Inputs{MediaPermissionResolved: true, HasMediaPermission: true},
			want:    CodeAllow,
		},
		{
			name:    "export abonnés N2 avec preuve trop ancienne",
			session: sessionWith("u1", "aal2", ago(2*time.Hour), totp(ago(2*time.Hour))),
			action:  ActionSubscribersExport,
			in:      Inputs{MediaPermissionResolved: true, HasMediaPermission: true},
			want:    CodeNeedsStepUp,
		},
		{
			name:    "export abonnés N2 sans horodatage exploitable",
			session: sessionWith("u1", "aal2", time.Time{}, AMREntry{Method: MethodTOTP}),
			action:  ActionSubscribersExport,
			in:      Inputs{MediaPermissionResolved: true, HasMediaPermission: true},
			want:    CodeNeedsStepUp,
		},
		{
			name:    "import sans numéro vérifié",
			session: sessionWith("u1", "aal2", ago(time.Minute), totp(ago(time.Minute))),
			action:  ActionImportRequest,
			in:      Inputs{MediaPermissionResolved: true, HasMediaPermission: true},
			want:    CodeDenyPhoneRequired,
		},
		{
			name:    "import avec numéro vérifié",
			session: sessionWith("u1", "aal2", ago(time.Minute), totp(ago(time.Minute))),
			action:  ActionImportRequest,
			in:      Inputs{MediaPermissionResolved: true, HasMediaPermission: true, PhoneVerified: true},
			want:    CodeAllow,
		},
		{
			name:    "créer un média n'exige pas de téléphone",
			session: sessionWith("u1", "aal2", ago(time.Minute), totp(ago(time.Minute))),
			action:  ActionMediaCreate,
			in:      Inputs{PhoneVerified: false},
			want:    CodeAllow,
		},
		{
			name:    "action staff N3 sans seconde validation",
			session: sessionWith("u1", "aal2", ago(time.Minute), totp(ago(time.Minute))),
			action:  ActionStaffHighImpact,
			want:    CodeNeedsReview,
		},
		{
			name:    "action staff N3 avec seconde validation",
			session: sessionWith("u1", "aal2", ago(time.Minute), totp(ago(time.Minute))),
			action:  ActionStaffHighImpact,
			in:      Inputs{SecondApproval: true},
			want:    CodeAllow,
		},
		{
			name:    "hint de méthode faible ignoré",
			session: sessionWith("u1", "aal1", ago(time.Minute), AMREntry{Method: MethodPassword, Timestamp: ago(time.Minute)}),
			action:  ActionApiKeyCreate,
			in: Inputs{
				MediaPermissionResolved: true, HasMediaPermission: true,
				StrongMethodHint: MethodPassword,
			},
			want: CodeNeedsStepUp,
		},
		{
			name:    "hint de méthode forte vérifiée côté serveur",
			session: sessionWith("u1", "aal1", ago(time.Minute), AMREntry{Method: MethodPassword, Timestamp: ago(time.Minute)}),
			action:  ActionApiKeyCreate,
			in: Inputs{
				MediaPermissionResolved: true, HasMediaPermission: true,
				StrongMethodHint: "mfa/totp",
			},
			want: CodeAllow,
		},
		{
			name:    "clé API créée par un ancien gestionnaire : permission absente",
			session: sessionWith("u1", "aal2", ago(time.Minute), totp(ago(time.Minute))),
			action:  ActionApiKeyRotate,
			in:      Inputs{MediaPermissionResolved: true, HasMediaPermission: false},
			want:    CodeDenyNoResourcePermission,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := Evaluate(tc.session, tc.action, tc.in, testNow)
			if got.Code != tc.want {
				t.Fatalf("code = %s (%s), attendu %s", got.Code, got.Reason, tc.want)
			}
			if (got.Code == CodeAllow) != got.Allowed {
				t.Fatalf("Allowed=%v incohérent avec le code %s", got.Allowed, got.Code)
			}
			if got.Action != tc.action {
				t.Fatalf("Action = %q, attendu %q", got.Action, tc.action)
			}
		})
	}
}

func TestEvaluateDenialAlwaysExplains(t *testing.T) {
	// Un refus doit toujours porter un motif non vide (exigence support/audit).
	for _, a := range Actions() {
		d := Evaluate(Session{}, a, Inputs{}, testNow)
		if d.Allowed {
			continue
		}
		if d.Reason == "" {
			t.Fatalf("refus sans motif pour %s", a)
		}
		if d.Level.String() == "" {
			t.Fatalf("niveau illisible pour %s", a)
		}
	}
}

// TestVerifyLevel — contrôle de niveau sans action nommée, celui que la console
// monte par route : N0 libre, N1 exige un facteur fort utilisé dans CETTE
// session, N2 exige en plus une preuve de moins de 10 minutes, et une session
// `aal2` obtenue par SMS reste une preuve faible.
func TestVerifyLevel(t *testing.T) {
	tests := []struct {
		name    string
		session Session
		level   Level
		want    Code
	}{
		{
			name:    "N0 sans facteur",
			session: sessionWith("u1", "aal1", ago(4*time.Hour), AMREntry{Method: MethodPassword, Timestamp: ago(4 * time.Hour)}),
			level:   Level0,
			want:    CodeAllow,
		},
		{
			name:    "N1 avec TOTP de la session, même ancien",
			session: sessionWith("u1", "aal2", ago(3*time.Hour), totp(ago(3*time.Hour))),
			level:   Level1,
			want:    CodeAllow,
		},
		{
			name:    "N1 avec aal2 SMS seulement",
			session: sessionWith("u1", "aal2", ago(time.Minute), sms(ago(time.Minute))),
			level:   Level1,
			want:    CodeDenyWeakAuth,
		},
		{
			name:    "N1 sans facteur",
			session: sessionWith("u1", "aal1", ago(time.Minute), AMREntry{Method: MethodPassword, Timestamp: ago(time.Minute)}),
			level:   Level1,
			want:    CodeNeedsStepUp,
		},
		{
			name:    "N2 avec TOTP de 5 minutes",
			session: sessionWith("u1", "aal2", ago(5*time.Minute), totp(ago(5*time.Minute))),
			level:   Level2,
			want:    CodeAllow,
		},
		{
			name:    "N2 avec preuve de 30 minutes",
			session: sessionWith("u1", "aal2", ago(30*time.Minute), totp(ago(30*time.Minute))),
			level:   Level2,
			want:    CodeNeedsStepUp,
		},
		{
			// Critère de sortie de la Phase 3 : une session `aal2` ouverte le
			// matin ne peut pas expédier un acte N2 l'après-midi, même quand la
			// pile d'authentification n'horodate pas `amr` — la fraîcheur se
			// mesure alors à l'émission du jeton.
			name:    "N2 : session aal2 du matin, amr sans horodatage",
			session: sessionWith("u1", "aal2", ago(4*time.Hour), totp(time.Time{})),
			level:   Level2,
			want:    CodeNeedsStepUp,
		},
		{
			name:    "N2 : amr sans horodatage mais jeton tout juste émis",
			session: sessionWith("u1", "aal2", ago(2*time.Minute), totp(time.Time{})),
			level:   Level2,
			want:    CodeAllow,
		},
		{
			name:    "N2 avec aal2 SMS seulement",
			session: sessionWith("u1", "aal2", ago(time.Minute), sms(ago(time.Minute))),
			level:   Level2,
			want:    CodeDenyWeakAuth,
		},
		{
			name:    "N2 sans claims exploitables",
			session: Session{},
			level:   Level2,
			want:    CodeNeedsStepUp,
		},
		{
			// N3 : la session doit être N2 ; la double validation est vérifiée
			// par l'appelant, pas par les claims.
			name:    "N3 avec preuve fraîche",
			session: sessionWith("u1", "aal2", ago(time.Minute), passkey(ago(time.Minute))),
			level:   Level3,
			want:    CodeAllow,
		},
		{
			name:    "N3 avec preuve ancienne",
			session: sessionWith("u1", "aal2", ago(45*time.Minute), passkey(ago(45*time.Minute))),
			level:   Level3,
			want:    CodeNeedsStepUp,
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			code, reason := VerifyLevel(tc.session, tc.level, testNow)
			if code != tc.want {
				t.Fatalf("code = %q, attendu %q (%s)", code, tc.want, reason)
			}
			if code != CodeAllow && reason == "" {
				t.Fatal("refus sans motif : un refus doit toujours être explicable")
			}
		})
	}
}

func TestRegistryCoherence(t *testing.T) {
	for _, row := range Matrix() {
		if row.Level < Level0 || row.Level > Level3 {
			t.Fatalf("%s : niveau hors bornes %d", row.Action, row.Level)
		}
		if row.Note == "" {
			t.Fatalf("%s : note produit manquante (matrice/audit)", row.Action)
		}
		if row.Level.RequiresFreshProof() && row.Freshness == 0 {
			t.Fatalf("%s : N2/N3 sans délai de fraîcheur", row.Action)
		}
		if !row.Level.RequiresStrongAuth() && row.Freshness > 0 {
			t.Fatalf("%s : délai de fraîcheur sur une action sans preuve forte", row.Action)
		}
		if row.DoubleApproval && row.Level < Level3 {
			t.Fatalf("%s : double validation sous N3", row.Action)
		}
	}
	if !KnownAction(ActionMediaCreate) || KnownAction(Action("inconnue")) {
		t.Fatal("KnownAction incohérent")
	}
}

func TestIsStrongMethod(t *testing.T) {
	strong := []string{"totp", "TOTP", "mfa/totp", "webauthn", "mfa/webauthn", " WebAuthn "}
	for _, m := range strong {
		if !IsStrongMethod(m) {
			t.Fatalf("%q devrait être une méthode forte", m)
		}
	}
	weak := []string{"", "password", "otp", "sms", "phone", "oauth", "magiclink", "email", "sso/saml", "mfa/phone"}
	for _, m := range weak {
		if IsStrongMethod(m) {
			t.Fatalf("%q ne doit pas être une méthode forte", m)
		}
	}
	// Un préfixe mfa/ ne transforme pas une méthode faible en facteur fort.
	if IsStrongMethod("mfa/sms") {
		t.Fatal("mfa/sms ne doit pas compter comme MFA forte")
	}
}

func TestFromClaims(t *testing.T) {
	iat := ago(90 * time.Second)
	claims := map[string]any{
		"sub":        "user-42",
		"session_id": "sess-42",
		"aal":        "aal2",
		"iat":        float64(iat.Unix()),
		"amr": []any{
			map[string]any{"method": "password", "timestamp": float64(iat.Add(-30 * time.Second).Unix())},
			map[string]any{"method": "mfa/totp", "timestamp": json.Number("1759000000")},
		},
	}
	s := FromClaims(claims)
	if s.UserID != "user-42" || s.SessionID != "sess-42" || s.AAL != "aal2" {
		t.Fatalf("champs de session mal lus: %+v", s)
	}
	if !s.IssuedAt.Equal(iat) {
		t.Fatalf("iat = %v, attendu %v", s.IssuedAt, iat)
	}
	method, at, ok := s.StrongMethodAt()
	if !ok || method != MethodTOTP {
		t.Fatalf("méthode forte = %q, ok=%v", method, ok)
	}
	if at.Unix() != 1759000000 {
		t.Fatalf("horodatage fort = %v", at)
	}
	// Le mot de passe n'élève pas la session : la preuve forte reste le TOTP.
	if s.ActiveStrongMethod(testNow, 0) != true {
		t.Fatal("ActiveStrongMethod devrait être vrai")
	}

	// Forme []map[string]any et absence d'horodatage → repli sur iat.
	s2 := FromClaims(map[string]any{
		"sub": "u2",
		"amr": []map[string]any{{"method": "totp"}},
		"iat": int64(iat.Unix()),
	})
	if _, at2, ok2 := s2.StrongMethodAt(); !ok2 || !at2.Equal(iat) {
		t.Fatalf("repli sur iat: at=%v ok=%v", at2, ok2)
	}

	// Sans méthode forte, ActiveStrongMethod est faux même avec aal2.
	s3 := FromClaims(map[string]any{
		"sub": "u3", "aal": "aal2", "iat": float64(iat.Unix()),
		"amr": []any{map[string]any{"method": "otp", "timestamp": float64(iat.Unix())}},
	})
	if s3.ActiveStrongMethod(testNow, 0) {
		t.Fatal("aal2 par otp ne doit pas activer la preuve forte")
	}

	// Nil et carte vide ne paniquent pas.
	if FromClaims(nil).UserID != "" || FromClaims(map[string]any{}).UserID != "" {
		t.Fatal("claims vides devraient donner une session sans utilisateur")
	}
}

func TestActiveStrongMethodFreshness(t *testing.T) {
	s := sessionWith("u1", "aal2", ago(time.Hour), totp(ago(time.Hour)))
	if !s.ActiveStrongMethod(testNow, 0) {
		t.Fatal("preuve forte valable tant que la session vit")
	}
	if s.ActiveStrongMethod(testNow, StepUpMaxAge) {
		t.Fatal("preuve d'une heure trop ancienne pour un step-up")
	}
	if !sessionWith("u1", "aal2", ago(time.Minute), passkey(ago(time.Minute))).ActiveStrongMethod(testNow, StepUpMaxAge) {
		t.Fatal("passkey fraîche devrait satisfaire le step-up")
	}
}

func TestNormalizeAAL(t *testing.T) {
	for in, want := range map[string]string{"aal1": "aal1", "aal2": "aal2", "aal3": "aal3", "": "", "AAL2": "", "bidon": ""} {
		if got := NormalizeAAL(in); got != want {
			t.Fatalf("NormalizeAAL(%q) = %q, attendu %q", in, got, want)
		}
	}
}

func TestLevelString(t *testing.T) {
	cases := map[Level]string{Level0: "N0", Level1: "N1", Level2: "N2", Level3: "N3"}
	for lvl, want := range cases {
		if got := lvl.String(); got != want {
			t.Fatalf("Level(%d).String() = %q, attendu %q", int(lvl), got, want)
		}
	}
}
