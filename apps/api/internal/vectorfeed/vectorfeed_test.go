package vectorfeed

import (
	"context"
	"log"
	"math"
	"os"
	"strconv"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/qoefi/api/internal/testutil"
)

// ── Tests purs (aucune DB) ────────────────────────────────────────────────

// axis512 construit un vecteur 512-d en plaçant les valeurs à des positions.
func axis512(values ...[2]float64) string {
	parts := make([]string, 512)
	for i := range parts {
		parts[i] = "0"
	}
	for _, p := range values {
		parts[int(p[0])] = strconv.FormatFloat(p[1], 'f', -1, 32)
	}
	return "[" + strings.Join(parts, ",") + "]"
}

func axis512F32(values ...[2]float64) []float32 {
	s := axis512(values...)
	v, _ := ParseLit(s)
	return v
}

func eq(a, b []float32) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

func TestAlpha(t *testing.T) {
	cases := []struct {
		it   InteractionType
		want float64
	}{
		{InteractionHighlight, 0.20},
		{InteractionBookmark, 0.16},
		{InteractionShowMore, 0.12},
		{InteractionReadComplete, 0.12},
		{InteractionCreatePost, 0.12},
		{InteractionLike, 0.08},
		{InteractionReadPartial, 0.05},
		{InteractionClick, 0.03},
		{InteractionType("UNKNOWN"), 0.05},
	}
	for _, c := range cases {
		if got := c.it.Alpha(); got != c.want {
			t.Errorf("Alpha(%q) = %v, attendu %v", c.it, got, c.want)
		}
	}
}

func TestNormalize_UnitNorm(t *testing.T) {
	v := Normalize([]float32{3, 4})           // mag 5
	got := math.Sqrt(float64(v[0]*v[0]) + float64(v[1]*v[1]))
	if math.Abs(got-1) > 1e-6 {
		t.Fatalf("norm = %v, attendu 1", got)
	}
	// Entrée non modifiée.
	orig := []float32{3, 4}
	_ = Normalize(orig)
	if orig[0] != 3 || orig[1] != 4 {
		t.Fatal("Normalize a muté l'entrée")
	}
	// Vecteur nul retourné tel quel (norm=0).
	if out := Normalize([]float32{0, 0, 0}); !eq(out, []float32{0, 0, 0}) {
		t.Fatalf("vecteur nul = %v", out)
	}
}

func TestParseLit(t *testing.T) {
	v, ok := ParseLit("[1,2,3]")
	if !ok || !eq(v, []float32{1, 2, 3}) {
		t.Fatalf("ParseLit([1,2,3]) = %v %v", v, ok)
	}
	if _, ok := ParseLit(""); ok {
		t.Fatal("chaine vide doit échouer")
	}
	if _, ok := ParseLit("not-a-vec"); ok {
		t.Fatal("chaine invalide doit échouer")
	}
	if _, ok := ParseLit("[a,b]"); ok {
		t.Fatal("nombres invalides doivent échouer")
	}
	if _, ok := ParseLit("[]"); ok {
		t.Fatal("liste vide doit échouer")
	}
	// Espaces gérés.
	if v, ok := ParseLit(" [ 1 , 2 ] "); !ok || !eq(v, []float32{1, 2}) {
		t.Fatalf("avec espaces = %v %v", v, ok)
	}
}

func TestLiteral_RoundTrip(t *testing.T) {
	in := []float32{0.25, -1.5, 3.25}
	out := Literal(in)
	if out != "[0.25,-1.5,3.25]" {
		t.Fatalf("Literal = %q", out)
	}
	v, ok := ParseLit(out)
	if !ok || !eq(v, in) {
		t.Fatalf("round-trip = %v %v", v, ok)
	}
}

var poolTest *pgxpool.Pool

func TestMain(m *testing.M) {
	p, err := testutil.Pool(context.Background())
	if err != nil {
		log.Fatalf("testcontainers: %v", err)
	}
	poolTest = p
	code := m.Run()
	testutil.Cleanup()
	os.Exit(code)
}

// seedUser insère un utilisateur avec un vecteur initial connu.
func seedUser(t *testing.T, userID, vec string) {
	t.Helper()
	if _, err := poolTest.Exec(context.Background(),
		`INSERT INTO "User" (id, email, username, name, role, "createdAt", "updatedAt", embedding)
		 VALUES ($1::uuid, $2, $3, 'Vec', 'user', now(), now(), $4::vector)
		 ON CONFLICT (id) DO UPDATE SET embedding = EXCLUDED.embedding, "updatedAt" = now()`,
		userID, userID+"@v.test", "v"+userID[len(userID)-2:], vec); err != nil {
		t.Fatalf("seed user: %v", err)
	}
}

