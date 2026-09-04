package creator

import (
	"context"
	"errors"
	"log"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/qoefi/api/internal/canon"
	"github.com/qoefi/api/internal/middleware"
	"github.com/qoefi/api/internal/response"
)

// =====================================================================
// 📦 Export groupé d'un article : l'article ET ses annotations dans le
// même payload, ancrées par offsets dans le document canonique inclus.
// Le front du créateur peint les marques avec son propre code — zéro
// re-fetch, zéro recherche. `text + quoteOrdinal` restent servis
// (dépréciés mais non cassants) ; les champs d'ancre sont additifs.
// =====================================================================

// apiExportAnnotation est UNE annotation ancrée dans l'article exporté.
// AnchorStatus : exact (offsets stockés, empreinte conforme), recomputed
// (offsets re-résolus à la lecture contre le document inclus) ou missing
// (passage absent du contenu actuel → repli sur text + quoteOrdinal).
type apiExportAnnotation struct {
	ID             string   `json:"id"`
	Text           string   `json:"text"`
	Note           *string  `json:"note,omitempty"`
	IsPublic       bool     `json:"isPublic"`
	IsOfficial     bool     `json:"isOfficial"`
	QuoteOrdinal   int      `json:"quoteOrdinal"` // déprécié, conservé
	CreatedAt      string   `json:"createdAt"`
	Upvotes        int64    `json:"upvotesCount"`
	Comments       int64    `json:"commentsCount"`
	Reader         apiActor `json:"reader"`
	CanonicalStart *int     `json:"canonicalStart,omitempty"` // code points dans document.text
	CanonicalEnd   *int     `json:"canonicalEnd,omitempty"`
	ContentSha     string   `json:"contentSha,omitempty"` // empreinte du doc référencé par l'ancre
	AnchorStatus   string   `json:"anchorStatus"`         // exact | recomputed | missing
	ContextBefore  string   `json:"contextBefore,omitempty"`
	ContextAfter   string   `json:"contextAfter,omitempty"`
}

type apiAnnotationsExport struct {
	Article     *apiArticleFull       `json:"article"`  // contentHtml + contentMarkdown (contrat actuel)
	Document    *canon.Document       `json:"document"` // base des offsets : blocs, segments, text, sha
	Annotations []apiExportAnnotation `json:"annotations"`
}

// annotationCtx est une ligne brute issue de la base.
type annotationRow struct {
	id, text             string
	note                 *string
	isPublic, isOfficial bool
	quoteOrdinal         int
	createdAt            time.Time
	upvotes, comments    int64
	reader               apiActor
	start, end           pgtype.Int4
	sha                  pgtype.Text
}

// GET /v1/creator/articles/{slug}/annotations — export groupé (scope READ).
// Article lié au créateur (publication de la clé, signature, co-écriture),
// slug principal ou variante personnelle accepté.
func (h *Handler) apiArticleAnnotations(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	publicationID, _ := middleware.PublicationID(r.Context())
	userID, _ := middleware.UserID(r.Context())

	full, err := h.loadCreatorArticleFull(r.Context(), publicationID, userID, slug)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			response.NotFound(w, "Article introuvable")
			return
		}
		log.Printf("[creator] annotations: article %s: %v", slug, err)
		response.Internal(w)
		return
	}

	// Document canonique du contenu ACTUEL : les offsets servis référencent
	// exactement ce document (le front peint sans re-fetch).
	doc := canon.Parse(full.ContentHTML)

	rows, err := h.annotationRows(r.Context(), full.ID)
	if err != nil {
		log.Printf("[creator] annotations: highlights %s: %v", slug, err)
		response.Internal(w)
		return
	}

	items := make([]apiExportAnnotation, 0, len(rows))
	for _, row := range rows {
		items = append(items, buildExportAnnotation(doc, row))
	}

	response.OK(w, apiAnnotationsExport{
		Article:     full,
		Document:    doc,
		Annotations: items,
	})
}

