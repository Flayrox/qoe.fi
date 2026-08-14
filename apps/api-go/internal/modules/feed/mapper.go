package feed

import (
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	db "github.com/qoefi/api-go/internal/database"
	"github.com/qoefi/api-go/internal/modules/posts"
)

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

// mapTrendingRows convertit les lignes FindTrendingRow en DTOs API.
func mapTrendingRows(rows []db.FindTrendingRow) []posts.Thought {
	out := make([]posts.Thought, 0, len(rows))
	for _, r := range rows {
		out = append(out, posts.Thought{
			ID:               r.ID,
			Content:          r.Content,
			AuthorID:         r.AuthorId,
			CreatedAt:        r.CreatedAt.Time.Format(time.RFC3339),
			Tags:             r.Tags,
			ImageURL:         textPtr(r.ImageUrl),
			LikeCount:        int(r.LikeCount),
			RepostCount:      int(r.RepostCount),
			ReplyCount:       int(r.ReplyCount),
			ParentID:         textVal(r.ParentId),
			RootID:           textVal(r.RootId),
			RepostID:         textVal(r.RepostId),
			ReplyRestriction: r.ReplyRestriction,
			IsPinned:         r.IsPinned,
			IsHiddenByAuthor: r.IsHiddenByAuthor,
			Author: posts.Author{
				ID:          r.AuthorID,
				Name:        textPtr(r.AuthorName),
				Username:    textPtr(r.AuthorUsername),
				LogoURL:     textPtr(r.AuthorLogo),
				IsCertified: r.AuthorCertified,
			},
			ViewerLiked:    r.ViewerLiked,
			ViewerReposted: r.ViewerReposted,
		})
	}
	return out
}

func mapRows(rows []db.FindFollowingFeedRow) []posts.Thought {
	out := make([]posts.Thought, 0, len(rows))
	for _, r := range rows {
		out = append(out, posts.Thought{
			ID:               r.ID,
			Content:          r.Content,
			AuthorID:         r.AuthorId,
			CreatedAt:        r.CreatedAt.Time.Format(time.RFC3339),
			Tags:             r.Tags,
			ImageURL:         textPtr(r.ImageUrl),
			LikeCount:        int(r.LikeCount),
			RepostCount:      int(r.RepostCount),
			ReplyCount:       int(r.ReplyCount),
			ParentID:         textVal(r.ParentId),
			RootID:           textVal(r.RootId),
			RepostID:         textVal(r.RepostId),
			ReplyRestriction: r.ReplyRestriction,
			IsPinned:         r.IsPinned,
			IsHiddenByAuthor: r.IsHiddenByAuthor,
			Author: posts.Author{
				ID:          r.AuthorID,
				Name:        textPtr(r.AuthorName),
				Username:    textPtr(r.AuthorUsername),
				LogoURL:     textPtr(r.AuthorLogo),
				IsCertified: r.AuthorCertified,
			},
			ViewerLiked:    r.ViewerLiked,
			ViewerReposted: r.ViewerReposted,
		})
	}
	return out
}
