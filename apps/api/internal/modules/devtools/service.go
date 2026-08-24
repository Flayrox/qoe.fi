// Package devtools — inspecteur de données du panneau DevTools (dev-only).
// Lecture seule, réservée au superadmin. Miroir Go de getDevtoolsData
// (packages/db/src/devtools.ts).
package devtools

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

// Service porte les opérations de l'inspecteur DevTools.
type Service struct {
	pool *pgxpool.Pool
	q    *db.Queries
}

func NewService(pool *pgxpool.Pool) *Service {
	return &Service{pool: pool, q: db.New(pool)}
}

// DevtoolsUser est un utilisateur listé par l'inspecteur (parité DevtoolsUser TS).
type DevtoolsUser struct {
	ID           string  `json:"id"`
	Name         *string `json:"name"`
	Email        string  `json:"email"`
	Username     *string `json:"username"`
	Role         string  `json:"role"`
	Subdomain    *string `json:"subdomain"`
	CustomDomain *string `json:"customDomain"`
	AccentColor  *string `json:"accentColor"`
	LayoutStyle  *string `json:"layoutStyle"`
	CreatedAt    string  `json:"createdAt"`
}

// DevtoolsStats sont les compteurs de la base (parité DevtoolsStats TS).
type DevtoolsStats struct {
	Users       int64 `json:"users"`
	Articles    int64 `json:"articles"`
	Posts       int64 `json:"posts"`
	Likes       int64 `json:"likes"`
	Subscribers int64 `json:"subscribers"`
}

// Data est la réponse complète de l'inspecteur.
type Data struct {
	Users []DevtoolsUser `json:"users"`
	Stats DevtoolsStats  `json:"stats"`
}

// GetData retourne les utilisateurs + compteurs. ErrForbidden si le user
// n'est pas superadmin.
func (s *Service) GetData(ctx context.Context, userID string) (*Data, error) {
	role, err := s.q.GetUserRole(ctx, userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, errForbidden
		}
		return nil, err
	}
	if role != "superadmin" {
		return nil, errForbidden
	}

	rows, err := s.q.ListDevtoolsUsers(ctx)
	if err != nil {
		return nil, err
	}
	users := make([]DevtoolsUser, 0, len(rows))
	for _, r := range rows {
		users = append(users, DevtoolsUser{
			ID:           r.ID,
			Name:         textPtr(r.Name),
			Email:        r.Email,
			Username:     textPtr(r.Username),
			Role:         r.Role,
			Subdomain:    textPtr(r.Subdomain),
			CustomDomain: textPtr(r.CustomDomain),
			AccentColor:  textPtr(r.AccentColor),
			LayoutStyle:  textPtr(r.LayoutStyle),
			CreatedAt:    r.CreatedAt.Time.Format(time.RFC3339),
		})
	}

	counts := make([]int64, 0, 5)
	for _, f := range []func(context.Context) (int64, error){
		s.q.CountDevtoolsUsers, s.q.CountDevtoolsArticles, s.q.CountDevtoolsThoughts,
		s.q.CountDevtoolsLikes, s.q.CountDevtoolsSubscribers,
	} {
		n, err := f(ctx)
		if err != nil {
			return nil, err
		}
		counts = append(counts, n)
	}

	return &Data{
		Users: users,
		Stats: DevtoolsStats{
			Users: counts[0], Articles: counts[1], Posts: counts[2],
			Likes: counts[3], Subscribers: counts[4],
		},
	}, nil
}

func textPtr(t pgtype.Text) *string {
	if !t.Valid {
		return nil
	}
	v := t.String
	return &v
}
