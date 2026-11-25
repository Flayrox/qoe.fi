package posts

import "strings"

// FeedItem est le contrat de lecture stable d'un élément de feed : le post
// effectif, son contexte de réponse, la raison de sa présence et l'explication
// de recommandation. Le transport historique reste FeedSlice pour ne pas
// casser le mobile ; cette projection ne duplique aucune règle métier.
type FeedItem struct {
	Post   FeedPost          `json:"post"`
	Reply  *FeedReplyContext `json:"reply,omitempty"`
	Reason *FeedItemReason   `json:"reason,omitempty"`
	Why    string            `json:"why,omitempty"`
}

type FeedReplyContext struct {
	Root              *FeedPost      `json:"root,omitempty"`
	Article           *QuotedArticle `json:"article,omitempty"`
	Parent            *FeedPost      `json:"parent,omitempty"`
	GrandparentAuthor *Author        `json:"grandparentAuthor,omitempty"`
}

// FeedItemReason explique pourquoi l'item est là : repost d'une pensée, repost
// d'article ou épingle. Le type est un enum de transport (repost|pin|
// article_repost), pas une règle recalculée par le client.
type FeedItemReason struct {
	Type string `json:"type"`
	By   Author `json:"by"`
	At   string `json:"at"`
}

// ToFeedItem projette une slice déjà assemblée par le serveur. Un repost pur
// affiche le post d'origine ; une citation (repost + texte) reste le post
// cible avec sa citation. Aucun contenu n'est inventé.
func (s FeedSlice) ToFeedItem() FeedItem {
	target := s.TargetPost
	item := FeedItem{Post: target, Why: target.Why}

	if target.RootArticle != nil {
		item.Reply = &FeedReplyContext{
			Root:    s.RootPost,
			Article: target.RootArticle,
			Parent:  s.ParentPost,
		}
	} else if s.RootPost != nil || s.ParentPost != nil {
		item.Reply = &FeedReplyContext{Root: s.RootPost, Parent: s.ParentPost}
	}
	if item.Reply != nil && s.ParentPost != nil {
		switch {
		case s.ParentPost.Parent != nil:
			item.Reply.GrandparentAuthor = &s.ParentPost.Parent.Author
		case s.RootPost != nil && s.ParentPost.ID != s.RootPost.ID:
			item.Reply.GrandparentAuthor = &s.RootPost.Author
		}
	}

	switch {
	case target.IsPinned:
		item.Reason = &FeedItemReason{Type: "pin", By: target.Author, At: target.CreatedAt}
	case target.Repost != nil && strings.TrimSpace(target.Content) == "":
		item.Post = *target.Repost
		item.Reason = &FeedItemReason{Type: "repost", By: target.Author, At: target.CreatedAt}
	case target.Repost == nil && strings.TrimSpace(target.Content) == "" && target.QuotedArticle != nil:
		item.Reason = &FeedItemReason{Type: "article_repost", By: target.Author, At: target.CreatedAt}
	}

	return item
}
