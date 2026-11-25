package posts

import "testing"

func feedItemAuthor(id string) Author {
	return Author{ID: id, Username: &id}
}

func TestFeedSliceToFeedItem(t *testing.T) {
	t.Run("post isolé", func(t *testing.T) {
		item := (FeedSlice{TargetPost: FeedPost{ID: "p1", Content: "hola", Author: feedItemAuthor("u1"), Why: "parce que"}}).ToFeedItem()
		if item.Post.ID != "p1" || item.Reply != nil || item.Reason != nil || item.Why != "parce que" {
			t.Fatalf("item = %+v", item)
		}
	})

	t.Run("réponse profonde", func(t *testing.T) {
		root := &FeedPost{ID: "root", Author: feedItemAuthor("u-root")}
		parent := &FeedPost{ID: "parent", Author: feedItemAuthor("u-parent"), Parent: root}
		item := (FeedSlice{RootPost: root, ParentPost: parent, TargetPost: FeedPost{ID: "child"}}).ToFeedItem()
		if item.Reply == nil || item.Reply.Root != root || item.Reply.Parent != parent {
			t.Fatalf("reply = %+v", item.Reply)
		}
		if item.Reply.GrandparentAuthor == nil || item.Reply.GrandparentAuthor.ID != "u-root" {
			t.Fatalf("grandparent = %+v", item.Reply.GrandparentAuthor)
		}
	})

	t.Run("commentaire d'article", func(t *testing.T) {
		article := &QuotedArticle{ID: "art1", Title: "Titre", Slug: "titre"}
		item := (FeedSlice{TargetPost: FeedPost{ID: "c1", RootArticle: article}}).ToFeedItem()
		if item.Reply == nil || item.Reply.Article != article || item.Reply.Root != nil {
			t.Fatalf("reply = %+v", item.Reply)
		}
	})

	t.Run("repost pur affiche l'original", func(t *testing.T) {
		original := &FeedPost{ID: "orig"}
		item := (FeedSlice{TargetPost: FeedPost{
			ID: "r1", Content: "  ", Repost: original, Author: feedItemAuthor("u-repost"),
		}}).ToFeedItem()
		if item.Post.ID != "orig" || item.Reason == nil || item.Reason.Type != "repost" || item.Reason.By.ID != "u-repost" {
			t.Fatalf("item = %+v", item)
		}
	})

	t.Run("citation avec texte n'est pas un repost", func(t *testing.T) {
		item := (FeedSlice{TargetPost: FeedPost{
			ID: "q1", Content: "mon commentaire", Repost: &FeedPost{ID: "orig"},
		}}).ToFeedItem()
		if item.Post.ID != "q1" || item.Reason != nil {
			t.Fatalf("item = %+v", item)
		}
	})

	t.Run("repost d'article", func(t *testing.T) {
		item := (FeedSlice{TargetPost: FeedPost{
			ID: "a1", Content: "", QuotedArticle: &QuotedArticle{ID: "art1"}, Author: feedItemAuthor("u1"),
		}}).ToFeedItem()
		if item.Reason == nil || item.Reason.Type != "article_repost" || item.Post.ID != "a1" {
			t.Fatalf("item = %+v", item)
		}
	})

	t.Run("épingle", func(t *testing.T) {
		item := (FeedSlice{TargetPost: FeedPost{ID: "p1", IsPinned: true, Author: feedItemAuthor("u1")}}).ToFeedItem()
		if item.Reason == nil || item.Reason.Type != "pin" {
			t.Fatalf("item = %+v", item)
		}
	})
}
