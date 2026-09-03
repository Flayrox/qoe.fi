package canon

import (
	"encoding/json"
	"os"
	"testing"
)

// Corpus de parité : mêmes fixtures que les tests TS (html-blocks-core) —
// verrouille le texte canonique (blancs, entités, inline) et la recherche.
// Le fichier vit dans testdata/corpus.json pour être réutilisable par
// d'autres langages (corpus partagé Go ↔ TS).

type corpusFind struct {
	Target  string `json:"target"`
	Ordinal int    `json:"ordinal"`
	Start   int    `json:"start"`
	End     int    `json:"end"`
}

type corpusCase struct {
	Name     string       `json:"name"`
	HTML     string       `json:"html"`
	WantText string       `json:"wantText"`
	WantFind []corpusFind `json:"wantFind"`
}

func TestCorpusParity(t *testing.T) {
	raw, err := os.ReadFile("testdata/corpus.json")
	if err != nil {
		t.Fatalf("lecture corpus: %v", err)
	}
	var cases []corpusCase
	if err := json.Unmarshal(raw, &cases); err != nil {
		t.Fatalf("json corpus: %v", err)
	}
	if len(cases) == 0 {
		t.Fatal("corpus vide")
	}
	for _, c := range cases {
		t.Run(c.Name, func(t *testing.T) {
			doc := Parse(c.HTML)
			if doc.Text != c.WantText {
				t.Fatalf("texte canonique = %q, want %q", doc.Text, c.WantText)
			}
			for _, f := range c.WantFind {
				start, end, ok := doc.Find(f.Target, f.Ordinal)
				if !ok || start != f.Start || end != f.End {
					t.Errorf("Find(%q, %d) = %d,%d,%v — want %d,%d,true",
						f.Target, f.Ordinal, start, end, ok, f.Start, f.End)
				}
			}
		})
	}
}
