// Package posts — assemblage des DTO FeedPost.
//
// L'assemblage vit ICI (pas dans feed) pour garantir UNE SEULE shape de post
// dans toute l'API : `/v1/feed`, `/v1/posts/{id}/thread`, `/v1/posts/{id}`,
// les créations et réponses renvoient tous des `FeedPost` construits par les
// mêmes fonctions — fini le double shape `Thought`/`FeedPost` qui forçait le
// mobile à normaliser deux formes différentes (voir docs/API_CONTRACT.md §8).
package posts

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	db "github.com/qoefi/api/internal/database"
)

// ParentIDOf renvoie l'ID parent d'une ligne (nil si aucun).
func ParentIDOf(r *db.GetPostsByIDsRow) *string {
	if r.ParentId.Valid && r.ParentId.String != "" {
		v := r.ParentId.String
		return &v
	}
	return nil
}

// RootIDOf renvoie l'ID racine d'une ligne (nil si aucun).
func RootIDOf(r *db.GetPostsByIDsRow) *string {
	if r.RootId.Valid && r.RootId.String != "" {
		v := r.RootId.String
		return &v
	}
	return nil
}

// RepostIDOf renvoie l'ID reposté d'une ligne (nil si aucun).
func RepostIDOf(r *db.GetPostsByIDsRow) *string {
	if r.RepostId.Valid && r.RepostId.String != "" {
		v := r.RepostId.String
		return &v
	}
	return nil
}

// AuthorOf construit l'auteur dénormalisé d'une ligne de post.
func AuthorOf(r *db.GetPostsByIDsRow, following map[string]bool) Author {
	return Author{
		ID:          r.AuthorID,
		Name:        pgtypeTextPtr(r.AuthorName),
		Username:    pgtypeTextPtr(r.AuthorUsername),
		LogoURL:     pgtypeTextPtr(r.AuthorLogo),
		IsCertified: r.AuthorCertified,
		IsFollowing: following[r.AuthorID],
	}
}

// BuildFeedPost construit le DTO complet d'une pensée (miroir Prisma), avec
// l'état du viewer (liked/reposted) et l'état follow de l'auteur.
func BuildFeedPost(r *db.GetPostsByIDsRow, all map[string]*db.GetPostsByIDsRow, attachments map[string][]Attachment, polls map[string]*Poll, following map[string]bool) FeedPost {
	fp := FeedPost{
		ID:               r.ID,
		Content:          r.Content,
		AuthorID:         r.AuthorId,
		CreatedAt:        r.CreatedAt.Time.Format(time.RFC3339),
		Tags:             r.Tags,
		ImageURL:         pgtypeTextPtr(r.ImageUrl),
		LikeCount:        int(r.LikeCount),
		RepostCount:      int(r.RepostCount),
		ReplyCount:       int(r.ReplyCount),
		ParentID:         ParentIDOf(r),
		RootID:           RootIDOf(r),
		RepostID:         RepostIDOf(r),
		ReplyRestriction: r.ReplyRestriction,
		IsPinned:         r.IsPinned,
		IsHiddenByAuthor: r.IsHiddenByAuthor,
		Author:           AuthorOf(r, following),
		Attachments:      attachments[r.ID],
		Poll:             polls[r.ID],
		Likes:            []PostActor{},
		Reposts:          []PostActor{},
		Counts: PostCounts{
			Likes: int(r.LikeCount), Replies: int(r.ReplyCount), Reposts: int(r.RepostCount),
		},
		Liked:    r.ViewerLiked,
		Reposted: r.ViewerReposted,
	}
	if rid := RepostIDOf(r); rid != nil {
		if rp, ok := all[*rid]; ok {
			rr := BuildFeedPost(rp, all, attachments, polls, following)
			fp.Repost = &rr
		}
	}
	return fp
}

// BuildFeedPostWithAncestors construit le FeedPost d'une pensée ET chaîne
// récursivement ses ancêtres dans `Parent` (root → … → parent direct).
func BuildFeedPostWithAncestors(r *db.GetPostsByIDsRow, all map[string]*db.GetPostsByIDsRow, attachments map[string][]Attachment, polls map[string]*Poll, following map[string]bool, seen map[string]bool) FeedPost {
	fp := BuildFeedPost(r, all, attachments, polls, following)
	pid := ParentIDOf(r)
	if pid == nil || seen[r.ID] {
		return fp
	}
	if parentRow, ok := all[*pid]; ok {
		seen[r.ID] = true
		pp := BuildFeedPostWithAncestors(parentRow, all, attachments, polls, following, seen)
		fp.Parent = &pp
	}
	return fp
}

