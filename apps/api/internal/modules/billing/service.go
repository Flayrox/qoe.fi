// Service billing — formules (Tier) et rattachements Stripe.
//
// SQL brut assumé : le schéma existe déjà (Tier, Publisher.stripeAccountId,
// Subscriber.stripeCustomerId/stripeSubscriptionId) et ce lot n'ajoute
// AUCUNE migration. Les requêtes restent paramétrées.
package billing

import (
	"context"
	"errors"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Erreurs sentinelles (mappées en statuts HTTP par les handlers).
var (
	// ErrNotConfigured : aucune clé Stripe → 503 explicite.
	ErrNotConfigured = errors.New("paiement non configuré")
	// ErrTierNotFound : formule inexistante.
	ErrTierNotFound = errors.New("formule introuvable")
	// ErrForbidden : l'utilisateur ne gère pas cette publication.
	ErrForbidden = errors.New("publication non autorisée")
	// ErrInvalidTier : formule incomplète (nom, prix, tarif Stripe).
	ErrInvalidTier = errors.New("formule invalide")
)

// Tier est une formule d'abonnement d'une publication.
type Tier struct {
	ID                   string `json:"id"`
	Name                 string `json:"name"`
	Description          string `json:"description"`
	MonthlyPriceCents    int    `json:"monthlyPriceCents"`
	YearlyPriceCents     *int   `json:"yearlyPriceCents"`
	StripePriceIDMonthly string `json:"stripePriceIdMonthly"`
	StripePriceIDYearly  string `json:"stripePriceIdYearly"`
	PublisherID          string `json:"publisherId"`
}

// Service porte les lectures/écritures billing.
type Service struct {
	pool *pgxpool.Pool
}

// NewService construit le service (pool nil = réponses vides, jamais de panne).
func NewService(pool *pgxpool.Pool) *Service {
	return &Service{pool: pool}
}

// ListTiers renvoie les formules publiques d'une publication.
func (s *Service) ListTiers(ctx context.Context, publisherID string) ([]Tier, error) {
	if s == nil || s.pool == nil || strings.TrimSpace(publisherID) == "" {
		return []Tier{}, nil
	}
	rows, err := s.pool.Query(ctx, `
		SELECT "id", "name", COALESCE("description", ''),
		       "monthlyPriceCents", "yearlyPriceCents",
		       COALESCE("stripePriceIdMonthly", ''), COALESCE("stripePriceIdYearly", ''),
		       "publisherId"
		FROM "Tier"
		WHERE "publisherId" = $1
		ORDER BY "monthlyPriceCents" ASC`, publisherID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	tiers := []Tier{}
	for rows.Next() {
		var t Tier
		var yearly *int
		if err := rows.Scan(&t.ID, &t.Name, &t.Description, &t.MonthlyPriceCents, &yearly,
			&t.StripePriceIDMonthly, &t.StripePriceIDYearly, &t.PublisherID); err != nil {
			return nil, err
		}
		t.YearlyPriceCents = yearly
		tiers = append(tiers, t)
	}
	return tiers, rows.Err()
}

// GetTier relit une formule (refus explicite si absente).
func (s *Service) GetTier(ctx context.Context, tierID string) (Tier, error) {
	if s == nil || s.pool == nil || strings.TrimSpace(tierID) == "" {
		return Tier{}, ErrTierNotFound
	}
	var t Tier
	var yearly *int
	err := s.pool.QueryRow(ctx, `
		SELECT "id", "name", COALESCE("description", ''),
		       "monthlyPriceCents", "yearlyPriceCents",
		       COALESCE("stripePriceIdMonthly", ''), COALESCE("stripePriceIdYearly", ''),
		       "publisherId"
		FROM "Tier" WHERE "id" = $1`, tierID).
		Scan(&t.ID, &t.Name, &t.Description, &t.MonthlyPriceCents, &yearly,
			&t.StripePriceIDMonthly, &t.StripePriceIDYearly, &t.PublisherID)
	if err != nil {
		return Tier{}, ErrTierNotFound
	}
	t.YearlyPriceCents = yearly
	return t, nil
}

// CreateTierInput décrit une formule à créer (prix en centimes).
type CreateTierInput struct {
	Name                 string `json:"name"`
	Description          string `json:"description"`
	MonthlyPriceCents    int    `json:"monthlyPriceCents"`
	YearlyPriceCents     *int   `json:"yearlyPriceCents"`
	StripePriceIDMonthly string `json:"stripePriceIdMonthly"`
	StripePriceIDYearly  string `json:"stripePriceIdYearly"`
}

// CreateTier crée une formule après vérification de propriété.
func (s *Service) CreateTier(ctx context.Context, userID, publisherID string, in CreateTierInput) (Tier, error) {
	if s == nil || s.pool == nil {
		return Tier{}, errors.New("base indisponible")
	}
	if strings.TrimSpace(in.Name) == "" || in.MonthlyPriceCents <= 0 {
		return Tier{}, ErrInvalidTier
	}
	ok, err := s.CanManagePublisher(ctx, userID, publisherID)
	if err != nil {
		return Tier{}, err
	}
	if !ok {
		return Tier{}, ErrForbidden
	}

	var t Tier
	var yearly *int
	err = s.pool.QueryRow(ctx, `
		INSERT INTO "Tier" ("id", "name", "description", "monthlyPriceCents",
		                    "yearlyPriceCents", "stripePriceIdMonthly", "stripePriceIdYearly",
		                    "createdAt", "updatedAt", "publisherId")
		VALUES (gen_random_uuid()::text, $1, NULLIF($2, ''), $3, $4, NULLIF($5, ''), NULLIF($6, ''), now(), now(), $7)
		RETURNING "id", "name", COALESCE("description", ''), "monthlyPriceCents",
		          "yearlyPriceCents", COALESCE("stripePriceIdMonthly", ''),
		          COALESCE("stripePriceIdYearly", ''), "publisherId"`,
		strings.TrimSpace(in.Name), strings.TrimSpace(in.Description), in.MonthlyPriceCents,
		in.YearlyPriceCents, strings.TrimSpace(in.StripePriceIDMonthly),
		strings.TrimSpace(in.StripePriceIDYearly), publisherID).
		Scan(&t.ID, &t.Name, &t.Description, &t.MonthlyPriceCents, &yearly,
			&t.StripePriceIDMonthly, &t.StripePriceIDYearly, &t.PublisherID)
	if err != nil {
		return Tier{}, err
	}
	t.YearlyPriceCents = yearly
	return t, nil
}

// CanManagePublisher : publication personnelle de l'utilisateur, ou média
// dont il est propriétaire actif (mêmes règles que le worker Stripe).
func (s *Service) CanManagePublisher(ctx context.Context, userID, publisherID string) (bool, error) {
	if s == nil || s.pool == nil || userID == "" || publisherID == "" {
		return false, nil
	}
	var ok bool
	err := s.pool.QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1 FROM "User" u WHERE u.id = $1::uuid AND u."publisherId" = $2
			UNION
			SELECT 1 FROM "MediaMember" mm
			JOIN "Media" m ON m.id = mm."mediaId"
			WHERE mm."userId" = $1::uuid AND mm.role = 'owner' AND mm.status = 'active'
			  AND m."publisherId" = $2
		)`, userID, publisherID).Scan(&ok)
	if err != nil {
		return false, err
	}
	return ok, nil
}

// UserEmail renvoie l'email du compte (pré-remplissage Checkout).
func (s *Service) UserEmail(ctx context.Context, userID string) (string, error) {
	if s == nil || s.pool == nil || userID == "" {
		return "", nil
	}
	var email string
	err := s.pool.QueryRow(ctx,
		`SELECT COALESCE("email", '') FROM "User" WHERE id = $1::uuid`, userID).Scan(&email)
	if err != nil {
		return "", err
	}
	return email, nil
}

// PublisherStripeAccount renvoie le compte Connect de la publication.
func (s *Service) PublisherStripeAccount(ctx context.Context, publisherID string) string {
	if s == nil || s.pool == nil || publisherID == "" {
		return ""
	}
	var account string
	if err := s.pool.QueryRow(ctx,
		`SELECT COALESCE("stripeAccountId", '') FROM "Publisher" WHERE id = $1`, publisherID).
		Scan(&account); err != nil {
		return ""
	}
	return account
}

// ReaderStripeCustomer retrouve le client Stripe d'un lecteur à partir de son
// email (le plus récent abonnement connu). Vide = jamais passé par Checkout.
func (s *Service) ReaderStripeCustomer(ctx context.Context, userID string) string {
	if s == nil || s.pool == nil || userID == "" {
		return ""
	}
	var customer string
	if err := s.pool.QueryRow(ctx, `
		SELECT COALESCE(s."stripeCustomerId", '')
		FROM "Subscriber" s
		JOIN "User" u ON u."email" = s."email"
		WHERE u.id = $1::uuid AND s."stripeCustomerId" IS NOT NULL
		ORDER BY s."updatedAt" DESC
		LIMIT 1`, userID).Scan(&customer); err != nil {
		return ""
	}
	return customer
}
