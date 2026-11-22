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
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/qoefi/api/internal/apiaccess"
	db "github.com/qoefi/api/internal/database"
	"github.com/qoefi/api/internal/middleware"
	"github.com/qoefi/api/internal/netguard"
)

var (
	errNotFound     = errors.New("webhook introuvable")
	errForbidden    = errors.New("permission insuffisante")
	errInvalidURL   = errors.New("URL invalide")
	errInvalidInput = errors.New("webhook invalide")
	errQuota        = errors.New("limite de webhooks atteinte pour cette publication")
)

const (
	// maxWebhooksPerPublisher borne l'écriture : chaque webhook actif reçoit
	// une livraison par événement, donc un compte pouvait multiplier la
	// charge sortante et la taille de la liste sans limite.
	maxWebhooksPerPublisher = 20
	maxWebhookNameRunes     = 80
	maxWebhookURLLen        = 2000
	// deliveriesPerWebhook : nombre de livraisons récentes jointes à la liste.
	deliveriesPerWebhook = 5
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
	pool       *pgxpool.Pool
	q          *db.Queries
	httpClient *http.Client
}

func NewService(pool *pgxpool.Pool) *Service {
	return &Service{pool: pool, q: db.New(pool)}
}

func (s *Service) client() *http.Client {
	if s.httpClient != nil {
		return s.httpClient
	}
	return netguard.SafeHTTPClient(10 * time.Second)
}