func readVec(t *testing.T, userID string) []float32 {
	t.Helper()
	var txt string
	if err := poolTest.QueryRow(context.Background(),
		`SELECT "embedding"::text FROM "User" WHERE id=$1`, userID).Scan(&txt); err != nil {
		t.Fatalf("read vec: %v", err)
	}
	if txt == "" {
		return nil
	}
	v, _ := ParseLit(txt)
	return v
}

func TestApplyInteraction_ColdStart_TakesTarget(t *testing.T) {
	ctx := context.Background()
	userID := "00000000-0000-0000-0000-00000000f001"
	seedUser(t, userID, axis512([2]float64{10, 1}))
	// Cold-start : reset du vecteur, on force l'absence de vecteur en le vidant.
	if _, err := poolTest.Exec(ctx, `UPDATE "User" SET embedding=NULL WHERE id=$1::uuid`, userID); err != nil {
		t.Fatal(err)
	}
	// Cible = axe y (position 1) : normalized → [0,1,...].
	if err := ApplyInteraction(ctx, poolTest, userID, axis512F32([2]float64{1, 10}), InteractionLike); err != nil {
		t.Fatalf("ApplyInteraction: %v", err)
	}
	v := readVec(t, userID)
	if float64(v[1]) < 0.9 {
		t.Fatalf("cold-start: y = %v, attendu ≈1 (prend directement le vecteur cible)", v[1])
	}
}

func TestApplyInteraction_MovesTowardTarget(t *testing.T) {
	ctx := context.Background()
	userID := "00000000-0000-0000-0000-00000000f002"
	seedUser(t, userID, axis512([2]float64{0, 10}))
	if err := ApplyInteraction(ctx, poolTest, userID, axis512F32([2]float64{1, 10}), InteractionLike); err != nil {
		t.Fatalf("ApplyInteraction: %v", err)
	}
	v := readVec(t, userID)
	// x était exposé (position 0=1) ; après EMA vers y, y devient non nul
	// tandis que x reste dominant (un seul like, α=0.08).
	if float64(v[1]) <= 0 {
		t.Fatalf("après like, y = %v, attendu > 0 (EMA a rapproché du vecteur cible)", v[1])
	}
	if float64(v[0]) <= float64(v[1]) {
		t.Fatalf("x = %v doit rester dominant sur y = %v (un seul like)", v[0], v[1])
	}
}

func TestApplyInteraction_EmptyIsNoop(t *testing.T) {
	ctx := context.Background()
	if err := ApplyInteraction(ctx, poolTest, "", axis512F32([2]float64{1, 0}), InteractionLike); err != nil {
		t.Fatalf("userID vide doit être no-op: %v", err)
	}
	if err := ApplyInteraction(ctx, poolTest, "00000000-0000-0000-0000-00000000f003", nil, InteractionLike); err != nil {
		t.Fatalf("target vide doit être no-op: %v", err)
	}
}

func TestApplyNegative_MovesAway(t *testing.T) {
	ctx := context.Background()
	userID := "00000000-0000-0000-0000-00000000f004"
	seedUser(t, userID, axis512([2]float64{0, 10}))
	// Repousse depuis cur=[1,0,...] (position 0) d'un contenu cible orienté y
	// (position 1) : pushed = cur + strength*(cur - target) → la composante vers
	// le contenu rejeté (y) devient négative tandis que x reste dominant.
	if err := ApplyNegative(ctx, poolTest, userID, axis512F32([2]float64{1, 10}), 0.5); err != nil {
		t.Fatalf("ApplyNegative: %v", err)
	}
	v := readVec(t, userID)
	if float64(v[1]) >= 0 {
		t.Fatalf("negative: y = %v, attendu < 0 (éloigné du contenu rejeté orienté y)", v[1])
	}
	if float64(v[0]) <= 0 {
		t.Fatalf("negative trop fort: x = %v, attendu > 0", v[0])
	}
}

