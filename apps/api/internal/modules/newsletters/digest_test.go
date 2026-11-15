package newsletters

import (
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	db "github.com/qoefi/api/internal/database"
)

func digestRow(title, content string) db.ListArticlesForDigestRow {
	return db.ListArticlesForDigestRow{
		ID:            "art_1",
		Title:         title,
		Slug:          "mon-article",
		Content:       content,
		ImageUrl:      pgtype.Text{String: "https://cdn.test/cover.jpg", Valid: true},
		ReadingTime:   6,
		CreatedAt:     pgtype.Timestamp{Time: time.Now(), Valid: true},
		PublisherName: "La Rédaction",
		Subdomain:     pgtype.Text{String: "redaction", Valid: true},
		CustomDomain:  pgtype.Text{String: "exemple.fr", Valid: true},
		CategorySlug:  "tech",
	}
}

func TestBuildDigestHTML_EscapesAndLinks(t *testing.T) {
	html := buildDigestHTML([]db.ListArticlesForDigestRow{
		digestRow(`<script>alert("x")</script>`, `<p>Bonjour &amp; bienvenue</p>`),
	}, "La Rédaction")

	if strings.Contains(html, "<script>") {
		t.Fatalf("titre non échappé : %s", html)
	}
	if !strings.Contains(html, "&lt;script&gt;") {
		t.Fatalf("titre échappé attendu : %s", html)
	}
	if !strings.Contains(html, "https://exemple.fr/tech/mon-article") {
		t.Fatalf("lien canonique attendu : %s", html)
	}
	if !strings.Contains(html, "https://cdn.test/cover.jpg") {
		t.Fatalf("image attendue : %s", html)
	}
	if !strings.Contains(html, "Bonjour &amp; bienvenue") {
		t.Fatalf("extrait texte attendu : %s", html)
	}
	if !strings.Contains(html, "6 min") {
		t.Fatalf("temps de lecture attendu : %s", html)
	}
}

func TestDigestArticleURL_Priority(t *testing.T) {
	custom := pgtype.Text{String: "exemple.fr", Valid: true}
	sub := pgtype.Text{String: "redaction", Valid: true}

	if got := digestArticleURL(custom, sub, "tech", "slug"); got != "https://exemple.fr/tech/slug" {
		t.Fatalf("domaine custom = %q", got)
	}
	if got := digestArticleURL(pgtype.Text{}, sub, "tech", "slug"); got != "https://redaction.qoe.fi/tech/slug" {
		t.Fatalf("sous-domaine = %q", got)
	}
	if got := digestArticleURL(pgtype.Text{}, pgtype.Text{}, "tech", "slug"); got != "https://qoe.fi/p/slug" {
		t.Fatalf("fallback = %q", got)
	}
}

func TestDigestExcerpt_StripsHTMLAndBoundsRunes(t *testing.T) {
	if got := digestExcerpt("<p>Bonjour <strong>le monde</strong></p>"); got != "Bonjour le monde" {
		t.Fatalf("extrait = %q", got)
	}
	long := strings.Repeat("é", 300)
	got := digestExcerpt("<p>" + long + "</p>")
	if len([]rune(got)) != 221 || !strings.HasSuffix(got, "…") {
		t.Fatalf("extrait long = %d runes", len([]rune(got)))
	}
}
