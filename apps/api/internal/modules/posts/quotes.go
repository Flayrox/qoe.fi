package posts

// ─────────────────────────────────────────────────────────────────────────────
// Citations d'articles (quotedArticleId + quotedExcerpt).
//
// Le serveur charge les articles cités par lots et résout le contexte du
// passage (avant / extrait / après) contre le TEXTE CANONIQUE de l'article —
// une seule canonicalisation par article, quelle que soit la taille du feed.
// La carte du feed n'a donc plus besoin du HTML brut ni d'un indexOf client.
// ─────────────────────────────────────────────────────────────────────────────

import (
	"context"
	"encoding/json"
	"strings"

	"github.com/qoefi/api/internal/canon"
	db "github.com/qoefi/api/internal/database"
	"github.com/qoefi/api/internal/identity"
)

// QuoteRef est la référence de citation d'une ligne de post.
// `Annotation` est le snapshot d'une annotation citée (nil pour une
// citation d'article classique) : il porte l'occurrence et les ancres.
type QuoteRef struct {
	PostID     string
	ArticleID  string
	Excerpt    string
	Annotation *QuotedAnnotation
}

// QuoteRefsFrom extrait les références de citation d'un ensemble de lignes
// (les posts dont quotedArticleId est renseigné).
func QuoteRefsFrom(all map[string]*db.GetPostsByIDsRow) []QuoteRef {
	refs := make([]QuoteRef, 0, 4)
	for _, r := range all {
		if !r.QuotedArticleId.Valid || r.QuotedArticleId.String == "" {
			continue
		}
		ref := QuoteRef{
			PostID:    r.ID,
			ArticleID: r.QuotedArticleId.String,
			Excerpt:   textVal(r.QuotedExcerpt),
		}
		if len(r.QuotedAnnotation) > 0 {
			var citation QuotedAnnotation
			if err := json.Unmarshal(r.QuotedAnnotation, &citation); err == nil {
				ref.Annotation = &citation
			}
		}
		refs = append(refs, ref)
	}
	return refs
}

// QuotedArticlesFor charge les articles cités par les refs (dédoublonnés) et
// résout pour chaque post le contexte du passage. Retourne une map cléée par
// postID ; un post dont l'extrait ne se retrouve pas dans le texte canonique
// (contenu remanié, extrait trop long) n'a pas d'entrée — la carte retombe
// sur l'extrait brut. Ne lève jamais pour une résolution ratée : l'erreur
// n'est propagée que si le CHARGEMENT échoue.
func QuotedArticlesFor(ctx context.Context, q db.Querier, refs []QuoteRef) (map[string]*QuotedArticle, error) {
	out := map[string]*QuotedArticle{}
	if len(refs) == 0 {
		return out, nil
	}

	articleIDs := make([]string, 0, len(refs))
	seen := map[string]bool{}
	for _, r := range refs {
		if !seen[r.ArticleID] {
			seen[r.ArticleID] = true
			articleIDs = append(articleIDs, r.ArticleID)
		}
	}

	rows, err := q.GetQuotedArticlesByIDs(ctx, articleIDs)
	if err != nil {
		return nil, err
	}

	// Métadonnées par article (une entrée, partagée), documents canoniques
	// résolus une seule fois par article.
	byArticle := map[string]*QuotedArticle{}
	docs := map[string]*canon.Document{}
	for i := range rows {
		row := &rows[i]
		byArticle[row.ID] = &QuotedArticle{
			ID:        row.ID,
			Title:     row.Title,
			Slug:      row.Slug,
			IsPremium: row.IsPremium,
			Publication: QuotedPublication{
				ID:           row.PubID,
				Name:         row.Name,
				Slug:         row.PubSlug,
				Subdomain:    textPtr(row.Subdomain),
				CustomDomain: textPtr(row.CustomDomain),
				Type:         string(row.Type),
				LogoURL:      textPtr(row.PubLogo),
				IsCertified:  row.PubCertified,
			},
			Author: QuotedAuthor{
				ID:          row.AuthorID,
				Name:        textPtr(row.AuthorName),
				Username:    textPtr(row.AuthorUsername),
				LogoURL:     textPtr(row.AuthorLogo),
				IsCertified: row.AuthorCertified,
				Type:        identity.Type(row.AuthorIsMedia),
			},
		}
		docs[row.ID] = canon.Parse(row.Content)
	}

	// Contexte PAR POST (deux posts peuvent citer le même article avec des
	// passages différents) — repli tolérant de canon.Find par extrait.
	for _, r := range refs {
		base, ok := byArticle[r.ArticleID]
		if !ok {
			continue
		}
		qa := *base
		qa.QuoteContext = resolveOne(docs[r.ArticleID], r)
		out[r.PostID] = &qa
	}
	return out, nil
}

func resolveOne(doc *canon.Document, ref QuoteRef) *QuoteContext {
	// 🎯 Une annotation citée apporte ses propres ancres : on slice le texte
	// canonique à l'endroit EXACT qu'elle désignait. Un passage répété ne
	// dépend plus d'une recherche de texte — l'empreinte doit correspondre
	// (document ré-édité → repli tolérant par extrait + occurrence).
	if anchor := ref.Annotation; anchor != nil && anchor.ContentSha != nil &&
		*anchor.ContentSha == doc.Sha && anchor.CanonicalStart != nil && anchor.CanonicalEnd != nil {
		if ctx := contextAt(doc, *anchor.CanonicalStart, *anchor.CanonicalEnd); ctx != nil {
			return ctx
		}
	}

	ordinal := 0
	if ref.Annotation != nil {
		ordinal = ref.Annotation.QuoteOrdinal
	}
	start, end, ok := doc.Find(ref.Excerpt, ordinal)
	if !ok && ordinal != 0 {
		// L'occurrence a disparu (contenu ré-édité) : la première reste une
		// preuve plus utile qu'une carte sans passage.
		start, end, ok = doc.Find(ref.Excerpt, 0)
	}
	if !ok {
		return nil
	}
	return contextAt(doc, start, end)
}

// contextAt découpe un contexte autour d'offsets en CODE POINTS — jamais un
// slice d'octets (accents/émoticônes multi-octets).
func contextAt(doc *canon.Document, start, end int) *QuoteContext {
	textR := []rune(doc.Text)
	if start < 0 || end > len(textR) || end <= start {
		return nil
	}
	highlight := strings.TrimSpace(string(textR[start:end]))
	if highlight == "" {
		return nil
	}
	ctx := &QuoteContext{
		Before:    canon.ContextWindow(doc.Text, start, -1),
		Highlight: highlight,
		After:     canon.ContextWindow(doc.Text, end, +1),
		Start:     start,
		End:       end,
		Sha:       doc.Sha,
	}
	if ctx.Before == "" && ctx.Highlight == "" && ctx.After == "" {
		return nil
	}
	return ctx
}
