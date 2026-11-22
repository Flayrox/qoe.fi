package creator

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/qoefi/api/internal/middleware"
	"github.com/qoefi/api/internal/response"
	"github.com/qoefi/api/internal/shortcode"
	pkgslug "github.com/qoefi/api/internal/slug"
)

// uniqueArticleSlug garantit un slug libre (suffixe -2, -3… sinon hash court).
// Une erreur de base n'est jamais interprétée comme « slug libre » : elle est
// remontée pour que l'appelant réponde 500 au lieu d'écrire un doublon.
func (h *Handler) uniqueArticleSlug(ctx context.Context, base string) (string, error) {
	if base == "" {
		base = "article"
	}
	candidate := base
	for i := 2; ; i++ {
		var exists bool
		if err := h.pool.QueryRow(ctx,
			`SELECT EXISTS(
			   SELECT 1 FROM "Article" WHERE slug = $1
			   UNION ALL SELECT 1 FROM "ArticleSlug" WHERE slug = $1
			   UNION ALL SELECT 1 FROM "ArticleSlugHistory" WHERE slug = $1
		 )`, candidate,
		).Scan(&exists); err != nil {
			return "", err
		} else if !exists {
			return candidate, nil
		}
		candidate = base + "-" + strconv.Itoa(i)
		if code := pkgslug.ExtractTrailingShortCode(base); code != "" {
			// Garder le code court en dernier jeton (résolution par /l/{code}).
			candidate = strings.TrimSuffix(base, "-"+code) + "-" + strconv.Itoa(i) + "-" + code
		}
	}
}

func (h *Handler) uniqueShortCode(ctx context.Context) string {
	return shortcode.Generate(ctx, h.pool)
}

// readingTimeFromHTML estime le temps de lecture (~200 mots/min).
func readingTimeFromHTML(html string) int32 {
	text := stripHTMLTags(html, 1<<20)
	words := len(strings.Fields(text))
	if words == 0 {
		return 1
	}
	rt := int32((words + 199) / 200)
	if rt < 1 {
		rt = 1
	}
	return rt
}

// effectiveSlug renvoie le variant personnel de l'auteur s'il existe,
// sinon le slug principal de l'article.
func (h *Handler) effectiveSlug(ctx context.Context, articleID, userID, baseSlug string) string {
	var s string
	err := h.pool.QueryRow(ctx,
		`SELECT slug FROM "ArticleSlug" WHERE "articleId" = $1 AND "ownerUserId"::text = $2`,
		articleID, userID).Scan(&s)
	if err != nil || s == "" {
		return baseSlug
	}
	return s
}

// authorSlugs retourne le slug effectif de CHAQUE auteur de l'article :
// principal + co-auteurs — pour que le front puisse ouvrir la version de
// l'autre dans un nouvel onglet.
func (h *Handler) authorSlugs(ctx context.Context, articleID, baseSlug, mainAuthorID string) map[string]string {
	out := map[string]string{mainAuthorID: baseSlug}
	rows, err := h.pool.Query(ctx, `
		SELECT u.id::text,
		       COALESCE(s.slug, $2) AS effective
		FROM "User" u
		JOIN "_CoAuthors" c ON c."B" = u.id AND c."A" = $1
		LEFT JOIN "ArticleSlug" s ON s."articleId" = $1 AND s."ownerUserId" = u.id`, articleID, baseSlug)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var uid, eff string
		if err := rows.Scan(&uid, &eff); err == nil {
			out[uid] = eff
		}
	}
	return out
}

// PATCH /v1/creator/articles/{id}/slug — définit (ou réinitialise) le
// variant de slug de l'appelant pour cet article.
type apiSlugInput struct {
	Slug string `json:"slug"` // vide → revient au slug principal
}

