// Package workers — handlers de tâches asynq (billing Stripe).
package workers

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"time"

	"github.com/hibiken/asynq"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	db "github.com/qoefi/api-go/internal/database"
	"github.com/qoefi/api-go/internal/queue"
	"github.com/redis/go-redis/v9"
)

// StripeWorker traite les événements Stripe (entitlements + wallet).
type StripeWorker struct {
	pool *pgxpool.Pool
	q    *db.Queries
	rc   *redis.Client
}

func NewStripeWorker(pool *pgxpool.Pool, rc *redis.Client) *StripeWorker {
	return &StripeWorker{pool: pool, q: db.New(pool), rc: rc}
}

// HandleStripeEvent traite TaskStripeEvent avec idempotence Redis.
func (s *StripeWorker) HandleStripeEvent(ctx context.Context, t *asynq.Task) error {
	var p queue.StripeEventPayload
	if err := json.Unmarshal(t.Payload(), &p); err != nil {
		return err
	}
	if p.EventID == "" {
		return errors.New("eventId manquant")
	}

	// Idempotence exact-once : verrou Redis TTL 7 jours.
	if s.rc != nil {
		ok, err := s.rc.SetNX(ctx, "stripe:event:"+p.EventID, "processed", 7*24*time.Hour).Result()
		if err == nil && !ok {
			log.Printf("[stripe] événement déjà traité, skip %s", p.EventID)
			return nil
		}
	}

	switch p.EventType {
	case "invoice.payment_succeeded":
		if err := s.handlePaymentSucceeded(ctx, p.Data); err != nil {
			log.Printf("[stripe] payment_succeeded ERREUR: %v", err)
			return err
		}
		return nil
	case "customer.subscription.deleted":
		return s.handleSubscriptionDeleted(ctx, p.Data)
	case "invoice.payment_failed":
		return s.handlePaymentFailed(ctx, p.Data)
	default:
		return nil
	}
}

// resolvePublicationID mappe creatorRef (publication ou user) → publication.
func (s *StripeWorker) resolvePublicationID(ctx context.Context, creatorRef string) (string, error) {
	if pub, err := s.q.GetPublicationByID(ctx, creatorRef); err == nil && pub != "" {
		return pub, nil
	}
	personal, err := s.q.GetPersonalPublicationByUserID(ctx, creatorRef)
	if err != nil {
		return "", err
	}
	if !personal.Valid {
		return "", errors.New("publication introuvable")
	}
	return personal.String, nil
}

// creditOwner calcule la commission et crédite le wallet du propriétaire.
func (s *StripeWorker) creditOwner(ctx context.Context, publicationID string, amountPaidCents int) error {
	// Propriétaire : publication personnelle, sinon membre owner du média.
	ownerID := ""
	role := "FREE"
	if owner, err := s.q.GetPersonalOwnerForCredit(ctx, pgtype.Text{String: publicationID, Valid: true}); err == nil {
		ownerID = owner.OwnerID
		role = owner.OwnerRole
	} else if mediaOwner, err := s.q.GetMediaOwnerForCredit(ctx, publicationID); err == nil {
		ownerID = mediaOwner.OwnerID
		role = "creator"
	} else {
		return nil
	}

	plan := "FREE"
	if role == "creator" {
		plan = "PRO"
	}
	feePercent := 10
	if plan == "PRO" {
		feePercent = 5
	}
	fee := int64(amountPaidCents) * int64(feePercent) / 100
	credit := int(amountPaidCents) - int(fee)

	if err := s.q.IncrementWalletBalance(ctx, db.IncrementWalletBalanceParams{
		ID: ownerID, WalletBalanceCents: int32(credit),
	}); err != nil {
		return err
	}
	if _, err := s.q.CreateWalletTransaction(ctx, db.CreateWalletTransactionParams{
		UserId: toUUID(ownerID), AmountCents: int32(credit), Type: "DEPOSIT",
	}); err != nil {
		return err
	}
	log.Printf("[stripe] créateur %s crédité de %d€ (frais %d€)", ownerID, credit/100, int(fee)/100)
	return nil
}

func (s *StripeWorker) handlePaymentSucceeded(ctx context.Context, data map[string]any) error {
	metadata, _ := data["metadata"].(map[string]any)
	creatorRef, _ := metadata["creatorId"].(string)
	email := stringVal(data["customer_email"])
	if email == "" {
		email, _ = metadata["subscriberEmail"].(string)
	}
	if creatorRef == "" || email == "" {
		log.Printf("[stripe] payment_succeeded sans metadata: %v", metadata)
		return nil
	}

	publicationID, err := s.resolvePublicationID(ctx, creatorRef)
	if err != nil {
		return nil
	}

	amountPaid := intVal(data["amount_paid"])
	if amountPaid <= 0 {
		return nil
	}

	if _, err := s.q.UpsertSubscriberPayment(ctx, db.UpsertSubscriberPaymentParams{
		Email: email, PublicationId: publicationID, LtvCents: int32(amountPaid),
	}); err != nil {
		return fmt.Errorf("upsert subscriber: %w", err)
	}

	return s.creditOwner(ctx, publicationID, amountPaid)
}

func (s *StripeWorker) handleSubscriptionDeleted(ctx context.Context, data map[string]any) error {
	metadata, _ := data["metadata"].(map[string]any)
	creatorRef, _ := metadata["creatorId"].(string)
	email, _ := metadata["subscriberEmail"].(string)
	if creatorRef == "" || email == "" {
		return nil
	}
	publicationID, err := s.resolvePublicationID(ctx, creatorRef)
	if err != nil {
		return nil
	}
	return s.q.SetSubscriberPremiumStatus(ctx, db.SetSubscriberPremiumStatusParams{
		PublicationId: publicationID, Email: email, IsActive: false, Status: db.SubscriptionStatusCANCELED,
	})
}

func (s *StripeWorker) handlePaymentFailed(ctx context.Context, data map[string]any) error {
	metadata, _ := data["metadata"].(map[string]any)
	creatorRef, _ := metadata["creatorId"].(string)
	email := stringVal(data["customer_email"])
	if email == "" {
		email, _ = metadata["subscriberEmail"].(string)
	}
	if creatorRef == "" || email == "" {
		return nil
	}
	publicationID, err := s.resolvePublicationID(ctx, creatorRef)
	if err != nil {
		return nil
	}
	return s.q.SetSubscriberPremiumStatus(ctx, db.SetSubscriberPremiumStatusParams{
		PublicationId: publicationID, Email: email, IsActive: false, Status: db.SubscriptionStatusPASTDUE,
	})
}

func stringVal(v any) string {
	if s, ok := v.(string); ok {
		return s
	}
	return ""
}

func toUUID(id string) pgtype.UUID {
	u := pgtype.UUID{}
	_ = u.Scan(id)
	return u
}

func intVal(v any) int {
	switch n := v.(type) {
	case float64:
		return int(n)
	case int:
		return n
	case int64:
		return int(n)
	}
	return 0
}
