package support

// Articles d'aide gérables (tranche 6) : le staff publie/corrige/ordonne
// SANS déploiement. Règles :
//   - slug kebab-case 3-80 (validé ici, CHECK en base) ; unique.
//   - Même slug qu'une entrée statique de la vitrine = la version console
//     la REMPLACE (override documenté, pas doublon).
//   - published=false : brouillon invisible du public (prévisualisé en
//     console via le détail). Pas de versioning : l'historique, c'est
//     updatedAt + la note du staff ailleurs — un article d'aide n'est pas
//     un acte juridique.
//   - Body texte brut (whitespace-pre-wrap côté front) : pas de markdown,
//     pas d'HTML — le staff écrit, il ne code pas (pas d'injection).

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

var slugFormat = regexp.MustCompile(`^[a-z0-9-]{3,80}$`)

// Article est un article d'aide (sérialisable).
type Article struct {
	ID        string `json:"id"`
	Slug      string `json:"slug"`
	TitleFr   string `json:"titleFr"`
	TitleEn   string `json:"titleEn"`
	BodyFr    string `json:"bodyFr"`
	BodyEn    string `json:"bodyEn"`
	Position  int    `json:"position"`
	Published bool   `json:"published"`
	CreatedAt string `json:"createdAt"`
	UpdatedAt string `json:"updatedAt"`
}

// ErrArticleNotFound : article inexistant (refus explicite).
var ErrArticleNotFound = errors.New("article introuvable")

// ErrInvalidArticle : slug/titres/corps hors bornes.
var ErrInvalidArticle = errors.New("article invalide")

// ValidArticleInput valide un contenu (création comme mise à jour) : slug
// kebab-case, titres 5-200, corps 1-10000. Pur et testé sans base.
func ValidArticleInput(slug, titleFr, titleEn, bodyFr, bodyEn string) error {
	if !slugFormat.MatchString(strings.TrimSpace(slug)) {
		return fmt.Errorf("%w : slug kebab-case 3-80", ErrInvalidArticle)
	}
	for _, t := range []struct {
		name, v  string
		min, max int
	}{
		{"titre FR", titleFr, 5, 200}, {"titre EN", titleEn, 5, 200},
		{"texte FR", bodyFr, 1, 10000}, {"texte EN", bodyEn, 1, 10000},
	} {
		if n := len([]rune(strings.TrimSpace(t.v))); n < t.min || n > t.max {
			return fmt.Errorf("%w : %s (%d-%d caractères)", ErrInvalidArticle, t.name, t.min, t.max)
		}
	}
	return nil
}

const articleColumns = `"id", "slug", "titleFr", "titleEn", "bodyFr", "bodyEn", "position", "published", "createdAt", "updatedAt"`

func scanArticle(row pgx.Row) (Article, error) {
	var a Article
	var createdAt, updatedAt time.Time
	err := row.Scan(&a.ID, &a.Slug, &a.TitleFr, &a.TitleEn, &a.BodyFr, &a.BodyEn,
		&a.Position, &a.Published, &createdAt, &updatedAt)
	if err != nil {
		return Article{}, err
	}
	a.CreatedAt = createdAt.UTC().Format(time.RFC3339)
	a.UpdatedAt = updatedAt.UTC().Format(time.RFC3339)
	return a, nil
}

// CreateArticle crée un article (brouillon par défaut — publier est un acte
// explicite séparé, jamais implicite à la création).
func CreateArticle(ctx context.Context, pool DB, slug, titleFr, titleEn, bodyFr, bodyEn string, position int, now time.Time) (Article, error) {
	if pool == nil {
		return Article{}, errors.New("base indisponible")
	}
	if err := ValidArticleInput(slug, titleFr, titleEn, bodyFr, bodyEn); err != nil {
		return Article{}, err
	}
	now = now.UTC()
	a, err := scanArticle(pool.QueryRow(ctx, `
		INSERT INTO "SupportArticle" ("id", "slug", "titleFr", "titleEn", "bodyFr", "bodyEn", "position", "published", "createdAt", "updatedAt")
		VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, false, $7, $7)
		RETURNING `+articleColumns, strings.TrimSpace(slug),
		strings.TrimSpace(titleFr), strings.TrimSpace(titleEn),
		strings.TrimSpace(bodyFr), strings.TrimSpace(bodyEn), position, now))
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return Article{}, fmt.Errorf("%w : slug déjà pris", ErrInvalidArticle)
		}
		return Article{}, err
	}
	return a, nil
}

