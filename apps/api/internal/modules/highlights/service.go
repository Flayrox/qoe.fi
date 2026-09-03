// Package highlights implémente le domaine des surlignages d'articles
// (annotations publiques/privées, upvotes, commentaires) — consommé par le
// mobile (lecteur d'article + bibliothèque).
package highlights

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/qoefi/api/internal/canon"
	db "github.com/qoefi/api/internal/database"
	"github.com/qoefi/api/internal/vectorfeed"
)

// Author est l'auteur d'un surlignage ou d'un commentaire d'annotation.
type Author struct {
	ID       string  `json:"id"`
	Name     *string `json:"name"`
	Username *string `json:"username"`
	LogoURL  *string `json:"logoUrl"`
}

// Highlight est un surlignage d'article (shape API).
type Highlight struct {
	ID         string  `json:"id"`
	Text       string  `json:"text"`
	Note       *string `json:"note"`
	IsPublic   bool    `json:"isPublic"`
	IsOfficial bool    `json:"isOfficial"`
	// QuoteOrdinal = quelle occurrence du passage citer (0-based) quand
	// le même texte apparaît plusieurs fois dans l'article.
	QuoteOrdinal  int    `json:"quoteOrdinal"`
	UpvotesCount  int    `json:"upvotesCount"`
	ReaderID      string `json:"readerId"`
	ArticleID     string `json:"articleId"`
	CreatedAt     string `json:"createdAt"`
	Reader        Author `json:"reader"`
	ViewerUpvoted bool   `json:"viewerUpvoted"`
	CommentsCount int    `json:"commentsCount"`
}

// AnnotationComment est un commentaire attaché à un surlignage.
type AnnotationComment struct {
	ID          string `json:"id"`
	Content     string `json:"content"`
	CreatedAt   string `json:"createdAt"`
	HighlightID string `json:"highlightId"`
	Author      Author `json:"author"`
}

// MyHighlight est un surlignage du lecteur avec l'article associé (bibliothèque).
type MyHighlight struct {
	ID                      string  `json:"id"`
	Text                    string  `json:"text"`
	Note                    *string `json:"note"`
	IsPublic                bool    `json:"isPublic"`
	IsOfficial              bool    `json:"isOfficial"`
	UpvotesCount            int     `json:"upvotesCount"`
	ReaderID                string  `json:"readerId"`
	ArticleID               string  `json:"articleId"`
	CreatedAt               string  `json:"createdAt"`
	ArticleTitle            string  `json:"articleTitle"`
	ArticleSlug             string  `json:"articleSlug"`
	PublicationID           string  `json:"publicationId"`
	PublicationName         string  `json:"publicationName"`
	PublicationSlug         string  `json:"publicationSlug"`
	PublicationSubdomain    *string `json:"subdomain"`
	PublicationCustomDomain *string `json:"customDomain"`
}

// BookmarkItem est un article sauvegardé (bibliothèque).
type BookmarkItem struct {
	BookmarkID              string  `json:"bookmarkId"`
	BookmarkedAt            string  `json:"bookmarkedAt"`
	ArticleID               string  `json:"articleId"`
	ArticleTitle            string  `json:"articleTitle"`
	ArticleSlug             string  `json:"articleSlug"`
	ArticleReadingTime      int     `json:"readingTime"`
	ArticleIsPremium        bool    `json:"isPremium"`
	ArticleCreatedAt        string  `json:"articleCreatedAt"`
	ArticleContent          string  `json:"content"`
	PublicationID           string  `json:"publicationId"`
	PublicationName         string  `json:"publicationName"`
	PublicationSlug         string  `json:"publicationSlug"`
	PublicationSubdomain    *string `json:"subdomain"`
	PublicationCustomDomain *string `json:"customDomain"`
	PublicationLogo         *string `json:"logoUrl"`
	CategoryName            *string `json:"categoryName"`
	Author                  Author  `json:"author"`
}

