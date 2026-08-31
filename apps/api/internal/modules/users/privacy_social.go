package users

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
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
	var exists bool
	err := h.svc.pool.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM "BlockedUser" WHERE "creatorId"=$1 AND "readerId"=$2)`, toUUID(target), toUUID(userID)).Scan(&exists)
	if err != nil {
		response.Internal(w)
		return
	}
	if exists {
		_, err = h.svc.pool.Exec(r.Context(), `DELETE FROM "BlockedUser" WHERE "creatorId"=$1 AND "readerId"=$2`, toUUID(target), toUUID(userID))
	} else {
		_, err = h.svc.pool.Exec(r.Context(), `INSERT INTO "BlockedUser" (id,"creatorId","readerId") VALUES (gen_random_uuid()::text,$1,$2) ON CONFLICT DO NOTHING`, toUUID(target), toUUID(userID))
	}
	if err != nil {
		response.Internal(w)
		return
	}
	response.OK(w, map[string]bool{"blocked": !exists})
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
	var exists bool
	err := h.svc.pool.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM "MutedUser" WHERE "muterId"=$1 AND "mutedId"=$2)`, toUUID(userID), toUUID(target)).Scan(&exists)
	if err != nil {
		response.Internal(w)
		return
	}
	if exists {
		_, err = h.svc.pool.Exec(r.Context(), `DELETE FROM "MutedUser" WHERE "muterId"=$1 AND "mutedId"=$2`, toUUID(userID), toUUID(target))
	} else {
		_, err = h.svc.pool.Exec(r.Context(), `INSERT INTO "MutedUser" (id,"muterId","mutedId") VALUES (gen_random_uuid()::text,$1,$2) ON CONFLICT DO NOTHING`, toUUID(userID), toUUID(target))
	}
	if err != nil {
		response.Internal(w)
		return
	}
	response.OK(w, map[string]bool{"muted": !exists})
}