// TestDecayIfStale vérifie la dérive temporelle vers le centroïde du corpus :
// un utilisateur inactif (updatedAt vieux de >1 jour) dont le vecteur est
// orthogonal au centroïde doit dériver partiellement vers lui après interaction.
func TestDecayIfStale(t *testing.T) {
	ctx := context.Background()
	authorID := "00000000-0000-0000-0000-00000000f0a0"
	userID := "00000000-0000-0000-0000-00000000f005"

	// Auteur requis par la FK Article.authorId.
	if _, err := poolTest.Exec(ctx, `INSERT INTO "User" (id, email, username, name, role, "createdAt", "updatedAt")
		VALUES ($1::uuid, $2, 'd-author', 'Author', 'user', now(), now())
		ON CONFLICT (id) DO NOTHING`, authorID, authorID+"@v.test"); err != nil {
		t.Fatalf("auteur: %v", err)
	}
	// Publication + article avec embedding orienté y (position 1) → centroïde ≈ [0,1,...].
	if _, err := poolTest.Exec(ctx, `INSERT INTO "Publication" (id, type, name, slug, "createdAt", "updatedAt")
		VALUES ('pub_decay', 'PERSONAL', 'Decay', 'decay', now(), now()) ON CONFLICT (id) DO NOTHING`); err != nil {
		t.Fatalf("publication: %v", err)
	}
	if _, err := poolTest.Exec(ctx, `INSERT INTO "Article" (id, title, slug, content, published, visibility, status, "publicationId", "authorId", "createdAt", "updatedAt", embedding)
		VALUES ('art_decay', 'Article', 'art-decay', '<p>x</p>', true, 'PUBLIC', 'PUBLISHED', 'pub_decay', $1::uuid, now(), now(), $2::vector)
		ON CONFLICT (id) DO NOTHING`, authorID, axis512([2]float64{1, 10})); err != nil {
		t.Fatalf("article: %v", err)
	}

	// Utilisateur stale orienté x (position 0), vieilli de 10 jours.
	seedUser(t, userID, axis512([2]float64{0, 10}))
	if _, err := poolTest.Exec(ctx, `UPDATE "User" SET "updatedAt" = now() - interval '30 days' WHERE id=$1::uuid`, userID); err != nil {
		t.Fatalf("vieillit user: %v", err)
	}

	// Like vers x. Sans decay, le vecteur resterait sur x (y≈0).
	// Avec decay 30 jours, γ = 1 - 0.5^(30/60) ≈ 0.293 → dérive marquée vers y.
	if err := ApplyInteraction(ctx, poolTest, userID, axis512F32([2]float64{0, 10}), InteractionLike); err != nil {
		t.Fatalf("ApplyInteraction (stale): %v", err)
	}
	v := readVec(t, userID)
	// Vecteur normalisé (L2 = 1).
	sum := 0.0
	for _, c := range v {
		sum += float64(c) * float64(c)
	}
	if math.Abs(math.Sqrt(sum)-1) > 1e-4 {
		t.Fatalf("vecteur non normalisé après decay: %v", v)
	}
	// y > 0 : la dérive vers le centroïde a bien poussé hors de l'axe x.
	// L'ampleur exacte dépend de la magnitude brute du vecteur (non normalisé
	// côté DB) vs le centroïde normalisé, donc on ne fige PAS une valeur : on
	// exige une dérive NETTEMENT au-dessus du bruit (le test « frais » exige
	// y ≈ 0). C'est le contraste qui prouve la décroissance.
	if float64(v[1]) < 0.025 {
		t.Fatalf("decay: y = %v, attendu > 0.025 (dérive vers centroïde manquée)", v[1])
	}
	// x doit rester dominant (single like, décroissance partielle seulement).
	if float64(v[0]) <= float64(v[1]) {
		t.Fatalf("x = %v doit rester dominant sur y = %v (décroissance trop forte)", v[0], v[1])
	}
}

// TestDecay_Crecent_NoDecay vérifie que la décroissance n'a PAS lieu quand le
// vecteur est récent (≤ decayMinElapsedDays) : un like n'introduit alors
// aucune dérive vers le centroïde.
func TestDecay_Crecent_NoDecay(t *testing.T) {
	ctx := context.Background()
	userID := "00000000-0000-0000-0000-00000000f007"
	seedUser(t, userID, axis512([2]float64{0, 10}))
	// updatedAt = now (frais) → decay no-op.
	if err := ApplyInteraction(ctx, poolTest, userID, axis512F32([2]float64{0, 10}), InteractionLike); err != nil {
		t.Fatalf("ApplyInteraction (frais): %v", err)
	}
	v := readVec(t, userID)
	// Sans decay, un like vers x pur garde y ~ 0 (aucune dérive vers centroïde).
	if float64(v[1]) > 0.02 {
		t.Fatalf("récent ne doit pas dériver: y = %v, attendu ≈ 0", v[1])
	}
}
