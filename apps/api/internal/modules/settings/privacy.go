package settings

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"
)

type ConsentPreferences struct {
	Analytics       bool   `json:"analytics"`
	Personalization bool   `json:"personalization"`
	Marketing       bool   `json:"marketing"`
	Version         string `json:"version"`
	UpdatedAt       string `json:"updatedAt"`
}

func (s *Service) GetConsentPreferences(ctx context.Context, userID string) (ConsentPreferences, error) {
	var raw string
	err := s.pool.QueryRow(ctx, `SELECT COALESCE(value, '{}') FROM "SystemConfig" WHERE key=$1`, "CONSENT_"+userID).Scan(&raw)
	if err != nil {
		return ConsentPreferences{Version: "1"}, nil
	}
	var out ConsentPreferences
	if err := json.Unmarshal([]byte(raw), &out); err != nil {
		return ConsentPreferences{}, err
	}
	return out, nil
}

func (s *Service) UpdateConsentPreferences(ctx context.Context, userID string, in ConsentPreferences) (ConsentPreferences, error) {
	if len(in.Version) > 32 {
		return ConsentPreferences{}, errors.New("version de consentement invalide")
	}
	if in.Version == "" {
		in.Version = "1"
	}
	in.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	raw, err := json.Marshal(in)
	if err != nil {
		return ConsentPreferences{}, err
	}
	_, err = s.pool.Exec(ctx, `INSERT INTO "SystemConfig" (key,value,description,"updatedAt") VALUES ($1,$2,'Consentement utilisateur',now()) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value,"updatedAt"=now()`, "CONSENT_"+userID, string(raw))
	if err != nil {
		return ConsentPreferences{}, fmt.Errorf("enregistrement consentement: %w", err)
	}
	return in, nil
}
