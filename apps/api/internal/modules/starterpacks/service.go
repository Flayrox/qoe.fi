// Package starterpacks — « packs de démarrage » (listes curées de créateurs
// à suivre, style Bluesky). Parité avec le dépôt Prisma starterPacks.ts.
package starterpacks

import (
	"context"
	"errors"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	db "github.com/qoefi/api/internal/database"
	"github.com/qoefi/api/internal/slug"
)

type PublicationBrief struct {
	ID           string  `json:"id"`
	Name         *string `json:"name"`
	Slug         string  `json:"slug"`
	Subdomain    *string `json:"subdomain"`
	CustomDomain *string `json:"customDomain"`
	LogoURL      *string `json:"logoUrl"`
	IsCertified  bool    `json:"isCertified"`
}

type PackItemUser struct {
	ID            string  `json:"id"`
	Name          *string `json:"name"`
	Username      *string `json:"username"`
	LogoURL       *string `json:"logoUrl"`
	IsCertified   bool    `json:"isCertified"`
	PublicationID *string `json:"publicationId"`
	Slug          *string `json:"slug"`
	Subdomain     *string `json:"subdomain"`
	FollowerCount int     `json:"followerCount"`
}

type PackItem struct {
	User PackItemUser `json:"user"`
}

type StarterPackDTO struct {
	ID            string     `json:"id"`
	Title         string     `json:"title"`
	Description   *string    `json:"description"`
	Icon          *string    `json:"icon"`
	Publication   PublicationBrief `json:"publication"`
	Items         []PackItem `json:"items"`
	Count         int        `json:"_count"`
	CreatedAt     string     `json:"createdAt"`
	UpdatedAt     string     `json:"updatedAt"`
}

type Service struct {
	pool pooler
	q    starterQuerier
}

func NewService(pool *pgxpool.Pool) *Service {
	return &Service{pool: pool, q: db.New(pool)}
}

func toUUID(id string) pgtype.UUID {
	u := pgtype.UUID{}
	_ = u.Scan(id)
	return u
}

func textPtr(t pgtype.Text) *string {
	if !t.Valid {
		return nil
	}
	v := t.String
	return &v
}

func tsStr(t pgtype.Timestamp) string {
	if !t.Valid {
		return ""
	}
	return t.Time.UTC().Format("2006-01-02T15:04:05.000Z")
}

// List renvoie les packs paginés (offset) avec leurs 8 premiers membres.
func (s *Service) List(ctx context.Context, limit, offset int) ([]StarterPackDTO, error) {
	rows, err := s.q.ListStarterPacks(ctx, db.ListStarterPacksParams{Limit: int32(limit), Offset: int32(offset)})
	if err != nil {
		return nil, err
	}
	out := make([]StarterPackDTO, 0, len(rows))
	for _, r := range rows {
		items, err := s.items(ctx, r.ID, 8)
		if err != nil {
			return nil, err
		}
		out = append(out, StarterPackDTO{
			ID:          r.ID,
			Title:       r.Title,
			Description: textPtr(r.Description),
			Icon:        textPtr(r.Icon),
			Publication: PublicationBrief{
				ID: r.PubID, Name: &r.PubName, Slug: r.PubSlug,
				Subdomain: textPtr(r.PubSubdomain), CustomDomain: textPtr(r.PubCustomDomain),
				LogoURL: textPtr(r.PubLogo), IsCertified: r.PubCertified,
			},
			Items:     items,
			Count:     int(r.ItemCount),
			CreatedAt: tsStr(r.CreatedAt),
			UpdatedAt: tsStr(r.UpdatedAt),
		})
	}
	return out, nil
}

// Get renvoie un pack détaillé (tous ses membres).
func (s *Service) Get(ctx context.Context, id string) (*StarterPackDTO, error) {
	r, err := s.q.GetStarterPackByID(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, errStarterPackNotFound
		}
		return nil, err
	}
	items, err := s.items(ctx, r.ID, 1000)
	if err != nil {
		return nil, err
	}
	return &StarterPackDTO{
		ID:          r.ID,
		Title:       r.Title,
		Description: textPtr(r.Description),
		Icon:        textPtr(r.Icon),
		Publication: PublicationBrief{
			ID: r.PubID, Name: &r.PubName, Slug: r.PubSlug,
			Subdomain: textPtr(r.PubSubdomain), CustomDomain: textPtr(r.PubCustomDomain),
			LogoURL: textPtr(r.PubLogo), IsCertified: r.PubCertified,
		},
		Items:     items,
		Count:     int(r.ItemCount),
		CreatedAt: tsStr(r.CreatedAt),
		UpdatedAt: tsStr(r.UpdatedAt),
	}, nil
}

