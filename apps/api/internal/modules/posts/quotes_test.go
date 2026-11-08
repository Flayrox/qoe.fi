package posts

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/qoefi/api/internal/canon"
	db "github.com/qoefi/api/internal/database"
)

// ─────────────────────────── Unitaires purs ───────────────────────────

func TestResolveOne_HighlightsExactPassage(t *testing.T) {
	doc := canon.Parse(`<p>Bonjour le monde 👋, ceci est un <strong>passage cité</strong> avec du contenu.</p><p>Suite de l'article.</p>`)
	ctx := resolveOne(doc, QuoteRef{Excerpt: "un passage cité"})
	if ctx == nil {
		t.Fatal("résolution attendue")
	}
	if ctx.Highlight != "un passage cité" {
		t.Errorf("highlight = %q", ctx.Highlight)
	}
	// Offsets en code points (pas en octets) : vérifier via re-découpage.
	textR := []rune(doc.Text)
	if got := string(textR[ctx.Start:ctx.End]); got != "un passage cité" {
		t.Errorf("tranche offsets = %q", got)
	}
	if ctx.End-ctx.Start != len([]rune("un passage cité")) {
		t.Errorf("longueur offsets = %d, attendu %d", ctx.End-ctx.Start, len([]rune("un passage cité")))
	}
	if ctx.Sha == "" || ctx.Sha != doc.Sha {
		t.Errorf("sha = %q", ctx.Sha)
	}
	if !strings.Contains(ctx.Before, "monde 👋") {
		t.Errorf("before = %q (attendu avec l'émoticône intacte)", ctx.Before)
	}
	if !strings.Contains(ctx.After, "contenu") {
		t.Errorf("after = %q", ctx.After)
	}
}

func TestResolveOne_NormalizesWhitespaceAndEntities(t *testing.T) {
	// L'extrait du client peut contenir des espaces insécables réels (U+00A0)
	// et des blancs multiples — le HTML source, lui, porte l'entité &nbsp;.
	doc := canon.Parse(`<p>Premier&nbsp;mot et&nbsp;second</p>`)
	ctx := resolveOne(doc, QuoteRef{Excerpt: "Premier\u00a0mot   et\u00a0second"})
	if ctx == nil {
		t.Fatal("résolution attendue malgré entités + blancs multiples")
	}
	if ctx.Highlight != "Premier mot et second" {
		t.Errorf("highlight = %q", ctx.Highlight)
	}
}

func TestResolveOne_FallbackTolerantTrimmedExcerpt(t *testing.T) {
	// Citation tronquée côté client (« … » en fin, casse exacte de la sélection)
	// : canon.Find retire l'ellipse de bord.
	doc := canon.Parse(`<p>Le chat noir dort sur le canapé rouge.</p>`)
	ctx := resolveOne(doc, QuoteRef{Excerpt: "Le chat noir dort…"})
	if ctx == nil {
		t.Fatal("résolution attendue via ellipse retirée")
	}
	if ctx.Highlight != "Le chat noir dort" {
		t.Errorf("highlight = %q (l'ellipse doit disparaître, casse de la source conservée)", ctx.Highlight)
	}
}

func TestResolveOne_MissingReturnsNil(t *testing.T) {
	doc := canon.Parse(`<p>Un article sans rapport.</p>`)
	if ctx := resolveOne(doc, QuoteRef{Excerpt: "passage inexistant dans le texte"}); ctx != nil {
		t.Errorf("résolution inattendue : %+v", ctx)
	}
}

// TestBuildFeedPost_UnresolvedQuoteDoesNotLeak : les colonnes dénormalisées
// quotedExcerpt/quotedAnnotation ne sortent que si l'article cité a été résolu
// pour ce viewer. Un article privé/bloqué ne doit jamais fuiter par repli.
func TestBuildFeedPost_UnresolvedQuoteDoesNotLeak(t *testing.T) {
	row := &db.GetPostsByIDsRow{
		ID:               "p_private_quote",
		Content:          "regarde",
		AuthorId:         "author_1",
		AuthorID:         "author_1",
		CreatedAt:        pgtype.Timestamp{Time: time.Now(), Valid: true},
		QuotedArticleId:  pgtype.Text{String: "art_private", Valid: true},
		QuotedExcerpt:    pgtype.Text{String: "passage secret", Valid: true},
		QuotedAnnotation: []byte(`{"id":"hl","note":"note secrète","excerpt":"passage secret","reader":{"id":"reader_1"}}`),
	}
	all := map[string]*db.GetPostsByIDsRow{row.ID: row}

	// Article privé/bloqué : absent de la map résolue → zéro fuite.
	fp := BuildFeedPost(row, all, nil, nil, nil, map[string]*QuotedArticle{})
	if fp.QuotedArticle != nil || fp.QuotedExcerpt != nil || fp.QuotedAnnotation != nil {
		t.Fatalf("fuite d'une citation non résolue : %+v", fp)
	}

	// Article résolu : l'extrait et le snapshot reviennent.
	fp = BuildFeedPost(row, all, nil, nil, nil, map[string]*QuotedArticle{
		row.ID: {ID: "art_private"},
	})
	if fp.QuotedExcerpt == nil || *fp.QuotedExcerpt != "passage secret" {
		t.Fatalf("extrait résolu absent : %+v", fp.QuotedExcerpt)
	}
	if fp.QuotedAnnotation == nil || fp.QuotedAnnotation.Note != "note secrète" {
		t.Fatalf("annotation résolue absente : %+v", fp.QuotedAnnotation)
	}
}

