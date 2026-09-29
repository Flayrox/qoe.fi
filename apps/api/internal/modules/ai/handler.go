package ai

// Routes IA de lecture (fiche Plus P1) : résumé fidèle d'article,
// explication d'extrait. Authentifié + Plus dans tous les cas.
// Codes stables (le front branche sur code) :
//   AI_PLUS_REQUIRED (403), AI_QUOTA_EXCEEDED (429), AI_UNAVAILABLE (503),
//   AI_BUSY (429 global). Le résumé s'affiche TOUJOURS comme IA avec lien
// au texte original (contrat rappelé au front — jamais confondu avec
// l'éditorial).

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	goai "github.com/qoefi/api/internal/ai"
	"github.com/qoefi/api/internal/middleware"
	"github.com/qoefi/api/internal/response"
)

// Handler expose les routes IA.
type Handler struct {
	svc *Service
}

// NewHandler construit le handler.
func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

func (h *Handler) userID(w http.ResponseWriter, r *http.Request) (string, bool) {
	uid, ok := middleware.UserID(r.Context())
	if !ok || uid == "" {
		response.Unauthorized(w, "Authentification requise")
		return "", false
	}
	return uid, true
}

// RegisterProtected enregistre les routes (groupe authentifié).
func (h *Handler) RegisterProtected(r chi.Router) {
	r.Post("/v1/ai/summarize", h.summarize)
	r.Post("/v1/ai/explain", h.explain)
	r.Get("/v1/ai/usage", h.usage)
}

func (h *Handler) mapErr(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, ErrPlusRequired):
		response.ErrorCode(w, http.StatusForbidden, "AI_PLUS_REQUIRED", err.Error())
	case errors.Is(err, ErrAIQuota):
		response.ErrorCode(w, http.StatusTooManyRequests, "AI_QUOTA_EXCEEDED", err.Error())
	case errors.Is(err, ErrAIGlobalQuota):
		response.ErrorCode(w, http.StatusTooManyRequests, "AI_BUSY", err.Error())
	case errors.Is(err, goai.ErrNoProvider):
		response.ErrorCode(w, http.StatusServiceUnavailable, "AI_UNAVAILABLE", err.Error())
	default:
		response.Internal(w)
	}
}

// POST /v1/ai/summarize { articleId, locale? } — résumé fidèle (article
// publié, coupé au paywall comme la lecture). Réponse { summary, usage }.
func (h *Handler) summarize(w http.ResponseWriter, r *http.Request) {
	uid, ok := h.userID(w, r)
	if !ok {
		return
	}
	var in struct {
		ArticleID string `json:"articleId"`
		Locale    string `json:"locale"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil || in.ArticleID == "" {
		response.BadRequest(w, "JSON invalide (articleId requis)")
		return
	}
	out, err := h.svc.Summarize(r.Context(), uid, in.ArticleID, in.Locale)
	if err != nil {
		h.mapErr(w, err)
		return
	}
	response.OK(w, out)
}

// POST /v1/ai/explain { text, locale? } — explication d'extrait (1-2000
// caractères, fournis par l'utilisateur qui les a sous les yeux).
func (h *Handler) explain(w http.ResponseWriter, r *http.Request) {
	uid, ok := h.userID(w, r)
	if !ok {
		return
	}
	var in struct {
		Text   string `json:"text"`
		Locale string `json:"locale"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	out, err := h.svc.Explain(r.Context(), uid, in.Text, in.Locale)
	if err != nil {
		h.mapErr(w, err)
		return
	}
	response.OK(w, out)
}

// GET /v1/ai/usage — quota restant (transparence : l'utilisateur sait où
// il en est AVANT de consommer). Ne consomme rien (lecture seule).
func (h *Handler) usage(w http.ResponseWriter, r *http.Request) {
	uid, ok := h.userID(w, r)
	if !ok {
		return
	}
	response.OK(w, h.svc.UsageOf(r.Context(), uid))
}