// annotationRows charge les annotations de l'article exportables au créateur :
// publiques (lecteurs) + officielles (annotations éditoriales de l'auteur).
// Les surlignages privés des lecteurs ne sortent JAMAIS.
func (h *Handler) annotationRows(ctx context.Context, articleID string) ([]annotationRow, error) {
	out := []annotationRow{}
	rows, err := h.pool.Query(ctx, `
		SELECT h.id::text, h.text, h.note, h."isPublic", h."isOfficial", h."quoteOrdinal",
		       h."canonicalStart", h."canonicalEnd", h."contentSha", h."createdAt",
		       h."upvotesCount",
		       (SELECT COUNT(*) FROM "AnnotationComment" c WHERE c."highlightId" = h.id) AS comments,
		       u.id::text, u.username, u.name, u."logoUrl"
		FROM "Highlight" h
		JOIN "User" u ON u.id = h."readerId"
		WHERE h."articleId" = $1
		  AND (h."isPublic" = true OR h."isOfficial" = true)
		ORDER BY h."canonicalStart" ASC NULLS LAST, h."createdAt" ASC`, articleID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var it annotationRow
		var username, name, logo *string
		if err := rows.Scan(
			&it.id, &it.text, &it.note, &it.isPublic, &it.isOfficial, &it.quoteOrdinal,
			&it.start, &it.end, &it.sha, &it.createdAt,
			&it.upvotes, &it.comments,
			&it.reader.ID, &username, &name, &logo,
		); err != nil {
			log.Printf("[creator] annotations: scan: %v", err)
			continue
		}
		it.reader.Username = username
		it.reader.Name = name
		it.reader.LogoURL = logo
		out = append(out, it)
	}
	return out, rows.Err()
}

// buildExportAnnotation aligne une ligne sur le document inclus :
//   - empreinte stockée == empreinte du document → offsets exacts ;
//   - sinon re-résolution tolérante (Find, repli type Hypothesis) ;
//   - sinon pas d'offsets : text + quoteOrdinal restent le repli (chip).
//
// Le contexte avant/après (fenêtre du texte canonique) est toujours dérivé
// du document inclus — stable pour un tiers qui ré-ancrerait dans son rendu.
func buildExportAnnotation(doc *canon.Document, row annotationRow) apiExportAnnotation {
	it := apiExportAnnotation{
		ID:           row.id,
		Text:         row.text,
		Note:         row.note,
		IsPublic:     row.isPublic,
		IsOfficial:   row.isOfficial,
		QuoteOrdinal: row.quoteOrdinal,
		CreatedAt:    row.createdAt.Format("2006-01-02T15:04:05Z07:00"),
		Upvotes:      row.upvotes,
		Comments:     row.comments,
		Reader:       row.reader,
		AnchorStatus: "missing",
	}

	start, end := -1, -1
	switch {
	case row.start.Valid && row.end.Valid && row.sha.Valid && row.sha.String == doc.Sha:
		start, end = int(row.start.Int32), int(row.end.Int32)
		it.AnchorStatus = "exact"
		it.ContentSha = doc.Sha
	default:
		// Offsets absents ou périmés (contenu ré-édité) → re-résolution
		// tolérante contre le document actuel, en mémoire (GET sans écriture).
		if s, e, ok := doc.Find(row.text, row.quoteOrdinal); ok {
			start, end = s, e
			it.AnchorStatus = "recomputed"
			it.ContentSha = doc.Sha
		}
	}
	if start < 0 || end <= start {
		return it // missing : le front retombe sur text + quoteOrdinal (chip)
	}
	cs, ce := start, end
	it.CanonicalStart = &cs
	it.CanonicalEnd = &ce

	it.ContextBefore = canon.ContextWindow(doc.Text, start, -1)
	it.ContextAfter = canon.ContextWindow(doc.Text, end, +1)
	return it
}
