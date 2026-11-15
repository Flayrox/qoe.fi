// Package workers — handlers de tâches asynq (billing Stripe).
package workers

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/hibiken/asynq"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	db "github.com/qoefi/api/internal/database"
	"github.com/qoefi/api/internal/queue"
	"github.com/qoefi/api/internal/subscriptions"
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
	case "checkout.session.completed":
		if err := s.handleCheckoutCompleted(ctx, p.Data); err != nil {
			log.Printf("[stripe] checkout.session.completed ERREUR: %v", err)
			return err
		}
		return nil
	case "customer.subscription.updated":
		return s.handleSubscriptionUpdated(ctx, p.Data)
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

// resolvePublisherID mappe creatorRef (publication ou user) → publication.
func (s *StripeWorker) resolvePublisherID(ctx context.Context, creatorRef string) (string, error) {
	if pub, err := s.q.GetPublisherByID(ctx, creatorRef); err == nil && pub != "" {
		return pub, nil
	}
	personal, err := s.q.GetPersonalPublisherByUserID(ctx, creatorRef)
	if err != nil {
		return "", err
	}
	if !personal.Valid {
		return "", errors.New("publication introuvable")
	}
	return personal.String, nil
}

// creditOwner calcule la commission et crédite le wallet du propriétaire.
func (s *StripeWorker) creditOwner(ctx context.Context, publisherID string, amountPaidCents int) error {
	// Propriétaire : publication personnelle, sinon membre owner du média.
	ownerID := ""
	role := "FREE"
	if owner, err := s.q.GetPersonalOwnerForCredit(ctx, pgtype.Text{String: publisherID, Valid: true}); err == nil {
		ownerID = owner.OwnerID
		role = owner.OwnerRole
	} else if mediaOwner, err := s.q.GetMediaOwnerForCredit(ctx, publisherID); err == nil {
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

// stripeObject descend dans `data.object` (forme réelle des événements
// Stripe). Les anciens payloads aplatis restent acceptés : on retombe sur
// `data` lui-même quand `object` est absent.
func stripeObject(data map[string]any) map[string]any {
	if data == nil {
		return map[string]any{}
	}
	if obj, ok := data["object"].(map[string]any); ok {
		return obj
	}
	return data
}

// handleCheckoutCompleted active le droit acheté : abonnement à une
// publication (Subscriber premium + ids Stripe) ou bundle lecteur Plus
// (octroi `subscriptions`, source unique des droits).
func (s *StripeWorker) handleCheckoutCompleted(ctx context.Context, data map[string]any) error {
	obj := stripeObject(data)
	metadata, _ := obj["metadata"].(map[string]any)
	plan := stringVal(metadata["plan"])
	customerID := stringVal(obj["customer"])
	subscriptionID := stringVal(obj["subscription"])

	switch plan {
	case "plus":
		userID := stringVal(metadata["userId"])
		if userID == "" {
			return nil
		}
		now := time.Now().UTC()
		// Période payée : un mois (le renouvellement rejoue l'événement).
		endsAt := now.AddDate(0, 1, 0)
		note := "stripe"
		if subscriptionID != "" {
			note = "stripe:" + subscriptionID
		}
		_, err := subscriptions.GrantPlan(ctx, s.pool, subscriptions.SubjectUser, userID,
			subscriptions.PlanPlus, now, &endsAt, "stripe", note, now)
		return err

	case "publication":
		creatorRef := stringVal(metadata["creatorId"])
		email := stringVal(obj["customer_email"])
		if email == "" {
			email = stringVal(metadata["subscriberEmail"])
		}
		if creatorRef == "" || email == "" {
			return nil
		}
		publisherID, err := s.resolvePublisherID(ctx, creatorRef)
		if err != nil {
			return nil
		}
		amount := intVal(obj["amount_total"])
		if _, err := s.q.UpsertSubscriberPayment(ctx, db.UpsertSubscriberPaymentParams{
			Email: email, PublisherId: publisherID, LtvCents: int32(amount),
		}); err != nil {
			return fmt.Errorf("upsert subscriber: %w", err)
		}
		// Les ids Stripe ne sont pas des miroirs de droit (isPremium est
		// déjà posé par l'upsert) : ils servent au portail et au prochain
		// `customer.subscription.*`.
		_, err = s.pool.Exec(ctx, `
			UPDATE "Subscriber"
			SET "stripeCustomerId" = NULLIF($3, ''),
			    "stripeSubscriptionId" = NULLIF($4, ''),
			    "tierId" = NULLIF($5, ''),
			    "updatedAt" = now()
			WHERE "publisherId" = $1 AND email = $2`,
			publisherID, email, customerID, subscriptionID, stringVal(metadata["tierId"]))
		return err
	}
	return nil
}

// handleSubscriptionUpdated aligne l'accès sur le statut Stripe (renouvelé,
// impayé, annulé). Le lien se fait par l'id d'abonnement, pas par metadata :
// les événements de cycle de vie n'ont pas toujours le contexte de la session.
func (s *StripeWorker) handleSubscriptionUpdated(ctx context.Context, data map[string]any) error {
	obj := stripeObject(data)
	subscriptionID := stringVal(obj["id"])
	if subscriptionID == "" {
		return nil
	}
	status := strings.ToLower(stringVal(obj["status"]))
	active := status == "active" || status == "trialing"
	_, err := s.pool.Exec(ctx, `
		UPDATE "Subscriber"
		SET "isPremium" = $2,
		    "isActive" = $2,
		    status = CASE WHEN $2 THEN 'ACTIVE'::"SubscriptionStatus" ELSE 'CANCELED'::"SubscriptionStatus" END,
		    "updatedAt" = now()
		WHERE "stripeSubscriptionId" = $1`, subscriptionID, active)
	return err
}

func (s *StripeWorker) handlePaymentSucceeded(ctx context.Context, data map[string]any) error {
	data = stripeObject(data)
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

	publisherID, err := s.resolvePublisherID(ctx, creatorRef)
	if err != nil {
		return nil
	}

	amountPaid := intVal(data["amount_paid"])
	if amountPaid <= 0 {
		return nil
	}

	if _, err := s.q.UpsertSubscriberPayment(ctx, db.UpsertSubscriberPaymentParams{
		Email: email, PublisherId: publisherID, LtvCents: int32(amountPaid),
	}); err != nil {
		return fmt.Errorf("upsert subscriber: %w", err)
	}

	return s.creditOwner(ctx, publisherID, amountPaid)
}

func (s *StripeWorker) handleSubscriptionDeleted(ctx context.Context, data map[string]any) error {
	data = stripeObject(data)
	metadata, _ := data["metadata"].(map[string]any)
	creatorRef, _ := metadata["creatorId"].(string)
	email, _ := metadata["subscriberEmail"].(string)
	if creatorRef == "" || email == "" {
		return nil
	}
	publisherID, err := s.resolvePublisherID(ctx, creatorRef)
	if err != nil {
		return nil
	}
	return s.q.SetSubscriberPremiumStatus(ctx, db.SetSubscriberPremiumStatusParams{
		PublisherId: publisherID, Email: email, IsActive: false, Status: db.SubscriptionStatusCANCELED,
	})
}

func (s *StripeWorker) handlePaymentFailed(ctx context.Context, data map[string]any) error {
	data = stripeObject(data)
	metadata, _ := data["metadata"].(map[string]any)
	creatorRef, _ := metadata["creatorId"].(string)
	email := stringVal(data["customer_email"])
	if email == "" {
		email, _ = metadata["subscriberEmail"].(string)
	}
	if creatorRef == "" || email == "" {
		return nil
	}
	publisherID, err := s.resolvePublisherID(ctx, creatorRef)
	if err != nil {
		return nil
	}
	return s.q.SetSubscriberPremiumStatus(ctx, db.SetSubscriberPremiumStatusParams{
		PublisherId: publisherID, Email: email, IsActive: false, Status: db.SubscriptionStatusPASTDUE,
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
