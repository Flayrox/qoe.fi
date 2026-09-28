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

import "fmt"

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

// requiresStrongAuth indique si le niveau exige une preuve forte (TOTP ou
// WebAuthn) pour la session courante.
func (l Level) requiresStrongAuth() bool { return l >= Level1 }

// requiresFreshProof indique si le niveau exige une preuve forte **récente**
// (step-up) plutôt qu'une preuve acquise plus tôt dans la session.
func (l Level) requiresFreshProof() bool { return l >= Level2 }
