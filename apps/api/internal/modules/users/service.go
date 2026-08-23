package users

import (
	"context"
	"errors"
	"regexp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Service struct {
	pool *pgxpool.Pool
}

func NewService(pool *pgxpool.Pool) *Service {
	return &Service{pool: pool}
}

type Contributor struct {
	ID          string  `json:"id"`
	Name        *string `json:"name"`
	Username    *string `json:"username"`
	LogoURL     *string `json:"logoUrl"`
	IsCertified bool    `json:"isCertified"`
}

func toUUID(id string) pgtype.UUID {
	u := pgtype.UUID{}
	_ = u.Scan(id)
	return u
}

func textPtr(t pgtype.Text) *string {
	if !t.Valid {
		return nil
	}
	v := t.String
	return &v
}

// SearchForContributors cherche des utilisateurs pour co-auteur (name/username/email contains, insensible).
// Mirroir de packages/api-client/src/actions/articles/index.ts searchArticleContributorsAction.
func (s *Service) SearchForContributors(ctx context.Context, query string, excludeIds []string) ([]Contributor, error) {
	if len(query) < 2 {
		return []Contributor{}, nil
	}
	q := "%" + query + "%"
	// Construit le tableau d'UUIDs à exclure
	excludeUUIDs := make([]pgtype.UUID, 0, len(excludeIds))
	for _, id := range excludeIds {
		if id != "" {
			excludeUUIDs = append(excludeUUIDs, toUUID(id))
		}
	}
	// Si aucun à exclure, on passe un tableau vide
	rows, err := s.pool.Query(ctx, `
		SELECT id::text, name, username, "logoUrl", "isCertified"
		FROM "User"
		WHERE "isSuspended" = false AND "isShadowbanned" = false
		  AND id != ALL($2::uuid[])
		  AND (name ILIKE $1 OR username ILIKE $1 OR email ILIKE $1)
		ORDER BY name ASC
		LIMIT 8
	`, q, excludeUUIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Contributor
	for rows.Next() {
		var c Contributor
		var name, username, logo pgtype.Text
		var certified bool
		if err := rows.Scan(&c.ID, &name, &username, &logo, &certified); err != nil {
			continue
		}
		c.Name = textPtr(name)
		c.Username = textPtr(username)
		c.LogoURL = textPtr(logo)
		c.IsCertified = certified
		out = append(out, c)
	}
	if out == nil {
		out = []Contributor{}
	}
	return out, rows.Err()
}

// MediaPublicationForUser renvoie l'id de publication d'un média pour lequel
// l'utilisateur est membre actif (résolution du workspace MEDIA du dashboard).
// Retourne ("", nil) si non membre — parité prisma.mediaMember.findUnique.
func (s *Service) MediaPublicationForUser(ctx context.Context, userID, mediaID string) (string, error) {
	var pubID pgtype.Text
	err := s.pool.QueryRow(ctx, `
		SELECT p.id::text
		FROM "MediaMember" mm
		JOIN "Media" m ON m.id = mm."mediaId"
		JOIN "Publication" p ON p.id = m."publicationId"
		WHERE mm."userId" = $1 AND mm."mediaId" = $2 AND mm.status = 'active'`,
		toUUID(userID), mediaID).Scan(&pubID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", nil
		}
		return "", err
	}
	if !pubID.Valid {
		return "", nil
	}
	return pubID.String, nil
}

// ── Profil lecteur (GET /v1/me, PATCH /v1/me/profile) ─────────────────────

// ReaderProfile est le profil lecteur renvoyé par GET /v1/me : identité +
// compteurs de la bibliothèque (suivis, mots masqués) — porté de
// getRequestDbUser / getAccountSettingsAction / login (Prisma).
type ReaderProfile struct {
	ID                     string  `json:"id"`
	Email                  string  `json:"email"`
	Name                   *string `json:"name"`
	Username               *string `json:"username"`
	LogoURL                *string `json:"logoUrl"`
	OnboardingText         *string `json:"onboardingText"`
	Pronouns               *string `json:"pronouns"`
	Role                   string  `json:"role"`
	WalletBalanceCents     int32   `json:"walletBalanceCents"`
	HasCompletedOnboarding bool    `json:"hasCompletedOnboarding"`
	CreatedAt              string  `json:"createdAt"`
	FollowsCount           int32   `json:"followsCount"`
	MutedWordsCount        int32   `json:"mutedWordsCount"`
	IsMediaMember          bool    `json:"isMediaMember"`
}

