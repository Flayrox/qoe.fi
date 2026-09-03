package creator

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/qoefi/api/internal/canon"
	authmw "github.com/qoefi/api/internal/middleware"
)

// seedAnnotationsFixture crée l'environnement de l'export groupé :
// publication, créateur (auteur), lecteurs, un article au HTML stable et
// des surlignages : public ANCRÉ exact, public hérité SANS ancres (résolu à
// la lecture), officiel, et un privé qui ne doit JAMAIS sortir.
// Retourne le slug de l'article et les offsets attendus.
func seedAnnotationsFixture(t *testing.T) (slug string, doc *canon.Document) {
	t.Helper()
	ctx := context.Background()

	if _, err := poolTest.Exec(ctx,
		`TRUNCATE TABLE "AnnotationUpvote", "AnnotationComment", "Highlight", "Article",
		 "_CoAuthors", "Publication", "User" CASCADE`); err != nil {
		t.Fatalf("truncate: %v", err)
	}

	creatorID := "00000000-0000-0000-0000-00000000a001"
	readerID := "00000000-0000-0000-0000-00000000a002"
	pubID := "pub_annot_001"

	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Publication" (id, type, name, slug, "createdAt", "updatedAt")
		 VALUES ($1, 'PERSONAL', 'Annotations API', 'annot-api', now(), now())`, pubID); err != nil {
		t.Fatalf("publication: %v", err)
	}
	for _, u := range []struct{ id, username string }{
		{creatorID, "annotcreator"}, {readerID, "annotreader"},
	} {
		if _, err := poolTest.Exec(ctx,
			`INSERT INTO "User" (id, email, username, name, role, "createdAt", "updatedAt")
			 VALUES ($1, $2, $3, $3, 'user', now(), now())`,
			u.id, u.username+"@test.dev", u.username); err != nil {
			t.Fatalf("user %s: %v", u.username, err)
		}
	}

	content := `<p>Le paragraphe d'introduction pose le décor de l'article.</p>` +
		`<p>Le passage unique à surligner se trouve ici, au milieu du texte.</p>` +
		`<p>La conclusion referme le sujet abordé plus haut.</p>`
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Article" (id, title, slug, content, published, visibility,
		                        "readingTime", status, "publicationId", "authorId", "createdAt", "updatedAt")
		 VALUES ('art_annot', 'Article annoté', 'article-annote', $1, true, 'PUBLIC',
		         3, 'PUBLISHED', $2, $3, now(), now())`,
		content, pubID, creatorID); err != nil {
		t.Fatalf("article: %v", err)
	}

	// Document canonique de référence : les ancres stockées doivent porter
	// son empreinte pour être « exactes ».
	doc = canon.Parse(content)

	anchor := func(text string, ordinal int) (int, int, bool) {
		return doc.Find(text, ordinal)
	}
	// 1) Public ANCRÉ exact (empreinte conforme).
	s, e, ok := anchor("Le passage unique à surligner se trouve ici, au milieu du texte.", 0)
	if !ok {
		t.Fatalf("passage exact introuvable dans le canonique")
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Highlight" (id, text, "isPublic", "isOfficial", "quoteOrdinal",
		                          "canonicalStart", "canonicalEnd", "contentSha",
		                          "readerId", "articleId", "createdAt")
		 VALUES ('hl_annot_exact', $1, true, false, 0, $2, $3, $4, $5, 'art_annot', now())`,
		"Le passage unique à surligner se trouve ici, au milieu du texte.", s, e, doc.Sha, readerID); err != nil {
		t.Fatalf("highlight exact: %v", err)
	}

	// 2) Public hérité SANS ancres → re-résolution tolérante à la lecture.
	s, e, ok = anchor("Le paragraphe d'introduction pose le décor de l'article.", 0)
	if !ok {
		t.Fatalf("passage hérité introuvable dans le canonique")
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Highlight" (id, text, "isPublic", "isOfficial", "quoteOrdinal",
		                          "readerId", "articleId", "createdAt")
		 VALUES ('hl_annot_legacy', $1, true, false, 0, $2, 'art_annot', now())`,
		"Le paragraphe d'introduction pose le décor de l'article.", readerID); err != nil {
		t.Fatalf("highlight legacy: %v", err)
	}

	// 3) Officiel (annotation éditoriale de l'auteur) → sort aussi.
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Highlight" (id, text, note, "isPublic", "isOfficial", "quoteOrdinal",
		                          "readerId", "articleId", "createdAt")
		 VALUES ('hl_annot_official', $1, 'Un mot de la rédaction', true, true, 0,
		         $2, 'art_annot', now())`,
		"La conclusion referme le sujet abordé plus haut.", creatorID); err != nil {
		t.Fatalf("highlight official: %v", err)
	}

	// 4) Privé → exclu de l'export (jamais exposé à l'API créateur).
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Highlight" (id, text, "isPublic", "isOfficial", "quoteOrdinal",
		                          "readerId", "articleId", "createdAt")
		 VALUES ('hl_annot_prive', $1, false, false, 0, $2, 'art_annot', now())`,
		"Ceci est une note privée du lecteur.", readerID); err != nil {
		t.Fatalf("highlight privé: %v", err)
	}

	return "article-annote", doc
}

