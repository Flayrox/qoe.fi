package feed

import (
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgtype"
)

func TestTextPtr(t *testing.T) {
	if v := textPtr(pgtype.Text{}); v != nil {
		t.Errorf("textPtr invalid = %v", *v)
	}
	if v := textPtr(pgtype.Text{String: "x", Valid: true}); v == nil || *v != "x" {
		t.Errorf("textPtr valid = %v", v)
	}
}

func TestParseCursor(t *testing.T) {
	if ParseCursor("") != 0 {
		t.Error("cursor vide → 0")
	}
	if ParseCursor("12") != 12 {
		t.Error("cursor numérique → 12")
	}
	if ParseCursor("abc") != 0 {
		t.Error("cursor invalide → 0")
	}
	if ParseCursor("-3") != 0 {
		t.Error("cursor négatif → 0")
	}
}

func TestClampInt(t *testing.T) {
	if clampInt(5, 0, 10) != 5 {
		t.Error("dans les bornes")
	}
	if clampInt(-1, 0, 10) != 0 {
		t.Error("sous la borne basse")
	}
	if clampInt(99, 0, 10) != 10 {
		t.Error("au-dessus de la borne haute")
	}
}

func TestMutedOK(t *testing.T) {
	if !mutedOK("bonjour", nil) {
		t.Error("pas de mots masqués → true")
	}
	if !mutedOK("bonjour", []string{}) {
		t.Error("liste vide → true")
	}
	if mutedOK("le match de foot", []string{"foot"}) {
		t.Error("contient le mot masqué → false")
	}
	if !mutedOK("cuisine", []string{"FOOT"}) {
		t.Error("insensible à la casse pour le mot, mais utile ici")
	}
	// Mot masqué en majuscules dans le texte.
	if mutedOK("SUPER FOOT", []string{"foot"}) {
		t.Error("mot masqué en majuscule doit être détecté (lower)")
	}
}

// TestGetCircadianProfile — profils par plage horaire + week-end + defaut.
func TestGetCircadianProfile(t *testing.T) {
	byName := func(h, d int) string { return getCircadianProfile(h, d).Name }
	if byName(8, 1) != "MORNING_BRIEF" {
		t.Errorf("8h = %s", byName(8, 1))
	}
	if byName(12, 1) != "MIDDAY_BREAK" {
		t.Errorf("12h = %s", byName(12, 1))
	}
	if byName(16, 1) != "AFTERNOON_FLOW" {
		t.Errorf("16h = %s", byName(16, 1))
	}
	if byName(20, 1) != "EVENING_SANCTUARY" {
		t.Errorf("20h = %s", byName(20, 1))
	}
	if byName(3, 1) != "LATE_NIGHT" {
		t.Errorf("3h = %s", byName(3, 1))
	}
	// Week-end prime sur l'heure.
	if byName(8, 0) != "WEEKEND_LONGFORM" {
		t.Errorf("dimanche 8h = %s", byName(8, 0))
	}
	if byName(8, 6) != "WEEKEND_LONGFORM" {
		t.Errorf("samedi 8h = %s", byName(8, 6))
	}
	// userHour hors bornes → repli sur maintenant (ne doit pas paniquer).
	getCircadianProfile(-1, -1)
	getCircadianProfile(99, 99)
}

// TestParsing — parseEmbeddingText parcourt les embeddings stockés en texte.
func TestParseEmbeddingText(t *testing.T) {
	if _, ok := parseEmbeddingText(""); ok {
		t.Error("vide → false")
	}
	if _, ok := parseEmbeddingText("[]"); ok {
		t.Error("[] → false")
	}
	if _, ok := parseEmbeddingText("encore invalide"); ok {
		t.Error("non-numérique → false")
	}
	if _, ok := parseEmbeddingText("[   ]"); ok {
		t.Error("[   ] → false")
	}
	v, ok := parseEmbeddingText("[0.1, 0.2, 0.3]")
	if !ok || len(v.Slice()) != 3 {
		t.Errorf("[0.1,0.2,0.3] → ok=%v len=%d", ok, len(v.Slice()))
	}
}

// TestNeighborValues vérifie la construction du VALUES SQL typé uuid/float8.
func TestNeighborValues(t *testing.T) {
	got := neighborValues(map[string]float64{
		"00000000-0000-0000-0000-0000000000aa": 2.5,
	})
	if !strings.Contains(got, "00000000-0000-0000-0000-0000000000aa'::uuid") {
		t.Errorf("uid manquant dans VALUES: %s", got)
	}
	if !strings.Contains(got, "2.5::float8") {
		t.Errorf("affinité manquante dans VALUES: %s", got)
	}
	if !strings.HasPrefix(got, "SELECT * FROM (VALUES ") {
		t.Errorf("VALUES malformé: %s", got)
	}
	// Map vide → clause SELECT sans entrées.
	empty := neighborValues(map[string]float64{})
	if !strings.HasPrefix(empty, "SELECT * FROM (VALUES ") {
		t.Errorf("empty malformé: %s", empty)
	}
}