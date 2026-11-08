package feed

import (
	"context"

	db "github.com/qoefi/api/internal/database"
	"github.com/qoefi/api/internal/modules/posts"
)

// buildSlices assemble les FeedSlice (miroir de buildFeedSlices TS).
// L'assemblage des FeedPost vit dans le package posts (assembly.go) — UNE
// seule shape pour tout l'API (feed, thread, posts).
func (s *Service) buildSlices(ctx context.Context, targetIDs []string, viewerID string, keepUnavailableParents bool) ([]posts.FeedSlice, error) {
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
	quoted, err := posts.QuotedArticlesFor(ctx, s.q, posts.QuoteRefsFrom(all), viewerID)
	if err != nil {
		return nil, err
	}

	seenRoot := map[string]bool{}
	reasonCache := map[string]string{}
	var slices []posts.FeedSlice

	for i := range baseRows {
		r := &baseRows[i]
		slice, conversationRoot, ok := buildFeedSlice(
			r, all, attachments, polls, following, quoted, keepUnavailableParents,
			func(parentID string) string {
				return s.parentUnavailableReason(ctx, parentID, viewerID, reasonCache)
			},
		)
		if !ok || seenRoot[conversationRoot] {
			continue
		}
		seenRoot[conversationRoot] = true
		slices = append(slices, slice)
	}

	return slices, nil
}

// buildFeedSlice assemble une slice à partir des lignes déjà chargées. La
// fonction est pure (aucun accès DB) : elle porte les décisions de visibilité
// du parent et se teste sans Postgres. `keepUnavailableParents=false` imite
// les flux, qui retirent une réponse sans contexte lisible.
func buildFeedSlice(
	r *db.GetPostsByIDsRow,
	all map[string]*db.GetPostsByIDsRow,
	attachments map[string][]posts.Attachment,
	polls map[string]*posts.Poll,
	following map[string]bool,
	quoted map[string]*posts.QuotedArticle,
	keepUnavailableParents bool,
	parentReason func(parentID string) string,
) (posts.FeedSlice, string, bool) {
	target := posts.BuildFeedPost(r, all, attachments, polls, following, quoted)

	var parent, root *posts.FeedPost
	parentUnavailable := false
	parentReasonValue := ""
	pid := posts.ParentIDOf(r)
	if pid != nil {
		if p, ok := all[*pid]; ok {
			pp := posts.BuildFeedPost(p, all, attachments, polls, following, quoted)
			parent = &pp
		} else {
			parentReasonValue = parentReason(*pid)
			parentUnavailable = true
			// Le flag vit sur la slice ET sur le post cible : le thread le porte
			// déjà sur le post, et un consommateur qui lit `targetPost` seul ne
			// doit pas perdre l'information. Le contenu du parent, lui, ne sort
			// jamais.
			target.ParentUnavailable = true
			target.ParentUnavailableReason = parentReasonValue
			target.Parent = nil
			// Un flux ne montre jamais une réponse dont le parent est
			// bloqué/supprimé : elle n'a pas de contexte lisible. Seules
			// les listes de profil la gardent, avec un placeholder.
			if !keepUnavailableParents {
				return posts.FeedSlice{}, "", false
			}
		}
	}
	if rid := posts.RootIDOf(r); rid != nil && (parent == nil || *rid != *pid) {
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

	return posts.FeedSlice{
		ID:                      r.ID,
		RootPost:                root,
		ParentPost:              parent,
		TargetPost:              target,
		IsIncompleteThread:      isIncomplete,
		HiddenIntermediateCount: hidden,
		ParentUnavailable:       parentUnavailable,
		ParentUnavailableReason: parentReasonValue,
	}, conversationRoot, true
}

// markThreadParentUnavailable marque une réponse dont le parent n'est pas
// dans la fermeture visible. Le parent est coupé : le placeholder et son
// contenu ne coexistent jamais, même si un assemblage futur le peuplait.
func markThreadParentUnavailable(
	fp *posts.FeedPost,
	all map[string]*db.GetPostsByIDsRow,
	parentReason func(parentID string) string,
) {
	if fp == nil || fp.ParentID == nil || all[*fp.ParentID] != nil {
		return
	}
	fp.ParentUnavailable = true
	fp.ParentUnavailableReason = parentReason(*fp.ParentID)
	fp.Parent = nil
}

// markThreadAncestorParents applique le même contrat à la chaîne
// root → … → parent direct du post cible. Un ancêtre intermédiaire dont le
// parent manque porte le placeholder, pas seulement le post cible.
func markThreadAncestorParents(
	fp *posts.FeedPost,
	all map[string]*db.GetPostsByIDsRow,
	parentReason func(parentID string) string,
) {
	for current := fp; current != nil; current = current.Parent {
		markThreadParentUnavailable(current, all, parentReason)
	}
}

// parentUnavailableReason explique pourquoi un parent existe mais n'est pas
// dans la fermeture chargée : bloqué (dans un sens ou l'autre) ou supprimé /
// filtré. Le motif reste grossier : aucun contenu du parent ne fuit.
func (s *Service) parentUnavailableReason(ctx context.Context, parentID, viewerID string, cache map[string]string) string {
	if reason, ok := cache[parentID]; ok {
		return reason
	}
	var authorID string
	if err := s.pool.QueryRow(ctx, `SELECT "authorId"::text FROM "Post" WHERE id = $1`, parentID).Scan(&authorID); err != nil {
		cache[parentID] = "deleted"
		return "deleted"
	}
	reason := "unavailable"
	if viewerID != "" {
		blocked, err := s.q.IsBlockedEitherWay(ctx, db.IsBlockedEitherWayParams{
			ReaderId:  toUUID(viewerID),
			CreatorId: toUUID(authorID),
		})
		if err == nil && blocked {
			reason = "blocked"
		}
	}
	cache[parentID] = reason
	return reason
}
