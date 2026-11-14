package creator

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/qoefi/api/internal/antispam"
	db "github.com/qoefi/api/internal/database"
	"github.com/qoefi/api/internal/middleware"
	"github.com/qoefi/api/internal/permissions"
	"github.com/qoefi/api/internal/response"
	"github.com/qoefi/api/internal/secguard"
	"github.com/qoefi/api/internal/shared/identifier"
	"github.com/qoefi/api/internal/slug"
)

// category est la forme API d'une catégorie (parité Hono).
type category struct {
	ID            string  `json:"id"`
	Name          string  `json:"name"`
	Slug          string  `json:"slug"`
	Description   *string `json:"description"`
	ParentID      *string `json:"parentId"`
	IsDefault     bool    `json:"isDefault"`
	ArticlesCount int32   `json:"articlesCount"`
}

func (h *Handler) categories(w http.ResponseWriter, r *http.Request) {
	pubID := r.URL.Query().Get("publisherId")
	if pubID == "" {
		pubID, _ = middleware.PublisherID(r.Context())
	}
	if pubID == "" {
		response.NotFound(w, "Publisher not found")
		return
	}

	// Garantit l'existence de la catégorie par défaut (« Non classé »)
	// même pour les publications créées après la migration.
	if _, err := h.q.EnsureDefaultCategory(r.Context(), pubID); err != nil {
		log.Printf("[creator] ensureDefaultCategory: %v", err)
	}

	rows, err := h.q.ListCategoriesByPublisher(r.Context(), pubID)
	if err != nil {
		log.Printf("[creator] categories: %v", err)
		response.Internal(w)
		return
	}

	out := make([]category, 0, len(rows))
	for _, row := range rows {
		desc := (*string)(nil)
		if row.Description.Valid {
			desc = &row.Description.String
		}
		parentID := (*string)(nil)
		if row.ParentId.Valid {
			parentID = &row.ParentId.String
		}
		out = append(out, category{
			ID:            row.ID,
			Name:          row.Name,
			Slug:          row.Slug,
			Description:   desc,
			ParentID:      parentID,
			IsDefault:     row.IsDefault,
			ArticlesCount: row.ArticlesCount,
		})
	}
	w.Header().Set("Cache-Control", "public, max-age=300, s-maxage=600, stale-while-revalidate=3600")
	response.OK(w, map[string]any{"data": out})
}

// authorizeCategories vérifie que l'utilisateur peut gérer les catégories de la publication.
func (h *Handler) authorizeCategories(ctx context.Context, userID, publisherID string) error {
	if p, ok := middleware.GetPrincipal(ctx); ok && p.Type == middleware.PrincipalTypePublisher {
		if p.PublisherID != nil && *p.PublisherID == publisherID {
			return nil
		}
	}
	if personal, err := h.q.GetUserPersonalPublisher(ctx, userID); err == nil && personal.String == publisherID {
		return nil
	}
	member, err := h.q.GetMediaMemberContext(ctx, db.GetMediaMemberContextParams{
		PublisherId: publisherID, UserId: toUUID(userID),
	})
	if err != nil {
		return errForbidden
	}
	if !permissions.CanMedia(&permissions.MediaMember{
		Role: member.Role, Permissions: member.Permissions, Status: member.Status,
	}, permissions.PermManageCategories) {
		return errForbidden
	}
	return nil
}

// categoryInput est la charge utile de création/édition d'une catégorie.
type categoryInput struct {
	PublisherID string  `json:"publisherId"`
	Name        string  `json:"name"`
	Slug        string  `json:"slug"`
	Description *string `json:"description"`
	ParentID    *string `json:"parentId"`
}

