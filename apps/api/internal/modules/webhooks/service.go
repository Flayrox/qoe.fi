// Package webhooks — abonnements webhooks sortants du dashboard créateur.
// La livraison (HMAC + retries) est assurée par le worker asynq
// (internal/workers/webhook.go) ; ce module expose l'API de gestion :
// lister / s'abonner / supprimer / toggle / tester / consulter les logs.
package webhooks

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	db "github.com/qoefi/api/internal/database"
)

var (
	errNotFound  = errors.New("webhook introuvable")
	errForbidden = errors.New("permission insuffisante")
)

// ValidWebhookEvents est la liste blanche des événements souscriptibles.
var ValidWebhookEvents = []string{
	"article.published",
	"article.updated",
	"article.deleted",
	"article.scheduled",
	"subscriber.created",
}

// Delivery est un log de livraison (statut, HTTP, corps, tentatives).
type Delivery struct {
	ID           string  `json:"id"`
	Status       string  `json:"status"`
	HTTPStatus   *int32  `json:"httpStatus"`
	Event        string  `json:"event"`
	CreatedAt    string  `json:"createdAt"`
	ResponseBody *string `json:"responseBody,omitempty"`
	Attempts     int     `json:"attempts,omitempty"`
}

// Webhook est un abonnement (le secret n'y figure JAMAIS sauf à la création).
type Webhook struct {
	ID           string     `json:"id"`
	Name         string     `json:"name"`
	URL          string     `json:"url"`
	Events       []string   `json:"events"`
	Active       bool       `json:"active"`
	CreatedAt    string     `json:"createdAt"`
	UpdatedAt    string     `json:"updatedAt,omitempty"`
	Deliveries   []Delivery `json:"deliveries"`
	LastDelivery *Delivery  `json:"lastDelivery"`
}

// TestResult est la réponse d'un ping de test.
type TestResult struct {
	Status   int    `json:"status"`
	Response string `json:"response"`
}

type Service struct {
	pool *pgxpool.Pool
	q    *db.Queries
}

