// Package webhooks — gestion des abonnements webhooks sortants (créateurs).
// La livraison (HMAC + retries) est assurée par le worker asynq
// (internal/workers/webhook.go) ; ce module expose l'API de gestion :
// lister / s'abonner / supprimer / consulter les logs de livraison.
package webhooks

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"net/url"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	db "github.com/qoefi/api-go/internal/database"
)

var (
	errNotFound     = errors.New("webhook introuvable")
	errForbidden    = errors.New("permission insuffisante")
	errInvalidURL   = errors.New("URL invalide (http/https requis)")
	errNoEvents     = errors.New("au moins un événement requis")
	errInvalidEvent = errors.New("événement inconnu")
)

// AllowedEvents sont les événements de domaine abonnables (miroir spec OpenAPI).
var AllowedEvents = []string{
	"article.published",
	"article.updated",
	"article.deleted",
	"article.scheduled",
	"subscriber.created",
}

// WebhookItem est la forme API d'un abonnement (le secret n'y figure JAMAIS).
type WebhookItem struct {
	ID        string   `json:"id"`
	Name      string   `json:"name"`
	URL       string   `json:"url"`
	Events    []string `json:"events"`
	Active    bool     `json:"active"`
	CreatedAt string   `json:"createdAt"`
	UpdatedAt string   `json:"updatedAt"`
}

// WebhookWithSecret est la réponse de création (secret montré une seule fois).
type WebhookWithSecret struct {
	WebhookItem
	Secret string `json:"secret"`
}

// DeliveryItem est un log de livraison.
type DeliveryItem struct {
	ID           string  `json:"id"`
	Event        string  `json:"event"`
	Status       string  `json:"status"`
	HTTPStatus   *int    `json:"httpStatus"`
	ResponseBody *string `json:"responseBody"`
	Attempts     int     `json:"attempts"`
	CreatedAt    string  `json:"createdAt"`
}

type Service struct {
	q *db.Queries
}

func NewService(pool *pgxpool.Pool) *Service {
	return &Service{q: db.New(pool)}
}

// resolveRole retourne le rôle de l'utilisateur sur la publication
// ("owner" personnel ou rôle média owner/editor/writer/viewer).
func (s *Service) resolveRole(ctx context.Context, userID, publicationID string) (string, error) {
	if personal, err := s.q.GetUserPersonalPublication(ctx, userID); err == nil && personal.String == publicationID {
		return "owner", nil
	}
	role, err := s.q.GetMediaRoleForUser(ctx, db.GetMediaRoleForUserParams{
		PublicationId: publicationID, UserId: toUUID(userID),
	})
	if err != nil {
		return "", errForbidden
	}
	return role, nil
}

func toUUID(id string) pgtype.UUID {
	u := pgtype.UUID{}
	_ = u.Scan(id)
	return u
}

// canManage : seuls owner/editor gèrent les webhooks d'une publication.
func canManage(role string) bool { return role == "owner" || role == "editor" }

// List liste les abonnements webhooks d'une publication (RBAC requis).
func (s *Service) List(ctx context.Context, userID, publicationID string) ([]WebhookItem, error) {
	if _, err := s.resolveRole(ctx, userID, publicationID); err != nil {
		return nil, err
	}
	rows, err := s.q.ListWebhooksByPublication(ctx, publicationID)
	if err != nil {
		return nil, err
	}
	out := make([]WebhookItem, 0, len(rows))
	for _, r := range rows {
		out = append(out, WebhookItem{
			ID: r.ID, Name: r.Name, URL: r.Url, Events: r.Events, Active: r.Active,
			CreatedAt: r.CreatedAt.Time.Format(time.RFC3339),
			UpdatedAt: r.UpdatedAt.Time.Format(time.RFC3339),
		})
	}
	return out, nil
}

