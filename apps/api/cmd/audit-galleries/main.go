// cmd/audit-galleries — audit LECTURE SEULE des galeries d'images déjà
// enregistrées. Le parseur Studio a longtemps relu un
// `<div data-image-gallery>` comme une galerie vide suivie d'une image
// dupliquée ; ce correctif protège les nouveaux chargements, pas les articles
// qui ont déjà traversé l'ancien parseur.
//
// La commande ne modifie aucune ligne. Elle liste les articles qui contiennent
// une galerie et signale :
//   - une galerie sans aucune image ;
//   - une image de galerie sans `src` ;
//   - une image seule placée juste après une galerie dont une image n'a plus
//     de `src` (signature exacte de l'ancien bug).
//
// Usage :
//
//	cd apps/api && go run ./cmd/audit-galleries
//	cd apps/api && go run ./cmd/audit-galleries -json
//	cd apps/api && go run ./cmd/audit-galleries -all
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"github.com/joho/godotenv"
	"golang.org/x/net/html"

	"github.com/qoefi/api/internal/config"
	"github.com/qoefi/api/internal/dbpool"
)

type galleryFinding struct {
	ID              string    `json:"id"`
	Slug            string    `json:"slug"`
	Status          string    `json:"status"`
	Published       bool      `json:"published"`
	UpdatedAt       time.Time `json:"updatedAt"`
	Galleries       int       `json:"galleries"`
	GalleryImages   int       `json:"galleryImages"`
	MissingSrc      int       `json:"missingSrc"`
	EmptyGalleries  int       `json:"emptyGalleries"`
	DuplicateAfter  int       `json:"duplicateAfter"`
	MissingAlt      int       `json:"missingAlt"`
	Suspicious      bool      `json:"suspicious"`
	ContentExcerpt  string    `json:"-"`
	ContentChecksum string    `json:"-"`
}

func isElement(n *html.Node) bool { return n != nil && n.Type == html.ElementNode }

func attr(n *html.Node, key string) string {
	for _, a := range n.Attr {
		if strings.EqualFold(a.Key, key) {
			return a.Val
		}
	}
	return ""
}

func hasAttr(n *html.Node, key string) bool {
	for _, a := range n.Attr {
		if strings.EqualFold(a.Key, key) {
			return true
		}
	}
	return false
}

// nextElementSibling renvoie le premier frère élément après n (les nœuds texte
// et commentaires sont ignorés, comme le ferait le navigateur).
func nextElementSibling(n *html.Node) *html.Node {
	if n == nil || n.Parent == nil {
		return nil
	}
	found := false
	for c := n.Parent.FirstChild; c != nil; c = c.NextSibling {
		if c == n {
			found = true
			continue
		}
		if found && isElement(c) {
			return c
		}
	}
	return nil
}

func collectGalleryImages(n *html.Node, out *[]*html.Node) {
	for c := n.FirstChild; c != nil; c = c.NextSibling {
		if !isElement(c) {
			continue
		}
		if c.Data == "img" && hasAttr(c, "data-gallery-image") {
			*out = append(*out, c)
			continue
		}
		collectGalleryImages(c, out)
	}
}

// analyzeGalleryHTML inspecte un corps d'article sans le modifier.
func analyzeGalleryHTML(content string) galleryFinding {
	finding := galleryFinding{}
	doc, err := html.Parse(strings.NewReader(content))
	if err != nil {
		return finding
	}

	var walk func(*html.Node)
	walk = func(n *html.Node) {
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			if !isElement(c) {
				continue
			}
			if c.Data == "div" && hasAttr(c, "data-image-gallery") {
				finding.Galleries++
				var images []*html.Node
				collectGalleryImages(c, &images)
				finding.GalleryImages += len(images)
				if len(images) == 0 {
					finding.EmptyGalleries++
				}

				gallerySrcs := map[string]struct{}{}
				galleryMissing := 0
				for _, img := range images {
					src := strings.TrimSpace(attr(img, "src"))
					if src == "" {
						finding.MissingSrc++
						galleryMissing++
					} else {
						gallerySrcs[src] = struct{}{}
					}
					if strings.TrimSpace(attr(img, "alt")) == "" {
						finding.MissingAlt++
					}
				}

				// Le bug historique déposait l'image dupliquée immédiatement
				// après la galerie, en frère. On ne signale ce cas que si la
				// galerie a effectivement perdu un src : une image volontaire
				// juste après une galerie saine n'est pas un doublon.
				if galleryMissing > 0 {
					if sibling := nextElementSibling(c); isElement(sibling) && sibling.Data == "img" {
						src := strings.TrimSpace(attr(sibling, "src"))
						if src != "" {
							if _, inGallery := gallerySrcs[src]; !inGallery {
								finding.DuplicateAfter++
							}
						}
					}
				}
			}
			walk(c)
		}
	}
	walk(doc)

	finding.Suspicious = finding.MissingSrc > 0 || finding.EmptyGalleries > 0 || finding.DuplicateAfter > 0
	return finding
}

