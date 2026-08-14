package posts

import (
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	db "github.com/qoefi/api-go/internal/database"
)

// textPtr convertit un pgtype.Text nullable en *string JSON-friendly.
func textVal(t pgtype.Text) string {
	if !t.Valid {
		return ""
	}
	return t.String
}

func textPtr(t pgtype.Text) *string {
	if !t.Valid {
		return nil
	}
	v := t.String
	return &v
}

func timePtr(t pgtype.Timestamp) *string {
	if !t.Valid {
		return nil
	}
	v := t.Time.Format(time.RFC3339)
	return &v
}

// thoughtFromGetRow convertit une ligne GetThoughtByIDRow en DTO API.
func thoughtFromGetRow(row db.GetThoughtByIDRow) Thought {
	t := Thought{
		ID:               row.ID,
		Content:          row.Content,
		AuthorID:         row.AuthorId,
		CreatedAt:        row.CreatedAt.Time.Format(time.RFC3339),
		Tags:             row.Tags,
		ImageURL:         textPtr(row.ImageUrl),
		LikeCount:        int(row.LikeCount),
		RepostCount:      int(row.RepostCount),
		ReplyCount:       int(row.ReplyCount),
		ParentID:         textVal(row.ParentId),
		RootID:           textVal(row.RootId),
		RepostID:         textVal(row.RepostId),
		ReplyRestriction: row.ReplyRestriction,
		IsPinned:         row.IsPinned,
		IsHiddenByAuthor: row.IsHiddenByAuthor,
		Author: Author{
			ID:          row.AuthorID,
			Name:        textPtr(row.AuthorName),
			Username:    textPtr(row.AuthorUsername),
			LogoURL:     textPtr(row.AuthorLogo),
			IsCertified: row.AuthorCertified,
		},
	}
	return t
}
