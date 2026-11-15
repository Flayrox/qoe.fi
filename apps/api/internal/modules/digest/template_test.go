package digest

import (
	"strings"
	"testing"
	"time"
)

func TestNormalize_Bornes(t *testing.T) {
	cfg := normalize(Config{Weekday: 0, Hour: 99, MaxArticles: 500, Intro: "  bonjour  "})
	if cfg.Weekday != 1 || cfg.Hour != 9 || cfg.MaxArticles != 5 || cfg.Intro != "bonjour" {
		t.Fatalf("config non bornée : %+v", cfg)
	}
}

func TestSubject(t *testing.T) {
	articles := []Article{{Title: "A"}, {Title: "B"}}
	subject := Subject("Le Média", articles)
	if !strings.Contains(subject, "Le Média") || !strings.Contains(subject, "2") {
		t.Fatalf("objet = %q", subject)
	}
	if Subject("", nil) == "" {
		t.Fatal("objet vide sans publication")
	}
}

func TestRenderPreview(t *testing.T) {
	html := RenderPreview("Le Média", Config{Intro: "Cette semaine"}, []Article{{
		Title:     "Titre <important>",
		Slug:      "mon-article",
		Excerpt:   "Un extrait",
		CreatedAt: time.Date(2026, 11, 15, 0, 0, 0, 0, time.UTC),
	}}, "https://qoe.test")

	for _, want := range []string{
		"Le Média",
		"Cette semaine",
		"https://qoe.test/mon-article",
		"Titre &lt;important&gt;",
		"Un extrait",
	} {
		if !strings.Contains(html, want) {
			t.Fatalf("aperçu sans %q", want)
		}
	}
}

func TestExcerpt(t *testing.T) {
	got := excerpt("<p>Bonjour <strong>le</strong> monde</p>", 10)
	if got != "Bonjour le…" {
		t.Fatalf("excerpt = %q", got)
	}
}