func TestQuoteRefsFrom_SkipsEmpty(t *testing.T) {
	all := map[string]*db.GetPostsByIDsRow{
		"p1": {ID: "p1", QuotedArticleId: pgtype.Text{String: "art_1", Valid: true}, QuotedExcerpt: pgtype.Text{String: "extrait", Valid: true}},
		"p2": {ID: "p2"}, // pas de citation
		"p3": {ID: "p3", QuotedArticleId: pgtype.Text{Valid: false}},
	}
	refs := QuoteRefsFrom(all)
	if len(refs) != 1 {
		t.Fatalf("refs = %d, attendu 1", len(refs))
	}
	if refs[0].PostID != "p1" || refs[0].ArticleID != "art_1" || refs[0].Excerpt != "extrait" {
		t.Errorf("refs[0] = %+v", refs[0])
	}
}

// ─────────────────────────── Intégration ───────────────────────────

// TestQuotedArticlesFor_ContextPerPost : deux posts citent le MÊME article
// avec des passages différents — chacun doit recevoir SON contexte.
func TestQuotedArticlesFor_ContextPerPost(t *testing.T) {
	requirePool(t)
	svc := newTestService()
	ctx := context.Background()
	fx := seedPosts(t)

	// Contenu réaliste de l'article cité.
	if _, err := poolTest.Exec(ctx,
		`UPDATE "Article" SET content = $1 WHERE id = $2`,
		`<p>Le réchauffement climatique accélère la fonte des glaciers alpins, menaçant l'approvisionnement en eau douce de toute l'Europe.</p><p>Les scientifiques appellent à une action immédiate.</p>`,
		fx.ArticleID,
	); err != nil {
		t.Fatalf("update article: %v", err)
	}

	quoteA := "post_quote_a"
	quoteB := "post_quote_b"
	for _, q := range []struct{ id, excerpt string }{
		{quoteA, "fonte des glaciers alpins"},
		{quoteB, "action immédiate"},
	} {
		if _, err := poolTest.Exec(ctx,
			`INSERT INTO "Post" (id, content, "authorId", "createdAt", "updatedAt", tags,
			                    visibility, "contentVisibility", "isDraft", "replyRestriction",
			                    "quotedArticleId", "quotedExcerpt", "likeCount", "repostCount", "replyCount")
			 VALUES ($1, 'citation', $2, now(), now(), ARRAY[]::text[], 'public', 'PUBLIC',
			         false, 'everyone', $3, $4, 0, 0, 0)`,
			q.id, fx.AuthorID, fx.ArticleID, q.excerpt,
		); err != nil {
			t.Fatalf("insert quote %s: %v", q.id, err)
		}
	}

	refs := []QuoteRef{
		{PostID: quoteA, ArticleID: fx.ArticleID, Excerpt: "fonte des glaciers alpins"},
		{PostID: quoteB, ArticleID: fx.ArticleID, Excerpt: "action immédiate"},
	}
	quoted, err := QuotedArticlesFor(ctx, svc.q, refs, fx.ViewerID)
	if err != nil {
		t.Fatalf("QuotedArticlesFor: %v", err)
	}
	if len(quoted) != 2 {
		t.Fatalf("quoted = %d entrées, attendu 2", len(quoted))
	}
	a, b := quoted[quoteA], quoted[quoteB]
	if a == nil || b == nil {
		t.Fatal("les deux posts doivent avoir leur article cité")
	}
	if a.QuoteContext == nil || b.QuoteContext == nil {
		t.Fatal("les deux extraits doivent se résoudre")
	}
	if a.QuoteContext.Highlight != "fonte des glaciers alpins" {
		t.Errorf("A highlight = %q", a.QuoteContext.Highlight)
	}
	if b.QuoteContext.Highlight != "action immédiate" {
		t.Errorf("B highlight = %q", b.QuoteContext.Highlight)
	}
	if a.QuoteContext.Start == b.QuoteContext.Start {
		t.Errorf("les deux posts ne doivent PAS partager le même ancrage (A=%d B=%d)",
			a.QuoteContext.Start, b.QuoteContext.Start)
	}
	// Métadonnées dénormalisées.
	if a.Title == "" || a.Slug == "" || a.Publication.Name == "" ||
		a.Publication.ID == "" || // requis par le lecteur mobile (/article/{slug})
		a.Author.Username == nil || *a.Author.Username == "" {
		t.Errorf("métadonnées incomplètes : %+v", a)
	}
}