// resolveRole retourne le rôle de l'utilisateur sur la publication
// ("owner" personnel ou rôle média owner/editor/writer/viewer),
// ou "owner" si la requête provient d'une clé API média de cette publication.
//
// Seul `pgx.ErrNoRows` vaut « aucun rôle » : une panne de base répondait 403
// « permission insuffisante », ce qui effaçait l'incident et trompait le client.
func (s *Service) resolveRole(ctx context.Context, userID, publisherID string) (string, error) {
	if p, ok := middleware.GetPrincipal(ctx); ok && p.Type == middleware.PrincipalTypePublisher {
		if p.PublisherID != nil && *p.PublisherID == publisherID {
			return "owner", nil
		}
		return "", errForbidden
	}
	if userID == "" {
		return "", errForbidden
	}
	personal, err := s.q.GetUserPersonalPublisher(ctx, userID)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return "", err
	}
	if err == nil && personal.Valid && personal.String == publisherID {
		return "owner", nil
	}
	role, err := s.q.GetMediaRoleForUser(ctx, db.GetMediaRoleForUserParams{
		PublisherId: publisherID, UserId: toUUID(userID),
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return "", errForbidden
	}
	if err != nil {
		return "", err
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

// requireWebhookGrant vérifie que le créateur possède la permission « API
// sortante — webhooks » (User.apiGrants, modulable par l'admin) et que le
// module est actif sur la plateforme. C'est le contrôle de l'API sortante :
// sans ce grant, aucun webhook ne peut être créé ni géré.
func (s *Service) requireWebhookGrant(ctx context.Context, userID string) error {
	targetUserID := userID
	if targetUserID == "" {
		if p, ok := middleware.GetPrincipal(ctx); ok && p.Type == middleware.PrincipalTypePublisher {
			if p.CreatedByUserID != nil && *p.CreatedByUserID != "" {
				targetUserID = *p.CreatedByUserID
			}
		}
	}
	if targetUserID != "" {
		grants, err := s.q.GetUserApiGrants(ctx, targetUserID)
		if errors.Is(err, pgx.ErrNoRows) {
			return errForbidden
		}
		if err != nil {
			// Une lecture de grants impossible n'est pas un refus métier.
			return err
		}
		if !apiaccess.HasGrant(grants, apiaccess.ModuleWebhooks) {
			return errForbidden
		}
	} else {
		// Clé API média sans CreatedByUserID : vérifier qu'au moins un propriétaire du média existe, sinon refus.
		if p, ok := middleware.GetPrincipal(ctx); !ok || p.Type != middleware.PrincipalTypePublisher {
			return errForbidden
		}
	}
	if !apiaccess.IsEnabled(ctx, s.pool, apiaccess.ModuleWebhooks) {
		return errForbidden
	}
	return nil
}

// List renvoie les webhooks d'une publication avec leurs livraisons récentes.
func (s *Service) List(ctx context.Context, userID, publisherID string) ([]Webhook, error) {
	if err := s.requireWebhookGrant(ctx, userID); err != nil {
		return nil, err
	}
	if _, err := s.resolveRole(ctx, userID, publisherID); err != nil {
		return nil, err
	}
	rows, err := s.q.ListWebhooksByPublisher(ctx, publisherID)
	if err != nil {
		return nil, err
	}
	// Une seule requête pour toutes les livraisons récentes : l'ancienne
	// boucle faisait un aller-retour par webhook (N+1).
	recent, err := s.q.ListRecentDeliveriesByPublisher(ctx, db.ListRecentDeliveriesByPublisherParams{
		PublisherId: publisherID,
		Column2:     deliveriesPerWebhook,
	})
	if err != nil {
		return nil, err
	}
	byWebhook := make(map[string][]Delivery, len(rows))
	for _, d := range recent {
		byWebhook[d.WebhookId] = append(byWebhook[d.WebhookId], Delivery{
			ID:           d.ID,
			Status:       d.Status,
			HTTPStatus:   int32Ptr(d.HttpStatus),
			Event:        d.Event,
			CreatedAt:    d.CreatedAt.Time.Format(time.RFC3339),
			ResponseBody: textPtr(d.ResponseBody),
			Attempts:     int(d.Attempts),
		})
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
		if ds := byWebhook[r.ID]; len(ds) > 0 {
			w.Deliveries = ds
			first := ds[0]
			w.LastDelivery = &first
		}
		out = append(out, w)
	}
	return out, nil
}

// Create crée un webhook (owner/editor requis) et retourne le secret
// (affiché une seule fois, signature HMAC des livraisons).
func (s *Service) Create(ctx context.Context, userID, publisherID, name, url string, events []string) (Webhook, string, error) {
	// La validation vit ici, pas seulement dans le handler : tout appelant
	// (test, script, futur endpoint) doit obtenir les mêmes garanties.
	name = strings.TrimSpace(name)
	if name == "" || utf8.RuneCountInString(name) > maxWebhookNameRunes {
		return Webhook{}, "", fmt.Errorf("%w : nom requis (80 caractères maximum)", errInvalidInput)
	}
	url = strings.TrimSpace(url)
	if url == "" || len(url) > maxWebhookURLLen {
		return Webhook{}, "", fmt.Errorf("%w : URL requise (2000 caractères maximum)", errInvalidInput)
	}
	// netguard d'abord : un hôte interne doit remonter ErrUnsafeURL même en
	// http, sinon le motif de refus (SSRF) serait masqué par le schéma.
	if err := netguard.ValidateExternalURL(url); err != nil {
		return Webhook{}, "", fmt.Errorf("%w : %w", errInvalidURL, err)
	}
	if !strings.HasPrefix(strings.ToLower(url), "https://") {
		return Webhook{}, "", fmt.Errorf("%w : l'URL doit commencer par https://", errInvalidURL)
	}
	events = filterValidEvents(events)
	if len(events) == 0 {
		return Webhook{}, "", fmt.Errorf("%w : sélectionnez au moins un événement", errInvalidInput)
	}
	if err := s.requireWebhookGrant(ctx, userID); err != nil {
		return Webhook{}, "", err
	}
	role, err := s.resolveRole(ctx, userID, publisherID)
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

	// Quota et insertion dans une transaction, publication verrouillée :
	// deux créations concurrentes ne peuvent plus dépasser la limite (le
	// COUNT puis INSERT hors transaction laissait passer les deux).
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Webhook{}, "", err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	var lockedID string
	if err := tx.QueryRow(ctx, `SELECT id FROM "Publisher" WHERE id = $1 FOR UPDATE`, publisherID).Scan(&lockedID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Webhook{}, "", errForbidden
		}
		return Webhook{}, "", err
	}
	var count int
	if err := tx.QueryRow(ctx, `SELECT COUNT(*)::int FROM "Webhook" WHERE "publisherId" = $1`, publisherID).Scan(&count); err != nil {
		return Webhook{}, "", err
	}
	if count >= maxWebhooksPerPublisher {
		return Webhook{}, "", errQuota
	}
	row, err := s.q.WithTx(tx).CreateWebhook(ctx, db.CreateWebhookParams{
		PublisherId: publisherID,
		Name:        name,
		Url:         url,
		Secret:      secret,
		Events:      events,
	})
	if err != nil {
		return Webhook{}, "", err
	}
	if err := tx.Commit(ctx); err != nil {
		return Webhook{}, "", err
	}
	return Webhook{
		ID: row.ID, Name: row.Name, URL: row.Url, Events: row.Events,
		Active: row.Active, CreatedAt: row.CreatedAt.Time.Format(time.RFC3339),
		Deliveries: []Delivery{},
	}, secret, nil
}

// Delete supprime un webhook (après contrôle d'appartenance + RBAC).
func (s *Service) Delete(ctx context.Context, userID, id, publisherID string) error {
	if err := s.requireWebhookGrant(ctx, userID); err != nil {
		return err
	}
	role, err := s.resolveRole(ctx, userID, publisherID)
	if err != nil {
		return err
	}
	if !canManage(role) {
		return errForbidden
	}
	if _, err := s.ensureOwnership(ctx, id, publisherID); err != nil {
		return err
	}
	return s.q.DeleteWebhook(ctx, id)
}

// Toggle inverse l'état actif et le retourne.
func (s *Service) Toggle(ctx context.Context, userID, id, publisherID string) (bool, error) {
	if err := s.requireWebhookGrant(ctx, userID); err != nil {
		return false, err
	}
	role, err := s.resolveRole(ctx, userID, publisherID)
	if err != nil {
		return false, err
	}
	if !canManage(role) {
		return false, errForbidden
	}
	if _, err := s.ensureOwnership(ctx, id, publisherID); err != nil {
		return false, err
	}
	// Une seule instruction : l'ancien lire-puis-réécrire perdait une des
	// deux bascules concurrentes (les deux lisaient le même état).
	next, err := s.q.ToggleWebhookActive(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return false, errNotFound
		}
		return false, err
	}
	return next, nil
}