// AttachmentsFor charge les pièces jointes groupées par thoughtId.
func AttachmentsFor(ctx context.Context, q db.Querier, ids []string) (map[string][]Attachment, error) {
	out := map[string][]Attachment{}
	if len(ids) == 0 {
		return out, nil
	}
	rows, err := q.GetAttachmentsByIDs(ctx, ids)
	if err != nil {
		return nil, err
	}
	for _, a := range rows {
		att := Attachment{
			ID:        a.ID,
			ThoughtID: a.ThoughtId,
			Type:      a.Type,
			URL:       a.Url,
			AltText:   pgtypeTextPtr(a.AltText),
			Width:     pgtypeInt4Ptr(a.Width),
			Height:    pgtypeInt4Ptr(a.Height),
			Order:     int(a.Order),
		}
		out[a.ThoughtId] = append(out[a.ThoughtId], att)
	}
	return out, nil
}

// PollsFor charge et formate les sondages groupés par thoughtId.
func PollsFor(ctx context.Context, q db.Querier, ids []string, viewerID string) (map[string]*Poll, error) {
	out := map[string]*Poll{}
	if len(ids) == 0 {
		return out, nil
	}

	polls, err := q.GetPollsByIDs(ctx, ids)
	if err != nil {
		return nil, err
	}
	if len(polls) == 0 {
		return out, nil
	}

	pollIDs := make([]string, 0, len(polls))
	pollByThought := map[string]db.GetPollsByIDsRow{}
	for _, p := range polls {
		pollIDs = append(pollIDs, p.ID)
		pollByThought[p.ThoughtId] = p
	}

	options, err := q.GetPollOptionsByIDs(ctx, pollIDs)
	if err != nil {
		return nil, err
	}
	voteCounts, err := q.CountPollVotesByIDs(ctx, pollIDs)
	if err != nil {
		return nil, err
	}
	optionVotes, err := q.CountOptionVotesByIDs(ctx, pollIDs)
	if err != nil {
		return nil, err
	}
	userVotes, err := q.GetUserVotesByIDs(ctx, db.GetUserVotesByIDsParams{Column1: pollIDs, UserId: toUUID(viewerID)})
	if err != nil {
		return nil, err
	}

	totalByPoll := map[string]int{}
	for _, v := range voteCounts {
		totalByPoll[v.PollId] = int(v.Count)
	}
	votesByOption := map[string]int{}
	for _, v := range optionVotes {
		votesByOption[v.OptionId] = int(v.Count)
	}
	userVoteByPoll := map[string]string{}
	for _, v := range userVotes {
		userVoteByPoll[v.PollId] = v.OptionId
	}

	optionsByPoll := map[string][]db.PollOption{}
	for _, o := range options {
		optionsByPoll[o.PollId] = append(optionsByPoll[o.PollId], o)
	}

	now := time.Now()
	for _, p := range polls {
		total := totalByPoll[p.ID]
		var opts []PollOption
		for _, o := range optionsByPoll[p.ID] {
			vc := votesByOption[o.ID]
			percentage := 0
			if total > 0 {
				percentage = int(float64(vc) / float64(total) * 100)
			}
			opts = append(opts, PollOption{
				ID: o.ID, Text: o.Text, Order: int(o.Order), VoteCount: vc, Percentage: percentage,
			})
		}
		var userVote *string
		if uv, ok := userVoteByPoll[p.ID]; ok {
			v := uv
			userVote = &v
		}
		out[p.ThoughtId] = &Poll{
			ID:                p.ID,
			ThoughtID:         p.ThoughtId,
			ExpiresAt:         p.ExpiresAt.Time.Format(time.RFC3339),
			IsExpired:         now.After(p.ExpiresAt.Time),
			TotalVotes:        total,
			UserVotedOptionID: userVote,
			Options:           opts,
		}
	}
	return out, nil
}

// FollowingFor calcule, pour une liste d'auteurs, si le viewer les suit
// (Follows par publicationId). Renvoie un map authorID → bool.
func FollowingFor(ctx context.Context, q db.Querier, viewerID string, authorIDs []string) (map[string]bool, error) {
	out := map[string]bool{}
	if viewerID == "" || len(authorIDs) == 0 {
		return out, nil
	}
	uuids := make([]pgtype.UUID, 0, len(authorIDs))
	for _, id := range authorIDs {
		uuids = append(uuids, toUUID(id))
	}
	rows, err := q.GetFollowingStateByAuthorIDs(ctx, db.GetFollowingStateByAuthorIDsParams{
		Ids:      uuids,
		ViewerID: toUUID(viewerID),
	})
	if err != nil {
		return nil, err
	}
	for _, r := range rows {
		out[r.AuthorID] = r.IsFollowing
	}
	return out, nil
}

// pgtypeTextPtr convertit un pgtype.Text nullable en *string JSON-friendly.
func pgtypeTextPtr(t pgtype.Text) *string {
	if !t.Valid {
		return nil
	}
	v := t.String
	return &v
}

func pgtypeInt4Ptr(v pgtype.Int4) *int {
	if !v.Valid {
		return nil
	}
	i := int(v.Int32)
	return &i
}
