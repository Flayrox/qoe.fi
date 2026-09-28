package admin

// ── Revue staff des imports d'abonnés (console superadmin) ──────────────
// Les routes vivent ici pour réutiliser le garde superadmin déjà en place
// (`requireSuperadmin`) plutôt que d'en écrire un second : deux contrôles
// d'accès pour la même action finiraient par diverger. La logique métier, elle,
// reste dans le module `imports` — ce fichier n'est qu'une façade HTTP.

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/qoefi/api/internal/modules/imports"
	"github.com/qoefi/api/internal/response"
)

// SetSubscriberImports branche le service d'import d'abonnés. Même pattern que
// SetFlags : la console admin ne construit pas ce service, elle l'expose.
func (h *Handler) SetSubscriberImports(svc *imports.Service) { h.subscriberImports = svc }

// registerSubscriberImports enregistre les routes de revue quand le service
// est branché. Sans lui, aucune route n'est créée : une console mal câblée
// n'expose pas une revue fantôme.
func (h *Handler) registerSubscriberImports(r chi.Router) {
	if h.subscriberImports == nil {
		return
	}
	r.Get("/v1/admin/import/subscribers", h.subscriberImportQueue)
	r.Get("/v1/admin/import/subscribers/{id}", h.subscriberImportReview)
	r.Post("/v1/admin/import/subscribers/{id}/claim", h.subscriberImportClaim)
	r.Post("/v1/admin/import/subscribers/{id}/decide", h.subscriberImportDecide)
	// Branche de reconfirmation : ouvrir une vague, suivre les vagues, purger
	// les demandes échues. Mêmes gardes superadmin, même service.
	r.Post("/v1/admin/import/subscribers/{id}/reconfirm", h.subscriberImportReconfirm)
	r.Get("/v1/admin/import/subscribers/{id}/reconfirm", h.subscriberImportReconfirmStatus)
	r.Post("/v1/admin/import/subscribers/{id}/reconfirm/purge", h.subscriberImportReconfirmPurge)
	// Envoi encadré : ouvrir une vague, suivre les vagues, annuler une vague.
	// Mêmes gardes superadmin, même service — la console n'est qu'une façade.
	r.Post("/v1/admin/import/subscribers/{id}/send-wave", h.subscriberImportSendWave)
	r.Get("/v1/admin/import/subscribers/{id}/send-waves", h.subscriberImportSendWaves)
	r.Post("/v1/admin/import/subscribers/{id}/send-waves/{waveId}/cancel", h.subscriberImportSendWaveCancel)
}