// Service porte les dépendances du domaine highlights.
type Service struct {
	pool *pgxpool.Pool
	q    highlightQuerier
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

func tsString(t pgtype.Timestamp) string {
	return t.Time.Format(time.RFC3339)
}

// ListByArticle retourne les surlignages d'un article : publics + les siens,
// avec l'état upvote du viewer. Auth optionnelle (viewerID peut être "").
func (s *Service) ListByArticle(ctx context.Context, articleID, viewerID string) ([]Highlight, error) {
	rows, err := s.q.ListHighlightsByArticle(ctx, db.ListHighlightsByArticleParams{
		ArticleId: articleID,
		ViewerId:  toUUID(viewerID),
	})
	if err != nil {
		return nil, err
	}
	out := make([]Highlight, 0, len(rows))
	for _, r := range rows {
		out = append(out, Highlight{
			ID:           r.ID,
			Text:         r.Text,
			Note:         textPtr(r.Note),
			IsPublic:     r.IsPublic,
			IsOfficial:   r.IsOfficial,
			QuoteOrdinal: int(r.QuoteOrdinal),
			UpvotesCount: int(r.UpvotesCount),
			ReaderID:     r.ReaderID,
			ArticleID:    r.ArticleId,
			CreatedAt:    tsString(r.CreatedAt),
			Reader: Author{
				ID:       r.ReaderID,
				Name:     textPtr(r.ReaderName),
				Username: textPtr(r.ReaderUsername),
				LogoURL:  textPtr(r.ReaderLogo),
			},
			ViewerUpvoted: r.ViewerUpvoted,
			CommentsCount: int(r.CommentsCount),
		})
	}
	return out, nil
}

// resolveAnchor canonicalise le contenu de l'article et résout le passage en
// offsets (code points) + empreinte. En cas d'échec, retourne des ancres NULL
// (le surlignage reste lisible via text + quoteOrdinal — modèle hérité).
func (s *Service) resolveAnchor(ctx context.Context, articleID, text string, quoteOrdinal int) (pgtype.Int4, pgtype.Int4, pgtype.Text) {
	var html string
	if err := s.pool.QueryRow(ctx, `SELECT "content" FROM "Article" WHERE id=$1`, articleID).Scan(&html); err != nil {
		return pgtype.Int4{}, pgtype.Int4{}, pgtype.Text{}
	}
	doc := canon.Parse(html)
	start, end, ok := doc.Find(text, quoteOrdinal)
	if !ok {
		return pgtype.Int4{}, pgtype.Int4{}, pgtype.Text{}
	}
	return pgtype.Int4{Int32: int32(start), Valid: true},
		pgtype.Int4{Int32: int32(end), Valid: true},
		pgtype.Text{String: doc.Sha, Valid: true}
}

// Create crée un surlignage pour un lecteur sur un article.
func (s *Service) Create(ctx context.Context, articleID, readerID, text string, note *string, isPublic bool, quoteOrdinal int) (Highlight, error) {
	if quoteOrdinal < 0 {
		quoteOrdinal = 0
	}
	start, end, sha := s.resolveAnchor(ctx, articleID, text, quoteOrdinal)
	id, err := s.q.CreateHighlight(ctx, db.CreateHighlightParams{
		Text:           text,
		Note:           pgtype.Text{String: deref(note), Valid: note != nil},
		IsPublic:       isPublic,
		IsOfficial:     false,
		QuoteOrdinal:   int32(quoteOrdinal),
		ReaderId:       toUUID(readerID),
		ArticleId:      articleID,
		CanonicalStart: start,
		CanonicalEnd:   end,
		ContentSha:     sha,
	})
	if err != nil {
		return Highlight{}, err
	}
	// 🧠 EMA vectorielle : surligner = l'engagement le plus profond (on a
	// vraiment lu le passage) → rapproche fortement le profil du thème.
	if readerID != "" {
		var emb string
		if err := s.pool.QueryRow(ctx, `SELECT COALESCE("embedding"::text,'') FROM "Article" WHERE id=$1`, articleID).Scan(&emb); err == nil && strings.TrimSpace(emb) != "" {
			if vec, ok := vectorfeed.ParseLit(emb); ok {
				_ = vectorfeed.ApplyInteraction(ctx, s.pool, readerID, vec, vectorfeed.InteractionHighlight)
			}
		}
	}
	row, err := s.q.GetHighlightByID(ctx, id)
	if err != nil {
		return Highlight{}, err
	}
	return Highlight{
		ID:           row.ID,
		Text:         row.Text,
		Note:         textPtr(row.Note),
		IsPublic:     row.IsPublic,
		IsOfficial:   row.IsOfficial,
		UpvotesCount: int(row.UpvotesCount),
		ReaderID:     row.ReaderID,
		ArticleID:    row.ArticleId,
		CreatedAt:    tsString(row.CreatedAt),
		Reader: Author{
			ID:       row.ReaderID,
			Name:     textPtr(row.ReaderName),
			Username: textPtr(row.ReaderUsername),
			LogoURL:  textPtr(row.ReaderLogo),
		},
		ViewerUpvoted: false,
		CommentsCount: 0,
	}, nil
}

// Delete supprime un de ses surlignages (ownership vérifié en requête).
func (s *Service) Delete(ctx context.Context, highlightID, readerID string) (bool, error) {
	rows, err := s.q.DeleteHighlight(ctx, db.DeleteHighlightParams{
		ID:       highlightID,
		ReaderId: toUUID(readerID),
	})
	if err != nil {
		return false, err
	}
	// 0 ligne affectée = surlignage inexistant OU non propriétaire.
	return rows > 0, nil
}

// Update modifie la note et/ou la visibilité d'un de ses surlignages
// (parité toggleHighlightPrivacy / updateHighlightNote Prisma).
func (s *Service) Update(ctx context.Context, highlightID, readerID string, note *string, isPublic *bool) (Highlight, error) {
	// On résout les valeurs finales AVANT l'UPDATE : la requête COALESCE ne
	// peut pas distinguer « non fourni » d'une valeur concrète pour un bool.
	current, err := s.q.GetHighlightByID(ctx, highlightID)
	if err != nil {
		return Highlight{}, err
	}
	if current.ReaderId.String() != readerID {
		return Highlight{}, errors.New("surlignage introuvable ou non autorisé")
	}
	finalNote := current.Note
	if note != nil {
		finalNote = pgtype.Text{String: *note, Valid: *note != ""}
	}
	finalPublic := current.IsPublic
	if isPublic != nil {
		finalPublic = *isPublic
	}
	if _, err := s.q.UpdateHighlight(ctx, db.UpdateHighlightParams{
		ID:       highlightID,
		ReaderId: toUUID(readerID),
		Note:     finalNote,
		IsPublic: finalPublic,
	}); err != nil {
		return Highlight{}, err
	}
	row, err := s.q.GetHighlightByID(ctx, highlightID)
	if err != nil {
		return Highlight{}, err
	}
	return Highlight{
		ID:           row.ID,
		Text:         row.Text,
		Note:         textPtr(row.Note),
		IsPublic:     row.IsPublic,
		IsOfficial:   row.IsOfficial,
		UpvotesCount: int(row.UpvotesCount),
		ReaderID:     row.ReaderID,
		ArticleID:    row.ArticleId,
		CreatedAt:    tsString(row.CreatedAt),
		Reader: Author{
			ID:       row.ReaderID,
			Name:     textPtr(row.ReaderName),
			Username: textPtr(row.ReaderUsername),
			LogoURL:  textPtr(row.ReaderLogo),
		},
		ViewerUpvoted: false,
		CommentsCount: 0,
	}, nil
}

// ToggleUpvote ajoute/retire l'upvote du viewer sur un surlignage.
// L'insertion est idempotente (ON CONFLICT DO NOTHING) : si aucune ligne
// n'est retournée, l'upvote existait déjà → on le retire. Le compteur est
// lu dans une requête séparée (les CTE PostgreSQL sont matérialisés).
func (s *Service) ToggleUpvote(ctx context.Context, highlightID, userID string) (upvoted bool, count int, err error) {
	_, err = s.q.ToggleHighlightUpvote(ctx, db.ToggleHighlightUpvoteParams{
		HighlightId: highlightID,
		UserId:      toUUID(userID),
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			// L'upvote existait déjà → retrait.
			if err := s.q.DeleteHighlightUpvote(ctx, db.DeleteHighlightUpvoteParams{
				HighlightId: highlightID,
				UserId:      toUUID(userID),
			}); err != nil {
				return false, 0, err
			}
			upvoted = false
		} else {
			return false, 0, err
		}
	} else {
		upvoted = true
	}

	n, err := s.q.CountHighlightUpvotes(ctx, highlightID)
	if err != nil {
		return upvoted, 0, err
	}
	return upvoted, int(n), nil
}

// ListComments retourne les commentaires d'un surlignage.
func (s *Service) ListComments(ctx context.Context, highlightID string) ([]AnnotationComment, error) {
	rows, err := s.q.ListAnnotationComments(ctx, highlightID)
	if err != nil {
		return nil, err
	}
	out := make([]AnnotationComment, 0, len(rows))
	for _, r := range rows {
		out = append(out, AnnotationComment{
			ID:          r.ID,
			Content:     r.Content,
			CreatedAt:   tsString(r.CreatedAt),
			HighlightID: r.HighlightId,
			Author: Author{
				ID:       r.AuthorID,
				Name:     textPtr(r.AuthorName),
				Username: textPtr(r.AuthorUsername),
				LogoURL:  textPtr(r.AuthorLogo),
			},
		})
	}
	return out, nil
}

// CreateComment ajoute un commentaire d'annotation.
func (s *Service) CreateComment(ctx context.Context, highlightID, authorID, content string) (AnnotationComment, error) {
	id, err := s.q.CreateAnnotationComment(ctx, db.CreateAnnotationCommentParams{
		Content:     content,
		HighlightId: highlightID,
		AuthorId:    toUUID(authorID),
	})
	if err != nil {
		return AnnotationComment{}, err
	}
	rows, err := s.q.ListAnnotationComments(ctx, highlightID)
	if err != nil {
		return AnnotationComment{}, err
	}
	for _, r := range rows {
		if r.ID == id {
			return AnnotationComment{
				ID:          r.ID,
				Content:     r.Content,
				CreatedAt:   tsString(r.CreatedAt),
				HighlightID: r.HighlightId,
				Author: Author{
					ID:       r.AuthorID,
					Name:     textPtr(r.AuthorName),
					Username: textPtr(r.AuthorUsername),
					LogoURL:  textPtr(r.AuthorLogo),
				},
			}, nil
		}
	}
	return AnnotationComment{}, nil
}

// DeleteComment supprime un de ses commentaires d'annotation.
func (s *Service) DeleteComment(ctx context.Context, commentID, authorID string) (bool, error) {
	rows, err := s.q.DeleteAnnotationComment(ctx, db.DeleteAnnotationCommentParams{
		ID:       commentID,
		AuthorId: toUUID(authorID),
	})
	if err != nil {
		return false, err
	}
	return rows > 0, nil
}

// MyHighlights retourne les surlignages du lecteur (bibliothèque), paginés.
func (s *Service) MyHighlights(ctx context.Context, readerID string, limit, offset int) ([]MyHighlight, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	rows, err := s.q.ListMyHighlights(ctx, db.ListMyHighlightsParams{
		ReaderId: toUUID(readerID),
		Limit:    int32(limit),
		Offset:   int32(offset),
	})
	if err != nil {
		return nil, err
	}
	out := make([]MyHighlight, 0, len(rows))
	for _, r := range rows {
		out = append(out, MyHighlight{
			ID:                      r.ID,
			Text:                    r.Text,
			Note:                    textPtr(r.Note),
			IsPublic:                r.IsPublic,
			IsOfficial:              r.IsOfficial,
			UpvotesCount:            int(r.UpvotesCount),
			ReaderID:                r.ReaderId.String(),
			ArticleID:               r.ArticleId,
			CreatedAt:               tsString(r.CreatedAt),
			ArticleTitle:            r.ArticleTitle,
			ArticleSlug:             r.ArticleSlug,
			PublicationID:           r.PublicationID,
			PublicationName:         r.PublicationName,
			PublicationSlug:         r.PublicationSlug,
			PublicationSubdomain:    textPtr(r.PublicationSubdomain),
			PublicationCustomDomain: textPtr(r.PublicationCustomDomain),
		})
	}
	return out, nil
}

// Bookmarks retourne les articles sauvegardés d'un lecteur (bibliothèque), paginés.
func (s *Service) Bookmarks(ctx context.Context, readerID string, limit, offset int) ([]BookmarkItem, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	rows, err := s.q.ListBookmarksByReader(ctx, db.ListBookmarksByReaderParams{
		ReaderId: toUUID(readerID),
		Limit:    int32(limit),
		Offset:   int32(offset),
	})
	if err != nil {
		return nil, err
	}
	out := make([]BookmarkItem, 0, len(rows))
	for _, r := range rows {
		out = append(out, BookmarkItem{
			BookmarkID:              r.BookmarkID,
			BookmarkedAt:            tsString(r.BookmarkedAt),
			ArticleID:               r.ArticleID,
			ArticleTitle:            r.ArticleTitle,
			ArticleSlug:             r.ArticleSlug,
			ArticleReadingTime:      int(r.ArticleReadingTime),
			ArticleIsPremium:        r.ArticleIsPremium,
			ArticleCreatedAt:        tsString(r.ArticleCreatedAt),
			PublicationID:           r.PublicationID,
			PublicationName:         r.PublicationName,
			PublicationSlug:         r.PublicationSlug,
			PublicationSubdomain:    textPtr(r.PublicationSubdomain),
			PublicationCustomDomain: textPtr(r.PublicationCustomDomain),
			PublicationLogo:         textPtr(r.PublicationLogo),
			ArticleContent:          r.ArticleContent,
			CategoryName:            textPtr(r.CategoryName),
			Author: Author{
				ID:       r.AuthorID,
				Name:     textPtr(r.AuthorName),
				Username: textPtr(r.AuthorUsername),
				LogoURL:  textPtr(r.AuthorLogo),
			},
		})
	}
	return out, nil
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}
