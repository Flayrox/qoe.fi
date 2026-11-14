package admin

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/qoefi/api/internal/adminauthz"
	"github.com/qoefi/api/internal/response"
)

// =====================================================================
// 🗂️ saved_views.go — persistance serveur des vues d'exploitation (Lot B3)
// =====================================================================
// Permet de mémoriser et de partager au sein de l'équipe staff les configurations
// de filtres, tri, colonnes et densités appliquées sur les grilles d'exploitation.
// =====================================================================

var (
	errViewNotFound    = errors.New("vue introuvable")
	errViewForbidden   = errors.New("action non autorisée sur cette vue")
	errInvalidViewName = errors.New("le nom de la vue est obligatoire")
)

type SavedViewItem struct {
	ID        string          `json:"id"`
	UserID    string          `json:"userId"`
	Resource  string          `json:"resource"`
	Name      string          `json:"name"`
	IsShared  bool            `json:"isShared"`
	IsMine    bool            `json:"isMine"`
	State     json.RawMessage `json:"state"`
	CreatedAt string          `json:"createdAt"`
	UpdatedAt string          `json:"updatedAt"`
}

type SaveViewInput struct {
	Name     string          `json:"name"`
	IsShared bool            `json:"isShared"`
	State    json.RawMessage `json:"state"`
}

// ListSavedViews retourne les vues personnelles de l'opérateur et les vues partagées de l'équipe pour la ressource.
func (s *Service) ListSavedViews(ctx context.Context, staffID, resource string) ([]SavedViewItem, error) {
	resource = strings.TrimSpace(resource)
	if resource == "" {
		return []SavedViewItem{}, nil
	}

	rows, err := s.pool.Query(ctx, `
		SELECT 
			id::text, 
			"userId"::text, 
			resource, 
			name, 
			"isShared", 
			state, 
			"createdAt", 
			"updatedAt"
		FROM "AdminSavedView"
		WHERE resource = $1 AND ("userId" = $2::uuid OR "isShared" = true)
		ORDER BY "isShared" ASC, name ASC
	`, resource, staffID)
	if err != nil {
		return nil, fmt.Errorf("list saved views: %w", err)
	}
	defer rows.Close()

	var items []SavedViewItem
	for rows.Next() {
		var item SavedViewItem
		var rawState []byte
		var createdAt, updatedAt time.Time
		if err := rows.Scan(
			&item.ID,
			&item.UserID,
			&item.Resource,
			&item.Name,
			&item.IsShared,
			&rawState,
			&createdAt,
			&updatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan saved view: %w", err)
		}
		item.State = json.RawMessage(rawState)
		item.IsMine = (item.UserID == staffID)
		item.CreatedAt = createdAt.Format(time.RFC3339)
		item.UpdatedAt = updatedAt.Format(time.RFC3339)
		items = append(items, item)
	}
	if items == nil {
		items = []SavedViewItem{}
	}
	return items, nil
}

// SaveView insère ou met à jour une vue sauvegardée pour l'opérateur.
func (s *Service) SaveView(ctx context.Context, staffID, resource string, in SaveViewInput) (SavedViewItem, error) {
	resource = strings.TrimSpace(resource)
	in.Name = strings.TrimSpace(in.Name)
	if in.Name == "" {
		return SavedViewItem{}, errInvalidViewName
	}
	if len(in.State) == 0 {
		in.State = json.RawMessage(`{}`)
	}

	var item SavedViewItem
	var rawState []byte
	var createdAt, updatedAt time.Time

	err := s.pool.QueryRow(ctx, `
		INSERT INTO "AdminSavedView" ("userId", resource, name, "isShared", state, "updatedAt")
		VALUES ($1::uuid, $2, $3, $4, $5, NOW())
		ON CONFLICT ("userId", resource, name)
		DO UPDATE SET
			"isShared" = EXCLUDED."isShared",
			state = EXCLUDED.state,
			"updatedAt" = NOW()
		RETURNING 
			id::text, 
			"userId"::text, 
			resource, 
			name, 
			"isShared", 
			state, 
			"createdAt", 
			"updatedAt"
	`, staffID, resource, in.Name, in.IsShared, in.State).Scan(
		&item.ID,
		&item.UserID,
		&item.Resource,
		&item.Name,
		&item.IsShared,
		&rawState,
		&createdAt,
		&updatedAt,
	)
	if err != nil {
		return SavedViewItem{}, fmt.Errorf("save view: %w", err)
	}

	item.State = json.RawMessage(rawState)
	item.IsMine = true
	item.CreatedAt = createdAt.Format(time.RFC3339)
	item.UpdatedAt = updatedAt.Format(time.RFC3339)

	s.logAudit(ctx, staffID, "views.save", "system", item.ID, map[string]any{
		"name":     item.Name,
		"resource": resource,
		"isShared": item.IsShared,
	})
	return item, nil
}

