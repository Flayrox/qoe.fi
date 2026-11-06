package admin

// ── Flags & registre des fonctionnalités ────────────────────────────────
// Les flags ne sont plus écrits directement depuis Next.js/Supabase : toute
// bascule passe par une route Go, donc par une capacité, une preuve N2 et
// l'audit. Le registre "Feature" porte l'état opérationnel (statut, CTA,
// flag) ; les textes restent dans le catalogue @qoe/ui.

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/qoefi/api/internal/flags"
)

var (
	errInvalidFeatureFlag = errors.New("flag invalide")
	errInvalidFeature     = errors.New("fonctionnalité invalide")
)

type FeatureFlagItem struct {
	Key         string   `json:"key"`
	IsEnabled   bool     `json:"is_enabled"`
	Description *string  `json:"description"`
	TargetRoles []string `json:"target_roles"`
	UpdatedAt   string   `json:"updated_at,omitempty"`
}

// ListFeatureFlags liste la table partagée. La lecture reste ouverte à
// `admin.config.read` : voir un flag n'est pas le basculer.
func (s *Service) ListFeatureFlags(ctx context.Context) ([]FeatureFlagItem, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT "key", "is_enabled", "description", "target_roles", "updated_at"
		FROM "feature_flags"
		ORDER BY "key" ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []FeatureFlagItem{}
	for rows.Next() {
		var item FeatureFlagItem
		if err := rows.Scan(&item.Key, &item.IsEnabled, &item.Description, &item.TargetRoles, &item.UpdatedAt); err != nil {
			return nil, err
		}
		if item.TargetRoles == nil {
			item.TargetRoles = []string{}
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

// SetFeatureFlag bascule un flag connu. La clé doit appartenir au registre Go
// (pas de flag fantôme) ; l'écriture est auditée même si admin-audit-log est
// désactivé.
func (s *Service) SetFeatureFlag(ctx context.Context, staffID, key string, enabled bool) (FeatureFlagItem, error) {
	key = strings.TrimSpace(key)
	if key == "" || !flags.Known(key) {
		return FeatureFlagItem{}, errInvalidFeatureFlag
	}
	var item FeatureFlagItem
	err := s.pool.QueryRow(ctx, `
		INSERT INTO "feature_flags" ("key", "is_enabled", "description", "target_roles", "updated_at")
		VALUES ($1, $2, NULL, '{all}', now())
		ON CONFLICT ("key") DO UPDATE SET "is_enabled" = EXCLUDED."is_enabled", "updated_at" = now()
		RETURNING "key", "is_enabled", "description", "target_roles", "updated_at"`,
		key, enabled).Scan(&item.Key, &item.IsEnabled, &item.Description, &item.TargetRoles, &item.UpdatedAt)
	if err != nil {
		return FeatureFlagItem{}, err
	}
	s.logAudit(ctx, staffID, "platform.feature_flag", "platform", key, map[string]any{"enabled": enabled})
	return item, nil
}

type FeatureAdminItem struct {
	Key           string  `json:"key"`
	Status        string  `json:"status"`
	NotifyEnabled bool    `json:"notifyEnabled"`
	FlagKey       *string `json:"flagKey"`
	Href          *string `json:"href"`
	Interested    int     `json:"interested"`
}

// ListFeatures retourne le registre opérationnel et le nombre de promesses
// actives : la console peut juger une audience avant de créer une campagne.
func (s *Service) ListFeatures(ctx context.Context) ([]FeatureAdminItem, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT f."key", f."status", f."notifyEnabled", f."flagKey", f."href",
		       COUNT(i."id") FILTER (WHERE i."status" = 'active')::int
		FROM "Feature" f
		LEFT JOIN "FeatureInterest" i ON i."featureKey" = f."key"
		GROUP BY f."key", f."status", f."notifyEnabled", f."flagKey", f."href"
		ORDER BY f."key" ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []FeatureAdminItem{}
	for rows.Next() {
		var item FeatureAdminItem
		if err := rows.Scan(&item.Key, &item.Status, &item.NotifyEnabled, &item.FlagKey, &item.Href, &item.Interested); err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

// UpdateFeatureInput est volontairement borné : la clé n'est pas modifiable
// (elle est le contrat public) et le statut vient d'un vocabulaire fermé.
type UpdateFeatureInput struct {
	Status        string  `json:"status"`
	NotifyEnabled *bool   `json:"notifyEnabled"`
	FlagKey       *string `json:"flagKey"`
	Href          *string `json:"href"`
}

func validFeatureStatus(status string) bool {
	switch status {
	case "in-development", "coming-soon", "paused", "beta", "live", "retired":
		return true
	default:
		return false
	}
}

// UpdateFeature met à jour l'état opérationnel. Une fonctionnalité en pause ou
// retirée ne peut pas garder une promesse ouverte.
func (s *Service) UpdateFeature(ctx context.Context, staffID, key string, in UpdateFeatureInput) (FeatureAdminItem, error) {
	key = strings.TrimSpace(key)
	if key == "" {
		return FeatureAdminItem{}, errInvalidFeature
	}
	if !validFeatureStatus(in.Status) {
		return FeatureAdminItem{}, fmt.Errorf("%w: statut inconnu", errInvalidFeature)
	}
	if in.NotifyEnabled != nil && *in.NotifyEnabled && (in.Status == "paused" || in.Status == "retired") {
		return FeatureAdminItem{}, fmt.Errorf("%w: une fonctionnalité en pause ne peut pas promettre une notification", errInvalidFeature)
	}
	flagKey := ""
	if in.FlagKey != nil {
		flagKey = strings.TrimSpace(*in.FlagKey)
		if flagKey != "" && !flags.Known(flagKey) {
			return FeatureAdminItem{}, fmt.Errorf("%w: flag inconnu", errInvalidFeature)
		}
	}
	href := ""
	if in.Href != nil {
		href = strings.TrimSpace(*in.Href)
	}
	tag, err := s.pool.Exec(ctx, `
		UPDATE "Feature"
		SET "status" = $2,
		    "notifyEnabled" = COALESCE($3, "notifyEnabled"),
		    "flagKey" = NULLIF($4, ''),
		    "href" = NULLIF($5, ''),
		    "updatedAt" = now()
		WHERE "key" = $1`, key, in.Status, in.NotifyEnabled, flagKey, href)
	if err != nil {
		return FeatureAdminItem{}, err
	}
	if tag.RowsAffected() == 0 {
		return FeatureAdminItem{}, errInvalidFeature
	}
	item, err := s.getFeature(ctx, key)
	if err != nil {
		return FeatureAdminItem{}, err
	}
	s.logAudit(ctx, staffID, "platform.feature", "platform", key, map[string]any{
		"status":        in.Status,
		"notifyEnabled": in.NotifyEnabled,
	})
	return item, nil
}

func (s *Service) getFeature(ctx context.Context, key string) (FeatureAdminItem, error) {
	var item FeatureAdminItem
	err := s.pool.QueryRow(ctx, `
		SELECT f."key", f."status", f."notifyEnabled", f."flagKey", f."href",
		       COUNT(i."id") FILTER (WHERE i."status" = 'active')::int
		FROM "Feature" f
		LEFT JOIN "FeatureInterest" i ON i."featureKey" = f."key"
		WHERE f."key" = $1
		GROUP BY f."key", f."status", f."notifyEnabled", f."flagKey", f."href"`, key).
		Scan(&item.Key, &item.Status, &item.NotifyEnabled, &item.FlagKey, &item.Href, &item.Interested)
	return item, err
}
