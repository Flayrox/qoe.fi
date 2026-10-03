package settings

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/qoefi/api/internal/middleware"
	"github.com/qoefi/api/internal/response"
)

// SiteVersion est un instantané publié d'une mise en page (restauration).
type SiteVersion struct {
	ID            string `json:"id"`
	PublicationID string `json:"publicationId"`
	Layout        string `json:"layout"`
	Label         string `json:"label"`
	CreatedBy     *string `json:"createdBy"`
	CreatedAt     string `json:"createdAt"`
}

// SiteDraft est le brouillon courant du Studio (vide = rien à publier).
type SiteDraft struct {
	Layout    *string `json:"layout"`
	UpdatedAt *string `json:"updatedAt"`
}

// GetSiteDraft retourne le brouillon (nil si aucun).
func (s *Service) GetSiteDraft(ctx context.Context, userID, publicationID string) (*SiteDraft, error) {
	if err := s.authorizeSettings(ctx, userID, publicationID); err != nil {
		return nil, err
	}
	var layout *string
	var updatedAt *time.Time
	err := s.pool.QueryRow(ctx,
		`SELECT "draft", "updatedAt" FROM "SiteLayout" WHERE "publicationId" = $1`,
		publicationID,
	).Scan(&layout, &updatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return &SiteDraft{}, nil
		}
		return nil, err
	}
	out := &SiteDraft{Layout: layout}
	if updatedAt != nil {
		formatted := updatedAt.Format(time.RFC3339)
		out.UpdatedAt = &formatted
	}
	return out, nil
}

// SaveSiteDraft enregistre le brouillon (ne touche pas au site public).
// Le layout doit être un JSON valide non vide (< 512 Ko).
func (s *Service) SaveSiteDraft(ctx context.Context, userID, publicationID, layout string) error {
	if err := s.authorizeSettings(ctx, userID, publicationID); err != nil {
		return err
	}
	if len(layout) == 0 || len(layout) > 512*1024 {
		return errors.New("mise en page invalide")
	}
	var raw json.RawMessage
	if err := json.Unmarshal([]byte(layout), &raw); err != nil {
		return errors.New("mise en page invalide")
	}
	_, err := s.pool.Exec(ctx, `
		INSERT INTO "SiteLayout" ("publicationId", "draft", "updatedAt")
		VALUES ($1, $2, CURRENT_TIMESTAMP)
		ON CONFLICT ("publicationId") DO UPDATE
		SET "draft" = EXCLUDED."draft", "updatedAt" = CURRENT_TIMESTAMP`,
		publicationID, layout,
	)
	return err
}

// PublishSiteLayout publie le brouillon : archive la version publiée
// actuelle puis copie le brouillon vers Publication.layoutStyle.
func (s *Service) PublishSiteLayout(ctx context.Context, userID, publicationID string) error {
	if err := s.authorizeSettings(ctx, userID, publicationID); err != nil {
		return err
	}
	var draft *string
	err := s.pool.QueryRow(ctx,
		`SELECT "draft" FROM "SiteLayout" WHERE "publicationId" = $1`,
		publicationID,
	).Scan(&draft)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return errors.New("aucun brouillon à publier")
		}
		return err
	}
	if draft == nil || *draft == "" {
		return errors.New("aucun brouillon à publier")
	}
	var current *string
	err = s.pool.QueryRow(ctx,
		`SELECT "layoutStyle" FROM "Publication" WHERE "id" = $1`,
		publicationID,
	).Scan(&current)
	if err != nil {
		return err
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if current != nil && *current != "" && *current != *draft {
		if _, err := tx.Exec(ctx, `
			INSERT INTO "SiteVersion" ("id", "publicationId", "layout", "label", "createdBy")
			VALUES ('ver_' || extract(epoch from now())::bigint || '_' || substr(md5(random()::text), 1, 6), $1, $2, 'Avant publication', $3)`,
			publicationID, *current, userID,
		); err != nil {
			return err
		}
	}
	if _, err := tx.Exec(ctx,
		`UPDATE "Publication" SET "layoutStyle" = $1, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $2`,
		*draft, publicationID,
	); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx,
		`DELETE FROM "SiteLayout" WHERE "publicationId" = $1`,
		publicationID,
	); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// ListSiteVersions retourne les 20 derniers instantanés publiés.
