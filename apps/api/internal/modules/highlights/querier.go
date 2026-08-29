package highlights

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	db "github.com/qoefi/api/internal/database"
)

// highlightQuerier : surface sqlc utilisée par Service (mockable en test —
// *db.Queries l'implémente en prod).
type highlightQuerier interface {
	CountHighlightUpvotes(ctx context.Context, highlightid string) (int32, error)
	CreateAnnotationComment(ctx context.Context, arg db.CreateAnnotationCommentParams) (string, error)
	CreateHighlight(ctx context.Context, arg db.CreateHighlightParams) (string, error)
	DeleteAnnotationComment(ctx context.Context, arg db.DeleteAnnotationCommentParams) (int64, error)
	DeleteHighlight(ctx context.Context, arg db.DeleteHighlightParams) (int64, error)
	DeleteHighlightUpvote(ctx context.Context, arg db.DeleteHighlightUpvoteParams) error
	GetHighlightByID(ctx context.Context, id string) (db.GetHighlightByIDRow, error)
	ListAnnotationComments(ctx context.Context, highlightid string) ([]db.ListAnnotationCommentsRow, error)
	ListBookmarksByReader(ctx context.Context, arg db.ListBookmarksByReaderParams) ([]db.ListBookmarksByReaderRow, error)
	ListHighlightsByArticle(ctx context.Context, arg db.ListHighlightsByArticleParams) ([]db.ListHighlightsByArticleRow, error)
	ListMyHighlights(ctx context.Context, arg db.ListMyHighlightsParams) ([]db.ListMyHighlightsRow, error)
	ToggleHighlightUpvote(ctx context.Context, arg db.ToggleHighlightUpvoteParams) (int32, error)
	UpdateHighlight(ctx context.Context, arg db.UpdateHighlightParams) (db.UpdateHighlightRow, error)
}

// compile-time check : *db.Queries satisfait highlightQuerier.
var _ highlightQuerier = (*db.Queries)(nil)

// compile-time check : *pgxpool.Pool satisfait toujours pooler si nécessaire.
var _ = (*pgxpool.Pool)(nil)
