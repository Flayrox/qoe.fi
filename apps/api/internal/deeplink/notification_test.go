package deeplink

import "testing"

func TestAbsoluteURL(t *testing.T) {
	if got := AbsoluteURL("/articles/art-1?ws=" + "media-1"); got != "https://studio.qoe.fi/articles/art-1?ws=media-1" {
		t.Fatalf("lien studio = %q", got)
	}
	if got := AbsoluteURL("/ada/thought/p-1"); got != "https://qoe.fi/ada/thought/p-1" {
		t.Fatalf("lien public = %q", got)
	}
}

func TestNotification(t *testing.T) {
	const mediaID = "0f7c2f0e-2b9a-4c39-9a4e-6a1c2d3e4f50"
	cases := []struct {
		name string
		t    Target
		want string
	}{
		{
			name: "commentaire d'article média → studio + ws",
			t: Target{
				Type: "COMMENT", ArticleID: "art-1", PublisherType: "MEDIA", MediaID: mediaID,
			},
			want: "/articles/art-1?ws=" + mediaID,
		},
		{
			name: "commentaire d'article personnel → studio sans ws",
			t: Target{
				Type: "COMMENT", ArticleID: "art-2", PublisherType: "PERSONAL",
			},
			want: "/articles/art-2",
		},
		{
			name: "mention sur une pensée → page publique, jamais de ws",
			t: Target{
				Type: "MENTION", ThoughtID: "p-1", SenderUsername: "ada",
				PublisherType: "MEDIA", MediaID: mediaID,
			},
			want: "/ada/thought/p-1",
		},
		{
			name: "publication média vue par un abonné → article public, sans ws",
			t: Target{
				Type: "MEDIA_ARTICLE_PUBLISHED", ArticleID: "art-9", ArticleSlug: "mon-article",
				PublisherType: "MEDIA", MediaID: mediaID,
			},
			want: "/article/mon-article",
		},
		{
			name: "invitation média → page média + ws",
			t: Target{
				Type: "MEDIA_INVITE", PublisherType: "MEDIA", MediaID: mediaID,
			},
			want: "/media?ws=" + mediaID,
		},
		{
			name: "nouvel abonné → profil public",
			t: Target{
				Type: "FOLLOW", PublisherSlug: "le-journal", PublisherType: "MEDIA", MediaID: mediaID,
			},
			want: "/le-journal",
		},
		{
			name: "invitation à contribuer → avancé + ws",
			t: Target{
				Type: "ARTICLE_CONTRIBUTOR_INVITED", PublisherType: "MEDIA", MediaID: mediaID,
			},
			want: "/advanced?ws=" + mediaID,
		},
		{
			name: "publication média sans article → page média + ws",
			t: Target{
				Type: "MEDIA_MEMBER_JOINED", PublisherID: "pub-1", PublisherType: "MEDIA", MediaID: mediaID,
			},
			want: "/media?ws=" + mediaID,
		},
		{
			name: "cible inconnue → centre de notifications",
			t:    Target{Type: "UNKNOWN"},
			want: "/notifications",
		},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := Notification(c.t); got != c.want {
				t.Fatalf("Notification() = %q, attendu %q", got, c.want)
			}
		})
	}
}
