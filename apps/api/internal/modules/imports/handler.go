package imports

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/qoefi/api/internal/authz"
	"github.com/qoefi/api/internal/middleware"
	"github.com/qoefi/api/internal/response"
)

type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

func (h *Handler) Register(r chi.Router) {
	// Mode synchrone (historique) : créé les articles du lot dans la requête.
	r.Post("/v1/import/articles", h.importArticles)
	// Mode asynchrone : job + worker asynq + rapport d'erreurs.
	r.Post("/v1/import/jobs", h.createImportJob)
	r.Get("/v1/import/jobs/{id}", h.getImportJob)
	r.Get("/v1/import/jobs", h.listImportJobs)

	// Dépôt d'une liste d'abonnés : quarantaine + revue staff. La publication
	// est dans le **chemin** précisément pour que le garde d'autorisation
	// puisse résoudre la permission média depuis l'URL (comme les routes de
	// réglages média) ; un identifiant qui ne voyagerait que dans le corps ne
	// serait résolu par personne, et le refus par défaut du garde
	// s'appliquerait faute de permission connue.
	r.With(middleware.RequireAction(authz.ActionImportRequest,
		middleware.WithAuthzResource(middleware.AuthzResourcePublication, "publicationId"),
	)).Post("/v1/import/publications/{publicationId}/subscribers", h.submitSubscriberImport)

	// Suivi côté demandeur : agrégats et décisions communicables uniquement.
	r.Get("/v1/import/subscribers", h.listSubscriberImports)
	r.Get("/v1/import/subscribers/{id}", h.getSubscriberImport)
}

// POST /v1/import/articles — crée les articles d'un lot (dédup par slug).
// Corps : { publicationId, articles: [{title, slug, content, readingTime}] }.
func (h *Handler) importArticles(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserID(r.Context())
	if !ok || userID == "" {
		response.Unauthorized(w, "Non authentifié")
		return
	}
	var in ImportArticlesRequest
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	if in.PublicationID == "" || len(in.Articles) == 0 {
		response.BadRequest(w, "publicationId et articles requis")
		return
	}
	created, err := h.svc.ImportArticles(r.Context(), userID, in)
	if err != nil {
		if err == errForbidden {
			response.Forbidden(w, "Vous n'êtes pas autorisé à importer dans cette publication.")
			return
		}
		log.Printf("[imports] importArticles: %v", err)
		response.Internal(w)
		return
	}
	response.Created(w, map[string]int{"importedCount": created})
}

// POST /v1/import/jobs — enregistre un job d'import asynchrone et l'enqueue
// asynq. Corps identique à /v1/import/articles. Réponse 202 {jobId}.
func (h *Handler) createImportJob(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserID(r.Context())
	if !ok || userID == "" {
		response.Unauthorized(w, "Non authentifié")
		return
	}
	var in ImportArticlesRequest
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	if in.PublicationID == "" || len(in.Articles) == 0 {
		response.BadRequest(w, "publicationId et articles requis")
		return
	}
	jobID, err := h.svc.CreateImportJob(r.Context(), userID, in)
	if err != nil {
		if errors.Is(err, errForbidden) {
			response.Forbidden(w, "Vous n'êtes pas autorisé à importer dans cette publication.")
			return
		}
		log.Printf("[imports] createImportJob: %v", err)
		response.BadRequest(w, err.Error())
		return
	}
	response.JSON(w, http.StatusAccepted, map[string]string{"jobId": jobID})
}

// GET /v1/import/jobs/{id} — statut + progression + rapport d'erreurs.
func (h *Handler) getImportJob(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserID(r.Context())
	if !ok || userID == "" {
		response.Unauthorized(w, "Non authentifié")
		return
	}
	job, err := h.svc.GetImportJob(r.Context(), userID, chi.URLParam(r, "id"))
	if err != nil {
		if errors.Is(err, errNotFound) {
			response.NotFound(w, "Job d'import introuvable")
			return
		}
		log.Printf("[imports] getImportJob: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, job)
}

// GET /v1/import/jobs — jobs récents de l'utilisateur (20 max).
func (h *Handler) listImportJobs(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserID(r.Context())
	if !ok || userID == "" {
		response.Unauthorized(w, "Non authentifié")
		return
	}
	jobs, err := h.svc.ListImportJobs(r.Context(), userID)
	if err != nil {
		log.Printf("[imports] listImportJobs: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, map[string]any{"jobs": jobs})
}

// POST /v1/import/publications/{publicationId}/subscribers — dépose un CSV
// d'abonnés en quarantaine et le soumet à la revue staff.
//
// Corps : { publicationId, source, sourceDetail, collectionPeriod,
// optInMethod, lastSendAt, declarations, proofRefs, content }.
//
// La réponse annonce un **bilan**, jamais un envoi : le dépôt ne rend aucun
// contact destinataire et n'expédie aucun email de reconfirmation.
func (h *Handler) submitSubscriberImport(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserID(r.Context())
	if !ok || userID == "" {
		response.Unauthorized(w, "Non authentifié")
		return
	}
	var in SubscriberImportRequest
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	// La publication vient du chemin : le corps ne peut pas la contredire,
	// sinon un demandeur autorisé sur une publication viserait une autre.
	in.PublicationID = chi.URLParam(r, "publicationId")
	if in.PublicationID == "" {
		response.BadRequest(w, "publicationId requis")
		return
	}
	batch, err := h.svc.SubmitSubscriberImport(r.Context(), userID, in)
	switch {
	case err == nil:
		response.Created(w, batch)
	case errors.Is(err, errForbidden):
		response.Forbidden(w, "Vous n'êtes pas autorisé à importer des abonnés pour cette publication.")
	case errors.Is(err, errImportDeclarations):
		response.BadRequest(w, "Déclarations de provenance incomplètes : origine licite, absence d'adresses achetées ou collectées sur le Web, absence de désabonnés et finalité annoncée sont obligatoires.")
	case errors.Is(err, errImportTooLarge):
		response.Error(w, http.StatusRequestEntityTooLarge, "Fichier trop volumineux.")
	case errors.Is(err, errImportOpenBatches):
		response.Error(w, http.StatusTooManyRequests, "Trop de lots en attente de revue pour cette publication. Attendez une décision avant d'en déposer un nouveau.")
	case errors.Is(err, errImportNoRows):
		response.BadRequest(w, "Aucune adresse exploitable dans le fichier.")
	default:
		log.Printf("[imports] submitSubscriberImport: %v", err)
		response.Internal(w)
	}
}

// GET /v1/import/subscribers — lots récents du demandeur.
func (h *Handler) listSubscriberImports(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserID(r.Context())
	if !ok || userID == "" {
		response.Unauthorized(w, "Non authentifié")
		return
	}
	batches, err := h.svc.ListSubscriberImports(r.Context(), userID)
	if err != nil {
		log.Printf("[imports] listSubscriberImports: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, map[string]any{"batches": batches})
}

// GET /v1/import/subscribers/{id} — dossier d'un lot, vue demandeur :
// bilan agrégé et décisions communicables, jamais le motif interne ni les
// adresses des autres lots.
func (h *Handler) getSubscriberImport(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserID(r.Context())
	if !ok || userID == "" {
		response.Unauthorized(w, "Non authentifié")
		return
	}
	review, err := h.svc.ReviewSubscriberImportForRequester(r.Context(), userID, chi.URLParam(r, "id"))
	if err != nil {
		if errors.Is(err, errNotFound) {
			response.NotFound(w, "Import introuvable")
			return
		}
		log.Printf("[imports] getSubscriberImport: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, review)
}