type exportAnnotationResp struct {
	ID             string  `json:"id"`
	Text           string  `json:"text"`
	Note           *string `json:"note"`
	IsPublic       bool    `json:"isPublic"`
	IsOfficial     bool    `json:"isOfficial"`
	QuoteOrdinal   int     `json:"quoteOrdinal"`
	AnchorStatus   string  `json:"anchorStatus"`
	CanonicalStart *int    `json:"canonicalStart"`
	CanonicalEnd   *int    `json:"canonicalEnd"`
	ContentSha     string  `json:"contentSha"`
	ContextBefore  string  `json:"contextBefore"`
	ContextAfter   string  `json:"contextAfter"`
}

type exportResp struct {
	Article struct {
		ID              string `json:"id"`
		ContentHTML     string `json:"contentHtml"`
		ContentMarkdown string `json:"contentMarkdown"`
	} `json:"article"`
	Document struct {
		Text string `json:"text"`
		Sha  string `json:"sha"`
	} `json:"document"`
	Annotations []exportAnnotationResp `json:"annotations"`
}

func TestCreatorAPI_AnnotationsExport(t *testing.T) {
	slug, doc := seedAnnotationsFixture(t)
	creatorID := "00000000-0000-0000-0000-00000000a001"

	r := newAPIRouter()
	key := insertAPIKey(t, creatorID, "annot", authmw.AllScopes)

	req := httptest.NewRequest(http.MethodGet, "/v1/creator/articles/"+slug+"/annotations", nil)
	req.Header.Set("Authorization", "Bearer "+key)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("annotations = %d %s, attendu 200", w.Code, w.Body.String())
	}
	var res exportResp
	if err := json.Unmarshal(w.Body.Bytes(), &res); err != nil {
		t.Fatalf("json: %v (%s)", err, w.Body.String())
	}

	// ── Article + document inclus ────────────────────────────────────────
	if res.Article.ID != "art_annot" {
		t.Fatalf("article.id = %q", res.Article.ID)
	}
	if !strings.Contains(res.Article.ContentHTML, "<p>Le passage unique") {
		t.Fatalf("contentHtml incomplet : %s", res.Article.ContentHTML)
	}
	if !strings.Contains(res.Article.ContentMarkdown, "Le passage unique") {
		t.Fatalf("contentMarkdown absent : %s", res.Article.ContentMarkdown)
	}
	if res.Document.Sha == "" || res.Document.Sha != doc.Sha {
		t.Fatalf("document.sha = %q, attendu %q", res.Document.Sha, doc.Sha)
	}
	if !strings.Contains(res.Document.Text, "Le passage unique à surligner") {
		t.Fatalf("document.text incomplet : %q", res.Document.Text)
	}

	// ── 3 annotations (exact + legacy + officiel), privé exclu ──────────
	if len(res.Annotations) != 3 {
		ids := []string{}
		for _, a := range res.Annotations {
			ids = append(ids, a.ID)
		}
		t.Fatalf("annotations = %d %v, attendu 3 (privé exclu)", len(res.Annotations), ids)
	}

	byID := map[string]exportAnnotationResp{}
	for _, a := range res.Annotations {
		byID[a.ID] = a
	}

	// Exact : offsets stockés, empreinte conforme, contexte présent.
	exact := byID["hl_annot_exact"]
	if exact.AnchorStatus != "exact" {
		t.Fatalf("hl_annot_exact anchorStatus = %q, attendu exact", exact.AnchorStatus)
	}
	if exact.CanonicalStart == nil || exact.CanonicalEnd == nil {
		t.Fatal("offsets absents sur l'ancre exacte")
	}
	if exact.ContentSha != doc.Sha {
		t.Fatalf("contentSha = %q, attendu %q", exact.ContentSha, doc.Sha)
	}
	if exact.ContextBefore == "" || exact.ContextAfter == "" {
		t.Fatalf("contexte vide sur l'ancre exacte : before=%q after=%q", exact.ContextBefore, exact.ContextAfter)
	}
	// Les offsets doivent pointer sur le bon passage du document inclus.
	runes := []rune(res.Document.Text)
	if got := string(runes[*exact.CanonicalStart:*exact.CanonicalEnd]); got != "Le passage unique à surligner se trouve ici, au milieu du texte." {
		t.Fatalf("offsets exacts → %q", got)
	}

	// Hérité sans ancres : re-résolu à la lecture (statut recomputed).
	legacy := byID["hl_annot_legacy"]
	if legacy.AnchorStatus != "recomputed" {
		t.Fatalf("hl_annot_legacy anchorStatus = %q, attendu recomputed", legacy.AnchorStatus)
	}
	if legacy.CanonicalStart == nil || legacy.CanonicalEnd == nil {
		t.Fatal("offsets absents sur l'hérité re-résolu")
	}
	if got := string(runes[*legacy.CanonicalStart:*legacy.CanonicalEnd]); got != "Le paragraphe d'introduction pose le décor de l'article." {
		t.Fatalf("offsets legacy → %q", got)
	}

	// Officiel : présent avec sa note.
	official := byID["hl_annot_official"]
	if !official.IsOfficial || official.Note == nil || *official.Note != "Un mot de la rédaction" {
		t.Fatalf("officiel mal exposé : %+v", official)
	}

	// Privé absent.
	if _, present := byID["hl_annot_prive"]; present {
		t.Fatal("le surlignage privé ne doit jamais sortir de l'export")
	}
}

