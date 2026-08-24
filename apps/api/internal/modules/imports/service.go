// Package imports — import d'articles en lot (RSS / Substack / Ghost).
// Migration de apps/studio/src/app/(creator)/import/actions.ts : le parsing et
// l'assainissement HTML restent côté serveur action (logique pure, zéro DB) ;
// la création dédupliquée des articles passe ici, en Go.
package imports

import (
	"context"
	"errors"
	"log"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	db "github.com/qoefi/api/internal/database"
)

var errForbidden = errors.New("accès refusé")

type Service struct {
	pool *pgxpool.Pool
	q    *db.Queries
}

func NewService(pool *pgxpool.Pool) *Service {
	return &Service{pool: pool, q: db.New(pool)}
}

func toUUID(id string) pgtype.UUID {
	u := pgtype.UUID{}
	_ = u.Scan(id)
	return u
}

// ImportArticle est un article prêt à créer (déjà nettoyé côté client).
type ImportArticle struct {
	Title       string `json:"title"`
	Slug        string `json:"slug"`
	Content     string `json:"content"`
	ReadingTime int32  `json:"readingTime"`
}

type ImportArticlesRequest struct {
	PublicationID string           `json:"publicationId"`
	Articles      []ImportArticle `json:"articles"`
}

// canImport vérifie que l'utilisateur peut créer des articles dans la
// publication : propriétaire de sa publication personnelle OU owner/editor d'un
// média (parité analytics.canAccess).
func (s *Service) canImport(ctx context.Context, userID, publicationID string) bool {
	if personal, err := s.q.GetUserPersonalPublication(ctx, userID); err == nil && personal.String == publicationID {
		return true
	}
	role, err := s.q.GetMediaRoleForUser(ctx, db.GetMediaRoleForUserParams{
		PublicationId: publicationID, UserId: toUUID(userID),
	})
	if err != nil {
		return false
	}
	return role == "owner" || role == "editor"
}

// ImportArticles crée les articles manquants (dédup par publicationId + slug,
// parité prisma.article.findUnique + create du fallback TS). Renvoie le nombre
// d'articles réellement créés. Les doublons sont ignorés silencieusement ; un
// échec DB sur un article n'interrompt pas le lot (best-effort par article).
func (s *Service) ImportArticles(ctx context.Context, userID string, req ImportArticlesRequest) (int, error) {
	if !s.canImport(ctx, userID, req.PublicationID) {
		return 0, errForbidden
	}
	created := 0
	for _, art := range req.Articles {
		if art.Title == "" || art.Slug == "" {
			continue
		}
		if _, err := s.q.GetArticleIdByPublicationAndSlug(ctx, db.GetArticleIdByPublicationAndSlugParams{
			PublicationId: req.PublicationID, Slug: art.Slug,
		}); err == nil {
			// Déjà importé — on saute (dédup).
			continue
		} else if !errors.Is(err, pgx.ErrNoRows) {
			log.Printf("[imports] check slug %q: %v", art.Slug, err)
			continue
		}

		// Parité avec le create Prisma du fallback TS : published, PUBLIC,
		// statut par défaut (DRAFT), author = user, lecture estimée.
		if _, err := s.q.CreateArticle(ctx, db.CreateArticleParams{
			Title:                 art.Title,
			Slug:                  art.Slug,
			Content:               art.Content,
			Published:             true,
			IsPremium:             false,
			Visibility:            "PUBLIC",
			ReadingTime:           art.ReadingTime,
			AllowPublicAnnotations: true,
			AllowComments:         true,
			Status:                "DRAFT",
			PublicationId:         req.PublicationID,
			AuthorId:              toUUID(userID),
		}); err != nil {
			log.Printf("[imports] create %q: %v", art.Slug, err)
			continue
		}
		created++
	}
	return created, nil
}
