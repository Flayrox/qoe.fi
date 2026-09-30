package authz

import "time"

// Code est un code de motif exploitable par les interfaces, le support et
// l'audit. Un refus doit toujours être explicable : « pourquoi cette personne
// ne peut-elle pas faire cela maintenant ? ».
type Code string

const (
	// CodeAllow — l'action est autorisée pour cette session et cette ressource.
	CodeAllow Code = "allow"
	// CodeDenyUnknownAction — action absente du registre (refus par défaut).
	CodeDenyUnknownAction Code = "deny_unknown_action"
	// CodeDenyNoSession — pas de session authentifiée exploitable.
	CodeDenyNoSession Code = "deny_no_session"
	// CodeDenySuspended — acteur suspendu ou révoqué.
	CodeDenySuspended Code = "deny_actor_suspended"
	// CodeDenyNoResourcePermission — droit effectif absent sur la ressource.
	CodeDenyNoResourcePermission Code = "deny_no_resource_permission"
	// CodeDenyWeakAuth — forte preuve exigée mais la session ne porte pas de
	// méthode autorisée (cas typique : `aal2` obtenu par SMS uniquement).
	CodeDenyWeakAuth Code = "deny_weak_auth"
	// CodeDenyStaleProof — preuve forte présente mais hors délai de fraîcheur
	// pour une action qui n'admet pas de nouvelle tentative (rare).
	CodeDenyStaleProof Code = "deny_stale_proof"
	// CodeDenyPhoneRequired — `phone_verified` manquant.
	CodeDenyPhoneRequired Code = "deny_phone_not_verified"
	// CodeNeedsStepUp — le client doit faire vérifier un facteur fort (ou un
	// facteur récent pour un N2) avant de rejouer l'action.
	CodeNeedsStepUp Code = "needs_step_up"
	// CodeNeedsReview — N3 : une seconde validation reste nécessaire.
	CodeNeedsReview Code = "needs_review"
	// CodeDenyMissingCapability — la personne n'a pas la capacité exigée par
	// la route de la console (gardé par internal/adminauthz). Distinct de
	// CodeDenyNoResourcePermission : ici il n'y a pas de ressource à laquelle
	// se rattacher, juste un rôle manquant — le motif à afficher est donc
	// « demandez le droit », pas « vos droits sur ce média sont insuffisants ».
	CodeDenyMissingCapability Code = "deny_missing_capability"
	// CodeDenyCapabilityLookup — la source des capacités n'a pas pu être lue.
	// Le refus est technique, jamais un jugement sur la personne : le client
	// doit proposer de réessayer plutôt qu'une demande de droits.
	CodeDenyCapabilityLookup Code = "deny_capability_lookup"
)

// Inputs rassemble ce que l'appelant a réellement vérifié sur la ressource.
// C'est le point clé du refus par défaut : si une règle exige une permission
// média et que l'appelant n'a pas résolu la membership (`Resolved=false`),
// l'évaluateur refuse — l'absence de preuve n'est jamais une autorisation.
type Inputs struct {
	// MediaPermissionResolved indique que l'appelant a bien résolu la
	// membership de l'acteur sur la ressource visée.
	MediaPermissionResolved bool
	// HasMediaPermission est le résultat de cette résolution, évalué avec
	// permissions.CanMedia sur le média **concerné** (jamais un autre).
	HasMediaPermission bool
	// PhoneVerified = `phone_verified` du demandeur (contrôle anti-abus
	// distinct de la MFA forte).
	PhoneVerified bool
	// Suspended couvre les statuts réellement bloquants (suspension, membre
	// révoqué, clé révoquée) déjà vérifiés par l'appelant.
	Suspended bool
	// SecondApproval : une seconde personne autorisée a approuvé l'action.
	SecondApproval bool
	// StrongMethodHint permet à l'appelant de fournir la méthode forte
	// réellement utilisée pour cette session lorsque la pile
	// d'authentification ne laisse pas l'information dans les claims.
	// Volontairement un **hint** : il ne doit être renseigné que depuis une
	// preuve vérifiée côté serveur (jamais un en-tête client).
	StrongMethodHint string
}

