package users

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/qoefi/api/internal/domainevents"
	"github.com/qoefi/api/internal/middleware"
	"github.com/qoefi/api/internal/response"
)

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
	rows, err := h.svc.pool.Query(r.Context(), `SELECT u.id::text,u.username,u.name,u."logoUrl" FROM "BlockedUser" b JOIN "User" u ON u.id=b."creatorId" WHERE b."readerId"=$1 ORDER BY b.id DESC`, toUUID(userID))
	if err != nil {
		response.Internal(w)
		return
	}
	defer rows.Close()
	out := []socialUserDTO{}
	for rows.Next() {
		var id string
		var username, name, logo pgtype.Text
		if rows.Scan(&id, &username, &name, &logo) == nil {
			out = append(out, socialUserDTO{id, textPtrUser(username), textPtrUser(name), textPtrUser(logo)})
		}
	}
	response.OK(w, map[string]any{"users": out})
}
func (h *Handler) mutedUsers(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	if userID == "" {
		response.Unauthorized(w, "Authentification requise")
		return
	}
	rows, err := h.svc.pool.Query(r.Context(), `SELECT u.id::text,u.username,u.name,u."logoUrl" FROM "MutedUser" m JOIN "User" u ON u.id=m."mutedId" WHERE m."muterId"=$1 ORDER BY m.id DESC`, toUUID(userID))
	if err != nil {
		response.Internal(w)
		return
	}
	defer rows.Close()
	out := []socialUserDTO{}
	for rows.Next() {
		var id string
		var username, name, logo pgtype.Text
		if rows.Scan(&id, &username, &name, &logo) == nil {
			out = append(out, socialUserDTO{id, textPtrUser(username), textPtrUser(name), textPtrUser(logo)})
		}
	}
	response.OK(w, map[string]any{"users": out})
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
	target := chi.URLParam(r, "id")
	if target == userID {
		response.BadRequest(w, "Impossible de se bloquer soi-même")
		return
	}

	blocked, err := domainevents.ToggleBlock(r.Context(), poolFromPooler(h.svc.pool), userID, target)
	if err != nil {
		response.Internal(w)
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
	target := chi.URLParam(r, "id")
	if target == userID {
		response.BadRequest(w, "Impossible de se masquer soi-même")
		return
	}

	muted, err := domainevents.ToggleMute(r.Context(), poolFromPooler(h.svc.pool), userID, target)
	if err != nil {
		response.Internal(w)
		return
	}
	response.OK(w, map[string]bool{"muted": muted})
}
