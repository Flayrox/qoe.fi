// Package admin — console superadmin (modération & management).
// Réservé au superadmin (même garde que le module devtools).
package admin

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	db "github.com/qoefi/api/internal/database"
)

var errForbidden = errors.New("réservé au superadmin")

// Service porte les opérations de la console admin.
type Service struct {
	pool *pgxpool.Pool
	q    *db.Queries
}

func NewService(pool *pgxpool.Pool) *Service {
	return &Service{pool: pool, q: db.New(pool)}
}

// DashboardCounts sont les compteurs de la page d'accueil admin (parité
// prisma.user.count / prisma.article.count / prisma.subscriber.count).
type DashboardCounts struct {
	Users             int64 `json:"users"`
	Creators          int64 `json:"creators"`
	Articles          int64 `json:"articles"`
	PremiumSubscribers int64 `json:"premiumSubscribers"`
}

// AdminUser est un utilisateur listé dans la table de modération
// (parité AdminUser TS — pages users + data-table).
type AdminUser struct {
	ID             string    `json:"id"`
	Name           *string   `json:"name"`
	Email          string    `json:"email"`
	Username       *string   `json:"username"`
	Role           string    `json:"role"`
	IsCertified    bool      `json:"isCertified"`
	IsShadowbanned bool      `json:"isShadowbanned"`
	IsSuspended    bool      `json:"isSuspended"`
	SuspendReason  *string   `json:"suspendReason"`
	Subdomain      *string   `json:"subdomain"`
	CreatedAt      string    `json:"createdAt"`
	UpdatedAt      string    `json:"updatedAt"`
}

// AdminUserDetail est la vue détaillée d'un utilisateur (page users/[id]).
type AdminUserDetail struct {
	ID                    string  `json:"id"`
	Name                  *string `json:"name"`
	Email                 string  `json:"email"`
	Username              *string `json:"username"`
	Role                  string  `json:"role"`
	IsCertified           bool    `json:"isCertified"`
	IsShadowbanned        bool    `json:"isShadowbanned"`
	IsSuspended           bool    `json:"isSuspended"`
	SuspendReason         *string `json:"suspendReason"`
	LogoURL               *string `json:"logoUrl"`
	PublicationID         *string `json:"publicationId"`
	Subdomain             *string `json:"subdomain"`
	PublicationName       *string `json:"publicationName"`
	ArticlesCount         int64   `json:"articlesCount"`
	SubscribersCount      int64   `json:"subscribersCount"`
	WalletTransactions    int64   `json:"walletTransactions"`
	RevenueCents          int64   `json:"revenueCents"`
	CreatedAt             string  `json:"createdAt"`
}

// ModerationInput porte les mises à jour de modération d'un utilisateur.
type ModerationInput struct {
	IsCertified    *bool   `json:"isCertified"`
	IsShadowbanned *bool   `json:"isShadowbanned"`
	IsSuspended    *bool   `json:"isSuspended"`
	SuspendReason  *string `json:"suspendReason"`
	PublicationCertified *bool `json:"publicationCertified"`
}

func (s *Service) checkSuperadmin(ctx context.Context, userID string) error {
	role, err := s.q.GetAdminUserRole(ctx, userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return errForbidden
		}
		return err
	}
	if role != "superadmin" {
		return errForbidden
	}
	return nil
}

// GetDashboard retourne les compteurs globaux (superadmin).
func (s *Service) GetDashboard(ctx context.Context, userID string) (*DashboardCounts, error) {
	if err := s.checkSuperadmin(ctx, userID); err != nil {
		return nil, err
	}
	row, err := s.q.AdminDashboardCounts(ctx)
	if err != nil {
		return nil, err
	}
	return &DashboardCounts{
		Users:              row.Users,
		Creators:           row.Creators,
		Articles:           row.Articles,
		PremiumSubscribers: row.PremiumSubscribers,
	}, nil
}

// ListUsers retourne tous les utilisateurs triés createdAt DESC (superadmin).
func (s *Service) ListUsers(ctx context.Context, userID string) ([]AdminUser, error) {
	if err := s.checkSuperadmin(ctx, userID); err != nil {
		return nil, err
	}
	rows, err := s.q.ListAdminUsers(ctx)
	if err != nil {
		return nil, err
	}
	users := make([]AdminUser, 0, len(rows))
	for _, r := range rows {
		users = append(users, AdminUser{
			ID:             r.ID,
			Name:           textPtr(r.Name),
			Email:          r.Email,
			Username:       textPtr(r.Username),
			Role:           r.Role,
			IsCertified:    r.IsCertified,
			IsShadowbanned: r.IsShadowbanned,
			IsSuspended:    r.IsSuspended,
			SuspendReason:  textPtr(r.SuspendReason),
			Subdomain:      textPtr(r.PublicationSubdomain),
			CreatedAt:      r.CreatedAt.Time.Format(time.RFC3339),
			UpdatedAt:      r.UpdatedAt.Time.Format(time.RFC3339),
		})
	}
	return users, nil
}

