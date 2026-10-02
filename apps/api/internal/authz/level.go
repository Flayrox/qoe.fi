// Package authz centralise le noyau de décision d'autorisation serveur de
// qoe.fi : un registre des actions sensibles (« action → niveau de preuve »)
// et un évaluateur **refus par défaut** qui combine session, méthode
// d'authentification réellement utilisée, fraîcheur de la preuve, téléphone,
// droit effectif sur la ressource et double validation.
//
// Invariants à ne pas contourner (cf. workin/qoefi_fiche_05_*) :
//
//   - `phone_verified` n'est PAS une authentification forte : un niveau N1
//     exige un facteur TOTP ou WebAuthn réellement utilisé dans CETTE session.
//   - Un `aal2` obtenu par SMS/OTP ne satisfait pas N1 : on contrôle la
//     méthode présente dans `amr`, pas seulement le niveau annoncé.
//   - Une passkey enregistrée mais non utilisée pour la session courante ne
//     satisfait rien : c'est la session qui est évaluée, pas le compte.
//   - Une action absente du registre est **refusée**.
//   - Une permission média requise mais non résolue par l'appelant est
//     refusée : l'absence de preuve n'est jamais une autorisation.
//
// Le paquet est volontairement sans état et sans dépendance à la base ou au
// middleware HTTP, pour rester appelable depuis n'importe quel module Go, y
// compris les workers et les tâches asynchrones. L'autorité reste le Go :
// les guards du Studio, de l'admin et du mobile ne sont que des aides d'UX.
package authz

import (
	"fmt"
	"time"
)

// Level est un niveau de protection **produit qoe.fi** (N0–N3). Ce ne sont
// PAS les niveaux d'assurance normalisés NIST AAL : la correspondance dépend
// de la pile d'authentification réellement déployée et doit être vérifiée
// côté Go, pas déduite de l'interface.
type Level int

const (
	// Level0 — compte normal : authentification de base et autorisation
	// habituelle (lecture, commentaire, abonnement lecteur).
	Level0 Level = 0
	// Level1 — MFA forte active : facteur TOTP ou WebAuthn effectivement
	// utilisé dans la session courante.
	Level1 Level = 1
	// Level2 — preuve forte récente (step-up) liée à l'action et à un délai
	// court, revalidée côté serveur.
	Level2 Level = 2
	// Level3 — N2 + double validation organisationnelle (approbation d'une
	// seconde personne autorisée ou contrôle staff) quand l'impact le justifie.
	Level3 Level = 3
)

// String rend le niveau sous la forme utilisée dans les fiches et les
// interfaces (« N0 »…« N3 »).
func (l Level) String() string {
	switch l {
	case Level0:
		return "N0"
	case Level1:
		return "N1"
	case Level2:
		return "N2"
	case Level3:
		return "N3"
	default:
		return fmt.Sprintf("N?%d", int(l))
	}
}

// RequiresStrongAuth indique si le niveau exige une preuve forte (TOTP ou
// WebAuthn) pour la session courante.
func (l Level) RequiresStrongAuth() bool { return l >= Level1 }

// RequiresFreshProof indique si le niveau exige une preuve forte **récente**
// (step-up) plutôt qu'une preuve acquise plus tôt dans la session.
func (l Level) RequiresFreshProof() bool { return l >= Level2 }

// VerifyLevel vérifie le niveau de preuve porté par la SESSION, sans action
// nommée : la console vérifie d'un côté la capacité (qui a le droit, voir
// internal/adminauthz) et de l'autre le niveau (avec quelle preuve). Le
// contrôle est celui d'Evaluate — mêmes codes, même fenêtre de fraîcheur,
// même exigence de méthode autorisée — il n'existe pas de second modèle de
// preuve à tenir à jour.
//
// N3 : la double validation organisationnelle ne vit pas dans la session (elle
// dépend d'un dossier d'approbation, pas d'un jeton) ; VerifyLevel retourne
// donc CodeAllow pour une session N2 satisfaisante et l'appelant DOIT vérifier
// l'approbation séparément.
func VerifyLevel(s Session, level Level, now time.Time) (Code, string) {
	// N0 : rien au-dessus de l'authentification de base.
	if !level.RequiresStrongAuth() {
		return CodeAllow, ""
	}
	_, at, ok := s.StrongMethodAt()
	if !ok {
		// `aal2` annoncé sans méthode autorisée (typiquement SMS) : ce n'est
		// pas « il faut s'authentifier » mais « cette méthode ne compte pas ».
		if s.AAL == "aal2" {
			return CodeDenyWeakAuth, "preuve forte absente : méthode non autorisée (passkey/TOTP requis)"
		}
		return CodeNeedsStepUp, "preuve forte requise : enrôler ou vérifier un facteur passkey/TOTP"
	}
	if !level.RequiresFreshProof() {
		return CodeAllow, ""
	}
	// Refus par défaut : sans horodatage exploitable, on ne peut pas affirmer
	// que la preuve est récente.
	if at.IsZero() || now.Sub(at) > StepUpMaxAge {
		return CodeNeedsStepUp, "preuve forte trop ancienne pour cette action : step-up requis"
	}
	return CodeAllow, ""
}
