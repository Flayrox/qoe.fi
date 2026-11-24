package articles

import (
	"context"
	"errors"
	"log"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	db "github.com/qoefi/api/internal/database"
	"github.com/qoefi/api/internal/notifications"
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
	if !cfg.ArticleAllowComments || !cfg.PublisherAllowComments {
		return Comment{}, errCommentsDisabled
	}

	// Un blocage, dans un sens ou dans l'autre, interdit aussi de commenter
	// l'écrit de l'autre et de répondre à ses commentaires.
	if blocked, err := s.blockedBetween(ctx, authorID, cfg.AuthorID); err != nil {
		return Comment{}, err
	} else if blocked {
		return Comment{}, errForbidden
	}
	if parentID != nil && *parentID != "" {
		// Le parent doit appartenir à CET écrit. Sans ce rattachement, une
		// réponse pouvait être accrochée au commentaire d'un autre article :
		// fil orphelin chez l'un, notification trompeuse chez l'autre. Un
		// parent introuvable ou étranger est indistinguable d'un inexistant.
		parentRow, err := s.q.GetCommentWithAuthor(ctx, *parentID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return Comment{}, errNotFound
			}
			return Comment{}, err
		}
		if parentRow.ArticleID.String != articleID {
			return Comment{}, errNotFound
		}
		if blocked, err := s.blockedBetween(ctx, authorID, parentRow.AuthorID); err != nil {
			return Comment{}, err
		} else if blocked {
			return Comment{}, errForbidden
		}
	}

	// Un commentaire est un post : l'article est la racine du CONTEXTE
	// ("rootArticleId"), le commentaire de niveau 1 est celle du FIL
	// ("rootId"). Une réponse hérite de la racine de son parent, sinon elle
	// serait elle-même sa propre racine et le fil se scinderait.
	article := pgtype.Text{String: articleID, Valid: true}
	var createdID string
	if parentID == nil || *parentID == "" {
		created, err := s.q.InsertArticleCommentRoot(ctx, db.InsertArticleCommentRootParams{
			Content:       content,
			AuthorId:      authorID,
			RootArticleId: article,
		})
		if err != nil {
			return Comment{}, err
		}
		createdID = created.ID
	} else {
		parentRow, err := s.q.GetCommentWithAuthor(ctx, *parentID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return Comment{}, errNotFound
			}
			return Comment{}, err
		}
		rootID := parentRow.ID
		if parentRow.RootID.Valid && parentRow.RootID.String != "" {
			rootID = parentRow.RootID.String
		}
		created, err := s.q.InsertArticleCommentReply(ctx, db.InsertArticleCommentReplyParams{
			Content:       content,
			AuthorId:      authorID,
			RootArticleId: article,
			ParentId:      pgtype.Text{String: parentRow.ID, Valid: true},
			RootId:        pgtype.Text{String: rootID, Valid: true},
		})
		if err != nil {
			return Comment{}, err
		}
		createdID = created.ID
		// Même compteur que les pensées : le fil et le feed lisent
		// "replyCount" sans savoir que le post est un commentaire.
		if err := s.q.IncrementReplyCount(ctx, parentRow.ID); err != nil {
			log.Printf("[articles] replyCount parent: %v", err)
		}
	}

	s.notifyComment(ctx, articleID, authorID, createdID, cfg, parentID)

	return s.getComment(ctx, createdID)
}

// ListComments renvoie tous les commentaires d'un article (flat, ordre chronologique).
// Les commentaires d'un compte bloqué (dans un sens ou dans l'autre) et ceux
// d'un compte privé non suivi sont omis pour le viewer.
func (s *Service) ListComments(ctx context.Context, articleID, viewerID string) ([]Comment, error) {
	rows, err := s.q.ListArticleComments(ctx, db.ListArticleCommentsParams{
		ArticleID: pgtype.Text{String: articleID, Valid: true},
		ViewerID:  toUUID(viewerID),
	})
	if err != nil {
		return nil, err
	}
	out := make([]Comment, 0, len(rows))
	for _, r := range rows {
		// Les deux formes de ligne sont identiques (même SELECT) : la
		// conversion est un simple changement de type généré.
		out = append(out, commentFromWithAuthorRow(db.GetCommentWithAuthorRow(r)))
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
	// Le compteur du parent est décrémenté avant la suppression : après, la
	// ligne n'existe plus pour dire à quel fil elle appartenait.
	if row, err := s.q.GetCommentWithAuthor(ctx, commentID); err == nil && row.ParentId.Valid {
		if err := s.q.DecrementReplyCount(ctx, row.ParentId.String); err != nil {
			log.Printf("[articles] replyCount parent (suppression): %v", err)
		}
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

	if err := notifications.Dispatch(ctx, s.pool, notifications.DispatchInput{
		RecipientID: recipientID,
		SenderID:    authorID,
		Type:        "COMMENT",
		ArticleID:   &articleID,
		CommentID:   &commentID,
		PublisherID: &cfg.PublisherID,
	}); err != nil {
		log.Printf("[articles] comment notif: %v", err)
	}
}

// blockedBetween indique si l'un des deux comptes a bloqué l'autre.
func (s *Service) blockedBetween(ctx context.Context, a, b string) (bool, error) {
	if a == "" || b == "" || a == b {
		return false, nil
	}
	var blocked bool
	err := s.pool.QueryRow(ctx, `SELECT is_blocked_bidirectional($1::uuid, $2::uuid)`, toUUID(a), toUUID(b)).Scan(&blocked)
	return blocked, err
}

func commentFromWithAuthorRow(r db.GetCommentWithAuthorRow) Comment {
	return Comment{
		ID:        r.ID,
		Content:   r.Content,
		CreatedAt: r.CreatedAt.Time.Format(time.RFC3339),
		UpdatedAt: r.UpdatedAt.Time.Format(time.RFC3339),
		ArticleID: r.ArticleID.String,
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