func loadEnv() {
	_ = godotenv.Load("../../../.env")
	_ = godotenv.Load()
}

func main() {
	asJSON := flag.Bool("json", false, "sortie JSON (une ligne par article)")
	showAll := flag.Bool("all", false, "afficher aussi les articles dont les galeries sont saines")
	flag.Parse()

	loadEnv()
	cfg := config.Load()
	if strings.TrimSpace(cfg.DatabaseURL) == "" {
		log.Fatal("DATABASE_URL ou API_DATABASE_URL requis")
	}

	ctx := context.Background()
	pool, err := dbpool.New(ctx, cfg.DatabaseURL, 4)
	if err != nil {
		log.Fatalf("connexion base de données: %v", err)
	}
	defer pool.Close()

	rows, err := pool.Query(ctx, `
		SELECT id, slug, status, published, "updatedAt", content
		FROM "Article"
		WHERE content ILIKE '%data-image-gallery%'
		   OR content ILIKE '%data-gallery-image%'
		ORDER BY "updatedAt" DESC`)
	if err != nil {
		log.Fatalf("requête articles: %v", err)
	}
	defer rows.Close()

	var findings []galleryFinding
	for rows.Next() {
		var f galleryFinding
		var content string
		if err := rows.Scan(&f.ID, &f.Slug, &f.Status, &f.Published, &f.UpdatedAt, &content); err != nil {
			log.Fatalf("scan: %v", err)
		}
		f = mergeFinding(f, analyzeGalleryHTML(content))
		findings = append(findings, f)
	}
	if rows.Err() != nil {
		log.Fatalf("lecture articles: %v", rows.Err())
	}

	suspects := 0
	for _, f := range findings {
		if f.Suspicious {
			suspects++
		}
	}

	if *asJSON {
		encoder := json.NewEncoder(os.Stdout)
		encoder.SetIndent("", "  ")
		for _, f := range findings {
			if !*showAll && !f.Suspicious {
				continue
			}
			if err := encoder.Encode(f); err != nil {
				log.Fatalf("encodage JSON: %v", err)
			}
		}
		return
	}

	fmt.Printf("Audit galeries (lecture seule)\n")
	fmt.Printf("Articles contenant une galerie : %d\n", len(findings))
	fmt.Printf("Articles suspects              : %d\n", suspects)
	if suspects == 0 {
		fmt.Println("Aucune signature de l'ancien bug détectée.")
		return
	}

	fmt.Println()
	for _, f := range findings {
		if !*showAll && !f.Suspicious {
			continue
		}
		state := "sain"
		if f.Suspicious {
			state = "SUSPECT"
		}
		fmt.Printf("- [%s] %s (%s, publié=%t)\n", state, f.Slug, f.ID, f.Published)
		fmt.Printf("  galeries=%d images=%d sansSrc=%d vides=%d doublonAprès=%d altManquants=%d\n",
			f.Galleries, f.GalleryImages, f.MissingSrc, f.EmptyGalleries, f.DuplicateAfter, f.MissingAlt)
	}
	fmt.Println("\nAucune écriture effectuée. Réparer seulement après revue des cas ci-dessus.")
}

// mergeFinding reporte les compteurs analysés sur la ligne DB.
func mergeFinding(row galleryFinding, analyzed galleryFinding) galleryFinding {
	row.Galleries = analyzed.Galleries
	row.GalleryImages = analyzed.GalleryImages
	row.MissingSrc = analyzed.MissingSrc
	row.EmptyGalleries = analyzed.EmptyGalleries
	row.DuplicateAfter = analyzed.DuplicateAfter
	row.MissingAlt = analyzed.MissingAlt
	row.Suspicious = analyzed.Suspicious
	return row
}
