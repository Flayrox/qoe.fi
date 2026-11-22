package settings

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

// ConsentPreferences est le choix de traceurs du lecteur
// (GET/PATCH /v1/settings/consent).
type ConsentPreferences struct {
	Analytics       bool   `json:"analytics"`
	Personalization bool   `json:"personalization"`
	Marketing       bool   `json:"marketing"`
	Version         string `json:"version"`
	UpdatedAt       string `json:"updatedAt"`
}

// consentVersionMax borne la version de politique acceptée (32 runes).
const consentVersionMax = 32

// GetConsentPreferences lit le consentement du lecteur. Aucune ligne = aucune
// décision enregistrée : les trois catégories optionnelles restent refusées.
// Une panne de lecture est remontée (jamais un 200 « tout refusé » qui
// laisserait croire que le choix a été enregistré).
func (s *Service) GetConsentPreferences(ctx context.Context, userID string) (ConsentPreferences, error) {
	if userID == "" {
		return ConsentPreferences{}, errUnauthenticated
	}
	var out ConsentPreferences
	var updatedAt time.Time
	err := s.pool.QueryRow(ctx, `
		SELECT "analytics", "personalization", "marketing", "version", "updatedAt"
		FROM "UserConsentPreference" WHERE "userId" = $1`, toUUID(userID)).
		Scan(&out.Analytics, &out.Personalization, &out.Marketing, &out.Version, &updatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return ConsentPreferences{Version: "1"}, nil
	}
	if err != nil {
		return ConsentPreferences{}, err
	}
	out.UpdatedAt = updatedAt.UTC().Format(time.RFC3339)
	return out, nil
}

// UpdateConsentPreferences enregistre le choix du lecteur (upsert idempotent,
// horodaté côté serveur). La version de politique ne peut pas être vide ni
// dépasser 32 runes ; elle est bornée en runes (pas en octets) pour rester
// valide en UTF-8.
func (s *Service) UpdateConsentPreferences(ctx context.Context, userID string, in ConsentPreferences) (ConsentPreferences, error) {
	if userID == "" {
		return ConsentPreferences{}, errUnauthenticated
	}
	in.Version = strings.TrimSpace(in.Version)
	if in.Version == "" {
		in.Version = "1"
	}
	if runes := []rune(in.Version); len(runes) > consentVersionMax {
		return ConsentPreferences{}, invalid("version de consentement invalide")
	}

	var updatedAt time.Time
	if err := s.pool.QueryRow(ctx, `
		INSERT INTO "UserConsentPreference"
			(id, "userId", "analytics", "personalization", "marketing", "version", "updatedAt")
		VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, now())
		ON CONFLICT ("userId") DO UPDATE
		SET "analytics" = EXCLUDED."analytics",
		    "personalization" = EXCLUDED."personalization",
		    "marketing" = EXCLUDED."marketing",
		    "version" = EXCLUDED."version",
		    "updatedAt" = now()
		RETURNING "updatedAt"`,
		toUUID(userID), in.Analytics, in.Personalization, in.Marketing, in.Version,
	).Scan(&updatedAt); err != nil {
		return ConsentPreferences{}, err
	}
	in.UpdatedAt = updatedAt.UTC().Format(time.RFC3339)
	return in, nil
}
