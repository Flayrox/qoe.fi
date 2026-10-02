package admin

// ── File des validations N3 (quorum) — façade HTTP ─────────────────────
// Deux routes seulement, parce que la décision se prend là où l'acte se
// commet : la demande est portée par l'écran de l'acte (publication juridique),
// la validation par cette file. Lire la file demande la capacité de lecture du
// domaine concerné ; DÉCIDER est un acte lourd (N2) qui exige la capacité de
// l'acte — valider une publication juridique n'est pas un clic de courtoisie.

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/qoefi/api/internal/response"
)

// GET /v1/admin/approvals — demandes récentes : ce qui attend une seconde
// validation d'abord, puis ce qui a été décidé (pour relire).
func (h *Handler) approvals(w http.ResponseWriter, r *http.Request) {
	actorID, ok := h.requireAuthenticated(w, r)
	if !ok {
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	items, err := h.svc.PendingApprovals(r.Context(), actorID, int32(limit))
	if errors.Is(err, ErrApprovalForbidden) {
		response.Forbidden(w, "File des validations réservée au personnel de la console.")
		return
	}
	if err != nil {
		log.Printf("[admin] approvals: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, map[string]any{"items": items})
}

// POST /v1/admin/approvals/{id}/decide — approuver ou rejeter une demande.
// L'auto-validation et une demande déjà close sont refusées avec un code
// distinct, pour que l'écran dise pourquoi au lieu d'un « erreur ».
func (h *Handler) decideApproval(w http.ResponseWriter, r *http.Request) {
	approverID, ok := h.requireAuthenticated(w, r)
	if !ok {
		return
	}
	var in struct {
		Decision string `json:"decision"`
		Note     string `json:"note"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide (decision requise)")
		return
	}
	decided, err := h.svc.DecideApproval(r.Context(), approverID, chi.URLParam(r, "id"), in.Decision, in.Note)
	switch {
	case err == nil:
		response.OK(w, decided)
	case errors.Is(err, ErrApprovalSelf):
		response.Error(w, http.StatusForbidden,
			"Vous avez demandé cette validation : une seconde personne doit l'approuver.")
	case errors.Is(err, ErrApprovalClosed):
		response.Error(w, http.StatusConflict,
			"Cette demande n'attend plus de décision (déjà décidée, expirée ou consommée).")
	case errors.Is(err, errInvalidAction):
		response.BadRequest(w, "Décision invalide : approuver ou rejeter.")
	case errors.Is(err, ErrApprovalForbidden):
		// La capacité de l'acte manque : valider à la place de quelqu'un d'autre
		// n'est pas une seconde validation, c'est un contournement.
		response.Forbidden(w, err.Error())
	default:
		log.Printf("[admin] decideApproval: %v", err)
		response.Internal(w)
	}
}