func (h *Handler) apiArticleSlugSet(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	publisherID, _ := middleware.PublisherID(r.Context())
	userID, _ := middleware.UserID(r.Context())

	if !h.creatorOwnsArticle(r.Context(), id, publisherID, userID) {
		response.NotFound(w, "Article introuvable")
		return
	}

	var in apiSlugInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	want := slugify(strings.ToLower(strings.TrimSpace(in.Slug)))
	if want != "" {
		if len(want) < 3 || len(want) > 80 {
			response.BadRequest(w, "Slug doit faire entre 3 et 80 caractères")
			return
		}
		if !slugValidRe.MatchString(want) {
			response.BadRequest(w, "Slug invalide (lettres, chiffres, tirets uniquement)")
			return
		}
		// Slugs réservés
		reserved := map[string]bool{"admin": true, "api": true, "login": true, "_next": true, "oauth": true, "settings": true, "article": true}
		if reserved[want] {
			response.BadRequest(w, "Slug réservé")
			return
		}
	}

	// Le slug principal de l'article = revenir au défaut.
	var baseSlug string
	if err := h.pool.QueryRow(r.Context(),
		`SELECT slug FROM "Article" WHERE id = $1`, id).Scan(&baseSlug); err != nil {
		response.NotFound(w, "Article introuvable")
		return
	}
	if want == "" || want == baseSlug {
		if _, err := h.pool.Exec(r.Context(),
			`DELETE FROM "ArticleSlug" WHERE "articleId" = $1 AND "ownerUserId"::text = $2`,
			id, userID); err != nil {
			log.Printf("[creator] reset article slug: %v", err)
			response.Internal(w)
			return
		}
		response.OK(w, map[string]string{"slug": baseSlug})
		return
	}

	// Sauvegarde l'ancien variant pour redirection 301 avant écrasement.
	var oldSlug string
	if err := h.pool.QueryRow(r.Context(),
		`SELECT slug FROM "ArticleSlug" WHERE "articleId" = $1 AND "ownerUserId"::text = $2`,
		id, userID).Scan(&oldSlug); err != nil && !errors.Is(err, pgx.ErrNoRows) {
		log.Printf("[creator] read article slug: %v", err)
		response.Internal(w)
		return
	}
	// Unicité globale avec auto-suffixe (-1, -2…) si déjà pris (inclut historique).
	candidate := want
	for n := 1; ; n++ {
		var taken bool
		if err := h.pool.QueryRow(r.Context(),
			`SELECT EXISTS(
			   SELECT 1 FROM "Article" WHERE slug = $1
			   UNION ALL
			   SELECT 1 FROM "ArticleSlug" WHERE slug = $1
			     AND NOT ("articleId" = $2 AND "ownerUserId"::text = $3)
			   UNION ALL
			   SELECT 1 FROM "ArticleSlugHistory" WHERE slug = $1
			 )`, candidate, id, userID).Scan(&taken); err != nil {
			response.Internal(w)
			return
		}
		if !taken {
			break
		}
		candidate = want + "-" + strconv.Itoa(n)
	}
	want = candidate
	if oldSlug != "" && oldSlug != want {
		if _, err := h.pool.Exec(r.Context(),
			`INSERT INTO "ArticleSlugHistory" (id, "articleId", slug) VALUES (gen_random_uuid()::text, $1, $2) ON CONFLICT (slug) DO NOTHING`,
			id, oldSlug); err != nil {
			log.Printf("[creator] article slug history: %v", err)
			response.Internal(w)
			return
		}
	}

	if _, err := h.pool.Exec(r.Context(), `
		INSERT INTO "ArticleSlug" (id, "articleId", "ownerUserId", slug, "createdAt", "updatedAt")
		VALUES (gen_random_uuid()::text, $1, $2::uuid, $3, now(), now())
		ON CONFLICT ("articleId", "ownerUserId")
		DO UPDATE SET slug = EXCLUDED.slug, "updatedAt" = now()`,
		id, userID, want); err != nil {
		log.Printf("[creator] write article slug: %v", err)
		response.Internal(w)
		return
	}

	response.OK(w, map[string]string{"slug": want})
}
