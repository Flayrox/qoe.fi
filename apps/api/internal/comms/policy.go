// Package comms — politique d'envoi des communications (fiche 04 §2–§3).
// =====================================================================
// Le moteur répond de façon explicable : « cette personne peut-elle recevoir
// ce message maintenant, et pourquoi ? » Sorties : allow, defer,
// needs_review, suppress, cancel — chacune avec un code de raison exploitable
// par les interfaces et le support.
//
// Ce moteur ne remplace ni le garde d'autorisation (internal/authz : QUI a le
// droit de déclencher), ni la revue staff des imports (QUEL lot peut partir) :
// il tranche l'éligibilité du DESTINATAIRE au moment de l'envoi. Les trois
// couches se cumulent ; aucune ne suffit seule.
//
// Règle anti-détournement (fiche 04 §2) : le traitement d'un message dépend
// du type enregistré dans `MessageTypePolicy`, jamais d'une étiquette choisie
// dans l'interface. Un type `security`/`service` ne transporte pas de contenu
// promotionnel — le moteur ne le vérifie pas (c'est aux templates), mais il
// refuse à ces familles tout budget ou file marketing.
package comms

import (
	"context"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/qoefi/api/internal/flags"
)

// Decision est un verdict du moteur : quoi faire d'un envoi envisagé.
type Decision string

const (
	// DecisionAllow : envoyer (dans le respect des files et budgets).
	DecisionAllow Decision = "allow"
	// DecisionDefer : ne pas envoyer maintenant, réessayer plus tard
	// (budget épuisé, transport indisponible).
	DecisionDefer Decision = "defer"
	// DecisionNeedsReview : ne pas envoyer sans validation humaine.
	DecisionNeedsReview Decision = "needs_review"
	// DecisionSuppress : ne jamais envoyer à ce destinataire pour ce message
	// (opposition, rejet durable). Définitif pour cette intention.
	DecisionSuppress Decision = "suppress"
	// DecisionCancel : abandonner l'intention (lot suspendu, approbation
	// retirée, type inconnu). Ne pas réessayer.
	DecisionCancel Decision = "cancel"
)

// Reason est le code de raison exploitable (support, interfaces, audit).
type Reason string

const (
	ReasonOK                  Reason = "ok"
	ReasonSuppressedGlobal    Reason = "suppressed_global"
	ReasonSuppressedPublisher Reason = "suppressed_publication"
	ReasonSuspended           Reason = "suspended"
	ReasonBudgetExhausted     Reason = "budget_exhausted"
	ReasonApprovalMissing     Reason = "approval_missing"
	ReasonUnknownType         Reason = "unknown_type"
	ReasonDeferred            Reason = "deferred_transport"
)

// Input rassemble ce que l'appelant a résolu sur le destinataire et le
// contexte. Comme pour le garde d'autorisation : ce qui n'est pas résolu
// n'est pas supposé — les champs booléens ont une valeur zéro sûre, et
// l'appelant qui ne sait pas laisse `Checked` à faux, ce qui renvoie
// `needs_review` plutôt qu'une autorisation aveugle.
type Input struct {
	// MessageType : clé du registre (ex. "creator.newsletter").
	MessageType string
	// Email du destinataire envisagé (normalisé par l'appelant).
	Email string
	// PublicationID concernée (vide pour les messages sans publication).
	PublicationID string

	// SuppressionChecked indique que l'opposition a été consultée.
	SuppressionChecked bool
	// SuppressedGlobal : opposition globale (plainte, rejet durable global).
	SuppressedGlobal bool
	// SuppressedPublication : opposition pour cette publication.
	SuppressedPublication bool
	// Suspended : lot, publication ou identité d'envoi suspendu.
	Suspended bool
	// BudgetChecked indique que le budget a été consulté.
	BudgetChecked bool
	// BudgetAvailable : il reste du quota consommable atomiquement.
	BudgetAvailable bool
	// ApprovalChecked indique que l'approbation requise a été vérifiée.
	ApprovalChecked bool
	// ApprovalGranted : approbation staff en vigueur pour ce type/lot.
	ApprovalGranted bool
}

// Verdict est le résultat expliqué d'une évaluation.
type Verdict struct {
	Decision Decision
	Reason   Reason
}

// RequiresSuppressionCheck indique si l'opposition doit être consultée pour
// ce type. Les messages de sécurité et de service lié (code, récupération,
// confirmation, bienvenue, réponse support, billet, avis légal) partent dans
// le cadre d'une relation ou d'une obligation existante : une désinscription
// newsletter ne les neutralise jamais — sinon, signaler les e-mails de
// quelqu'un permettrait de verrouiller son compte. Seuls les envois de liste
// (newsletter, produit, invitations, campagnes staff) exigent la consultation.
func (p MessageTypePolicy) RequiresSuppressionCheck() bool {
	switch p.Family {
	case "newsletter", "product", "event", "staff":
		return true
	default:
		return false
	}
}

