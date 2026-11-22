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
	"github.com/jackc/pgx/v5"
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

// errPublisherNotFound distingue « référence inconnue » (rien à activer : la
// tâche est consommée) d'une panne de base (à rejouer par asynq).
var errPublisherNotFound = errors.New("publication introuvable")

// HandleStripeEvent traite TaskStripeEvent avec idempotence Redis.
//
// Le verrou Redis est un marqueur de SUCCÈS : il est posé avant le traitement
// (deux rejeux concurrents ne traitent pas deux fois), puis libéré si le
// traitement échoue, sans quoi l'événement serait marqué « traité » alors
// qu'il n'a rien produit et le rejeu asynq serait avalé.
func (s *StripeWorker) HandleStripeEvent(ctx context.Context, t *asynq.Task) error {
	var p queue.StripeEventPayload
	if err := json.Unmarshal(t.Payload(), &p); err != nil {
		return err
	}
	if p.EventID == "" {
		return errors.New("eventId manquant")
	}

	key := "stripe:event:" + p.EventID
	if s.rc != nil {
		ok, err := s.rc.SetNX(ctx, key, "processing", 7*24*time.Hour).Result()
		switch {
		case err != nil:
			log.Printf("[stripe] verrou d'idempotence indisponible (%s): %v — traitement sans dédup", p.EventID, err)
		case !ok:
			log.Printf("[stripe] événement déjà traité, skip %s", p.EventID)
			return nil
		}
	}

	err := s.processEvent(ctx, p)
	if err != nil && s.rc != nil {
		if delErr := s.rc.Del(ctx, key).Err(); delErr != nil {
			log.Printf("[stripe] libération du verrou %s: %v", p.EventID, delErr)
		}
	}
	return err
}

// processEvent applique l'effet métier d'un événement Stripe.
func (s *StripeWorker) processEvent(ctx context.Context, p queue.StripeEventPayload) error {
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
// Une panne de base remonte (rejeu) ; une référence inconnue rend
// errPublisherNotFound (rien à activer).
func (s *StripeWorker) resolvePublisherID(ctx context.Context, creatorRef string) (string, error) {
	pub, err := s.q.GetPublisherByID(ctx, creatorRef)
	if err == nil && pub != "" {
		return pub, nil
	}
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return "", fmt.Errorf("résolution publication %s: %w", creatorRef, err)
	}
	personal, err := s.q.GetPersonalPublisherByUserID(ctx, creatorRef)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", errPublisherNotFound
	}
	if err != nil {
		return "", fmt.Errorf("résolution publication personnelle %s: %w", creatorRef, err)
	}
	if !personal.Valid {
		return "", errPublisherNotFound
	}
	return personal.String, nil
}

// resolveOwner trouve le propriétaire à créditer : publication personnelle,
// sinon membre owner du média. Une panne remonte ; l'absence de propriétaire
// rend "" (rien à créditer, pas de rejeu inutile).
func (s *StripeWorker) resolveOwner(ctx context.Context, publisherID string) (string, error) {
	owner, err := s.q.GetPersonalOwnerForCredit(ctx, pgtype.Text{String: publisherID, Valid: true})
	if err == nil && owner.OwnerID != "" {
		return owner.OwnerID, nil
	}
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return "", fmt.Errorf("propriétaire personnel %s: %w", publisherID, err)
	}
	mediaOwner, err := s.q.GetMediaOwnerForCredit(ctx, publisherID)
	if err == nil && mediaOwner.OwnerID != "" {
		return mediaOwner.OwnerID, nil
	}
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return "", fmt.Errorf("propriétaire média %s: %w", publisherID, err)
	}
	return "", nil
}

// publisherIDForActiveEvent résout la publication d'un événement Stripe :
// ok=false quand la référence est inconnue (événement consommé, loggé), err
// non nil quand la résolution a échoué (à rejouer par asynq).
func (s *StripeWorker) publisherIDForActiveEvent(ctx context.Context, creatorRef, eventType string) (string, bool, error) {
	publisherID, err := s.resolvePublisherID(ctx, creatorRef)
	if err == nil {
		return publisherID, true, nil
	}
	if errors.Is(err, errPublisherNotFound) {
		log.Printf("[stripe] %s : publication introuvable pour %q, événement ignoré", eventType, creatorRef)
		return "", false, nil
	}
	return "", false, err
}

