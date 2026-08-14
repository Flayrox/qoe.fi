// Package posts implémente le domaine social (pensées, likes, reposts, réponses).
package posts

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	db "github.com/qoefi/api-go/internal/database"
)

// toUUID convertit un identifiant texte en pgtype.UUID.
func toUUID(id string) pgtype.UUID {
	uuid := pgtype.UUID{}
	_ = uuid.Scan(id)
	return uuid
}

var errThoughtNotFound = errors.New("post introuvable")

// Author est l'auteur dénormalisé d'une pensée.
type Author struct {
	ID          string  `json:"id"`
	Name        *string `json:"name"`
	Username    *string `json:"username"`
	LogoURL     *string `json:"logoUrl"`
	IsCertified bool    `json:"isCertified"`
}

// Thought est la forme API d'une pensée (avec l'état du viewer).
type Thought struct {
	ID               string   `json:"id"`
	Content          string   `json:"content"`
	AuthorID         string   `json:"authorId"`
	CreatedAt        string   `json:"createdAt"`
	Tags             []string `json:"tags"`
	ImageURL         *string  `json:"imageUrl,omitempty"`
	LikeCount        int      `json:"likeCount"`
	RepostCount      int      `json:"repostCount"`
	ReplyCount       int      `json:"replyCount"`
	ParentID         string   `json:"parentId,omitempty"`
	RootID           string   `json:"rootId,omitempty"`
	RepostID         string   `json:"repostId,omitempty"`
	ReplyRestriction string   `json:"replyRestriction"`
	IsPinned         bool     `json:"isPinned"`
	IsHiddenByAuthor bool     `json:"isHiddenByAuthor"`
	Author           Author   `json:"author"`
	ViewerLiked      bool     `json:"viewerLiked"`
	ViewerReposted   bool     `json:"viewerReposted"`
}

type Service struct {
	pool *pgxpool.Pool
	q    *db.Queries
}

func NewService(pool *pgxpool.Pool) *Service {
	return &Service{pool: pool, q: db.New(pool)}
}

// Create crée une pensée (ou une réponse si parentID fourni).
func (s *Service) Create(ctx context.Context, authorID, content string, tags []string, parentID, repostID *string) (Thought, error) {
	if content == "" && repostID == nil {
		return Thought{}, errors.New("contenu requis")
	}

	var parentText, rootText, repostText pgtype.Text
	if parentID != nil {
		parentText = pgtype.Text{String: *parentID, Valid: true}
		root, _ := s.q.GetCanonicalThoughtID(ctx, *parentID)
		if root != "" {
			rootText = pgtype.Text{String: root, Valid: true}
		}
	}
	if repostID != nil {
		repostText = pgtype.Text{String: *repostID, Valid: true}
	}

	created, err := s.q.CreateThought(ctx, db.CreateThoughtParams{
		Content:           content,
		AuthorId:          authorID,
		Tags:              tags,
		ImageUrl:          pgtype.Text{},
		Visibility:        "public",
		ContentVisibility: db.ContentVisibilityPUBLIC,
		IsDraft:           false,
		ScheduledAt:       pgtype.Timestamp{},
		TriggerWarning:    pgtype.Text{},
		ParentId:          parentText,
		RootId:            rootText,
		RepostId:          repostText,
		ReplyRestriction:  "everyone",
	})
	if err != nil {
		return Thought{}, err
	}

	if parentID != nil {
		if err := s.q.IncrementReplyCount(ctx, *parentID); err != nil {
			return Thought{}, err
		}
	}

	return s.Get(ctx, created.ID, authorID)
}

// Get retourne une pensée avec son auteur et l'état du viewer.
func (s *Service) Get(ctx context.Context, id, viewerID string) (Thought, error) {
	row, err := s.q.GetThoughtByID(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Thought{}, errThoughtNotFound
		}
		return Thought{}, err
	}
	return thoughtFromGetRow(row), nil
}

// ToggleLike ajoute ou retire un like, avec mise à jour atomique du compteur.
func (s *Service) ToggleLike(ctx context.Context, postID, userID string) (bool, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return false, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	tq := s.q.WithTx(tx)

	_, err = tq.GetExistingLike(ctx, db.GetExistingLikeParams{PostId: postID, UserId: toUUID(userID)})
	if err == nil {
		if err := tq.DeleteLike(ctx, db.DeleteLikeParams{PostId: postID, UserId: toUUID(userID)}); err != nil {
			return false, err
		}
		if err := tq.DecrementLikeCount(ctx, postID); err != nil {
			return false, err
		}
		return false, tx.Commit(ctx)
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return false, err
	}

	if _, err := tq.InsertLike(ctx, db.InsertLikeParams{PostId: postID, UserId: toUUID(userID)}); err != nil {
		// Idempotence : une race a déjà inséré le like.
		if isUniqueViolation(err) {
			return true, nil
		}
		return false, err
	}
	if err := tq.IncrementLikeCount(ctx, postID); err != nil {
		return false, err
	}
	return true, tx.Commit(ctx)
}

// ToggleRepost ajoute ou retire un repost pur, avec mise à jour du compteur.
func (s *Service) ToggleRepost(ctx context.Context, postID, userID string) (bool, error) {
	canonicalID, err := s.q.GetCanonicalThoughtID(ctx, postID)
	if err != nil {
		return false, err
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return false, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	tq := s.q.WithTx(tx)

	count, err := tq.CountPureReposts(ctx, db.CountPureRepostsParams{AuthorId: userID, RepostId: pgtype.Text{String: canonicalID, Valid: true}})
	if err != nil {
		return false, err
	}

	if count > 0 {
		if err := tq.DeletePureReposts(ctx, db.DeletePureRepostsParams{AuthorId: userID, RepostId: pgtype.Text{String: canonicalID, Valid: true}}); err != nil {
			return false, err
		}
		if err := tq.DecrementRepostCount(ctx, canonicalID); err != nil {
			return false, err
		}
		return false, tx.Commit(ctx)
	}

	if _, err := tq.InsertPureRepost(ctx, db.InsertPureRepostParams{AuthorId: userID, RepostId: pgtype.Text{String: canonicalID, Valid: true}}); err != nil {
		return false, err
	}
	if err := tq.IncrementRepostCount(ctx, canonicalID); err != nil {
		return false, err
	}
	return true, tx.Commit(ctx)
}

func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		return pgErr.Code == "23505"
	}
	return false
}
