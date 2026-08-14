package feed

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	db "github.com/qoefi/api-go/internal/database"
	"github.com/qoefi/api-go/internal/modules/posts"
)

func parentIDOf(r *db.GetPostsByIDsRow) *string {
	if r.ParentId.Valid && r.ParentId.String != "" {
		v := r.ParentId.String
		return &v
	}
	return nil
}

func rootIDOf(r *db.GetPostsByIDsRow) *string {
	if r.RootId.Valid && r.RootId.String != "" {
		v := r.RootId.String
		return &v
	}
	return nil
}

func repostIDOf(r *db.GetPostsByIDsRow) *string {
	if r.RepostId.Valid && r.RepostId.String != "" {
		v := r.RepostId.String
		return &v
	}
	return nil
}

func authorOf(r *db.GetPostsByIDsRow) posts.Author {
	return posts.Author{
		ID:          r.AuthorID,
		Name:        pgtypeTextPtr(r.AuthorName),
		Username:    pgtypeTextPtr(r.AuthorUsername),
		LogoURL:     pgtypeTextPtr(r.AuthorLogo),
		IsCertified: r.AuthorCertified,
	}
}

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

// buildSlices assemble les FeedSlice (miroir de buildFeedSlices TS).
func (s *Service) buildSlices(ctx context.Context, targetIDs []string, viewerID string) ([]posts.FeedSlice, error) {
	if len(targetIDs) == 0 {
		return []posts.FeedSlice{}, nil
	}

	baseRows, err := s.q.GetPostsByIDs(ctx, db.GetPostsByIDsParams{Ids: targetIDs, ViewerID: toUUID(viewerID)})
	if err != nil {
		return nil, err
	}

	// ids manquants (parent/root/repost)
	have := map[string]bool{}
	for _, id := range targetIDs {
		have[id] = true
	}
	missing := map[string]bool{}
	addMissing := func(ids ...*string) {
		for _, id := range ids {
			if id != nil && !have[*id] {
				missing[*id] = true
			}
		}
	}
	for i := range baseRows {
		r := &baseRows[i]
		addMissing(parentIDOf(r), rootIDOf(r), repostIDOf(r))
	}
	var missingIDs []string
	for id := range missing {
		missingIDs = append(missingIDs, id)
	}

	all := map[string]*db.GetPostsByIDsRow{}
	for i := range baseRows {
		all[baseRows[i].ID] = &baseRows[i]
	}
	if len(missingIDs) > 0 {
		extraRows, err := s.q.GetPostsByIDs(ctx, db.GetPostsByIDsParams{Ids: missingIDs, ViewerID: toUUID(viewerID)})
		if err != nil {
			return nil, err
		}
		for i := range extraRows {
			all[extraRows[i].ID] = &extraRows[i]
		}
	}

	allIDs := append(append([]string{}, targetIDs...), missingIDs...)
	attachments, err := s.attachmentsFor(ctx, allIDs)
	if err != nil {
		return nil, err
	}
	polls, err := s.pollsFor(ctx, allIDs, viewerID)
	if err != nil {
		return nil, err
	}

	seenRoot := map[string]bool{}
	var slices []posts.FeedSlice

	for i := range baseRows {
		r := &baseRows[i]
		target := buildFeedPost(r, all, attachments, polls)

		var parent, root *posts.FeedPost
		if pid := parentIDOf(r); pid != nil {
			if p, ok := all[*pid]; ok {
				pp := buildFeedPost(p, all, attachments, polls)
				parent = &pp
			}
		}
		if rid := rootIDOf(r); rid != nil && (parent == nil || *rid != *parentIDOf(r)) {
			if rp, ok := all[*rid]; ok {
				rr := buildFeedPost(rp, all, attachments, polls)
				root = &rr
			}
		}

		isIncomplete := false
		hidden := 0
		if parent != nil && rootIDOf(r) != nil {
			parentRoot := ""
			if parent.RootID != nil {
				parentRoot = *parent.RootID
			}
			if parentRoot != *rootIDOf(r) && parent.ID != *rootIDOf(r) {
				isIncomplete = true
				hidden = int(r.ReplyCount)
				if hidden < 1 {
					hidden = 1
				}
			}
		}

		conversationRoot := r.ID
		if root != nil {
			conversationRoot = root.ID
		} else if rootIDOf(r) != nil {
			conversationRoot = *rootIDOf(r)
		} else if parent != nil {
			conversationRoot = parent.ID
		}
		if seenRoot[conversationRoot] {
			continue
		}
		seenRoot[conversationRoot] = true

		slices = append(slices, posts.FeedSlice{
			ID:                      r.ID,
			RootPost:                root,
			ParentPost:              parent,
			TargetPost:              target,
			IsIncompleteThread:      isIncomplete,
			HiddenIntermediateCount: hidden,
		})
	}

	return slices, nil
}

