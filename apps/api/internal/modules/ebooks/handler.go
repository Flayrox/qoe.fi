package ebooks

// Routes EPUBs personnels (fiche Plus P1) : upload (multipart, 20 Mo max),
// bibliothèque, détail+chapitres, couverture, progression, suppression.
// Authentifié dans tous les cas (strictement personnel — jamais de route
// publique par id). Codes stables : EBOOK_QUOTA_EXCEEDED (403),
// EBOOK_DUPLICATE (409) — le front branche sur code.

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/qoefi/api/internal/middleware"
	"github.com/qoefi/api/internal/response"
)

// Handler expose les routes EPUBs.
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
	r.Post("/v1/me/ebooks", h.upload)
	r.Get("/v1/me/ebooks", h.list)
	r.Get("/v1/me/ebooks/{id}", h.detail)
	r.Get("/v1/me/ebooks/{id}/cover", h.cover)
	r.Patch("/v1/me/ebooks/{id}/progress", h.progress)
	r.Delete("/v1/me/ebooks/{id}", h.remove)
	// Notes de lecture (table dédiée — jamais publiques, jamais votées).
	r.Get("/v1/me/ebooks/{id}/notes", h.listNotes)
	r.Post("/v1/me/ebooks/{id}/notes", h.addNote)
	r.Patch("/v1/me/ebooks/{id}/notes/{noteId}", h.updateNote)
	r.Delete("/v1/me/ebooks/{id}/notes/{noteId}", h.deleteNote)
}

func (h *Handler) mapErr(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, ErrEbookNotFound):
		response.NotFound(w, "Livre introuvable.")
	case errors.Is(err, ErrEbookDuplicate):
		response.Error(w, http.StatusConflict, err.Error())
	case errors.Is(err, ErrEbookQuota):
		response.ErrorCode(w, http.StatusForbidden, "EBOOK_QUOTA_EXCEEDED", err.Error())
	case errors.Is(err, ErrEpubInvalid):
		response.BadRequest(w, err.Error())
	case errors.Is(err, ErrNoteNotFound):
		response.NotFound(w, err.Error())
	case errors.Is(err, ErrNoteEmpty), errors.Is(err, ErrNoteTooLong):
		response.BadRequest(w, err.Error())
	default:
		response.Internal(w)
	}
}

// POST /v1/me/ebooks — upload multipart (champ "file", EPUB ≤ 20 Mo).
// Le brut est jeté après parse (seul le parsé strict est stocké).
func (h *Handler) upload(w http.ResponseWriter, r *http.Request) {
	uid, ok := h.userID(w, r)
	if !ok {
		return
	}
	if err := r.ParseMultipartForm(MaxUploadBytes + (1 << 20)); err != nil {
		response.BadRequest(w, "Fichier illisible ou trop gros (20 Mo max)")
		return
	}
	f, _, err := r.FormFile("file")
	if err != nil {
		response.BadRequest(w, "Champ 'file' requis (EPUB)")
		return
	}
	defer f.Close()
	raw, err := io.ReadAll(io.LimitReader(f, MaxUploadBytes+1))
	if err != nil {
		response.BadRequest(w, "Lecture impossible")
		return
	}
	book, err := h.svc.Upload(r.Context(), uid, raw)
	if err != nil {
		h.mapErr(w, err)
		return
	}
	response.Created(w, book)
}

// GET /v1/me/ebooks — bibliothèque (sans blobs ni chapitres).
func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	uid, ok := h.userID(w, r)
	if !ok {
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	items, err := h.svc.List(r.Context(), uid, limit, offset)
	if err != nil {
		h.mapErr(w, err)
		return
	}
	if items == nil {
		items = []Ebook{}
	}
	response.OK(w, map[string]any{"items": items})
}

// GET /v1/me/ebooks/{id} — détail + chapitres (lecture).
func (h *Handler) detail(w http.ResponseWriter, r *http.Request) {
	uid, ok := h.userID(w, r)
	if !ok {
		return
	}
	d, err := h.svc.Get(r.Context(), uid, chi.URLParam(r, "id"))
	if err != nil {
		h.mapErr(w, err)
		return
	}
	response.OK(w, d)
}

