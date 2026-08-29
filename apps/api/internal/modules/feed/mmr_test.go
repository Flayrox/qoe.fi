package feed

import (
	"math"
	"testing"
)

// vec2 construit un petit vecteur d'essai (cosine est générique, pas 512d).
func vec2(vals ...float32) []float32 { return vals }

// TestMMRSelect_RedundancyPenalty vérifie le cœur du MMR : un candidat très
// pertinent mais quasi identique à un item déjà retenu perd sa place au profit
// d'un candidat un peu moins pertinent mais sémantiquement différent.
func TestMMRSelect_RedundancyPenalty(t *testing.T) {
	// A : pertinent et isolé. B : presque aussi pertinent mais identique à A.
	// C : moins pertinent mais orthogonal à A.
	scores := map[string]float64{"A": 1.0, "B": 0.95, "C": 0.6}
	embs := map[string][]float32{
		"A": vec2(1, 0),
		"B": vec2(1, 0), // identique à A → redondant
		"C": vec2(0, 1), // orthogonal → diversifie la page
	}
	got := mmrSelect([]string{"A", "B", "C"}, scores, embs, 3, 0.7)
	// A d'abord (pertinence max, rien de sélectionné), puis C (B est trop
	// similaire à A), puis B en dernier (redondance pénalisée).
	want := []string{"A", "C", "B"}
	if len(got) != len(want) {
		t.Fatalf("mmrSelect = %v, attendu %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("mmrSelect[%d] = %q, attendu %q (ordre complet: %v)", i, got[i], want[i], got)
		}
	}
}

// TestMMRSelect_NoEmbeddingsFallback vérifie le repli sûr : sans embeddings,
// la sélection retombe sur l'ordre de pertinence pur (jamais de blocage).
func TestMMRSelect_NoEmbeddingsFallback(t *testing.T) {
	scores := map[string]float64{"A": 0.9, "B": 0.8, "C": 0.7}
	got := mmrSelect([]string{"A", "B", "C"}, scores, nil, 2, 0.7)
	if len(got) != 2 || got[0] != "A" || got[1] != "B" {
		t.Fatalf("repli sans embeddings = %v, attendu [A B]", got)
	}
	// maxItems supérieur à la liste → tout est retenu, ordre de pertinence.
	got2 := mmrSelect([]string{"A", "B"}, scores, nil, 10, 0.7)
	if len(got2) != 2 || got2[0] != "A" {
		t.Fatalf("maxItems > len = %v, attendu [A B]", got2)
	}
}

// TestMMRSelect_EdgeCases couvre les cas limites (ids vides, maxItems 0,
// λ=1 = pertinence pure sans pénalité de redondance).
func TestMMRSelect_EdgeCases(t *testing.T) {
	scores := map[string]float64{"A": 1}
	if got := mmrSelect(nil, scores, nil, 3, 0.7); got != nil {
		t.Fatalf("ids vides = %v, attendu nil", got)
	}
	if got := mmrSelect([]string{"A"}, scores, nil, 0, 0.7); got != nil {
		t.Fatalf("maxItems 0 = %v, attendu nil", got)
	}
	got := mmrSelect([]string{"A", "B"}, map[string]float64{"A": 1, "B": 0.9},
		map[string][]float32{"A": vec2(1, 0), "B": vec2(1, 0)}, 2, 1.0)
	if len(got) != 2 || got[0] != "A" || got[1] != "B" {
		t.Fatalf("λ=1 = %v, attendu [A B] (pertinence pure)", got)
	}
}

// TestDupSim vérifie la taxe de quasi-duplicat : aucune pénalité sous le
// seuil (deux pensées du même milieu restent ensemble), montée linéaire
// jusqu'à pleine pénalité à similarité parfaite.
func TestDupSim(t *testing.T) {
	if d := dupSim(0.5); d != 0 {
		t.Fatalf("sous le seuil: dupSim=%v, attendu 0", d)
	}
	if d := dupSim(mmrDupThreshold); d != 0 {
		t.Fatalf("au seuil: dupSim=%v, attendu 0", d)
	}
	if d := dupSim(1.0); math.Abs(d-1.0) > 1e-9 {
		t.Fatalf("similarité parfaite: dupSim=%v, attendu 1", d)
	}
	// À mi-chemin entre le seuil et 1.0 → moitié de la pénalité.
	mid := (1.0 + mmrDupThreshold) / 2
	if d := dupSim(mid); math.Abs(d-0.5) > 1e-9 {
		t.Fatalf("mi-chemin: dupSim=%v, attendu 0.5", d)
	}
}

// TestCosine couvre les quatre cas : identiques (1), orthogonaux (0), et les
// replis (vecteur absent / longueurs différentes / vecteur nul → 0).
func TestCosine(t *testing.T) {
	if c := cosine(vec2(1, 0), vec2(1, 0)); math.Abs(c-1) > 1e-9 {
		t.Fatalf("vecteurs identiques: cosine=%v, attendu 1", c)
	}
	if c := cosine(vec2(1, 0), vec2(0, 1)); math.Abs(c) > 1e-9 {
		t.Fatalf("orthogonaux: cosine=%v, attendu 0", c)
	}
	if c := cosine(nil, vec2(1, 0)); c != 0 {
		t.Fatalf("vecteur absent: cosine=%v, attendu 0", c)
	}
	if c := cosine(vec2(1), vec2(1, 0)); c != 0 {
		t.Fatalf("longueurs différentes: cosine=%v, attendu 0", c)
	}
	if c := cosine(vec2(0, 0), vec2(0, 0)); c != 0 {
		t.Fatalf("vecteurs nuls: cosine=%v, attendu 0", c)
	}
}

// TestPickExplorationRatio vérifie la fonction pure de l'exploration
// adaptative : froid (< minSignals) → ratio froid, mature → ratio chaud.
func TestPickExplorationRatio(t *testing.T) {
	if r := pickExplorationRatio(0, 0.22, 0.12, 10); r != 0.22 {
		t.Fatalf("froid (0): %v, attendu 0.22", r)
	}
	if r := pickExplorationRatio(9, 0.22, 0.12, 10); r != 0.22 {
		t.Fatalf("froid limite (9): %v, attendu 0.22", r)
	}
	if r := pickExplorationRatio(10, 0.22, 0.12, 10); r != 0.12 {
		t.Fatalf("mature (10): %v, attendu 0.12", r)
	}
}