// GetArticle relit un article (brouillon inclus — la console prévisualise).
func GetArticle(ctx context.Context, pool DB, id string) (Article, error) {
	if pool == nil {
		return Article{}, errors.New("base indisponible")
	}
	a, err := scanArticle(pool.QueryRow(ctx,
		`SELECT `+articleColumns+` FROM "SupportArticle" WHERE "id" = $1`, id))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Article{}, ErrArticleNotFound
		}
		return Article{}, err
	}
	return a, nil
}

// UpdateArticle modifie le contenu et/ou (position, published). Champs texte
// vides = inchangés (on ne vide jamais par omission). Pas de suppression :
// l'historique prime — dépublier au lieu d'effacer. published est un *bool
// (nil = inchangé, sinon bascule explicite) ; position un *int (même règle).
func UpdateArticle(ctx context.Context, pool DB, id, titleFr, titleEn, bodyFr, bodyEn string, position *int, published *bool, now time.Time) (Article, error) {
	if pool == nil {
		return Article{}, errors.New("base indisponible")
	}
	cur, err := GetArticle(ctx, pool, id)
	if err != nil {
		return Article{}, err
	}
	if titleFr == "" {
		titleFr = cur.TitleFr
	}
	if titleEn == "" {
		titleEn = cur.TitleEn
	}
	if bodyFr == "" {
		bodyFr = cur.BodyFr
	}
	if bodyEn == "" {
		bodyEn = cur.BodyEn
	}
	if err := ValidArticleInput(cur.Slug, titleFr, titleEn, bodyFr, bodyEn); err != nil {
		return Article{}, err
	}
	pos := cur.Position
	if position != nil {
		pos = *position
	}
	pub := cur.Published
	if published != nil {
		pub = *published
	}
	now = now.UTC()
	a, err := scanArticle(pool.QueryRow(ctx, `
		UPDATE "SupportArticle"
		SET "titleFr" = $2, "titleEn" = $3, "bodyFr" = $4, "bodyEn" = $5,
		    "position" = $6, "published" = $7, "updatedAt" = $8
		WHERE "id" = $1
		RETURNING `+articleColumns, id, strings.TrimSpace(titleFr), strings.TrimSpace(titleEn),
		strings.TrimSpace(bodyFr), strings.TrimSpace(bodyEn), pos, pub, now))
	if err != nil {
		return Article{}, err
	}
	return a, nil
}

// ListPublishedArticles : le public (vitrine) — publiés, ordre voulu puis
// récents. Pool nil : vide (la vitrine bascule sur son statique).
func ListPublishedArticles(ctx context.Context, pool DB) ([]Article, error) {
	if pool == nil {
		return nil, nil
	}
	rows, err := pool.Query(ctx, `
		SELECT `+articleColumns+` FROM "SupportArticle"
		WHERE "published" = true
		ORDER BY "position", "createdAt" DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []Article{}
	for rows.Next() {
		var a Article
		var createdAt, updatedAt time.Time
		if err := rows.Scan(&a.ID, &a.Slug, &a.TitleFr, &a.TitleEn, &a.BodyFr, &a.BodyEn,
			&a.Position, &a.Published, &createdAt, &updatedAt); err != nil {
			return nil, err
		}
		a.CreatedAt = createdAt.UTC().Format(time.RFC3339)
		a.UpdatedAt = updatedAt.UTC().Format(time.RFC3339)
		items = append(items, a)
	}
	return items, rows.Err()
}

// ListAllArticles : la console (tout, brouillons inclus, récents d'abord).
func ListAllArticles(ctx context.Context, pool DB, limit, offset int) ([]Article, int, error) {
	if pool == nil {
		return nil, 0, nil
	}
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	if offset < 0 {
		offset = 0
	}
	rows, err := pool.Query(ctx, `
		SELECT `+articleColumns+`, COUNT(*) OVER () AS total FROM "SupportArticle"
		ORDER BY "createdAt" DESC LIMIT $1 OFFSET $2`, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	var items []Article
	total := 0
	for rows.Next() {
		var a Article
		var createdAt, updatedAt time.Time
		var n int
		if err := rows.Scan(&a.ID, &a.Slug, &a.TitleFr, &a.TitleEn, &a.BodyFr, &a.BodyEn,
			&a.Position, &a.Published, &createdAt, &updatedAt, &n); err != nil {
			return nil, 0, err
		}
		a.CreatedAt = createdAt.UTC().Format(time.RFC3339)
		a.UpdatedAt = updatedAt.UTC().Format(time.RFC3339)
		total = n
		items = append(items, a)
	}
	return items, total, rows.Err()
}