// GET /v1/me/ebooks/{id}/cover — couverture (content-type réel, cache long :
// immuable par id — un réimport crée une autre ligne).
func (h *Handler) cover(w http.ResponseWriter, r *http.Request) {
	uid, ok := h.userID(w, r)
	if !ok {
		return
	}
	data, mime, err := h.svc.Cover(r.Context(), uid, chi.URLParam(r, "id"))
	if err != nil {
		h.mapErr(w, err)
		return
	}
	w.Header().Set("Content-Type", mime)
	w.Header().Set("Cache-Control", "private, max-age=86400")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
}

// PATCH /v1/me/ebooks/{id}/progress { chapter, pct } — progression
// synchronisée (base du multi-appareils : le client pousse, last-write-wins).
func (h *Handler) progress(w http.ResponseWriter, r *http.Request) {
	uid, ok := h.userID(w, r)
	if !ok {
		return
	}
	var in struct {
		Chapter int `json:"chapter"`
		Pct     int `json:"pct"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	if err := h.svc.SetProgress(r.Context(), uid, chi.URLParam(r, "id"), in.Chapter, in.Pct); err != nil {
		h.mapErr(w, err)
		return
	}
	response.OK(w, map[string]bool{"success": true})
}

// GET /v1/me/ebooks/{id}/notes — mes notes sur ce livre (ordre de lecture).
func (h *Handler) listNotes(w http.ResponseWriter, r *http.Request) {
	uid, ok := h.userID(w, r)
	if !ok {
		return
	}
	items, err := h.svc.Notes(r.Context(), uid, chi.URLParam(r, "id"))
	if err != nil {
		h.mapErr(w, err)
		return
	}
	if items == nil {
		items = []Note{}
	}
	response.OK(w, map[string]any{"items": items})
}

// POST /v1/me/ebooks/{id}/notes { chapter, chapterTitle, excerpt, note } —
// une note = un passage et/ou un mot à soi (les deux vides = refus).
func (h *Handler) addNote(w http.ResponseWriter, r *http.Request) {
	uid, ok := h.userID(w, r)
	if !ok {
		return
	}
	var in struct {
		Chapter      int    `json:"chapter"`
		ChapterTitle string `json:"chapterTitle"`
		Excerpt      string `json:"excerpt"`
		Note         string `json:"note"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	note, err := h.svc.AddNote(r.Context(), uid, chi.URLParam(r, "id"), NoteInput{
		ChapterIndex: in.Chapter, ChapterTitle: in.ChapterTitle, Excerpt: in.Excerpt, Note: in.Note,
	})
	if err != nil {
		h.mapErr(w, err)
		return
	}
	response.Created(w, note)
}

// PATCH /v1/me/ebooks/{id}/notes/{noteId} { note } — l'extrait ne bouge pas.
func (h *Handler) updateNote(w http.ResponseWriter, r *http.Request) {
	uid, ok := h.userID(w, r)
	if !ok {
		return
	}
	var in struct {
		Note string `json:"note"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	note, err := h.svc.UpdateNote(r.Context(), uid, chi.URLParam(r, "id"), chi.URLParam(r, "noteId"), in.Note)
	if err != nil {
		h.mapErr(w, err)
		return
	}
	response.OK(w, note)
}

// DELETE /v1/me/ebooks/{id}/notes/{noteId} — suppression (idempotente côté
// UX ; un id inconnu répond 404, pas 200 menteur).
func (h *Handler) deleteNote(w http.ResponseWriter, r *http.Request) {
	uid, ok := h.userID(w, r)
	if !ok {
		return
	}
	if err := h.svc.DeleteNote(r.Context(), uid, chi.URLParam(r, "id"), chi.URLParam(r, "noteId")); err != nil {
		h.mapErr(w, err)
		return
	}
	response.OK(w, map[string]bool{"deleted": true})
}

// DELETE /v1/me/ebooks/{id} — suppression (le brut n'a jamais été stocké,
// rien d'autre à purger — les notes partent en cascade avec le livre).
func (h *Handler) remove(w http.ResponseWriter, r *http.Request) {
	uid, ok := h.userID(w, r)
	if !ok {
		return
	}
	if err := h.svc.Delete(r.Context(), uid, chi.URLParam(r, "id")); err != nil {
		h.mapErr(w, err)
		return
	}
	response.OK(w, map[string]bool{"deleted": true})
}
