package admin

// =====================================================================
// 🚪 Accès staff — surface HTTP (plan console, Phase 2)
// =====================================================================
// Six routes, deux capacités : `admin.access.read` pour toutes les lectures
// (liste, fiche « pourquoi ? », matrice, vocabulaire) et `admin.access.grant`
// pour les deux mouvements (attribuer, révoquer). Le motif est obligatoire côté
// service : la surface ne peut pas l'oublier.
// =====================================================================

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/qoefi/api/internal/response"
)

// GET /v1/admin/access/grants — attributions de rôles.
// Query : ?q= (email, nom, pseudonyme, rôle, identifiant), ?limit= (max 500).
func (h *Handler) accessGrants(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireAuthenticated(w, r); !ok {
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	items, err := h.svc.ListAccessGrants(r.Context(), r.URL.Query().Get("q"), limit)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, map[string]any{"items": items, "total": len(items)})
}

// POST /v1/admin/access/grants — attribue un rôle.
// Body : { userId, roleKey, expiresAt?, reason }.
func (h *Handler) grantAccess(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireAuthenticated(w, r)
	if !ok {
		return
	}
	var in GrantAccessInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	grant, err := h.svc.GrantAccess(r.Context(), userID, in)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	h.InvalidateAccess(grant.UserID)
	response.OK(w, grant)
}

// POST /v1/admin/access/grants/{userID}/{roleKey}/revoke — révoque un rôle.
// Body : { reason }. Le motif est obligatoire : une révocation silencieuse est
// indistinguable d'une erreur de manipulation.
func (h *Handler) revokeAccess(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireAuthenticated(w, r)
	if !ok {
		return
	}
	var body struct {
		Reason string `json:"reason"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	targetID := chi.URLParam(r, "userID")
	roleKey := chi.URLParam(r, "roleKey")
	// Le motif peut aussi venir en query string : certaines automatisations
	// d'exploitation n'envoient pas de corps sur une route de révocation.
	if strings.TrimSpace(body.Reason) == "" {
		body.Reason = r.URL.Query().Get("reason")
	}
	revoked, err := h.svc.RevokeAccess(r.Context(), userID, targetID, roleKey, body.Reason)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	h.InvalidateAccess(revoked.UserID)
	response.OK(w, revoked)
}

// GET /v1/admin/access/people — personnes candidates à une attribution.
// Query : ?q= (au moins deux caractères), ?limit= (max 50).
func (h *Handler) accessPeople(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireAuthenticated(w, r); !ok {
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	items, err := h.svc.SearchAccessPeople(r.Context(), r.URL.Query().Get("q"), limit)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, map[string]any{"items": items, "total": len(items)})
}

// GET /v1/admin/access/people/{userID} — « pourquoi cette personne détient-elle
// ceci ? » : attributions, capacités effectives et rôle porteur de chacune.
func (h *Handler) accessPerson(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireAuthenticated(w, r); !ok {
		return
	}
	person, err := h.svc.AccessIdentity(r.Context(), chi.URLParam(r, "userID"))
	if err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, person)
}

// GET /v1/admin/access/roles — matrice rôle × capacité telle que la base la
// porte, avec le nombre de détenteurs actifs.
func (h *Handler) accessRoles(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireAuthenticated(w, r); !ok {
		return
	}
	items, err := h.svc.AccessRoles(r.Context())
	if err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, map[string]any{"items": items, "total": len(items)})
}

// GET /v1/admin/access/capabilities — vocabulaire des capacités semé en base.
func (h *Handler) accessCapabilities(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireAuthenticated(w, r); !ok {
		return
	}
	items, err := h.svc.AccessCapabilities(r.Context())
	if err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, map[string]any{"items": items, "total": len(items)})
}
