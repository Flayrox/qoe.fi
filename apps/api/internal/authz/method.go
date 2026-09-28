package authz

import "strings"

// Méthodes d'authentification telles qu'on les lit dans le claim `amr`
// (Authentication Methods References) du JWT Supabase, plus les variantes
// observées selon la version de GoTrue.
const (
	MethodPassword  = "password"
	MethodOAuth     = "oauth"
	MethodSSO       = "sso"
	MethodOTP       = "otp" // OTP e-mail ou SMS — jamais « fort »
	MethodSMS       = "sms"
	MethodPhone     = "phone"
	MethodMagicLink = "magiclink"
	MethodEmail     = "email"
	MethodTOTP      = "totp"
	MethodWebAuthn  = "webauthn"
)

// NormalizeMethod met une méthode `amr` sous forme canonique : minuscules et
// préfixe « mfa/ » retiré (GoTrue récent écrit `mfa/totp`, les versions plus
// anciennes `totp` ; on veut accepter les deux sans dupliquer les règles).
func NormalizeMethod(raw string) string {
	m := strings.ToLower(strings.TrimSpace(raw))
	m = strings.TrimPrefix(m, "mfa/")
	return m
}

// IsStrongMethod indique si une méthode satisfait la politique qoe.fi de MFA
// forte. L'ensemble est volontairement fermé : TOTP et WebAuthn uniquement.
//
// Ne sont **pas** des facteurs forts du produit, même si le fournisseur sait
// élever une session avec eux : mot de passe, OAuth social, OTP e-mail, OTP
// SMS/WhatsApp, lien magique et « appareil de confiance » autoproclamé. Un
// numéro de téléphone est une friction anti-abus, pas une preuve d'identité.
func IsStrongMethod(method string) bool {
	switch NormalizeMethod(method) {
	case MethodTOTP, MethodWebAuthn:
		return true
	default:
		return false
	}
}

// StrongMethods liste les méthodes fortes acceptées, WebAuthn (passkey)
// d'abord : c'est la préférence produit pour les propriétaires, admins et
// staff, le TOTP restant l'alternative vérifiée.
func StrongMethods() []string { return []string{MethodWebAuthn, MethodTOTP} }