var usernamePattern = regexp.MustCompile(`^[a-z0-9_]{3,30}$`)

// Profile retourne le profil lecteur complet (id = sub du JWT Supabase).
func (s *Service) Profile(ctx context.Context, userID string) (*ReaderProfile, error) {
	var p ReaderProfile
	var createdAt pgtype.Timestamp
	err := s.pool.QueryRow(ctx, `
		SELECT u.id::text, u.email, u.name, u.username, u."logoUrl", u."onboardingText", u.pronouns,
		       u.role, u."walletBalanceCents", u."hasCompletedOnboarding", u."createdAt",
		       (SELECT COUNT(*)::int FROM "Follows" f WHERE f."readerId" = u.id)  AS follows_count,
		       (SELECT COUNT(*)::int FROM "MutedWord" m WHERE m."userId" = u.id)  AS muted_count,
		       EXISTS(SELECT 1 FROM "MediaMember" mm
		              WHERE mm."userId" = u.id AND mm.status = 'active') AS is_media_member
		FROM "User" u
		WHERE u.id = $1`, toUUID(userID)).
		Scan(&p.ID, &p.Email, &p.Name, &p.Username, &p.LogoURL, &p.OnboardingText, &p.Pronouns,
			&p.Role, &p.WalletBalanceCents, &p.HasCompletedOnboarding, &createdAt,
			&p.FollowsCount, &p.MutedWordsCount, &p.IsMediaMember)
	if err != nil {
		return nil, err
	}
	p.CreatedAt = createdAt.Time.Format(time.RFC3339)
	return &p, nil
}

// UpdateProfile met à jour le profil lecteur (name, username, onboardingText,
// logoUrl, pronouns) — validation identique à updateAccountProfileAction.
func (s *Service) UpdateProfile(ctx context.Context, userID, name, username, onboardingText, logoURL, pronouns string) (*ReaderProfile, error) {
	name = strings.TrimSpace(name)
	if len(name) > 120 {
		name = name[:120]
	}
	username = strings.TrimSpace(strings.ToLower(username))
	username = strings.TrimPrefix(username, "@")
	onboardingText = strings.TrimSpace(onboardingText)
	if len(onboardingText) > 500 {
		onboardingText = onboardingText[:500]
	}
	logoURL = strings.TrimSpace(logoURL)
	if len(logoURL) > 2000 {
		logoURL = logoURL[:2000]
	}
	pronouns = strings.TrimSpace(pronouns)
	if len(pronouns) > 50 {
		pronouns = pronouns[:50]
	}

	if username != "" && !usernamePattern.MatchString(username) {
		return nil, errors.New("Le nom d'utilisateur doit contenir 3 à 30 caractères : lettres, chiffres ou _.")
	}
	if username != "" {
		var exists bool
		if err := s.pool.QueryRow(ctx,
			`SELECT EXISTS(SELECT 1 FROM "User" WHERE username = $1 AND id <> $2)`,
			username, toUUID(userID)).Scan(&exists); err != nil {
			return nil, err
		}
		if exists {
			return nil, errors.New("Ce nom d'utilisateur est déjà utilisé.")
		}
	}

	if _, err := s.pool.Exec(ctx, `
		UPDATE "User"
		SET name = $1, username = $2, "onboardingText" = $3, "logoUrl" = $4, pronouns = $5, "updatedAt" = now()
		WHERE id = $6`,
		optText(name), optText(username), optText(onboardingText), optText(logoURL), optText(pronouns),
		toUUID(userID)); err != nil {
		return nil, err
	}
	return s.Profile(ctx, userID)
}

// optText convertit une chaîne en pgtype.Text ; vide → NULL.
func optText(s string) pgtype.Text {
	if s == "" {
		return pgtype.Text{Valid: false}
	}
	return pgtype.Text{String: s, Valid: true}
}