// DeleteSavedView supprime une vue enregistrée si elle appartient à l'opérateur ou s'il dispose des droits admin.
func (s *Service) DeleteSavedView(ctx context.Context, staffID, resource, id string, canManageAny bool) error {
	resource = strings.TrimSpace(resource)
	id = strings.TrimSpace(id)

	// L'id vient de l'URL : un identifiant mal formé ne doit jamais devenir une
	// erreur de cast Postgres (500). Il ne peut désigner aucune vue → 404, même
	// réponse qu'une vue inexistante ou d'un collègue (zéro-fuite).
	if _, err := uuid.Parse(id); err != nil {
		return errViewNotFound
	}

	var name string
	err := s.pool.QueryRow(ctx, `
		DELETE FROM "AdminSavedView"
		WHERE id = $1::uuid AND resource = $2 AND ("userId" = $3::uuid OR $4)
		RETURNING name
	`, id, resource, staffID, canManageAny).Scan(&name)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return errViewNotFound
		}
		return fmt.Errorf("delete saved view: %w", err)
	}

	s.logAudit(ctx, staffID, "views.delete", "system", id, map[string]any{
		"name":     name,
		"resource": resource,
	})
	return nil
}

// ── HTTP Handlers ──────────────────────────────────────────────────────────

func (h *Handler) listSavedViews(w http.ResponseWriter, r *http.Request) {
	staffID, ok := h.requireAuthenticated(w, r)
	if !ok {
		return
	}
	resourceParam := chi.URLParam(r, "resource")
	views, err := h.svc.ListSavedViews(r.Context(), staffID, resourceParam)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, map[string]any{"views": views})
}

func (h *Handler) saveView(w http.ResponseWriter, r *http.Request) {
	staffID, ok := h.requireAuthenticated(w, r)
	if !ok {
		return
	}
	resourceParam := chi.URLParam(r, "resource")
	var in SaveViewInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	item, err := h.svc.SaveView(r.Context(), staffID, resourceParam, in)
	if err != nil {
		switch {
		case errors.Is(err, errInvalidViewName):
			response.BadRequest(w, err.Error())
		default:
			h.handleErr(w, err)
		}
		return
	}
	response.OK(w, item)
}

func (h *Handler) deleteSavedView(w http.ResponseWriter, r *http.Request) {
	staffID, ok := h.requireAuthenticated(w, r)
	if !ok {
		return
	}
	resourceParam := chi.URLParam(r, "resource")
	idParam := chi.URLParam(r, "id")

	// Vérifie si l'utilisateur possède admin.config.write pour supprimer des vues partagées de collègues
	hasConfigWrite := false
	if h.console != nil && h.console.Lookup() != nil {
		if acc, err := h.console.Lookup().Access(r.Context(), staffID); err == nil {
			hasConfigWrite = acc.Has(adminauthz.ConfigWrite)
		}
	}

	err := h.svc.DeleteSavedView(r.Context(), staffID, resourceParam, idParam, hasConfigWrite)
	if err != nil {
		switch {
		case errors.Is(err, errViewNotFound):
			response.NotFound(w, "Vue introuvable ou permissions insuffisantes")
		default:
			h.handleErr(w, err)
		}
		return
	}
	response.OK(w, map[string]any{"deleted": true})
}