func (h *Handler) createCategory(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	var in categoryInput
	if !response.DecodeJSON(w, r, &in) {
		return
	}
	if in.PublisherID == "" || strings.TrimSpace(in.Name) == "" {
		response.BadRequest(w, "publisherId et name requis")
		return
	}
	cleanName, err := antispam.SanitizeAndValidateText(in.Name, 1, 80, antispam.TextOptions{
		AllowNewlines: false,
		CheckXSS:      true,
	})
	if err != nil {
		if !secguard.WriteRejection(w, err) {
			response.BadRequest(w, err.Error())
		}
		return
	}
	in.Name = cleanName
	if in.Slug != "" {
		cleanSlug, err := antispam.SanitizeAndValidateText(in.Slug, 1, 80, antispam.TextOptions{
			AllowNewlines: false,
			CheckXSS:      true,
		})
		if err != nil {
			if !secguard.WriteRejection(w, err) {
				response.BadRequest(w, err.Error())
			}
			return
		}
		in.Slug = cleanSlug
	}
	if in.Description != nil {
		cleanDesc, err := antispam.SanitizeAndValidateText(*in.Description, 0, 500, antispam.TextOptions{
			AllowNewlines: true,
			CheckXSS:      true,
		})
		if err != nil {
			if !secguard.WriteRejection(w, err) {
				response.BadRequest(w, err.Error())
			}
			return
		}
		in.Description = &cleanDesc
	}
	if err := h.authorizeCategories(r.Context(), userID, in.PublisherID); err != nil {
		response.Forbidden(w, "Accès refusé à cette publication.")
		return
	}

	finalSlug := slug.Slugify(in.Slug)
	if finalSlug == "" {
		finalSlug = slug.Slugify(in.Name)
	}
	if finalSlug == "" {
		finalSlug = "cat-" + slug.ShortID(8)
	}
	if identifier.IsReservedTenantRoute(finalSlug) {
		response.BadRequest(w, fmt.Sprintf("Le slug %q est réservé par une page du site. Choisissez un autre nom.", finalSlug))
		return
	}
	exists, err := h.q.CheckCategorySlugExists(r.Context(), db.CheckCategorySlugExistsParams{
		PublisherId: in.PublisherID, Slug: finalSlug, ID: "",
	})
	if err == nil && exists {
		response.BadRequest(w, fmt.Sprintf("Le slug %q est déjà utilisé par une autre de vos catégories.", finalSlug))
		return
	}

	var parentID pgtype.Text
	if in.ParentID != nil && *in.ParentID != "" {
		parent, err := h.q.GetCategoryByID(r.Context(), *in.ParentID)
		if err != nil {
			response.BadRequest(w, "Catégorie parente introuvable.")
			return
		}
		if parent.PublisherId != in.PublisherID {
			response.BadRequest(w, "La catégorie parente n'appartient pas à cette publication.")
			return
		}
		if parent.ParentId.Valid && parent.ParentId.String != "" {
			response.BadRequest(w, "Une sous-catégorie ne peut pas avoir de sous-catégorie (limite de 2 niveaux).")
			return
		}
		parentID = textVal(in.ParentID)
	}

	row, err := h.q.CreateCategory(r.Context(), db.CreateCategoryParams{
		Name:        in.Name,
		Slug:        finalSlug,
		Description: textVal(in.Description),
		PublisherId: in.PublisherID,
		ParentId:    parentID,
	})
	if err != nil {
		log.Printf("[creator] createCategory: %v", err)
		response.Internal(w)
		return
	}
	response.Created(w, row)
}

