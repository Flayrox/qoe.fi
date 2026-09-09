package imports

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"
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