// GetUser retourne le détail d'un utilisateur + revenus (superadmin).
// ErrNotFound si l'utilisateur n'existe pas.
func (s *Service) GetUser(ctx context.Context, userID, targetID string) (*AdminUserDetail, error) {
	if err := s.checkSuperadmin(ctx, userID); err != nil {
		return nil, err
	}
	row, err := s.q.GetAdminUser(ctx, targetID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, pgx.ErrNoRows
		}
		return nil, err
	}
	var targetUUID pgtype.UUID
	if err := targetUUID.Scan(targetID); err != nil {
		return nil, err
	}
	rev, err := s.q.GetAdminUserRevenue(ctx, targetUUID)
	if err != nil {
		return nil, err
	}
	return &AdminUserDetail{
		ID:                 row.ID,
		Name:               textPtr(row.Name),
		Email:              row.Email,
		Username:           textPtr(row.Username),
		Role:               row.Role,
		IsCertified:        row.IsCertified,
		IsShadowbanned:     row.IsShadowbanned,
		IsSuspended:        row.IsSuspended,
		SuspendReason:      textPtr(row.SuspendReason),
		LogoURL:            textPtr(row.LogoUrl),
		PublicationID:      textPtr(row.PublicationId),
		Subdomain:          textPtr(row.Subdomain),
		PublicationName:    textPtr(row.PublicationName),
		ArticlesCount:      row.ArticlesCount,
		SubscribersCount:   row.SubscribersCount,
		WalletTransactions: row.WalletTransactionsCount,
		RevenueCents:       rev,
		CreatedAt:          row.CreatedAt.Time.Format(time.RFC3339),
	}, nil
}

// UpdateModeration applique les mises à jour de modération (superadmin).
func (s *Service) UpdateModeration(ctx context.Context, userID, targetID string, in ModerationInput) (*AdminUser, error) {
	if err := s.checkSuperadmin(ctx, userID); err != nil {
		return nil, err
	}

	// Lecture de l'état actuel pour ne modifier que ce qui est fourni.
	cur, err := s.q.GetAdminUser(ctx, targetID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, pgx.ErrNoRows
		}
		return nil, err
	}

	isCertified := cur.IsCertified
	if in.IsCertified != nil {
		isCertified = *in.IsCertified
	}
	isShadowbanned := cur.IsShadowbanned
	if in.IsShadowbanned != nil {
		isShadowbanned = *in.IsShadowbanned
	}
	isSuspended := cur.IsSuspended
	if in.IsSuspended != nil {
		isSuspended = *in.IsSuspended
	}
	suspendReason := cur.SuspendReason
	if in.SuspendReason != nil {
		suspendReason = pgtype.Text{String: *in.SuspendReason, Valid: true}
	}
	// Réactivation → raison effacée.
	if isSuspended == false && in.IsSuspended != nil {
		suspendReason = pgtype.Text{}
	}

	res, err := s.q.UpdateAdminUserModeration(ctx, db.UpdateAdminUserModerationParams{
		ID:             targetID,
		IsCertified:    isCertified,
		IsShadowbanned: isShadowbanned,
		IsSuspended:    isSuspended,
		SuspendReason:  suspendReason,
	})
	if err != nil {
		return nil, err
	}

	// Certification de la publication associée (le cas échéant).
	if in.PublicationCertified != nil && cur.PublicationId.Valid {
		if _, err := s.q.UpdatePublicationCertified(ctx, db.UpdatePublicationCertifiedParams{
			ID:          cur.PublicationId.String,
			IsCertified: *in.PublicationCertified,
		}); err != nil {
			return nil, err
		}
	}

	return &AdminUser{
		ID:             res.ID,
		Name:           textPtr(cur.Name),
		Email:          cur.Email,
		Username:       textPtr(cur.Username),
		Role:           res.Role,
		IsCertified:    res.IsCertified,
		IsShadowbanned: res.IsShadowbanned,
		IsSuspended:    res.IsSuspended,
		SuspendReason:  textPtr(res.SuspendReason),
		Subdomain:      textPtr(cur.Subdomain),
		CreatedAt:      cur.CreatedAt.Time.Format(time.RFC3339),
		UpdatedAt:      time.Now().UTC().Format(time.RFC3339),
	}, nil
}

func textPtr(t pgtype.Text) *string {
	if !t.Valid {
		return nil
	}
	v := t.String
	return &v
}