// Create crée un abonnement webhook (owner/editor requis). Le secret est
// généré côté serveur et retourné une seule fois (signature HMAC des livraisons).
func (s *Service) Create(ctx context.Context, userID, publicationID, name, rawURL string, events []string) (WebhookWithSecret, error) {
	role, err := s.resolveRole(ctx, userID, publicationID)
	if err != nil {
		return WebhookWithSecret{}, err
	}
	if !canManage(role) {
		return WebhookWithSecret{}, errForbidden
	}

	if err := validateWebhookURL(rawURL); err != nil {
		return WebhookWithSecret{}, err
	}
	if err := validateEvents(events); err != nil {
		return WebhookWithSecret{}, err
	}
	if name == "" {
		name = "Webhook"
	}

	secret, err := generateSecret()
	if err != nil {
		return WebhookWithSecret{}, err
	}

	id, err := s.q.CreateWebhook(ctx, db.CreateWebhookParams{
		PublicationId: publicationID,
		Name:          name,
		Url:           rawURL,
		Secret:        secret,
		Events:        events,
	})
	if err != nil {
		return WebhookWithSecret{}, err
	}

	now := time.Now().UTC().Format(time.RFC3339)
	return WebhookWithSecret{
		WebhookItem: WebhookItem{
			ID: id, Name: name, URL: rawURL, Events: events, Active: true,
			CreatedAt: now, UpdatedAt: now,
		},
		Secret: secret,
	}, nil
}

// Delete supprime un abonnement (owner/editor requis, publication vérifiée).
func (s *Service) Delete(ctx context.Context, userID, publicationID, id string) error {
	role, err := s.resolveRole(ctx, userID, publicationID)
	if err != nil {
		return err
	}
	if !canManage(role) {
		return errForbidden
	}
	row, err := s.q.GetWebhookByID(ctx, id)
	if err != nil {
		return errNotFound
	}
	if row.PublicationId != publicationID {
		return errNotFound
	}
	return s.q.DeleteWebhook(ctx, db.DeleteWebhookParams{ID: id, PublicationId: publicationID})
}

// ListDeliveries liste les logs de livraison d'un abonnement (RBAC requis).
func (s *Service) ListDeliveries(ctx context.Context, userID, publicationID, webhookID string, limit int) ([]DeliveryItem, error) {
	if _, err := s.resolveRole(ctx, userID, publicationID); err != nil {
		return nil, err
	}
	row, err := s.q.GetWebhookByID(ctx, webhookID)
	if err != nil {
		return nil, errNotFound
	}
	if row.PublicationId != publicationID {
		return nil, errNotFound
	}
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	rows, err := s.q.ListWebhookDeliveries(ctx, db.ListWebhookDeliveriesParams{WebhookId: webhookID, Limit: int32(limit)})
	if err != nil {
		return nil, err
	}
	out := make([]DeliveryItem, 0, len(rows))
	for _, d := range rows {
		var httpStatus *int
		if d.HttpStatus.Valid {
			v := int(d.HttpStatus.Int32)
			httpStatus = &v
		}
		var respBody *string
		if d.ResponseBody.Valid {
			v := d.ResponseBody.String
			respBody = &v
		}
		out = append(out, DeliveryItem{
			ID: d.ID, Event: d.Event, Status: d.Status,
			HTTPStatus: httpStatus, ResponseBody: respBody,
			Attempts:  int(d.Attempts),
			CreatedAt: d.CreatedAt.Time.Format(time.RFC3339),
		})
	}
	return out, nil
}

func contains(list []string, v string) bool {
	for _, s := range list {
		if s == v {
			return true
		}
	}
	return false
}

// validateWebhookURL vérifie qu'une URL est http/https avec un hôte valide.
func validateWebhookURL(rawURL string) error {
	u, err := url.Parse(rawURL)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
		return errInvalidURL
	}
	return nil
}

// validateEvents vérifie qu'au moins un événement est fourni, tous connus.
func validateEvents(events []string) error {
	if len(events) == 0 {
		return errNoEvents
	}
	for _, e := range events {
		if !contains(AllowedEvents, e) {
			return errInvalidEvent
		}
	}
	return nil
}

// generateSecret génère un secret HMAC de 32 octets (hex).
func generateSecret() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("génération secret: %w", err)
	}
	return hex.EncodeToString(b), nil
}