func (s *Service) ListSiteVersions(ctx context.Context, userID, publicationID string) ([]SiteVersion, error) {
	if err := s.authorizeSettings(ctx, userID, publicationID); err != nil {
		return nil, err
	}
	rows, err := s.pool.Query(ctx, `
		SELECT "id", "publicationId", "layout", "label", "createdBy", "createdAt"
		FROM "SiteVersion" WHERE "publicationId" = $1
		ORDER BY "createdAt" DESC LIMIT 20`,
		publicationID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []SiteVersion{}
	for rows.Next() {
		var v SiteVersion
		var createdAt time.Time
		if err := rows.Scan(&v.ID, &v.PublicationID, &v.Layout, &v.Label, &v.CreatedBy, &createdAt); err != nil {
			return nil, err
		}
		v.CreatedAt = createdAt.Format(time.RFC3339)
		out = append(out, v)
	}
	return out, rows.Err()
}

// RestoreSiteVersion recopie un instantané vers le brouillon (sans publier).
func (s *Service) RestoreSiteVersion(ctx context.Context, userID, publicationID, versionID string) error {
	if err := s.authorizeSettings(ctx, userID, publicationID); err != nil {
		return err
	}
	var layout string
	err := s.pool.QueryRow(ctx,
		`SELECT "layout" FROM "SiteVersion" WHERE "id" = $1 AND "publicationId" = $2`,
		versionID, publicationID,
	).Scan(&layout)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return errNotFound
		}
		return err
	}
	return s.SaveSiteDraft(ctx, userID, publicationID, layout)
}

// ─── Routes ───────────────────────────────────────────────────────────

func (h *Handler) getSiteDraft(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	if userID == "" {
		response.Unauthorized(w, "Authentification requise")
		return
	}
	publicationID := r.URL.Query().Get("publicationId")
	if publicationID == "" {
		response.BadRequest(w, "publicationId requis")
		return
	}
	draft, err := h.svc.GetSiteDraft(r.Context(), userID, publicationID)
	if err != nil {
		if errors.Is(err, errForbidden) {
			response.Forbidden(w, "Accès refusé à cette publication.")
			return
		}
		response.Internal(w)
		return
	}
	response.OK(w, draft)
}

func (h *Handler) saveSiteDraft(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	if userID == "" {
		response.Unauthorized(w, "Authentification requise")
		return
	}
	var body struct {
		PublicationID string `json:"publicationId"`
		Layout        string `json:"layout"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	if body.PublicationID == "" {
		response.BadRequest(w, "publicationId requis")
		return
	}
	if err := h.svc.SaveSiteDraft(r.Context(), userID, body.PublicationID, body.Layout); err != nil {
		if errors.Is(err, errForbidden) {
			response.Forbidden(w, "Accès refusé à cette publication.")
			return
		}
		response.BadRequest(w, err.Error())
		return
	}
	response.OK(w, map[string]any{"saved": true})
}

func (h *Handler) publishSiteLayout(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	if userID == "" {
		response.Unauthorized(w, "Authentification requise")
		return
	}
	var body struct {
		PublicationID string `json:"publicationId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	if body.PublicationID == "" {
		response.BadRequest(w, "publicationId requis")
		return
	}
	if err := h.svc.PublishSiteLayout(r.Context(), userID, body.PublicationID); err != nil {
		if errors.Is(err, errForbidden) {
			response.Forbidden(w, "Accès refusé à cette publication.")
			return
		}
		response.BadRequest(w, err.Error())
		return
	}
	response.OK(w, map[string]any{"published": true})
}

func (h *Handler) listSiteVersions(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	if userID == "" {
		response.Unauthorized(w, "Authentification requise")
		return
	}
	publicationID := r.URL.Query().Get("publicationId")
	if publicationID == "" {
		response.BadRequest(w, "publicationId requis")
		return
	}
	versions, err := h.svc.ListSiteVersions(r.Context(), userID, publicationID)
	if err != nil {
		if errors.Is(err, errForbidden) {
			response.Forbidden(w, "Accès refusé à cette publication.")
			return
		}
		response.Internal(w)
		return
	}
	response.OK(w, map[string]any{"versions": versions})
}

func (h *Handler) restoreSiteVersion(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	if userID == "" {
		response.Unauthorized(w, "Authentification requise")
		return
	}
	var body struct {
		PublicationID string `json:"publicationId"`
		VersionID     string `json:"versionId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	if body.PublicationID == "" || body.VersionID == "" {
		response.BadRequest(w, "publicationId et versionId requis")
		return
	}
	if err := h.svc.RestoreSiteVersion(r.Context(), userID, body.PublicationID, body.VersionID); err != nil {
		if errors.Is(err, errForbidden) {
			response.Forbidden(w, "Accès refusé à cette publication.")
			return
		}
		if errors.Is(err, errNotFound) {
			response.BadRequest(w, "Version introuvable")
			return
		}
		response.Internal(w)
		return
	}
	response.OK(w, map[string]any{"restored": true})
}

func registerSiteLayoutRoutes(r chi.Router, h *Handler) {
	r.Get("/site-layout", h.getSiteDraft)
	r.Patch("/site-layout", h.saveSiteDraft)
	r.Post("/site-layout/publish", h.publishSiteLayout)
	r.Get("/site-layout/versions", h.listSiteVersions)
	r.Post("/site-layout/restore", h.restoreSiteVersion)
}
