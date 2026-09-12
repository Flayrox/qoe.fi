package users

// Le consentement recueilli au formulaire d'inscription doit être transformé en
// preuve au moment EXACT où la ligne User naît — et une seule fois. Ces tests
// vérifient le câblage, pas la persistance (couverte dans le module legal).

import (
	"context"
	"testing"
)

type fakeConsentRecorder struct {
	calls   int
	userID  string
	locale  string
	source  string
	ip      string
	agent   string
	payload any
	err     error
}

func (f *fakeConsentRecorder) RecordSignupConsent(
	_ context.Context, userID, locale, source, ip, userAgent string, payload any,
) (int, error) {
	f.calls++
	f.userID, f.locale, f.source, f.ip, f.agent = userID, locale, source, ip, userAgent
	f.payload = payload
	if f.err != nil {
		return 0, f.err
	}
	return 1, nil
}

func withSignupConsent(svc *Service) (*fakeConsentRecorder, func()) {
	recorder := &fakeConsentRecorder{}
	previous := svc.consent
	svc.SetSignupConsentRecorder(recorder)
	return recorder, func() { svc.consent = previous }
}

func TestSyncUserRecordsSignupConsentOnCreation(t *testing.T) {
	ctx := context.Background()
	svc := NewService(poolTest)
	recorder, restore := withSignupConsent(svc)
	defer restore()

	freshID := "00000000-0000-0000-0000-0000000000c1"
	if _, err := poolTest.Exec(ctx, `DELETE FROM "User" WHERE id = $1`, freshID); err != nil {
		t.Fatalf("cleanup: %v", err)
	}
	t.Cleanup(func() { _, _ = poolTest.Exec(ctx, `DELETE FROM "User" WHERE id = $1`, freshID) })

	claims := map[string]any{
		"email": "consent-signup@test.dev",
		"user_metadata": map[string]any{
			"name":         "Consent Signup",
			"username":     "consentsignup",
			"languageCode": "en",
			"signupConsent": map[string]any{
				"locale": "en",
				"at":     "2026-09-12T10:00:00Z",
				"items": []any{
					map[string]any{"slug": "conditions-generales-utilisation", "versionId": "v1", "version": "1.0.0"},
				},
			},
		},
	}

	created, _, err := svc.SyncUserFromAuth(ctx, freshID, claims)
	if err != nil {
		t.Fatalf("sync: %v", err)
	}
	if !created {
		t.Fatal("le compte aurait dû être créé")
	}
	if recorder.calls != 1 {
		t.Fatalf("appels au dépositaire = %d, attendu 1", recorder.calls)
	}
	if recorder.userID != freshID || recorder.source != "signup" {
		t.Fatalf("contexte de preuve inattendu: %+v", recorder)
	}
	if recorder.payload == nil {
		t.Fatal("charge utile de consentement non transmise")
	}

	// Un second sync sur un compte EXISTANT ne doit rejouer aucune preuve :
	// l'acceptation d'origine est immuable.
	if _, _, err := svc.SyncUserFromAuth(ctx, freshID, claims); err != nil {
		t.Fatalf("re-sync: %v", err)
	}
	if recorder.calls != 1 {
		t.Fatalf("appels après re-sync = %d, attendu 1", recorder.calls)
	}
}

// La variante avec origine de requête transmet l'IP et l'agent : ce sont des
// éléments de preuve du consentement.
func TestSyncUserPassesRequestOrigin(t *testing.T) {
	ctx := context.Background()
	svc := NewService(poolTest)
	recorder, restore := withSignupConsent(svc)
	defer restore()

	freshID := "00000000-0000-0000-0000-0000000000c2"
	if _, err := poolTest.Exec(ctx, `DELETE FROM "User" WHERE id = $1`, freshID); err != nil {
		t.Fatalf("cleanup: %v", err)
	}
	t.Cleanup(func() { _, _ = poolTest.Exec(ctx, `DELETE FROM "User" WHERE id = $1`, freshID) })

	claims := map[string]any{
		"email": "consent-origin@test.dev",
		"user_metadata": map[string]any{
			"signupConsent": map[string]any{
				"items": []any{map[string]any{"slug": "accord-createur"}},
			},
		},
	}
	created, _, err := svc.syncUserFromAuth(ctx, freshID, claims, requestMeta{
		IP: "203.0.113.42", UserAgent: "agent-test",
	})
	if err != nil || !created {
		t.Fatalf("sync: created=%v err=%v", created, err)
	}
	if recorder.ip != "203.0.113.42" || recorder.agent != "agent-test" {
		t.Fatalf("origine non transmise: ip=%q ua=%q", recorder.ip, recorder.agent)
	}
}

// Sans consentement dans les métadonnées, on n'appelle jamais le dépositaire :
// une inscription sans case cochée ne doit produire aucune preuve.
func TestSyncUserWithoutConsentMetadata(t *testing.T) {
	ctx := context.Background()
	svc := NewService(poolTest)
	recorder, restore := withSignupConsent(svc)
	defer restore()

	freshID := "00000000-0000-0000-0000-0000000000c3"
	if _, err := poolTest.Exec(ctx, `DELETE FROM "User" WHERE id = $1`, freshID); err != nil {
		t.Fatalf("cleanup: %v", err)
	}
	t.Cleanup(func() { _, _ = poolTest.Exec(ctx, `DELETE FROM "User" WHERE id = $1`, freshID) })

	created, _, err := svc.SyncUserFromAuth(ctx, freshID, map[string]any{
		"email":         "no-consent@test.dev",
		"user_metadata": map[string]any{"name": "Sans Consentement"},
	})
	if err != nil || !created {
		t.Fatalf("sync: created=%v err=%v", created, err)
	}
	if recorder.calls != 0 {
		t.Fatalf("appels = %d, attendu 0 sans métadonnée de consentement", recorder.calls)
	}
}
