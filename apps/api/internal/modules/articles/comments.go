package articles

import (
	"context"
	"errors"
	"log"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	db "github.com/qoefi/api/internal/database"
)

var errCommentsDisabled = errors.New("les commentaires sont désactivés sur cet écrit")

// CommentAuthor est l'auteur dénormalisé d'un commentaire (miroir Prisma).
type CommentAuthor struct {
	ID          string  `json:"id"`
	Name        *string `json:"name"`
	Username    *string `json:"username"`
	LogoURL     *string `json:"logoUrl"`
	IsCertified bool    `json:"isCertified"`
}

// Comment est la forme API d'un commentaire d'article (miroir Prisma).
type Comment struct {
	ID        string        `json:"id"`
	Content   string        `json:"content"`
	CreatedAt string        `json:"createdAt"`
	UpdatedAt string        `json:"updatedAt"`
	ArticleID string        `json:"articleId"`
	AuthorID  string        `json:"authorId"`
	ParentID  *string       `json:"parentId"`
	Author    CommentAuthor `json:"author"`
}

// CreateComment crée un commentaire (ou une réponse) puis notifie l'auteur
// de l'article (ou du parent pour une réponse) — notification best-effort.
func (s *Service) CreateComment(ctx context.Context, articleID, authorID, content string, parentID *string) (Comment, error) {
	cfg, err := s.q.GetArticleCommentsConfig(ctx, articleID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Comment{}, errNotFound
		}
		return Comment{}, err
	}
	if !cfg.ArticleAllowComments || !cfg.PublicationAllowComments {
		return Comment{}, errCommentsDisabled
	}

	parent := pgtype.Text{}
	if parentID != nil && *parentID != "" {
		parent = pgtype.Text{String: *parentID, Valid: true}
	}

	created, err := s.q.InsertArticleComment(ctx, db.InsertArticleCommentParams{
		Content:   content,
		ArticleId: articleID,
		AuthorId:  toUUID(authorID),
		ParentId:  parent,
	})
	if err != nil {
		return Comment{}, err
	}

	s.notifyComment(ctx, articleID, authorID, created.ID, cfg, parentID)

	return s.getComment(ctx, created.ID)
}

// ListComments renvoie tous les commentaires d'un article (flat, ordre chronologique).
func (s *Service) ListComments(ctx context.Context, articleID string) ([]Comment, error) {
	rows, err := s.q.ListArticleComments(ctx, articleID)
	if err != nil {
		return nil, err
	}
	out := make([]Comment, 0, len(rows))
	for _, r := range rows {
		out = append(out, commentFromWithAuthorRow(db.GetCommentWithAuthorRow{
			ID: r.ID, Content: r.Content, CreatedAt: r.CreatedAt, UpdatedAt: r.UpdatedAt,
			ArticleId: r.ArticleId, AuthorID: r.AuthorID, ParentId: r.ParentId,
			AuthorName: r.AuthorName, AuthorUsername: r.AuthorUsername,
			AuthorLogoUrl: r.AuthorLogoUrl, AuthorIsCertified: r.AuthorIsCertified,
		}))
	}
	return out, nil
}

// DeleteComment supprime un commentaire (auteur uniquement).
func (s *Service) DeleteComment(ctx context.Context, commentID, userID string) error {
	author, err := s.q.GetArticleCommentAuthor(ctx, commentID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return errNotFound
		}
		return err
	}
	if author != userID {
		return errForbidden
	}
	return s.q.DeleteArticleComment(ctx, commentID)
}

func (s *Service) getComment(ctx context.Context, id string) (Comment, error) {
	row, err := s.q.GetCommentWithAuthor(ctx, id)
	if err != nil {
		return Comment{}, err
	}
	return commentFromWithAuthorRow(row), nil
}

// notifyComment crée la notification COMMENT (miroir du repo TS) :
// respect des préférences + déduplication non-lue. Best-effort.
func (s *Service) notifyComment(ctx context.Context, articleID, authorID, commentID string, cfg db.GetArticleCommentsConfigRow, parentID *string) {
	recipientID := cfg.AuthorID
	if parentID != nil && *parentID != "" {
		if parentAuthor, err := s.q.GetCommentParentAuthor(ctx, *parentID); err == nil && parentAuthor != "" {
			recipientID = parentAuthor
		}
	}
	if recipientID == "" || recipientID == authorID {
		return
	}

	recipientUUID := toUUID(recipientID)
	senderUUID := toUUID(authorID)

	prefs, err := s.q.GetCommentPrefs(ctx, recipientUUID)
	if err == nil {
		if !prefs.EmailComments && !prefs.PushComments {
			return
		}
	} else if !errors.Is(err, pgx.ErrNoRows) {
		log.Printf("[articles] comment prefs: %v", err)
		return
	}

	exists, err := s.q.ExistsUnreadCommentNotification(ctx, db.ExistsUnreadCommentNotificationParams{
		RecipientId: recipientUUID,
		SenderId:    senderUUID,
		CommentId:   pgtype.Text{String: commentID, Valid: true},
	})
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		log.Printf("[articles] comment dedup: %v", err)
		return
	}
	if exists == 1 {
		return
	}

	if err := s.q.InsertCommentNotification(ctx, db.InsertCommentNotificationParams{
		RecipientId:   recipientUUID,
		SenderId:      senderUUID,
		ArticleId:     pgtype.Text{String: articleID, Valid: true},
		CommentId:     pgtype.Text{String: commentID, Valid: true},
		PublicationId: pgtype.Text{String: cfg.PublicationID, Valid: true},
	}); err != nil {
		log.Printf("[articles] comment notif: %v", err)
	}
}

func commentFromWithAuthorRow(r db.GetCommentWithAuthorRow) Comment {
	return Comment{
		ID:        r.ID,
		Content:   r.Content,
		CreatedAt: r.CreatedAt.Time.Format(time.RFC3339),
		UpdatedAt: r.UpdatedAt.Time.Format(time.RFC3339),
		ArticleID: r.ArticleId,
		AuthorID:  r.AuthorID,
		ParentID:  textPtr(r.ParentId),
		Author: CommentAuthor{
			ID:          r.AuthorID,
			Name:        textPtr(r.AuthorName),
			Username:    textPtr(r.AuthorUsername),
			LogoURL:     textPtr(r.AuthorLogoUrl),
			IsCertified: r.AuthorIsCertified,
		},
	}
}