func (s *Service) items(ctx context.Context, starterPackID string, limit int) ([]PackItem, error) {
	rows, err := s.q.ListStarterPackItems(ctx, starterPackID)
	if err != nil {
		return nil, err
	}
	out := make([]PackItem, 0, len(rows))
	for _, r := range rows {
		if len(out) >= limit {
			break
		}
		item := PackItem{User: PackItemUser{
			ID:            r.UserID,
			Name:          textPtr(r.UserName),
			Username:      textPtr(r.UserUsername),
			LogoURL:       textPtr(r.UserLogo),
			IsCertified:   r.UserCertified,
			FollowerCount: int(r.FollowerCount),
		}}
		pid := r.PubID
		item.User.PublicationID = &pid
		if r.PubSlug.Valid {
			sl := r.PubSlug.String
			item.User.Slug = &sl
		}
		if r.PubSubdomain.Valid {
			sd := r.PubSubdomain.String
			item.User.Subdomain = &sd
		}
		out = append(out, item)
	}
	return out, nil
}

// resolvePersonalPublication résout la publication personnelle de l'utilisateur
// (création si absente — parité publications.getOrCreatePersonalPublication).
func (s *Service) resolvePersonalPublication(ctx context.Context, userID string) (string, error) {
	var pubID pgtype.Text
	err := s.pool.QueryRow(ctx,
		`SELECT "publicationId" FROM "User" WHERE id = $1`, userID).Scan(&pubID)
	if err != nil {
		return "", err
	}
	if pubID.Valid && pubID.String != "" {
		return pubID.String, nil
	}

	var name, username pgtype.Text
	err = s.pool.QueryRow(ctx,
		`SELECT name, username FROM "User" WHERE id = $1`, userID).Scan(&name, &username)
	if err != nil {
		return "", err
	}
	base := name.String
	if base == "" {
		base = username.String
	}
	if base == "" {
		base = "creator"
	}

	var createdID string
	err = s.pool.QueryRow(ctx,
		`INSERT INTO "Publication" (id, type, name, slug, "subdomain", "heroText", "layoutStyle", "isCertified", "updatedAt")
		 VALUES (gen_random_uuid()::text, 'PERSONAL', $1, $2, NULL, NULL, 'default', false, now())
		 RETURNING id`, base, slug.Slugify(base)).Scan(&createdID)
	if err != nil {
		return "", err
	}
	_, err = s.pool.Exec(ctx,
		`UPDATE "User" SET "publicationId" = $2, "updatedAt" = now() WHERE id = $1`,
		userID, createdID)
	if err != nil {
		return "", err
	}
	return createdID, nil
}

// Create crée un pack (title requis) avec ses membres (dédupliqués).
// Le pack est rattaché à la publication personnelle de l'auteur.
func (s *Service) Create(ctx context.Context, authorID, title string, description, icon *string, userIDs []string) (*StarterPackDTO, error) {
	publicationID, err := s.resolvePersonalPublication(ctx, authorID)
	if err != nil {
		return nil, err
	}
	pack, err := s.q.CreateStarterPack(ctx, db.CreateStarterPackParams{
		Title:         strings.TrimSpace(title),
		Description:   pgtype.Text{String: textOr(description), Valid: description != nil},
		Icon:          pgtype.Text{String: textOr(icon), Valid: icon != nil},
		PublicationId: publicationID,
	})
	if err != nil {
		return nil, err
	}

	seen := map[string]bool{}
	for _, uid := range userIDs {
		if uid == "" || seen[uid] {
			continue
		}
		seen[uid] = true
		if err := s.q.InsertStarterPackItem(ctx, db.InsertStarterPackItemParams{
			StarterPackId: pack.ID,
			UserId:        toUUID(uid),
		}); err != nil {
			return nil, err
		}
	}

	return s.Get(ctx, pack.ID)
}

// FollowAll suit toutes les publications des membres du pack (idempotent).
func (s *Service) FollowAll(ctx context.Context, starterPackID, readerID string) (int, error) {
	if _, err := s.q.GetStarterPackByID(ctx, starterPackID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return 0, errStarterPackNotFound
		}
		return 0, err
	}
	res, err := s.q.FollowPublications(ctx, db.FollowPublicationsParams{
		StarterPackId: starterPackID,
		ReaderId:      toUUID(readerID),
	})
	if err != nil {
		return 0, err
	}
	return int(res), nil
}

func textOr(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}



var errStarterPackNotFound = errors.New("StarterPack not found")