func TestCreatorAPI_AnnotationsExport_MissingPassage(t *testing.T) {
	ctx := context.Background()
	slug, _ := seedAnnotationsFixture(t)
	creatorID := "00000000-0000-0000-0000-00000000a001"

	// On édite l'article : le passage « exact » disparaît du contenu.
	if _, err := poolTest.Exec(ctx,
		`UPDATE "Article" SET content = '<p>Le contenu a été entièrement remanié après publication.</p>' WHERE id = 'art_annot'`); err != nil {
		t.Fatalf("update article: %v", err)
	}

	r := newAPIRouter()
	key := insertAPIKey(t, creatorID, "annot2", authmw.AllScopes)
	req := httptest.NewRequest(http.MethodGet, "/v1/creator/articles/"+slug+"/annotations", nil)
	req.Header.Set("Authorization", "Bearer "+key)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("annotations = %d %s", w.Code, w.Body.String())
	}
	var res exportResp
	if err := json.Unmarshal(w.Body.Bytes(), &res); err != nil {
		t.Fatalf("json: %v", err)
	}
	byID := map[string]exportAnnotationResp{}
	for _, a := range res.Annotations {
		byID[a.ID] = a
	}
	// Le passage n'existe plus → statut missing, pas d'offsets, texte conservé.
	exact := byID["hl_annot_exact"]
	if exact.AnchorStatus != "missing" {
		t.Fatalf("hl_annot_exact anchorStatus = %q, attendu missing", exact.AnchorStatus)
	}
	if exact.CanonicalStart != nil || exact.CanonicalEnd != nil {
		t.Fatalf("offsets servis sur un passage absent : %+v", exact)
	}
	if exact.Text == "" {
		t.Fatal("text de repli absent")
	}
}

func TestCreatorAPI_AnnotationsExport_NotFoundOrUnowned(t *testing.T) {
	seedAnnotationsFixture(t)

	// Un AUTRE créateur (n'auteur, ni co-auteur, ni publication) ne doit pas
	// voir l'article — même par son slug.
	otherID := "00000000-0000-0000-0000-00000000a003"
	ctx := context.Background()
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Publication" (id, type, name, slug, "createdAt", "updatedAt")
		 VALUES ('pub_annot_other', 'PERSONAL', 'Autre', 'autre', now(), now())`); err != nil {
		t.Fatalf("publication autre: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "User" (id, email, username, name, role, "createdAt", "updatedAt")
		 VALUES ($1, 'autre@test.dev', 'autre', 'Autre', 'user', now(), now())`,
		otherID); err != nil {
		t.Fatalf("user autre: %v", err)
	}

	r := newAPIRouter()
	key := insertAPIKey(t, otherID, "annot-other", authmw.AllScopes)

	for _, slug := range []string{"slug-inconnu", "article-annote"} {
		req := httptest.NewRequest(http.MethodGet, "/v1/creator/articles/"+slug+"/annotations", nil)
		req.Header.Set("Authorization", "Bearer "+key)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusNotFound {
			t.Fatalf("slug %s (autre créateur) = %d, attendu 404", slug, w.Code)
		}
	}
}

func TestCreatorAPI_AnnotationsExport_ScopeReadRequired(t *testing.T) {
	seedAnnotationsFixture(t)
	creatorID := "00000000-0000-0000-0000-00000000a001"
	r := newAPIRouter()

	// Clé limitée au scope WRITE → 403 sur l'export (scope READ requis).
	writeKey := insertAPIKey(t, creatorID, "annot-write", []string{authmw.ScopeWrite})
	req := httptest.NewRequest(http.MethodGet, "/v1/creator/articles/article-annote/annotations", nil)
	req.Header.Set("Authorization", "Bearer "+writeKey)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusForbidden {
		t.Fatalf("clé WRITE = %d, attendu 403", w.Code)
	}
}