func NewService(pool *pgxpool.Pool) *Service {
	return &Service{pool: pool, q: db.New(pool)}
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

// canManage : seuls owner/editor gèrent (create/delete/toggle/test) les webhooks.
func canManage(role string) bool { return role == "owner" || role == "editor" }

// List renvoie les webhooks d'une publication avec leurs livraisons récentes.
func (s *Service) List(ctx context.Context, userID, publicationID string) ([]Webhook, error) {
	if _, err := s.resolveRole(ctx, userID, publicationID); err != nil {
		return nil, err
	}
	rows, err := s.q.ListWebhooksByPublication(ctx, publicationID)
	if err != nil {
		return nil, err
	}
	out := make([]Webhook, 0, len(rows))
	for _, r := range rows {
		w := Webhook{
			ID:         r.ID,
			Name:       r.Name,
			URL:        r.Url,
			Events:     r.Events,
			Active:     r.Active,
			CreatedAt:  r.CreatedAt.Time.Format(time.RFC3339),
			UpdatedAt:  r.UpdatedAt.Time.Format(time.RFC3339),
			Deliveries: []Delivery{},
		}
		ds, err := s.q.ListWebhookDeliveries(ctx, db.ListWebhookDeliveriesParams{WebhookId: r.ID, Limit: 5})
		if err == nil {
			for _, d := range ds {
				w.Deliveries = append(w.Deliveries, deliveryFromRow(d))
			}
			if len(w.Deliveries) > 0 {
				first := w.Deliveries[0]
				w.LastDelivery = &first
			}
		}
		out = append(out, w)
	}
	return out, nil
}

// Create crée un webhook (owner/editor requis) et retourne le secret
// (affiché une seule fois, signature HMAC des livraisons).
func (s *Service) Create(ctx context.Context, userID, publicationID, name, url string, events []string) (Webhook, string, error) {
	role, err := s.resolveRole(ctx, userID, publicationID)
	if err != nil {
		return Webhook{}, "", err
	}
	if !canManage(role) {
		return Webhook{}, "", errForbidden
	}

	secret, err := newSecret()
	if err != nil {
		return Webhook{}, "", err
	}
	row, err := s.q.CreateWebhook(ctx, db.CreateWebhookParams{
		PublicationId: publicationID,
		Name:          name,
		Url:           url,
		Secret:        secret,
		Events:        events,
	})
	if err != nil {
		return Webhook{}, "", err
	}
	return Webhook{
		ID: row.ID, Name: row.Name, URL: row.Url, Events: row.Events,
		Active: row.Active, CreatedAt: row.CreatedAt.Time.Format(time.RFC3339),
		Deliveries: []Delivery{},
	}, secret, nil
}

// Delete supprime un webhook (après contrôle d'appartenance + RBAC).
func (s *Service) Delete(ctx context.Context, userID, id, publicationID string) error {
	role, err := s.resolveRole(ctx, userID, publicationID)
	if err != nil {
		return err
	}
	if !canManage(role) {
		return errForbidden
	}
	if _, err := s.ensureOwnership(ctx, id, publicationID); err != nil {
		return err
	}
	return s.q.DeleteWebhook(ctx, id)
}

// Toggle inverse l'état actif et le retourne.
func (s *Service) Toggle(ctx context.Context, userID, id, publicationID string) (bool, error) {
	role, err := s.resolveRole(ctx, userID, publicationID)
	if err != nil {
		return false, err
	}
	if !canManage(role) {
		return false, errForbidden
	}
	wh, err := s.ensureOwnership(ctx, id, publicationID)
	if err != nil {
		return false, err
	}
	next := !wh.Active
	if err := s.q.UpdateWebhookActive(ctx, db.UpdateWebhookActiveParams{ID: id, Active: next}); err != nil {
		return false, err
	}
	return next, nil
}

// Test envoie un ping signé HMAC au endpoint et enregistre la livraison.
func (s *Service) Test(ctx context.Context, userID, id, publicationID string) (TestResult, error) {
	role, err := s.resolveRole(ctx, userID, publicationID)
	if err != nil {
		return TestResult{}, err
	}
	if !canManage(role) {
		return TestResult{}, errForbidden
	}
	wh, err := s.ensureOwnership(ctx, id, publicationID)
	if err != nil {
		return TestResult{}, err
	}

	body := fmt.Sprintf(`{"event":"webhook.test","data":{"publicationId":%q},"timestamp":%q}`,
		publicationID, time.Now().UTC().Format(time.RFC3339))
	signature := signHMAC(wh.Secret, body)

	status := 0
	responseText := ""
	var respErr error

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, wh.Url, strings.NewReader(body))
	if err != nil {
		respErr = err
	} else {
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Qoe-Signature", "sha256="+signature)
		req.Header.Set("X-Qoe-Event", "webhook.test")
		req.Header.Set("User-Agent", "qoe-fi-webhook/1.0")
		client := &http.Client{Timeout: 10 * time.Second}
		res, err := client.Do(req)
		if err != nil {
			respErr = err
		} else {
			defer res.Body.Close()
			b, _ := io.ReadAll(io.LimitReader(res.Body, 4096))
			status = res.StatusCode
			responseText = string(b)
		}
	}

	deliveryStatus := "SUCCESS"
	if respErr != nil || status < 200 || status >= 300 {
		deliveryStatus = "FAILED"
	}
	if respErr != nil {
		responseText = respErr.Error()
	}

	payload, _ := json.Marshal(map[string]any{"test": true})
	httpStatus := pgtype.Int4{}
	if status != 0 {
		httpStatus = pgtype.Int4{Int32: int32(status), Valid: true}
	}
	if err := s.q.InsertWebhookDeliveryResult(ctx, db.InsertWebhookDeliveryResultParams{
		WebhookId:    id,
		Event:        "webhook.test",
		Payload:      payload,
		Status:       deliveryStatus,
		HttpStatus:   httpStatus,
		ResponseBody: pgtype.Text{String: truncate(responseText, 1000), Valid: responseText != ""},
	}); err != nil {
		log.Printf("[webhooks] enregistrement livraison test: %v", err)
	}

	if respErr != nil {
		return TestResult{Status: status, Response: truncate(responseText, 500)}, respErr
	}
	return TestResult{Status: status, Response: truncate(responseText, 500)}, nil
}

// ListDeliveries liste les logs de livraison d'un abonnement (RBAC requis).
func (s *Service) ListDeliveries(ctx context.Context, userID, publicationID, webhookID string, limit int) ([]Delivery, error) {
	if _, err := s.resolveRole(ctx, userID, publicationID); err != nil {
		return nil, err
	}
	if _, err := s.ensureOwnership(ctx, webhookID, publicationID); err != nil {
		return nil, err
	}
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	rows, err := s.q.ListWebhookDeliveries(ctx, db.ListWebhookDeliveriesParams{WebhookId: webhookID, Limit: int32(limit)})
	if err != nil {
		return nil, err
	}
	out := make([]Delivery, 0, len(rows))
	for _, d := range rows {
		out = append(out, deliveryFromRow(d))
	}
	return out, nil
}

func (s *Service) ensureOwnership(ctx context.Context, id, publicationID string) (db.Webhook, error) {
	wh, err := s.q.GetWebhook(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return db.Webhook{}, errNotFound
		}
		return db.Webhook{}, err
	}
	if wh.PublicationId != publicationID {
		return db.Webhook{}, errNotFound
	}
	return wh, nil
}

func deliveryFromRow(r db.ListWebhookDeliveriesRow) Delivery {
	var httpStatus *int32
	if r.HttpStatus.Valid {
		v := r.HttpStatus.Int32
		httpStatus = &v
	}
	d := Delivery{
		ID:         r.ID,
		Status:     r.Status,
		HTTPStatus: httpStatus,
		Event:      r.Event,
		CreatedAt:  r.CreatedAt.Time.Format(time.RFC3339),
		Attempts:   int(r.Attempts),
	}
	if r.ResponseBody.Valid {
		v := r.ResponseBody.String
		d.ResponseBody = &v
	}
	return d
}

func newSecret() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

func signHMAC(secret, body string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(body))
	return hex.EncodeToString(mac.Sum(nil))
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n]
}