// Test envoie un ping signé HMAC au endpoint et enregistre la livraison.
func (s *Service) Test(ctx context.Context, userID, id, publisherID string) (TestResult, error) {
	if err := s.requireWebhookGrant(ctx, userID); err != nil {
		return TestResult{}, err
	}
	role, err := s.resolveRole(ctx, userID, publisherID)
	if err != nil {
		return TestResult{}, err
	}
	if !canManage(role) {
		return TestResult{}, errForbidden
	}
	wh, err := s.ensureOwnership(ctx, id, publisherID)
	if err != nil {
		return TestResult{}, err
	}
	if err := netguard.ValidateExternalURL(wh.Url); err != nil {
		return TestResult{}, fmt.Errorf("%w : %w", errInvalidURL, err)
	}

	body := fmt.Sprintf(`{"event":"webhook.test","data":{"publisherId":%q},"timestamp":%q}`,
		publisherID, time.Now().UTC().Format(time.RFC3339))
	signature := Signature(wh.Secret, []byte(body))

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
		res, err := s.client().Do(req)
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

	// On journalise le corps RÉELLEMENT envoyé : `{"test":true}` ne
	// correspondait à aucun octet transmis, donc le journal mentait.
	payload := []byte(body)
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
		ResponseBody: pgtype.Text{String: TruncateUTF8(responseText, 1000), Valid: responseText != ""},
	}); err != nil {
		log.Printf("[webhooks] enregistrement livraison test: %v", err)
	}

	if respErr != nil {
		return TestResult{Status: status, Response: TruncateUTF8(responseText, 500)}, respErr
	}
	return TestResult{Status: status, Response: TruncateUTF8(responseText, 500)}, nil
}

// ListDeliveries liste les logs de livraison d'un abonnement (RBAC requis).
func (s *Service) ListDeliveries(ctx context.Context, userID, publisherID, webhookID string, limit int) ([]Delivery, error) {
	if err := s.requireWebhookGrant(ctx, userID); err != nil {
		return nil, err
	}
	if _, err := s.resolveRole(ctx, userID, publisherID); err != nil {
		return nil, err
	}
	if _, err := s.ensureOwnership(ctx, webhookID, publisherID); err != nil {
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

func (s *Service) ensureOwnership(ctx context.Context, id, publisherID string) (db.Webhook, error) {
	wh, err := s.q.GetWebhook(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return db.Webhook{}, errNotFound
		}
		return db.Webhook{}, err
	}
	if wh.PublisherId != publisherID {
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

// Signature est l'UNIQUE implémentation de la signature HMAC des livraisons
// (`sha256=` + hex). Le worker l'utilise aussi : deux copies du même contrat
// finissent par diverger et cassent la vérification côté intégrateur.
func Signature(secret string, body []byte) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(body)
	return hex.EncodeToString(mac.Sum(nil))
}

// filterValidEvents ne garde que les événements souscriptibles, sans doublon
// et dans l'ordre fourni. L'allowlist vit ici : un abonnement à un événement
// inexistant ne produisait aucune livraison tout en donnant l'illusion d'être
// actif.
func filterValidEvents(events []string) []string {
	allowed := make(map[string]bool, len(ValidWebhookEvents))
	for _, e := range ValidWebhookEvents {
		allowed[e] = true
	}
	out := make([]string, 0, len(events))
	seen := make(map[string]bool, len(events))
	for _, e := range events {
		if allowed[e] && !seen[e] {
			seen[e] = true
			out = append(out, e)
		}
	}
	return out
}

// TruncateUTF8 coupe sur une frontière de rune : l'ancienne version coupait en
// octets et produisait un corps UTF-8 invalide dans le JSON de réponse.
func TruncateUTF8(s string, n int) string {
	if len(s) <= n {
		return s
	}
	cut := n
	for cut > 0 && !utf8.RuneStart(s[cut]) {
		cut--
	}
	return s[:cut]
}

func int32Ptr(v pgtype.Int4) *int32 {
	if !v.Valid {
		return nil
	}
	n := v.Int32
	return &n
}

func textPtr(v pgtype.Text) *string {
	if !v.Valid {
		return nil
	}
	s := v.String
	return &s
}
