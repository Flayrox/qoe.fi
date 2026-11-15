// Package digest — récapitulatif email de la publication.
//
// Configuration stockée dans `Publisher.emailSettings->'digest'` (JSONB
// existant) : aucune migration. Le rendu est un aperçu honnête ; l'envoi
// planifié viendra après (worker + cadence).
package digest

import (
	"context"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Config est la configuration du digest.
type Config struct {
	Enabled     bool   `json:"enabled"`
	Weekday     int    `json:"weekday"` // 1 = lundi … 7 = dimanche
	Hour        int    `json:"hour"`    // 0..23 (heure locale de la publication)
	MaxArticles int    `json:"maxArticles"`
	Intro       string `json:"intro"`
}

// DefaultConfig : lundi 9 h, cinq articles — désactivé par défaut.
func DefaultConfig() Config {
	return Config{Enabled: false, Weekday: 1, Hour: 9, MaxArticles: 5, Intro: ""}
}

// normalize applique les bornes (jamais de valeur absurde en base).
func normalize(cfg Config) Config {
	if cfg.Weekday < 1 || cfg.Weekday > 7 {
		cfg.Weekday = 1
	}
	if cfg.Hour < 0 || cfg.Hour > 23 {
		cfg.Hour = 9
	}
	if cfg.MaxArticles < 1 || cfg.MaxArticles > 12 {
		cfg.MaxArticles = 5
	}
	cfg.Intro = strings.TrimSpace(cfg.Intro)
	if len(cfg.Intro) > 500 {
		cfg.Intro = cfg.Intro[:500]
	}
	return cfg
}

// Article est une entrée du digest.
type Article struct {
	Title     string    `json:"title"`
	Slug      string    `json:"slug"`
	Excerpt   string    `json:"excerpt"`
	CreatedAt time.Time `json:"createdAt"`
}

var reTags = regexp.MustCompile(`(?is)<[^>]+>`)

func excerpt(html string, max int) string {
	text := reTags.ReplaceAllString(html, " ")
	text = strings.Join(strings.Fields(text), " ")
	runes := []rune(text)
	if len(runes) > max {
		return strings.TrimSpace(string(runes[:max])) + "…"
	}
	return text
}

// Service lit/écrit la configuration et sélectionne les articles.
type Service struct {
	pool *pgxpool.Pool
}

// NewService construit le service.
func NewService(pool *pgxpool.Pool) *Service {
	return &Service{pool: pool}
}

// GetConfig renvoie la configuration (défauts si absente).
func (s *Service) GetConfig(ctx context.Context, publisherID string) (Config, error) {
	if s == nil || s.pool == nil {
		return DefaultConfig(), nil
	}
	var raw string
	if err := s.pool.QueryRow(ctx, `
		SELECT COALESCE("emailSettings"->'digest', '{}'::jsonb)::text
		FROM "Publisher" WHERE id = $1`, publisherID).Scan(&raw); err != nil {
		return DefaultConfig(), err
	}
	cfg := DefaultConfig()
	if err := json.Unmarshal([]byte(raw), &cfg); err != nil {
		return DefaultConfig(), nil
	}
	return normalize(cfg), nil
}

// SaveConfig écrit la configuration (valeurs bornées).
func (s *Service) SaveConfig(ctx context.Context, publisherID string, cfg Config) (Config, error) {
	if s == nil || s.pool == nil {
		return Config{}, fmt.Errorf("base indisponible")
	}
	cfg = normalize(cfg)
	payload, err := json.Marshal(cfg)
	if err != nil {
		return Config{}, err
	}
	_, err = s.pool.Exec(ctx, `
		UPDATE "Publisher"
		SET "emailSettings" = jsonb_set("emailSettings", '{digest}', $2::jsonb, true),
		    "updatedAt" = now()
		WHERE id = $1`, publisherID, string(payload))
	if err != nil {
		return Config{}, err
	}
	return cfg, nil
}

// CanManagePublisher : publication personnelle ou média dont l'utilisateur
// est propriétaire actif (même règle que Stripe/export/books).
func (s *Service) CanManagePublisher(ctx context.Context, userID, publisherID string) (bool, error) {
	if s == nil || s.pool == nil || userID == "" || publisherID == "" {
		return false, nil
	}
	var ok bool
	err := s.pool.QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1 FROM "User" u WHERE u.id = $1::uuid AND u."publisherId" = $2
			UNION
			SELECT 1 FROM "MediaMember" mm
			JOIN "Media" m ON m.id = mm."mediaId"
			WHERE mm."userId" = $1::uuid AND mm.role = 'owner' AND mm.status = 'active'
			  AND m."publisherId" = $2
		)`, userID, publisherID).Scan(&ok)
	return ok, err
}

// PublisherName renvoie le nom de la publication (objet de l'email).
func (s *Service) PublisherName(ctx context.Context, publisherID string) string {
	if s == nil || s.pool == nil {
		return ""
	}
	var name string
	if err := s.pool.QueryRow(ctx,
		`SELECT COALESCE("name", '') FROM "Publisher" WHERE id = $1`, publisherID).Scan(&name); err != nil {
		return ""
	}
	return name
}

// RecentArticles sélectionne les derniers articles publiés.
func (s *Service) RecentArticles(ctx context.Context, publisherID string, limit int) ([]Article, error) {
	if s == nil || s.pool == nil {
		return []Article{}, nil
	}
	if limit < 1 || limit > 12 {
		limit = 5
	}
	rows, err := s.pool.Query(ctx, `
		SELECT "title", "slug", "content", "createdAt"
		FROM "Article"
		WHERE "publisherId" = $1 AND "published" = true
		ORDER BY "createdAt" DESC
		LIMIT $2`, publisherID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	articles := []Article{}
	for rows.Next() {
		var a Article
		var content string
		if err := rows.Scan(&a.Title, &a.Slug, &content, &a.CreatedAt); err != nil {
			return nil, err
		}
		a.Excerpt = excerpt(content, 220)
		articles = append(articles, a)
	}
	return articles, rows.Err()
}
