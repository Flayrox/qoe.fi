package home

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/hibiken/asynq"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	db "github.com/qoefi/api/internal/database"
)

type Service struct {
	pool pooler
	q    *db.Queries

	// events (optionnel) : client asynq pour émettre l'événement
	// subscriber.created (webhooks créateur). Nil en tests → aucun enqueue.
	events *asynq.Client
}

func NewService(pool *pgxpool.Pool) *Service {
	return &Service{pool: pool, q: db.New(pool)}
}

// SetEventEmitter branche l'émission de l'événement subscriber.created
// (chaîne : /internal/events/subscriber-created → asynq → workers webhook).
func (s *Service) SetEventEmitter(client *asynq.Client) {
	s.events = client
}

type SystemConfig map[string]string

func (s *Service) GetSystemConfig(ctx context.Context) (SystemConfig, error) {
	rows, err := s.pool.Query(ctx, `SELECT key, value FROM "SystemConfig"`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	m := make(SystemConfig)
	for rows.Next() {
		var k, v string
		if err := rows.Scan(&k, &v); err == nil {
			m[k] = v
		}
	}
	return m, rows.Err()
}

// GlobalAnnouncement est le seul réglage système exposé publiquement par la
// page d'accueil. Le reste de SystemConfig reste réservé à l'administration.
type GlobalAnnouncement struct {
	ID       string  `json:"id"`
	Message  string  `json:"message"`
	Type     string  `json:"type,omitempty"`
	LinkURL  *string `json:"linkUrl,omitempty"`
	LinkText *string `json:"linkText,omitempty"`
}

// GetGlobalAnnouncement lit l'annonce globale sans passer par PostgREST. Une
// annonce absente, inactive, incomplète ou malformée vaut absence d'annonce :
// le bandeau ne doit jamais afficher un brouillon ou un JSON cassé.
func (s *Service) GetGlobalAnnouncement(ctx context.Context) (*GlobalAnnouncement, error) {
	var raw string
	err := s.pool.QueryRow(ctx, `SELECT value FROM "SystemConfig" WHERE key = 'GLOBAL_ANNOUNCEMENT'`).Scan(&raw)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}

	var stored struct {
		ID       string  `json:"id"`
		Active   bool    `json:"active"`
		Message  string  `json:"message"`
		Type     string  `json:"type"`
		LinkURL  *string `json:"linkUrl"`
		LinkText *string `json:"linkText"`
	}
	if err := json.Unmarshal([]byte(raw), &stored); err != nil {
		return nil, nil
	}
	if !stored.Active || stored.ID == "" || stored.Message == "" {
		return nil, nil
	}
	return &GlobalAnnouncement{
		ID: stored.ID, Message: stored.Message, Type: stored.Type,
		LinkURL: stored.LinkURL, LinkText: stored.LinkText,
	}, nil
}

type TrendItem struct {
	ID        string `json:"id"`
	Hashtag   string `json:"hashtag"`
	Count     int32  `json:"count"`
	CreatedAt string `json:"createdAt"`
	UpdatedAt string `json:"updatedAt"`
}

func (s *Service) GetTrends(ctx context.Context, limit int) ([]TrendItem, error) {
	if limit <= 0 {
		limit = 5
	}
	rows, err := s.pool.Query(ctx, `SELECT id, hashtag, count, "createdAt", "updatedAt" FROM "Trend" ORDER BY count DESC LIMIT $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []TrendItem
	for rows.Next() {
		var t TrendItem
		var createdAt, updatedAt pgtype.Timestamp
		if err := rows.Scan(&t.ID, &t.Hashtag, &t.Count, &createdAt, &updatedAt); err == nil {
			if createdAt.Valid {
				t.CreatedAt = createdAt.Time.Format(time.RFC3339)
			}
			if updatedAt.Valid {
				t.UpdatedAt = updatedAt.Time.Format(time.RFC3339)
			}
			out = append(out, t)
		}
	}
	if out == nil {
		out = []TrendItem{}
	}
	return out, rows.Err()
}

type PartnerPromoItem struct {
	ID          string  `json:"id"`
	Title       string  `json:"title"`
	Description string  `json:"description"`
	CtaText     *string `json:"ctaText"`
	CtaUrl      *string `json:"ctaUrl"`
	ImageUrl    *string `json:"imageUrl"`
	IsActive    bool    `json:"isActive"`
}

func (s *Service) GetPromos(ctx context.Context, limit int) ([]PartnerPromoItem, error) {
	if limit <= 0 {
		limit = 3
	}
	rows, err := s.pool.Query(ctx, `SELECT id, title, description, "ctaText", "ctaUrl", "imageUrl", "isActive" FROM "PartnerPromo" WHERE "isActive"=true ORDER BY "createdAt" DESC LIMIT $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []PartnerPromoItem
	for rows.Next() {
		var p PartnerPromoItem
		var ctaText, ctaUrl, imageUrl pgtype.Text
		if err := rows.Scan(&p.ID, &p.Title, &p.Description, &ctaText, &ctaUrl, &imageUrl, &p.IsActive); err == nil {
			if ctaText.Valid {
				p.CtaText = &ctaText.String
			}
			if ctaUrl.Valid {
				p.CtaUrl = &ctaUrl.String
			}
			if imageUrl.Valid {
				p.ImageUrl = &imageUrl.String
			}
			out = append(out, p)
		}
	}
	if out == nil {
		out = []PartnerPromoItem{}
	}
	return out, rows.Err()
}
