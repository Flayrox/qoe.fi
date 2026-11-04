package feed

import (
	"context"

	db "github.com/qoefi/api/internal/database"
	"github.com/qoefi/api/internal/modules/posts"
)

// buildSlices assemble les FeedSlice (miroir de buildFeedSlices TS).
// L'assemblage des FeedPost vit dans le package posts (assembly.go) — UNE
// seule shape pour tout l'API (feed, thread, posts).
func (s *Service) buildSlices(ctx context.Context, targetIDs []string, viewerID string) ([]posts.FeedSlice, error) {
	if len(targetIDs) == 0 {
		return []posts.FeedSlice{}, nil
	}

	// Fermeture complète : la pensée, ses ancêtres et toute sa chaîne de
	// citations. Une citation de citation arrive donc avec son propre
	// maillon au lieu d'un `repost` nul.
	all, err := posts.LoadPostClosure(ctx, s.q, targetIDs, viewerID)
	if err != nil {
		return nil, err
	}

	// L'ordre de la page vient du classement (`targetIDs`), jamais de la map.
	baseRows := make([]db.GetPostsByIDsRow, 0, len(targetIDs))
	for _, id := range targetIDs {
		if r, ok := all[id]; ok {
			baseRows = append(baseRows, *r)
		}
	}

	allIDs := make([]string, 0, len(all))
	for id := range all {
		allIDs = append(allIDs, id)
	}
	attachments, err := posts.AttachmentsFor(ctx, s.q, allIDs)
	if err != nil {
		return nil, err
	}
	polls, err := posts.PollsFor(ctx, s.q, allIDs, viewerID)
	if err != nil {
		return nil, err
	}

	// État follow des auteurs (isFollowing) — une requête groupée.
	authorIDs := make([]string, 0, len(all))
	for _, r := range all {
		authorIDs = append(authorIDs, r.AuthorID)
	}
	following, err := posts.FollowingFor(ctx, s.q, viewerID, authorIDs)
	if err != nil {
		return nil, err
	}
	quoted, err := posts.QuotedArticlesFor(ctx, s.q, posts.QuoteRefsFrom(all))
	if err != nil {
		return nil, err
	}

	seenRoot := map[string]bool{}
	var slices []posts.FeedSlice

	for i := range baseRows {
		r := &baseRows[i]
		target := posts.BuildFeedPost(r, all, attachments, polls, following, quoted)

		var parent, root *posts.FeedPost
		if pid := posts.ParentIDOf(r); pid != nil {
			if p, ok := all[*pid]; ok {
				pp := posts.BuildFeedPost(p, all, attachments, polls, following, quoted)
				parent = &pp
			}
		}
		if rid := posts.RootIDOf(r); rid != nil && (parent == nil || *rid != *posts.ParentIDOf(r)) {
			if rp, ok := all[*rid]; ok {
				rr := posts.BuildFeedPost(rp, all, attachments, polls, following, quoted)
				root = &rr
			}
		}

		isIncomplete := false
		hidden := 0
		if parent != nil && posts.RootIDOf(r) != nil {
			parentRoot := ""
			if parent.RootID != nil {
				parentRoot = *parent.RootID
			}
			if parentRoot != *posts.RootIDOf(r) && parent.ID != *posts.RootIDOf(r) {
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
		} else if posts.RootIDOf(r) != nil {
			conversationRoot = *posts.RootIDOf(r)
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
