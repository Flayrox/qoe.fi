// Package placements fournit le moteur souverain de diffusion de bannières et
// messages in-app (remplacement interne d'Appcues / LaunchDarkly).
package placements

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/qoefi/api/internal/subscriptions"
)

var (
	ErrPlacementNotFound = errors.New("placement introuvable")
	ErrInvalidPlacement  = errors.New("données de placement invalides")
	ErrForbidden         = errors.New("accès réservé au superadmin")
)

// DB abstrait l'accès PostgreSQL pour faciliter l'injection en tests.
type DB interface {
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
}

// Placement représente une configuration de message ou bannière pour un slot.
type Placement struct {
	ID             string     `json:"id"`
	Slot           string     `json:"slot"`
	Format         string     `json:"format"` // 'notch_banner', 'card', 'callout', 'modal'
	Type           string     `json:"type"`   // 'promo', 'info', 'warning', 'critical'
	Title          string     `json:"title"`
	Body           string     `json:"body"`
	CTALabel       *string    `json:"ctaLabel,omitempty"`
	CTAURL         *string    `json:"ctaUrl,omitempty"`
	TargetAudience string     `json:"targetAudience"` // 'all', 'free_only', 'plus_only', 'pro_only'
	Priority       int        `json:"priority"`
	IsActive       bool       `json:"isActive"`
	Dismissible    bool       `json:"dismissible"`
	StartsAt       *time.Time `json:"startsAt,omitempty"`
	EndsAt         *time.Time `json:"endsAt,omitempty"`
	CreatedAt      time.Time  `json:"createdAt"`
	UpdatedAt      time.Time  `json:"updatedAt"`
}

type Service struct {
	pool DB
}

func NewService(pool DB) *Service {
	return &Service{pool: pool}
}

// GetActivePlacementForSlot résout le placement prioritaire pour un slot donné,
// en filtrant selon l'audience (droits réels de l'utilisateur), la période de diffusion
// et l'historique d'acquittement (dismissals).
func (s *Service) GetActivePlacementForSlot(ctx context.Context, slot string, userID string, now time.Time) (*Placement, error) {
	if strings.TrimSpace(slot) == "" {
		return nil, ErrInvalidPlacement
	}

	query := `
		SELECT 
			id, slot, format, type, title, body, cta_label, cta_url, target_audience, priority,
			is_active, dismissible, starts_at, ends_at, created_at, updated_at
		FROM in_app_placements
		WHERE slot = $1
		  AND is_active = true
		  AND (starts_at IS NULL OR starts_at <= $2)
		  AND (ends_at IS NULL OR ends_at > $2)
		  AND (
		    $3 = '' OR id NOT IN (
		      SELECT placement_id FROM user_placement_dismissals WHERE user_id = $3
		    )
		  )
		ORDER BY priority DESC, created_at DESC
	`

	rows, err := s.pool.Query(ctx, query, slot, now, userID)
	if err != nil {
		return nil, fmt.Errorf("requête placements: %w", err)
	}
	defer rows.Close()

	// Cache de l'évaluation des droits pour éviter de requêter plusieurs fois
	hasPlusEvaluated := false
	hasPlus := false
	hasProEvaluated := false
	hasPro := false

	for rows.Next() {
		var p Placement
		var ctaLabel, ctaURL pgtype.Text
		var startsAt, endsAt, createdAt, updatedAt pgtype.Timestamptz

		if err := rows.Scan(
			&p.ID, &p.Slot, &p.Format, &p.Type, &p.Title, &p.Body,
			&ctaLabel, &ctaURL, &p.TargetAudience, &p.Priority,
			&p.IsActive, &p.Dismissible, &startsAt, &endsAt, &createdAt, &updatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan placement: %w", err)
		}

		if ctaLabel.Valid {
			p.CTALabel = &ctaLabel.String
		}
		if ctaURL.Valid {
			p.CTAURL = &ctaURL.String
		}
		if startsAt.Valid {
			p.StartsAt = &startsAt.Time
		}
		if endsAt.Valid {
			p.EndsAt = &endsAt.Time
		}
		if createdAt.Valid {
			p.CreatedAt = createdAt.Time
		}
		if updatedAt.Valid {
			p.UpdatedAt = updatedAt.Time
		}

		// Validation de l'audience ciblée
		switch p.TargetAudience {
		case "all":
			return &p, nil
		case "free_only":
			if userID == "" {
				// Les visiteurs non connectés sont considérés comme free
				return &p, nil
			}
			if !hasPlusEvaluated {
				hasPlus = subscriptions.HasPlus(ctx, s.pool, userID, now)
				hasPlusEvaluated = true
			}
			if !hasPlus {
				return &p, nil
			}
		case "plus_only":
			if userID == "" {
				continue
			}
			if !hasPlusEvaluated {
				hasPlus = subscriptions.HasPlus(ctx, s.pool, userID, now)
				hasPlusEvaluated = true
			}
			if hasPlus {
				return &p, nil
			}
		case "pro_only":
			if userID == "" {
				continue
			}
			if !hasProEvaluated {
				hasPro = subscriptions.HasEntitlement(ctx, s.pool, subscriptions.SubjectUser, userID, subscriptions.PlanPro, now)
				hasProEvaluated = true
			}
			if hasPro {
				return &p, nil
			}
		default:
			// Valeur inconnue -> fallback permissif ou all
			return &p, nil
		}
	}

	return nil, rows.Err()
}

