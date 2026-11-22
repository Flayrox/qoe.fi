package users

import (
	"context"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/qoefi/api/internal/domainevents"
	"github.com/qoefi/api/internal/middleware"
	"github.com/qoefi/api/internal/response"
)

// ErrSelfTarget : on ne se bloque/masque pas soi-même.
var ErrSelfTarget = errors.New("cible interdite")

// ErrUserNotFound : la cible du blocage/masquage n'existe pas.
var ErrUserNotFound = errors.New("utilisateur introuvable")

// socialUsers lit la liste des comptes bloqués (blocked=true) ou masqués.
// Toute erreur de lecture/scan remonte : une liste tronquée en 200 ferait
// croire à l'utilisateur que son blocage n'a pas été enregistré.
func (s *Service) socialUsers(ctx context.Context, userID string, blocked bool) ([]socialUserDTO, error) {
	var query string
	if blocked {
		query = `SELECT u.id::text, u.username, u.name, u."logoUrl"
		         FROM "BlockedUser" b JOIN "User" u ON u.id = b."creatorId"
		         WHERE b."readerId" = $1 ORDER BY b.id DESC`
	} else {
		query = `SELECT u.id::text, u.username, u.name, u."logoUrl"
		         FROM "MutedUser" m JOIN "User" u ON u.id = m."mutedId"
		         WHERE m."muterId" = $1 ORDER BY m.id DESC`
	}
	rows, err := s.pool.Query(ctx, query, toUUID(userID))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []socialUserDTO{}
	for rows.Next() {
		var id string
		var username, name, logo pgtype.Text
		if err := rows.Scan(&id, &username, &name, &logo); err != nil {
			return nil, err
		}
		out = append(out, socialUserDTO{id, textPtrUser(username), textPtrUser(name), textPtrUser(logo)})
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return out, nil
}

// requireUserExists protège les écritures qui référencent un compte par FK :
// sans ce contrôle, un identifiant inconnu répondait 500.
func (s *Service) requireUserExists(ctx context.Context, userID string) error {
	var exists bool
	if err := s.pool.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM "User" WHERE id = $1)`, toUUID(userID)).Scan(&exists); err != nil {
		return err
	}
	if !exists {
		return ErrUserNotFound
	}
	return nil
}

// ToggleBlock bascule le blocage d'un compte (cible vérifiée, pool typé).
func (s *Service) ToggleBlock(ctx context.Context, userID, targetID string) (bool, error) {
	if targetID == userID {
		return false, ErrSelfTarget
	}
	if err := s.requireUserExists(ctx, targetID); err != nil {
		return false, err
	}
	pool := poolFromPooler(s.pool)
	if pool == nil {
		return false, errors.New("pool de base de données indisponible")
	}
	return domainevents.ToggleBlock(ctx, pool, userID, targetID)
}

// ToggleMute bascule le masquage d'un compte (cible vérifiée, pool typé).
func (s *Service) ToggleMute(ctx context.Context, userID, targetID string) (bool, error) {
	if targetID == userID {
		return false, ErrSelfTarget
	}
	if err := s.requireUserExists(ctx, targetID); err != nil {
		return false, err
	}
	pool := poolFromPooler(s.pool)
	if pool == nil {
		return false, errors.New("pool de base de données indisponible")
	}
	return domainevents.ToggleMute(ctx, pool, userID, targetID)
}

type socialUserDTO struct {
	ID       string  `json:"id"`
	Username *string `json:"username"`
	Name     *string `json:"name"`
	LogoURL  *string `json:"logoUrl"`
}

func textPtrUser(v pgtype.Text) *string {
	if !v.Valid {
		return nil
	}
	s := v.String
	return &s
}
func (h *Handler) blockedUsers(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	if userID == "" {
		response.Unauthorized(w, "Authentification requise")
		return
	}
	users, err := h.svc.socialUsers(r.Context(), userID, true)
	if err != nil {
		response.Internal(w)
		return
	}
	response.OK(w, map[string]any{"users": users})
}

func (h *Handler) mutedUsers(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	if userID == "" {
		response.Unauthorized(w, "Authentification requise")
		return
	}
	users, err := h.svc.socialUsers(r.Context(), userID, false)
	if err != nil {
		response.Internal(w)
		return
	}
	response.OK(w, map[string]any{"users": users})
}

func poolFromPooler(p pooler) *pgxpool.Pool {
	if pool, ok := p.(*pgxpool.Pool); ok {
		return pool
	}
	type unwrapper interface {
		Unwrap() *pgxpool.Pool
	}
	if u, ok := p.(unwrapper); ok {
		return u.Unwrap()
	}
	return nil
}

func (h *Handler) toggleBlockedUser(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	if userID == "" {
		response.Unauthorized(w, "Authentification requise")
		return
	}
	blocked, err := h.svc.ToggleBlock(r.Context(), userID, chi.URLParam(r, "id"))
	if err != nil {
		switch {
		case errors.Is(err, ErrSelfTarget):
			response.BadRequest(w, "Impossible de se bloquer soi-même")
		case errors.Is(err, ErrUserNotFound):
			response.NotFound(w, "Utilisateur introuvable")
		default:
			response.Internal(w)
		}
		return
	}
	response.OK(w, map[string]bool{"blocked": blocked})
}

func (h *Handler) toggleMutedUser(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	if userID == "" {
		response.Unauthorized(w, "Authentification requise")
		return
	}
	muted, err := h.svc.ToggleMute(r.Context(), userID, chi.URLParam(r, "id"))
	if err != nil {
		switch {
		case errors.Is(err, ErrSelfTarget):
			response.BadRequest(w, "Impossible de se masquer soi-même")
		case errors.Is(err, ErrUserNotFound):
			response.NotFound(w, "Utilisateur introuvable")
		default:
			response.Internal(w)
		}
		return
	}
	response.OK(w, map[string]bool{"muted": muted})
}