// GET /v1/admin/import/subscribers — file de revue, plus anciens dépôts d'abord.
func (h *Handler) subscriberImportQueue(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireSuperadmin(w, r); !ok {
		return
	}
	batches, err := h.subscriberImports.ListSubscriberImportQueue(r.Context())
	if err != nil {
		log.Printf("[admin] subscriberImportQueue: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, map[string]any{"batches": batches})
}

// GET /v1/admin/import/subscribers/{id} — dossier complet : provenance
// déclarée, preuves, bilan par segment, journal, décisions précédentes et
// signaux de risque (historique de la publication, réimport du même fichier,
// doublons entre lots, vérification du demandeur).
func (h *Handler) subscriberImportReview(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireSuperadmin(w, r); !ok {
		return
	}
	review, err := h.subscriberImports.ReviewSubscriberImport(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		if errors.Is(err, imports.ErrNotFound) {
			response.NotFound(w, "Import introuvable")
			return
		}
		log.Printf("[admin] subscriberImportReview: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, review)
}

// POST /v1/admin/import/subscribers/{id}/claim — marque le lot « en examen ».
// Idempotent : deux membres du staff qui ouvrent le même dossier ne se
// marchent pas dessus.
func (h *Handler) subscriberImportClaim(w http.ResponseWriter, r *http.Request) {
	staffID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	batch, err := h.subscriberImports.ClaimSubscriberImportReview(r.Context(), staffID, chi.URLParam(r, "id"))
	if err != nil {
		if errors.Is(err, imports.ErrNotFound) {
			response.NotFound(w, "Import introuvable")
			return
		}
		log.Printf("[admin] subscriberImportClaim: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, batch)
}

// POST /v1/admin/import/subscribers/{id}/decide — enregistre une décision.
//
// La décision est immuable et porte sur la version exacte du fichier examiné :
// un `fileVersion`/`fileFingerprint` qui ne correspond plus est refusé, pour
// qu'un créateur ne puisse pas remplacer le contenu après approbation et
// hériter de l'accord.
func (h *Handler) subscriberImportDecide(w http.ResponseWriter, r *http.Request) {
	staffID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	var in imports.SubscriberImportDecisionInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	batch, err := h.subscriberImports.DecideSubscriberImport(r.Context(), staffID, chi.URLParam(r, "id"), in)
	switch {
	case err == nil:
		response.OK(w, batch)
	case errors.Is(err, imports.ErrNotFound):
		response.NotFound(w, "Import introuvable")
	case errors.Is(err, imports.ErrImportStaleDecision):
		response.Error(w, http.StatusConflict, "La décision ne porte pas sur la version courante du fichier : rechargez le dossier.")
	case errors.Is(err, imports.ErrImportTransition):
		response.Error(w, http.StatusConflict, "Transition d'état interdite pour ce lot.")
	default:
		log.Printf("[admin] subscriberImportDecide: %v", err)
		response.BadRequest(w, err.Error())
	}
}

// POST /v1/admin/import/subscribers/{id}/reconfirm — ouvre une vague de
// reconfirmation (lot `approved_reconfirm`). Corps optionnel : { waveSize }.
// Idempotent par lot : une vague active existante est renvoyée au lieu d'en
// créer une seconde qui doublerait les envois.
func (h *Handler) subscriberImportReconfirm(w http.ResponseWriter, r *http.Request) {
	staffID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	var in struct {
		WaveSize int `json:"waveSize"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	wave, err := h.subscriberImports.StartReconfirmWave(r.Context(), staffID, chi.URLParam(r, "id"), in.WaveSize)
	switch {
	case err == nil:
		response.Created(w, wave)
	case errors.Is(err, imports.ErrNotFound):
		response.NotFound(w, "Import introuvable")
	case errors.Is(err, imports.ErrReconfirmNotApproved):
		response.Error(w, http.StatusConflict, "Le lot n'est pas approuvé en reconfirmation.")
	case errors.Is(err, imports.ErrReconfirmExpired):
		response.Error(w, http.StatusGone, "L'approbation de reconfirmation a expiré.")
	case errors.Is(err, imports.ErrReconfirmNothingPending):
		response.Error(w, http.StatusConflict, "Aucune adresse à reconfirmer dans ce lot.")
	default:
		log.Printf("[admin] subscriberImportReconfirm: %v", err)
		response.BadRequest(w, err.Error())
	}
}

// GET /v1/admin/import/subscribers/{id}/reconfirm — vagues du lot, la plus
// récente d'abord (suivi d'envoi, confirmations, expirations).
func (h *Handler) subscriberImportReconfirmStatus(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireSuperadmin(w, r); !ok {
		return
	}
	waves, err := h.subscriberImports.ListReconfirmWaves(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		log.Printf("[admin] subscriberImportReconfirmStatus: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, map[string]any{"waves": waves})
}

// POST /v1/admin/import/subscribers/{id}/reconfirm/purge — périme les demandes
// échues et efface les jetons des abonnés restés non confirmés. Rejouable sans
// effet. La non-confirmation n'est pas une opposition : aucune suppression.
func (h *Handler) subscriberImportReconfirmPurge(w http.ResponseWriter, r *http.Request) {
	staffID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	expired, err := h.subscriberImports.PurgeExpiredReconfirms(r.Context(), staffID, chi.URLParam(r, "id"))
	if err != nil {
		log.Printf("[admin] subscriberImportReconfirmPurge: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, map[string]any{"expired": expired})
}

// POST /v1/admin/import/subscribers/{id}/send-wave — ouvre une vague d'envoi
// encadré (lot `approved_direct`). Corps optionnel : { cap } (plafond demandé,
// borné par le service). Idempotent par lot : une vague active existante est
// renvoyée au lieu d'en créer une seconde qui doublerait les envois.
func (h *Handler) subscriberImportSendWave(w http.ResponseWriter, r *http.Request) {
	staffID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	var in struct {
		Cap int `json:"cap"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	wave, err := h.subscriberImports.StartSendWave(r.Context(), staffID, chi.URLParam(r, "id"), in.Cap)
	switch {
	case err == nil:
		response.Created(w, wave)
	case errors.Is(err, imports.ErrNotFound):
		response.NotFound(w, "Import introuvable")
	case errors.Is(err, imports.ErrSendNotApproved):
		response.Error(w, http.StatusConflict, "Le lot n'est pas approuvé en envoi encadré.")
	case errors.Is(err, imports.ErrSendExpired):
		response.Error(w, http.StatusGone, "L'approbation d'envoi encadré a expiré.")
	case errors.Is(err, imports.ErrSendNothingEligible):
		response.Error(w, http.StatusConflict, "Aucune adresse éligible dans ce lot.")
	default:
		log.Printf("[admin] subscriberImportSendWave: %v", err)
		response.BadRequest(w, err.Error())
	}
}

// GET /v1/admin/import/subscribers/{id}/send-waves — vagues d'envoi du lot,
// la plus récente d'abord (suivi, compteurs de qualité, budget consommé).
func (h *Handler) subscriberImportSendWaves(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireSuperadmin(w, r); !ok {
		return
	}
	waves, err := h.subscriberImports.ListSendWaves(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		log.Printf("[admin] subscriberImportSendWaves: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, map[string]any{"waves": waves})
}

// POST /v1/admin/import/subscribers/{id}/send-waves/{waveId}/cancel — annule
// une vague : les livraisons en attente sont écartées avec motif, jamais
// envoyées plus tard par reprise.
func (h *Handler) subscriberImportSendWaveCancel(w http.ResponseWriter, r *http.Request) {
	staffID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	if err := h.subscriberImports.CancelSendWave(r.Context(), staffID, chi.URLParam(r, "waveId")); err != nil {
		if errors.Is(err, imports.ErrNotFound) {
			response.NotFound(w, "Vague introuvable")
			return
		}
		log.Printf("[admin] subscriberImportSendWaveCancel: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, map[string]bool{"success": true})
}