// TestQuotedArticlesFor_UnknownArticle : article absent → entrée sans contexte
// mais pas d'erreur (le post reste affichable).
func TestQuotedArticlesFor_UnknownArticle(t *testing.T) {
	requirePool(t)
	svc := newTestService()
	ctx := context.Background()

	quoted, err := QuotedArticlesFor(ctx, svc.q, []QuoteRef{
		{PostID: "p_x", ArticleID: "art_inexistant", Excerpt: "n'importe quoi"},
	}, "")
	if err != nil {
		t.Fatalf("QuotedArticlesFor: %v", err)
	}
	if len(quoted) != 0 {
		t.Errorf("quoted = %d, attendu 0 (article introuvable)", len(quoted))
	}
}

// TestQuotedArticlesFor_BlockedAuthorExcluded : une citation d'article ne
// contourne jamais un blocage symétrique.
func TestQuotedArticlesFor_BlockedAuthorExcluded(t *testing.T) {
	requirePool(t)
	svc := newTestService()
	ctx := context.Background()
	fx := seedPosts(t)

	// Bob bloque Alice, auteure de l'article cité.
	if _, err := svc.ToggleBlock(ctx, fx.AuthorID, fx.ViewerID); err != nil {
		t.Fatalf("block: %v", err)
	}

	quoted, err := QuotedArticlesFor(ctx, svc.q, []QuoteRef{
		{PostID: "p_blocked_article", ArticleID: fx.ArticleID, Excerpt: "Test"},
	}, fx.ViewerID)
	if err != nil {
		t.Fatalf("QuotedArticlesFor: %v", err)
	}
	if len(quoted) != 0 {
		t.Errorf("quoted = %d, attendu 0 (auteur bloqué)", len(quoted))
	}
}

// TestQuotedArticlesFor_BlockedAnnotationReaderExcluded : le snapshot
// d'annotation est dénormalisé dans le post. Même si l'article reste lisible,
// l'annotation d'un compte bloqué ne doit pas être affichée.
func TestQuotedArticlesFor_BlockedAnnotationReaderExcluded(t *testing.T) {
	requirePool(t)
	svc := newTestService()
	ctx := context.Background()
	fx := seedPosts(t)

	// Un troisième compte (Carol) a annoté l'article d'Alice ; Bob la bloque.
	const carolID = "00000000-0000-0000-0000-000000000099"
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "User" (id, email, username, name, role, "createdAt", "updatedAt")
		 VALUES ($1, 'carol@test.dev', 'carol', 'Carol', 'creator', now(), now())`, carolID); err != nil {
		t.Fatalf("seed carol: %v", err)
	}
	if _, err := svc.ToggleBlock(ctx, carolID, fx.ViewerID); err != nil {
		t.Fatalf("block: %v", err)
	}

	quoted, err := QuotedArticlesFor(ctx, svc.q, []QuoteRef{{
		PostID:    "p_blocked_annotation",
		ArticleID: fx.ArticleID,
		Excerpt:   "Test",
		Annotation: &QuotedAnnotation{
			ID: "hl_carol", Note: "note de Carol", Excerpt: "Test",
			Reader: QuotedAnnotationReader{ID: carolID},
		},
	}}, fx.ViewerID)
	if err != nil {
		t.Fatalf("QuotedArticlesFor: %v", err)
	}
	if len(quoted) != 0 {
		t.Errorf("quoted = %d, attendu 0 (annotation d'un compte bloqué)", len(quoted))
	}
}

// TestQuotedArticlesFor_UnpublishedArticleExcluded vérifie qu'un article
// non publié (published = false) est proprement exclu de QuotedArticlesFor
// sans casser la requête ni lever d'erreur.
func TestQuotedArticlesFor_UnpublishedArticleExcluded(t *testing.T) {
	requirePool(t)
	svc := newTestService()
	ctx := context.Background()
	fx := seedPosts(t)

	// Rend l'article non publié (published = false).
	if _, err := poolTest.Exec(ctx,
		`UPDATE "Article" SET published = false WHERE id = $1`,
		fx.ArticleID,
	); err != nil {
		t.Fatalf("update article: %v", err)
	}

	quoted, err := QuotedArticlesFor(ctx, svc.q, []QuoteRef{
		{PostID: "p_unpub", ArticleID: fx.ArticleID, Excerpt: "Test"},
	}, fx.ViewerID)
	if err != nil {
		t.Fatalf("QuotedArticlesFor: %v", err)
	}
	if len(quoted) != 0 {
		t.Errorf("quoted = %d, attendu 0 (article non publié exclu)", len(quoted))
	}
}
