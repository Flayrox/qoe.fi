package adminauthz

// =====================================================================
// 🤝 Protocole du quorum N3 — ce que le garde, l'acte et le registre partagent
// =====================================================================
// La double validation est un protocole à trois : le GARDE qui exige, le module
// qui COMMET l'acte (légal) et celui qui tient le REGISTRE des demandes (admin).
// Les trois se parlent par ce fichier, sans que l'un importe l'autre : le type
// de la demande et les motifs de refus y vivent, une fois, avec leurs messages.
//
// Pourquoi les sentinelles sont ici et pas dans le module qui écrit en base :
// le module qui commet l'acte doit pouvoir DIRE pourquoi une demande ne passe
// pas (« motif trop court » n'est pas « vous vous auto-validez »), sinon l'écran
// n'a qu'un 500 à montrer. Un vocabulaire partagé vaut mieux qu'un mappage
// d'erreurs deviné.
// =====================================================================

import (
	"context"
	"errors"

	"github.com/qoefi/api/internal/authz"
)

// ApprovalCheck dit si un dossier d'approbation couvre l'acte NOMMÉ que cette
// personne s'apprête à commettre sur CETTE cible : une SECONDE personne
// autorisée a validé la demande, dans un délai court. La cible compte — une
// approbation donnée pour publier la version A ne doit pas ouvrir la version B.
// Branché par le quorum N3 ; le service d'approbations le satisfait.
type ApprovalCheck func(ctx context.Context, userID string, act authz.Action, target string) bool

// ApprovalRequest est une demande de double validation N3, telle que la console
// la porte : l'acte visé, sa cible, qui l'a demandée et pourquoi, et où en est
// la seconde validation.
type ApprovalRequest struct {
	ID          string `json:"id"`
	Act         string `json:"act"`
	Target      string `json:"target"`
	Capability  string `json:"capability"`
	RequestedBy string `json:"requestedBy"`
	Reason      string `json:"reason"`
	Status      string `json:"status"`
	DecidedBy   string `json:"decidedBy,omitempty"`
	Note        string `json:"note,omitempty"`
	ExpiresAt   string `json:"expiresAt"`
	CreatedAt   string `json:"createdAt"`
	DecidedAt   string `json:"decidedAt,omitempty"`
}

var (
	// ErrApprovalForbidden : la personne n'a pas la capacité que l'acte exige.
	// Valider à la place de quelqu'un d'autre n'est pas une seconde validation,
	// c'est un contournement : l'auteur ET l'approbateur doivent le droit.
	ErrApprovalForbidden = errors.New("vous ne détenez pas la capacité requise par cet acte")

	// ErrApprovalSelf : l'approbateur est le demandeur. Le quorum exige deux
	// personnes distinctes — c'est toute sa valeur.
	ErrApprovalSelf = errors.New("auto-validation refusée : une seconde personne est requise")

	// ErrApprovalClosed : la demande n'est plus en attente (déjà décidée,
	// expirée ou consommée). Rejouer une décision ne rouvre pas un acte.
	ErrApprovalClosed = errors.New("cette demande n'attend plus de décision")

	// ErrApprovalReason : motif absent ou trop court (le journal doit rester
	// relisible : « pourquoi cette exception ? »).
	ErrApprovalReason = errors.New("motif requis (au moins 5 caractères)")

	// ErrApprovalUnknownAct : l'acte n'est pas un acte N3 connu du noyau. Une
	// approbation ne se demande pas pour un acte quelconque.
	ErrApprovalUnknownAct = errors.New("acte soumis à double validation inconnu")
)
