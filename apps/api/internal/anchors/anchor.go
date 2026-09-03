// Package anchors — ré-ancrage des surlignages après édition du contenu.
//
// Quand le HTML d'un article change, les offsets canoniques stockés peuvent
// devenir invalides. Ce package détecte le changement via l'empreinte
// contentSha et re-résout les surlignages du nouvel article : recherche du
// passage cité (text + quoteOrdinal) dans le document canonique du NOUVEAU
// contenu, mise à jour des offsets en une passe.
//
// Le repli texte + contexte (type Hypothesis) est prévu pour les remaniements
// lourds : tant qu'il n'est pas implémenté, un passage introuvable garde ses
// anciennes ancres (invalidées par le sha) et reste servi en back-compat via
// text + quoteOrdinal — jamais perdu, jamais mal pointé.
package anchors

import (
	"context"
	"log"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/qoefi/api/internal/canon"
)

// Pool est le sous-ensemble de pgxpool.Pool utilisé par ce package (permet
// d'injecter un pool réel ou un faux dans les tests).
type Pool interface {
	Exec(ctx context.Context, sql string, arguments ...any) (pgconn.CommandTag, error)
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

// Resolve canonicalise le HTML d'un article et localise le passage cité.
// Retourne les offsets en code points + l'empreinte du contenu. ok=false si
// le passage n'est pas (ou plus) présent dans le contenu.
func Resolve(articleHTML, text string, ordinal int) (start, end int32, sha string, ok bool) {
	doc := canon.Parse(articleHTML)
	s, e, found := doc.Find(text, ordinal)
	if !found {
		return 0, 0, "", false
	}
	return int32(s), int32(e), doc.Sha, true
}

// ReanchorArticle re-synchronise les ancres de tous les surlignages d'un
// article après une édition : met à jour Article.contentSha puis re-résout
// les surlignages dont l'empreinte ne correspond plus (ou jamais résolus).
// Jamais bloquant pour le flux appelant : échec → log, pas d'erreur.
func ReanchorArticle(ctx context.Context, pool Pool, articleID string) {
	var html string
	err := pool.QueryRow(ctx,
		`SELECT COALESCE("content",'') FROM "Article" WHERE id = $1`, articleID).Scan(&html)
	if err != nil || strings.TrimSpace(html) == "" {
		return // article inexistant ou vide : rien à ré-ancrer
	}

	doc := canon.Parse(html)
	if _, err := pool.Exec(ctx,
		`UPDATE "Article" SET "contentSha" = $2, "updatedAt" = now() WHERE id = $1`,
		articleID, doc.Sha); err != nil {
		log.Printf("[anchors] contentSha: %v", err)
		return
	}

	rows, err := pool.Query(ctx, `
		SELECT id, text, "quoteOrdinal"
		FROM "Highlight"
		WHERE "articleId" = $1
		  AND ("contentSha" IS DISTINCT FROM $2 OR "canonicalStart" IS NULL)
		ORDER BY "createdAt" ASC`, articleID, doc.Sha)
	if err != nil {
		log.Printf("[anchors] select: %v", err)
		return
	}
	defer rows.Close()

	type target struct {
		id      string
		text    string
		ordinal int
	}
	var stale []target
	for rows.Next() {
		var t target
		if err := rows.Scan(&t.id, &t.text, &t.ordinal); err != nil {
			log.Printf("[anchors] scan: %v", err)
			return
		}
		stale = append(stale, t)
	}
	if err := rows.Err(); err != nil {
		log.Printf("[anchors] rows: %v", err)
		return
	}
	for _, t := range stale {
		start, end, ok := doc.Find(t.text, t.ordinal)
		if !ok {
			// Passage introuvable après remaniement : on laisse les anciennes
			// ancres (invalidées) ; le client retombe sur text + quoteOrdinal.
			log.Printf("[anchors] passage introuvable après édition (highlight %s)", t.id)
			continue
		}
		if _, err := pool.Exec(ctx, `
			UPDATE "Highlight"
			SET "canonicalStart" = $2, "canonicalEnd" = $3, "contentSha" = $4
			WHERE id = $1`,
			t.id, start, end, doc.Sha); err != nil {
			log.Printf("[anchors] update %s: %v", t.id, err)
		}
	}
}
