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