// buildFeedPost construit le DTO complet d'une pensée de feed.
func buildFeedPost(r *db.GetPostsByIDsRow, all map[string]*db.GetPostsByIDsRow, attachments map[string][]posts.Attachment, polls map[string]*posts.Poll) posts.FeedPost {
	fp := posts.FeedPost{
		ID:               r.ID,
		Content:          r.Content,
		AuthorID:         r.AuthorId,
		CreatedAt:        r.CreatedAt.Time.Format(time.RFC3339),
		Tags:             r.Tags,
		ImageURL:         pgtypeTextPtr(r.ImageUrl),
		LikeCount:        int(r.LikeCount),
		RepostCount:      int(r.RepostCount),
		ReplyCount:       int(r.ReplyCount),
		ParentID:         parentIDOf(r),
		RootID:           rootIDOf(r),
		RepostID:         repostIDOf(r),
		ReplyRestriction: r.ReplyRestriction,
		IsPinned:         r.IsPinned,
		IsHiddenByAuthor: r.IsHiddenByAuthor,
		Author:           authorOf(r),
		Attachments:      attachments[r.ID],
		Poll:             polls[r.ID],
		Likes:            []posts.PostActor{},
		Reposts:          []posts.PostActor{},
		Counts: posts.PostCounts{
			Likes: int(r.LikeCount), Replies: int(r.ReplyCount), Reposts: int(r.RepostCount),
		},
		Liked:    r.ViewerLiked,
		Reposted: r.ViewerReposted,
	}
	if r.ViewerLiked {
		fp.Likes = append(fp.Likes, posts.PostActor{UserID: r.AuthorID})
	}
	if r.ViewerReposted {
		fp.Reposts = append(fp.Reposts, posts.PostActor{ID: r.ID})
	}
	if rid := repostIDOf(r); rid != nil {
		if rp, ok := all[*rid]; ok {
			rr := buildFeedPost(rp, all, attachments, polls)
			fp.Repost = &rr
		}
	}
	return fp
}

// attachmentsFor charge les pièces jointes groupées par thoughtId.
func (s *Service) attachmentsFor(ctx context.Context, ids []string) (map[string][]posts.Attachment, error) {
	out := map[string][]posts.Attachment{}
	if len(ids) == 0 {
		return out, nil
	}
	rows, err := s.q.GetAttachmentsByIDs(ctx, ids)
	if err != nil {
		return nil, err
	}
	for _, a := range rows {
		att := posts.Attachment{
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

// pollsFor charge et formate les sondages groupés par thoughtId.
func (s *Service) pollsFor(ctx context.Context, ids []string, viewerID string) (map[string]*posts.Poll, error) {
	out := map[string]*posts.Poll{}
	if len(ids) == 0 {
		return out, nil
	}

	polls, err := s.q.GetPollsByIDs(ctx, ids)
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

	options, err := s.q.GetPollOptionsByIDs(ctx, pollIDs)
	if err != nil {
		return nil, err
	}
	voteCounts, err := s.q.CountPollVotesByIDs(ctx, pollIDs)
	if err != nil {
		return nil, err
	}
	optionVotes, err := s.q.CountOptionVotesByIDs(ctx, pollIDs)
	if err != nil {
		return nil, err
	}
	userVotes, err := s.q.GetUserVotesByIDs(ctx, db.GetUserVotesByIDsParams{Column1: pollIDs, UserId: toUUID(viewerID)})
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
		var opts []posts.PollOption
		for _, o := range optionsByPoll[p.ID] {
			vc := votesByOption[o.ID]
			percentage := 0
			if total > 0 {
				percentage = int(float64(vc) / float64(total) * 100)
			}
			opts = append(opts, posts.PollOption{
				ID: o.ID, Text: o.Text, Order: int(o.Order), VoteCount: vc, Percentage: percentage,
			})
		}
		var userVote *string
		if uv, ok := userVoteByPoll[p.ID]; ok {
			v := uv
			userVote = &v
		}
		out[p.ThoughtId] = &posts.Poll{
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
