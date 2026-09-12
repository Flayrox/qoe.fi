package users

// =====================================================================
// ✍️ Consentement à l'inscription — capturé à la création du compte
// =====================================================================
// `SyncUserFromAuth` est le SEUL endroit où une ligne User naît (appelé par
// POST /v1/me/sync depuis /auth/callback, et par l'auto-réparation). C'est donc
// le seul moment où l'on peut rattacher à un compte les documents qu'il vient
// de cocher au formulaire d'inscription.
//
// Le formulaire dépose son choix dans `user_metadata.signupConsent` (Supabase) :
// il n'est lisible qu'à partir du premier JWT valide, c'est-à-dire ici. Le
// module legal devient le dépositaire de la preuve ; ce paquet n'en connaît que
// l'interface, donc aucune dépendance circulaire.
// =====================================================================

import (
	"context"
	"log"
)

// SignupConsentRecorder enregistre les consentements recueillis au formulaire
// d'inscription (implémenté par internal/modules/legal). `payload` est la
// valeur brute de `user_metadata.signupConsent`.
type SignupConsentRecorder interface {
	RecordSignupConsent(ctx context.Context, userID, locale, source, ip, userAgent string, payload any) (int, error)
}

// SetSignupConsentRecorder branche le dépositaire des preuves de consentement.
func (s *Service) SetSignupConsentRecorder(r SignupConsentRecorder) { s.consent = r }

// requestMeta porte ce que les claims JWT ne contiennent pas : l'origine de la
// requête, utile comme élément de preuve d'un consentement.
type requestMeta struct {
	IP        string
	UserAgent string
}

// recordSignupConsent traduit le choix du formulaire en preuves de
// consentement. Best-effort assumé : un souci de preuve secondaire ne doit pas
// faire échouer la création du compte (le portail de consentement reprend la
// main à la première navigation).
func (s *Service) recordSignupConsent(ctx context.Context, userID string, claims map[string]any, meta requestMeta) {
	if s.consent == nil || userID == "" {
		return
	}
	raw, _ := claims["user_metadata"].(map[string]any)
	if raw == nil {
		return
	}
	payload, ok := raw["signupConsent"]
	if !ok || payload == nil {
		return
	}
	locale, _ := raw["languageCode"].(string)
	written, err := s.consent.RecordSignupConsent(ctx, userID, locale, "signup", meta.IP, meta.UserAgent, payload)
	if err != nil {
		log.Printf("[users] consentement d'inscription non enregistré (user=%s): %v", userID, err)
		return
	}
	if written > 0 {
		log.Printf("[users] %d consentement(s) d'inscription enregistré(s) (user=%s)", written, userID)
	}
}