// Decision est le verdict de l'évaluateur.
type Decision struct {
	Allowed bool
	Code    Code
	Reason  string
	Level   Level
	Action  Action
}

func allow(action Action, level Level) Decision {
	return Decision{Allowed: true, Code: CodeAllow, Reason: "autorisé", Level: level, Action: action}
}

func deny(action Action, level Level, code Code, reason string) Decision {
	return Decision{Allowed: false, Code: code, Reason: reason, Level: level, Action: action}
}

// Evaluate applique la règle de l'action à la session et aux preuves fournies.
// Ordre volontaire : ressource d'abord (ne pas inviter à un step-up coûteux
// pour une action qu'on n'a de toute façon pas le droit d'exécuter), puis
// méthode forte et fraîcheur, puis les prérequis indépendants.
//
// `now` est injecté pour rendre la fraîcheur testable et reproductible.
func Evaluate(s Session, action Action, in Inputs, now time.Time) Decision {
	rule, ok := Lookup(action)
	if !ok {
		return deny(action, Level0, CodeDenyUnknownAction,
			"action non enregistrée dans le registre d'autorisation")
	}

	// 1. Session exploitable.
	if s.UserID == "" {
		return deny(action, rule.Level, CodeDenyNoSession, "session authentifiée absente")
	}

	// 2. Statut bloquant (suspension, révocation) déjà établi par l'appelant.
	if in.Suspended {
		return deny(action, rule.Level, CodeDenySuspended, "acteur suspendu ou droit révoqué")
	}

	// 3. Droit effectif sur la ressource concernée (refus par défaut).
	if rule.MediaPermission != "" {
		if !in.MediaPermissionResolved {
			return deny(action, rule.Level, CodeDenyNoResourcePermission,
				"permission média exigée mais membership non résolue")
		}
		if !in.HasMediaPermission {
			return deny(action, rule.Level, CodeDenyNoResourcePermission,
				"permission média absente sur la ressource visée")
		}
	}

	// 4. Preuve forte par une méthode autorisée.
	if rule.Level.requiresStrongAuth() {
		_, at, ok := s.StrongMethodAt()
		if !ok && in.StrongMethodHint != "" && IsStrongMethod(in.StrongMethodHint) {
			// Preuve serveur explicitement fournie par l'appelant (jamais un
			// en-tête client) : utile tant que la pile d'authentification ne
			// laisse pas la méthode dans les claims.
			ok = true
			at = s.IssuedAt
		}
		if !ok {
			// `aal2` annoncé sans méthode autorisée (typiquement SMS) : ce n'est
			// pas « il faut s'authentifier » mais « cette méthode ne compte pas ».
			if s.AAL == "aal2" {
				return deny(action, rule.Level, CodeDenyWeakAuth,
					"preuve forte absente : méthode non autorisée (passkey/TOTP requis)")
			}
			return deny(action, rule.Level, CodeNeedsStepUp,
				"preuve forte requise : enrôler ou vérifier un facteur passkey/TOTP")
		}
		if rule.Freshness > 0 {
			// Refus par défaut : sans horodatage exploitable, on ne peut pas
			// affirmer que la preuve est récente.
			if at.IsZero() {
				return deny(action, rule.Level, CodeNeedsStepUp,
					"fraîcheur de la preuve forte indéterminable : step-up requis")
			}
			if now.Sub(at) > rule.Freshness {
				return deny(action, rule.Level, CodeNeedsStepUp,
					"preuve forte trop ancienne pour cette action : step-up requis")
			}
		}
	}

	// 5. Prérequis indépendants (anti-abus).
	if rule.RequirePhone && !in.PhoneVerified {
		return deny(action, rule.Level, CodeDenyPhoneRequired,
			"numéro vérifié requis pour cette demande (contrôle anti-abus)")
	}

	// 6. Double validation organisationnelle.
	if rule.DoubleApproval && !in.SecondApproval {
		return deny(action, rule.Level, CodeNeedsReview,
			"double validation requise : une seconde personne autorisée doit approuver")
	}

	return allow(action, rule.Level)
}