func (h *Handler) updateCategory(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	id := chi.URLParam(r, "id")
	var in categoryInput
	if !response.DecodeJSON(w, r, &in) {
		return
	}

	existing, err := h.q.GetCategoryByID(r.Context(), id)
	if err != nil {
		response.NotFound(w, "Catégorie introuvable.")
		return
	}
	if err := h.authorizeCategories(r.Context(), userID, existing.PublisherId); err != nil {
		response.Forbidden(w, "Vous n'êtes pas autorisé à modifier cette catégorie.")
		return
	}
	if existing.IsDefault {
		response.BadRequest(w, "La catégorie par défaut « Non classé » ne peut pas être modifiée.")
		return
	}

	if strings.TrimSpace(in.Name) == "" {
		in.Name = existing.Name
	} else {
		cleanName, err := antispam.SanitizeAndValidateText(in.Name, 1, 80, antispam.TextOptions{
			AllowNewlines: false,
			CheckXSS:      true,
		})
		if err != nil {
			if !secguard.WriteRejection(w, err) {
				response.BadRequest(w, err.Error())
			}
			return
		}
		in.Name = cleanName
	}
	if in.Slug != "" {
		cleanSlug, err := antispam.SanitizeAndValidateText(in.Slug, 1, 80, antispam.TextOptions{
			AllowNewlines: false,
			CheckXSS:      true,
		})
		if err != nil {
			if !secguard.WriteRejection(w, err) {
				response.BadRequest(w, err.Error())
			}
			return
		}
		in.Slug = cleanSlug
	}
	if in.Description != nil {
		cleanDesc, err := antispam.SanitizeAndValidateText(*in.Description, 0, 500, antispam.TextOptions{
			AllowNewlines: true,
			CheckXSS:      true,
		})
		if err != nil {
			if !secguard.WriteRejection(w, err) {
				response.BadRequest(w, err.Error())
			}
			return
		}
		in.Description = &cleanDesc
	}

	finalSlug := slug.Slugify(in.Slug)
	if finalSlug == "" {
		finalSlug = slug.Slugify(in.Name)
	}
	if finalSlug == "" {
		finalSlug = existing.Slug
	}
	// Un slug historique déjà réservé reste éditable (grandfathering) ; seul
	// un changement vers un slug réservé est refusé.
	if finalSlug != existing.Slug && identifier.IsReservedTenantRoute(finalSlug) {
		response.BadRequest(w, fmt.Sprintf("Le slug %q est réservé par une page du site. Choisissez un autre nom.", finalSlug))
		return
	}
	exists, err := h.q.CheckCategorySlugExists(r.Context(), db.CheckCategorySlugExistsParams{
		PublisherId: existing.PublisherId, Slug: finalSlug, ID: id,
	})
	if err == nil && exists {
		response.BadRequest(w, fmt.Sprintf("Le slug %q est déjà utilisé par une autre de vos catégories.", finalSlug))
		return
	}

	parentID := existing.ParentId
	if in.ParentID != nil {
		if *in.ParentID == "" {
			parentID = pgtype.Text{Valid: false}
		} else {
			if *in.ParentID == id {
				response.BadRequest(w, "Une catégorie ne peut pas être sa propre parente.")
				return
			}
			parent, err := h.q.GetCategoryByID(r.Context(), *in.ParentID)
			if err != nil {
				response.BadRequest(w, "Catégorie parente introuvable.")
				return
			}
			if parent.PublisherId != existing.PublisherId {
				response.BadRequest(w, "La catégorie parente n'appartient pas à cette publication.")
				return
			}
			if parent.ParentId.Valid && parent.ParentId.String != "" {
				response.BadRequest(w, "Une sous-catégorie ne peut pas avoir de sous-catégorie (limite de 2 niveaux).")
				return
			}
			// Empêcher de convertir une catégorie mère contenant des sous-catégories en sous-catégorie
			siblings, err := h.q.ListCategoriesByPublisher(r.Context(), existing.PublisherId)
			if err == nil {
				for _, sib := range siblings {
					if sib.ParentId.Valid && sib.ParentId.String == id {
						response.BadRequest(w, "Cette catégorie contient déjà des sous-catégories et ne peut pas devenir une sous-catégorie.")
						return
					}
				}
			}
			parentID = textVal(in.ParentID)
		}
	}

	desc := textVal(in.Description)
	if in.Description == nil && existing.Description.Valid {
		desc = existing.Description
	}

	if err := h.q.UpdateCategory(r.Context(), db.UpdateCategoryParams{
		ID:          id,
		Name:        in.Name,
		Slug:        finalSlug,
		Description: desc,
		ParentId:    parentID,
	}); err != nil {
		log.Printf("[creator] updateCategory: %v", err)
		response.Internal(w)
		return
	}
	row, err := h.q.GetCategoryByID(r.Context(), id)
	if err != nil {
		response.OK(w, map[string]bool{"success": true})
		return
	}
	response.OK(w, row)
}

func (h *Handler) deleteCategory(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	id := chi.URLParam(r, "id")

	existing, err := h.q.GetCategoryByID(r.Context(), id)
	if err != nil {
		response.NotFound(w, "Catégorie introuvable.")
		return
	}
	if err := h.authorizeCategories(r.Context(), userID, existing.PublisherId); err != nil {
		response.Forbidden(w, "Vous n'êtes pas autorisé à supprimer cette catégorie.")
		return
	}
	if existing.IsDefault {
		response.BadRequest(w, "La catégorie par défaut « Non classé » ne peut pas être supprimée.")
		return
	}
	if err := h.q.DeleteCategory(r.Context(), id); err != nil {
		log.Printf("[creator] deleteCategory: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, map[string]bool{"success": true})
}