// creditOwner calcule la commission et crédite le wallet du propriétaire.
//
// Le solde et le mouvement sont écrits dans la MÊME transaction : un rejeu
// asynq après une écriture partielle ne peut pas créditer deux fois un wallet
// dont le mouvement manque.
func (s *StripeWorker) creditOwner(ctx context.Context, publisherID string, amountPaidCents int) error {
	ownerID, err := s.resolveOwner(ctx, publisherID)
	if err != nil {
		return err
	}
	if ownerID == "" {
		log.Printf("[stripe] aucun propriétaire à créditer pour la publication %s", publisherID)
		return nil
	}
	ownerUUID := toUUID(ownerID)
	if !ownerUUID.Valid {
		return fmt.Errorf("propriétaire %q: identifiant invalide", ownerID)
	}

	// Une SEULE définition du barème : le droit Pro (SubscriptionGrant), pas le
	// rôle du compte — sinon la commission du wallet diverge de celle du
	// Checkout (`commissionPercent`).
	feePercent := 10
	if subscriptions.HasPro(ctx, s.pool, publisherID, time.Now()) {
		feePercent = 5
	}
	fee := int64(amountPaidCents) * int64(feePercent) / 100
	credit := int(amountPaidCents) - int(fee)

	if err := pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		q := s.q.WithTx(tx)
		if err := q.IncrementWalletBalance(ctx, db.IncrementWalletBalanceParams{
			ID: ownerID, WalletBalanceCents: int32(credit),
		}); err != nil {
			return err
		}
		_, err := q.CreateWalletTransaction(ctx, db.CreateWalletTransactionParams{
			UserId: ownerUUID, AmountCents: int32(credit), Type: "DEPOSIT",
		})
		return err
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

	// Lien stable User → client Stripe (portail abonné), quel que soit le plan.
	s.rememberCustomer(ctx, metadata, customerID)

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
		// Idempotent : Stripe rejoue les webhooks, la période payée ne doit
		// pas s'allonger à chaque rejeu.
		_, err := subscriptions.EnsurePlanGrant(ctx, s.pool, subscriptions.SubjectUser, userID,
			subscriptions.PlanPlus, now, endsAt, "stripe", note, now)
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
		publisherID, ok, err := s.publisherIDForActiveEvent(ctx, creatorRef, "checkout.session.completed")
		if err != nil || !ok {
			return err
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
	metadata, _ := obj["metadata"].(map[string]any)
	// Les renouvellements rafraîchissent aussi le lien client (metadata portée
	// par l'abonnement depuis Checkout).
	s.rememberCustomer(ctx, metadata, stringVal(obj["customer"]))

	subscriptionID := stringVal(obj["id"])
	if subscriptionID == "" {
		return nil
	}
	status := strings.ToLower(stringVal(obj["status"]))
	active := status == "active" || status == "trialing"

	// Bundle Plus : chaque renouvellement (ou changement de période) étend le
	// droit jusqu'à `current_period_end`. Sans ça, Plus expirait au bout d'un
	// mois malgré le paiement.
	if active && stringVal(metadata["plan"]) == "plus" {
		if userID := stringVal(metadata["userId"]); userID != "" {
			now := time.Now().UTC()
			endsAt := periodEnd(obj, now)
			note := "stripe"
			if subscriptionID != "" {
				note = "stripe:" + subscriptionID
			}
			if _, err := subscriptions.ExtendPlanGrant(ctx, s.pool, subscriptions.SubjectUser, userID,
				subscriptions.PlanPlus, endsAt, "stripe", note, now); err != nil {
				return err
			}
		}
	}
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

	publisherID, ok, err := s.publisherIDForActiveEvent(ctx, creatorRef, "invoice.payment_succeeded")
	if err != nil || !ok {
		return err
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
	publisherID, ok, err := s.publisherIDForActiveEvent(ctx, creatorRef, "customer.subscription.deleted")
	if err != nil || !ok {
		return err
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
	publisherID, ok, err := s.publisherIDForActiveEvent(ctx, creatorRef, "invoice.payment_failed")
	if err != nil || !ok {
		return err
	}
	return s.q.SetSubscriberPremiumStatus(ctx, db.SetSubscriberPremiumStatusParams{
		PublisherId: publisherID, Email: email, IsActive: false, Status: db.SubscriptionStatusPASTDUE,
	})
}

// periodEnd lit `current_period_end` (secondes Unix). Absent/illisible :
// un mois à partir de maintenant (jamais un droit sans fin par accident).
func periodEnd(obj map[string]any, now time.Time) time.Time {
	if ts := intVal(obj["current_period_end"]); ts > 0 {
		return time.Unix(int64(ts), 0).UTC()
	}
	return now.AddDate(0, 1, 0)
}

// rememberCustomer écrit `User.stripeCustomerId`. Best-effort : si la
// migration 00091 n'est pas encore appliquée, le droit a déjà été accordé et
// on ne doit PAS faire échouer l'événement (asynq le rejouerait en boucle).
func (s *StripeWorker) rememberCustomer(ctx context.Context, metadata map[string]any, customerID string) {
	if customerID == "" {
		return
	}
	userID := stringVal(metadata["userId"])
	if userID == "" {
		return
	}
	if _, err := s.pool.Exec(ctx, `
		UPDATE "User" SET "stripeCustomerId" = $2, "updatedAt" = now()
		WHERE id = $1::uuid`, userID, customerID); err != nil {
		log.Printf("[stripe] lien client utilisateur non enregistré: %v", err)
	}
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
