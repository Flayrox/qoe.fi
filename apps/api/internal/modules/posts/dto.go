package posts

import (
	"time"

	"github.com/jackc/pgx/v5/pgtype"
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

// ─────────────────────────── Feed / Slice DTOs ───────────────────────────

// Attachment est une pièce jointe d'une pensée.
type Attachment struct {
	ID        string  `json:"id"`
	ThoughtID string  `json:"thoughtId"`
	Type      string  `json:"type"`
	URL       string  `json:"url"`
	AltText   *string `json:"altText"`
	Width     *int    `json:"width"`
	Height    *int    `json:"height"`
	Order     int     `json:"order"`
}

// PollOption est une option de sondage (avec score calculé).
type PollOption struct {
	ID         string `json:"id"`
	Text       string `json:"text"`
	Order      int    `json:"order"`
	VoteCount  int    `json:"voteCount"`
	Percentage int    `json:"percentage"`
}

// Poll est un sondage formaté (miroir de formatPollData TS).
type Poll struct {
	ID                string       `json:"id"`
	ThoughtID         string       `json:"thoughtId"`
	ExpiresAt         string       `json:"expiresAt"`
	IsExpired         bool         `json:"isExpired"`
	TotalVotes        int          `json:"totalVotes"`
	UserVotedOptionID *string      `json:"userVotedOptionId"`
	Options           []PollOption `json:"options"`
}

// QuotedAuthor est l'auteur de l'article cité (parité FeedPostRecord TS).
type QuotedAuthor struct {
	ID          string  `json:"id"`
	Name        *string `json:"name"`
	Username    *string `json:"username"`
	LogoURL     *string `json:"logoUrl"`
	IsCertified bool    `json:"isCertified"`
}

// QuotedPublication est la publication de l'article cité (parité TS).
// PublicationID est requis par le lecteur mobile (/article/{slug}).
type QuotedPublication struct {
	ID           string  `json:"id"`
	Name         string  `json:"name"`
	Slug         string  `json:"slug"`
	Subdomain    *string `json:"subdomain"`
	CustomDomain *string `json:"customDomain"`
	Type         string  `json:"type"`
	LogoURL      *string `json:"logoUrl"`
	IsCertified  bool    `json:"isCertified"`
}

// QuoteContext est le contexte du passage cité, résolu côté serveur contre le
// texte canonique de l'article — la carte du feed n'a plus à stripper le HTML
// ni à faire d'indexOf. Start/End (code points) + Sha préparent les
// deep-links sur le passage exact.
type QuoteContext struct {
	Before    string `json:"before"`
	Highlight string `json:"highlight"`
	After     string `json:"after"`
	Start     int    `json:"start"`
	End       int    `json:"end"`
	Sha       string `json:"sha"`
}

// QuotedArticle est l'article cité par une pensée.
type QuotedArticle struct {
	ID           string            `json:"id"`
	Title        string            `json:"title"`
	Slug         string            `json:"slug"`
	IsPremium    bool              `json:"isPremium"`
	QuoteContext *QuoteContext     `json:"quoteContext,omitempty"`
	Publication  QuotedPublication `json:"publication"`
	Author       QuotedAuthor      `json:"author"`
}

// PostCounts est le `_count` de Prisma.
type PostCounts struct {
	Likes   int `json:"likes"`
	Replies int `json:"replies"`
	Reposts int `json:"reposts"`
}

// FeedPost est la sérialisation complète d'une pensée dans le feed (miroir Prisma).
type FeedPost struct {
	ID               string         `json:"id"`
	Content          string         `json:"content"`
	AuthorID         string         `json:"authorId"`
	CreatedAt        string         `json:"createdAt"`
	Tags             []string       `json:"tags"`
	ImageURL         *string        `json:"imageUrl"`
	LikeCount        int            `json:"likeCount"`
	RepostCount      int            `json:"repostCount"`
	ReplyCount       int            `json:"replyCount"`
	ParentID         *string        `json:"parentId"`
	RootID           *string        `json:"rootId"`
	RepostID         *string        `json:"repostId"`
	ReplyRestriction string         `json:"replyRestriction"`
	IsPinned         bool           `json:"isPinned"`
	IsHiddenByAuthor bool           `json:"isHiddenByAuthor"`
	QuotedExcerpt    *string        `json:"quotedExcerpt,omitempty"`
	QuotedArticle    *QuotedArticle `json:"quotedArticle,omitempty"`
	Author           Author         `json:"author"`
	Parent           *FeedPost      `json:"parent"`
	Repost           *FeedPost      `json:"repost"`
	Attachments      []Attachment   `json:"attachments"`
	Poll             *Poll          `json:"poll"`
	Likes            []PostActor    `json:"likes"`
	Reposts          []PostActor    `json:"reposts"`
	Counts           PostCounts     `json:"_count"`
	Liked            bool           `json:"liked"`
	Reposted         bool           `json:"reposted"`
}

// PostActor est l'état viewer pour likes/reposts.
type PostActor struct {
	UserID string `json:"userId"`
	ID     string `json:"id,omitempty"`
}

// FeedSlice est un élément du feed (miroir de FeedSlice TS).
type FeedSlice struct {
	ID                      string    `json:"id"`
	RootPost                *FeedPost `json:"rootPost"`
	ParentPost              *FeedPost `json:"parentPost"`
	TargetPost              FeedPost  `json:"targetPost"`
	IsIncompleteThread      bool      `json:"isIncompleteThread"`
	HiddenIntermediateCount int       `json:"hiddenIntermediateCount,omitempty"`
}

func intPtr(v int32) *int {
	i := int(v)
	return &i
}