// DismissPlacement enregistre l'acquittement d'un placement par un utilisateur.
func (s *Service) DismissPlacement(ctx context.Context, placementID string, userID string, now time.Time) error {
	if strings.TrimSpace(placementID) == "" || strings.TrimSpace(userID) == "" {
		return ErrInvalidPlacement
	}

	query := `
		INSERT INTO user_placement_dismissals (user_id, placement_id, dismissed_at)
		VALUES ($1, $2, $3)
		ON CONFLICT (user_id, placement_id) DO UPDATE SET dismissed_at = EXCLUDED.dismissed_at
	`
	_, err := s.pool.Exec(ctx, query, userID, placementID, now)
	return err
}

// ListPlacements retourne l'ensemble des placements pour la console d'administration.
func (s *Service) ListPlacements(ctx context.Context) ([]Placement, error) {
	query := `
		SELECT 
			id, slot, format, type, title, body, cta_label, cta_url, target_audience, priority,
			is_active, dismissible, starts_at, ends_at, created_at, updated_at
		FROM in_app_placements
		ORDER BY slot ASC, priority DESC, created_at DESC
	`
	rows, err := s.pool.Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("list placements: %w", err)
	}
	defer rows.Close()

	var list []Placement
	for rows.Next() {
		var p Placement
		var ctaLabel, ctaURL pgtype.Text
		var startsAt, endsAt, createdAt, updatedAt pgtype.Timestamptz

		if err := rows.Scan(
			&p.ID, &p.Slot, &p.Format, &p.Type, &p.Title, &p.Body,
			&ctaLabel, &ctaURL, &p.TargetAudience, &p.Priority,
			&p.IsActive, &p.Dismissible, &startsAt, &endsAt, &createdAt, &updatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan placement list: %w", err)
		}

		if ctaLabel.Valid {
			p.CTALabel = &ctaLabel.String
		}
		if ctaURL.Valid {
			p.CTAURL = &ctaURL.String
		}
		if startsAt.Valid {
			p.StartsAt = &startsAt.Time
		}
		if endsAt.Valid {
			p.EndsAt = &endsAt.Time
		}
		if createdAt.Valid {
			p.CreatedAt = createdAt.Time
		}
		if updatedAt.Valid {
			p.UpdatedAt = updatedAt.Time
		}

		list = append(list, p)
	}

	return list, rows.Err()
}

// CreatePlacement insère un nouveau placement.
func (s *Service) CreatePlacement(ctx context.Context, p *Placement) (*Placement, error) {
	if strings.TrimSpace(p.ID) == "" {
		p.ID = fmt.Sprintf("plc_%d", time.Now().UnixNano())
	}
	if strings.TrimSpace(p.Slot) == "" || strings.TrimSpace(p.Title) == "" || strings.TrimSpace(p.Body) == "" {
		return nil, ErrInvalidPlacement
	}
	if p.Format == "" {
		p.Format = "notch_banner"
	}
	if p.Type == "" {
		p.Type = "promo"
	}
	if p.TargetAudience == "" {
		p.TargetAudience = "all"
	}

	now := time.Now().UTC()
	p.CreatedAt = now
	p.UpdatedAt = now

	query := `
		INSERT INTO in_app_placements (
			id, slot, format, type, title, body, cta_label, cta_url, target_audience,
			priority, is_active, dismissible, starts_at, ends_at, created_at, updated_at
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
		)
	`
	_, err := s.pool.Exec(
		ctx, query,
		p.ID, p.Slot, p.Format, p.Type, p.Title, p.Body, p.CTALabel, p.CTAURL, p.TargetAudience,
		p.Priority, p.IsActive, p.Dismissible, p.StartsAt, p.EndsAt, p.CreatedAt, p.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("create placement: %w", err)
	}

	return p, nil
}

// UpdatePlacement met à jour un placement existant.
func (s *Service) UpdatePlacement(ctx context.Context, p *Placement) (*Placement, error) {
	if strings.TrimSpace(p.ID) == "" || strings.TrimSpace(p.Slot) == "" || strings.TrimSpace(p.Title) == "" {
		return nil, ErrInvalidPlacement
	}

	p.UpdatedAt = time.Now().UTC()

	query := `
		UPDATE in_app_placements
		SET slot = $2, format = $3, type = $4, title = $5, body = $6,
		    cta_label = $7, cta_url = $8, target_audience = $9, priority = $10,
		    is_active = $11, dismissible = $12, starts_at = $13, ends_at = $14, updated_at = $15
		WHERE id = $1
	`
	tag, err := s.pool.Exec(
		ctx, query,
		p.ID, p.Slot, p.Format, p.Type, p.Title, p.Body,
		p.CTALabel, p.CTAURL, p.TargetAudience, p.Priority,
		p.IsActive, p.Dismissible, p.StartsAt, p.EndsAt, p.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("update placement: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return nil, ErrPlacementNotFound
	}

	return p, nil
}

// DeletePlacement supprime un placement.
func (s *Service) DeletePlacement(ctx context.Context, id string) error {
	if strings.TrimSpace(id) == "" {
		return ErrInvalidPlacement
	}

	tag, err := s.pool.Exec(ctx, `DELETE FROM in_app_placements WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("delete placement: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrPlacementNotFound
	}
	return nil
}

// CheckSuperadmin vérifie que l'utilisateur a le rôle superadmin.
func (s *Service) CheckSuperadmin(ctx context.Context, userID string) error {
	var role string
	err := s.pool.QueryRow(ctx, `SELECT role FROM "User" WHERE id = $1::uuid`, userID).Scan(&role)
	if err != nil {
		return ErrForbidden
	}
	if role != "superadmin" {
		return ErrForbidden
	}
	return nil
}

