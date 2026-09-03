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

// SyncOfficialMarks synchronise les annotations officielles du studio : les
// <mark data-annotation-note> présents dans le HTML source deviennent des
// lignes Highlight (isOfficial, isPublic) ANCRÉES — plus de double source de
// vérité (marque dans le HTML + ligne DB qui peut diverger).
//
// Sémantique : upsert par (article, canonicalStart, canonicalEnd) — les marks
// nouveaux sont insérés, les marks existants sont mis à jour (texte, note,
// offsets, sha). Les lignes officielles existantes SANS mark correspondant
// (ex. seed) sont laissées intactes ; leur ré-ancrage est géré par
// ReanchorArticle. Jamais bloquant : échec → log.
//
// L'auteur (readerId des entités) est TOUJOURS l'auteur de l'article lu en
// base — jamais le userID de la requête (correct même en co-écriture).
func SyncOfficialMarks(ctx context.Context, pool Pool, articleID string) {
	var html, authorID string
	err := pool.QueryRow(ctx,
		`SELECT COALESCE("content",''), "authorId"::text FROM "Article" WHERE id = $1`,
		articleID).Scan(&html, &authorID)
	if err != nil || strings.TrimSpace(html) == "" {
		return
	}

	doc := canon.Parse(html)

	// Offset canonique de départ de chaque bloc texte (item 0).
	segStart := map[int]int{}
	for _, seg := range doc.Segments {
		if _, seen := segStart[seg.BlockIdx]; !seen {
			segStart[seg.BlockIdx] = seg.Start
		}
	}

	// Lignes officielles existantes de l'article, indexées par (start,end).
	rows, err := pool.Query(ctx, `
		SELECT id, "canonicalStart", "canonicalEnd"
		FROM "Highlight"
		WHERE "articleId" = $1 AND "isOfficial" = true AND "canonicalStart" IS NOT NULL`,
		articleID)
	if err != nil {
		log.Printf("[anchors] official select: %v", err)
		return
	}
	existing := map[[2]int]string{} // [start,end] → id
	for rows.Next() {
		var id string
		var s, e *int32
		if err := rows.Scan(&id, &s, &e); err != nil {
			rows.Close()
			log.Printf("[anchors] official scan: %v", err)
			return
		}
		if s != nil && e != nil {
			existing[[2]int{int(*s), int(*e)}] = id
		}
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		log.Printf("[anchors] official rows: %v", err)
		return
	}

	for bi, block := range doc.Blocks {
		if len(block.Spans) == 0 {
			continue
		}
		base, ok := segStart[bi]
		if !ok {
			continue
		}
		runes := []rune(block.Text)
		for _, sp := range block.Spans {
			if sp.Start < 0 || sp.End > len(runes) || sp.End <= sp.Start {
				continue
			}
			passage := string(runes[sp.Start:sp.End])
			cStart := base + sp.Start
			cEnd := base + sp.End
			ordinal := doc.CountBefore(passage, cStart)

			note := any(nil)
			if sp.Note != "" {
				note = sp.Note
			}
			key := [2]int{cStart, cEnd}
			if id, seen := existing[key]; seen {
				if _, err := pool.Exec(ctx, `
					UPDATE "Highlight"
					SET text = $2, note = $3, "quoteOrdinal" = $4,
					    "canonicalStart" = $5, "canonicalEnd" = $6, "contentSha" = $7
					WHERE id = $1`,
					id, passage, note, ordinal, cStart, cEnd, doc.Sha); err != nil {
					log.Printf("[anchors] official update %s: %v", id, err)
				}
			} else {
				if _, err := pool.Exec(ctx, `
					INSERT INTO "Highlight"
						(id, text, note, "isPublic", "isOfficial", "quoteOrdinal",
						 "readerId", "articleId", "canonicalStart", "canonicalEnd", "contentSha")
					VALUES (gen_random_uuid()::text, $1, $2, true, true, $3, $4::uuid, $5, $6, $7, $8)`,
					passage, note, ordinal, authorID, articleID, cStart, cEnd, doc.Sha); err != nil {
					log.Printf("[anchors] official insert: %v", err)
				}
			}
		}
	}
}

// BackfillAll re-synchronise les ancres de TOUS les articles publiés
// (one-shot d'exploitation : migration des données héritées). Idempotent :
// ReanchorArticle ne re-résout que les lignes sans ancre ou au sha périmé,
// SyncOfficialMarks n'insère que les marks officiels absents.
func BackfillAll(ctx context.Context, pool Pool) {
	rows, err := pool.Query(ctx, `
		SELECT id::text
		FROM "Article"
		WHERE published = true
		ORDER BY id`)
	if err != nil {
		log.Printf("[anchors] backfill select: %v", err)
		return
	}
	defer rows.Close()
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			log.Printf("[anchors] backfill scan: %v", err)
			return
		}
		ReanchorArticle(ctx, pool, id)
		SyncOfficialMarks(ctx, pool, id)
	}
	if err := rows.Err(); err != nil {
		log.Printf("[anchors] backfill rows: %v", err)
	}
}

// ReanchorArticle re-synchronise les ancres de tous les surlignages d'un
// article après une édition : met à jour Article.contentSha puis re-résout
// les surlignages dont l'empreinte ne correspond plus (ou jamais résolus).
// Jamais bloquant pour le flux appelant : échec → log, pas d'erreur.
func ReanchorArticle(ctx context.Context, pool Pool, articleID string) {
	var html, curSha string
	err := pool.QueryRow(ctx,
		`SELECT COALESCE("content",''), COALESCE("contentSha",'') FROM "Article" WHERE id = $1`,
		articleID).Scan(&html, &curSha)
	if err != nil || strings.TrimSpace(html) == "" {
		return // article inexistant ou vide : rien à ré-ancrer
	}

	doc := canon.Parse(html)
	// L'empreinte n'a pas changé → aucun churn d'écriture (updatedAt intact) ;
	// la re-résolution ci-dessous reste utile pour les ancres jamais résolues.
	if curSha != doc.Sha {
		if _, err := pool.Exec(ctx,
			`UPDATE "Article" SET "contentSha" = $2, "updatedAt" = now() WHERE id = $1`,
			articleID, doc.Sha); err != nil {
			log.Printf("[anchors] contentSha: %v", err)
			return
		}
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