// Evaluate applique la politique dans un ordre qui ne fuit aucune information
// inutile : opposition d'abord (refus définitif, sans appel), puis suspension,
// puis approbation, puis budget. Un type inconnu du registre annule — on
// n'envoie jamais un message dont la finalité n'est pas enregistrée.
func Evaluate(policy *MessageTypePolicy, in Input) Verdict {
	if policy == nil {
		return Verdict{Decision: DecisionCancel, Reason: ReasonUnknownType}
	}
	// 1. Opposition : définitive pour cette intention, mais seulement pour les
	// envois de liste. L'ordre global puis publication donne le motif le plus
	// précis sans rien révéler d'autre.
	if policy.RequiresSuppressionCheck() {
		if !in.SuppressionChecked {
			// Opposition non consultée : on ne peut pas autoriser, mais on ne
			// peut pas non plus supprimer (rien ne prouve l'opposition).
			// Revue humaine plutôt qu'autorisation aveugle.
			return Verdict{Decision: DecisionNeedsReview, Reason: ReasonUnknownType}
		}
		if in.SuppressedGlobal {
			return Verdict{Decision: DecisionSuppress, Reason: ReasonSuppressedGlobal}
		}
		if in.SuppressedPublication {
			return Verdict{Decision: DecisionSuppress, Reason: ReasonSuppressedPublisher}
		}
	}
	// 2. Suspension : conservatoire, réversible par décision explicite.
	if in.Suspended {
		return Verdict{Decision: DecisionCancel, Reason: ReasonSuspended}
	}
	// 3. Approbation : les types qui l'exigent (légal, staff, produit sensible)
	// ne partent jamais sur une simple intention.
	if policy.StaffApproval {
		if !in.ApprovalChecked || !in.ApprovalGranted {
			if !in.ApprovalChecked {
				return Verdict{Decision: DecisionNeedsReview, Reason: ReasonApprovalMissing}
			}
			return Verdict{Decision: DecisionCancel, Reason: ReasonApprovalMissing}
		}
	}
	// 4. Budget : épuisé = différé, jamais dépassé. La consommation atomique
	// reste à la charge de l'appelant (UPDATE conditionnel).
	if in.BudgetChecked && !in.BudgetAvailable {
		return Verdict{Decision: DecisionDefer, Reason: ReasonBudgetExhausted}
	}
	return Verdict{Decision: DecisionAllow, Reason: ReasonOK}
}

// MessageTypePolicy est une ligne du registre (miroir de la table).
type MessageTypePolicy struct {
	Key           string
	Family        string
	Owner         string
	BaseRule      string
	Priority      int
	Tracking      string
	StaffApproval bool
}

// EmailKillEngaged lit l'arrêt d'urgence global des envois
// (`workers-email-kill`, fiche 04 §6, §13). True = TOUT STOPPER sauf l'auth
// (codes et récupération, qui ne passent par aucun worker).
//
// Défaut sûr : pool nil, table absente ou erreur de lecture → false (envois
// autorisés). C'est le même défaut que le coupe-feu newsletters existant, et
// c'est cohérent : quand la base est injoignable, les workers ne peuvent de
// toute façon rien envoyer (ils lisent leurs files en base) ; un défaut
// bloquant empêcherait surtout les reprises. L'activation du kill est
// toujours explicite et journalisée à chaque point d'arrêt.
func EmailKillEngaged(ctx context.Context, pool *pgxpool.Pool) bool {
	if pool == nil {
		return false
	}
	return flags.NewService(pool).IsOn(ctx, flags.WorkersEmailKill)
}

// SuppressionState est l'opposition connue pour un couple (email, publication).
type SuppressionState struct {
	Global      bool
	Publication bool
}

// LookupSuppression lit l'opposition durable pour un destinataire : portée
// globale OU portée publication. Une seule requête, réutilisée par tous les
// chemins d'envoi — c'est le point central qui empêche les divergences entre
// la quarantaine d'import, les campagnes et les reconfirmations.
func LookupSuppression(ctx context.Context, pool *pgxpool.Pool, email, publicationID string) (SuppressionState, error) {
	var out SuppressionState
	email = strings.ToLower(strings.TrimSpace(email))
	if email == "" {
		return out, nil
	}
	err := pool.QueryRow(ctx, `
		SELECT
		  EXISTS(SELECT 1 FROM "EmailSuppression" WHERE email = $1 AND "scope" = 'global'),
		  EXISTS(SELECT 1 FROM "EmailSuppression" WHERE email = $1 AND "scope" = 'publication' AND "publicationId" = $2)`,
		email, publicationID).Scan(&out.Global, &out.Publication)
	return out, err
}
