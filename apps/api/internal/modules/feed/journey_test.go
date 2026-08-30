package feed

import (
	"context"
	"fmt"
	"math"
	"strconv"
	"strings"
	"testing"

	"github.com/qoefi/api/internal/modules/highlights"
	"github.com/qoefi/api/internal/modules/posts"
	"github.com/qoefi/api/internal/modules/tracking"
	"github.com/qoefi/api/internal/vectorfeed"
)

// ── Parcours complet : interactions réelles → embedding → « Pour vous » ─────
//
// Ces tests simulent le parcours d'un lecteur sur la base régénérée : il suit
// une publication, lit des articles, like des pensées, bookmarque, surligne,
// demande « voir plus », publie une pensée, et rejette du contenu d'une autre
// niche — via les VRAIS services (tracking, posts, highlights) — puis vérifie
// que son embedding sémantique dérive vers sa niche et que son « Pour vous »
// la favorise.

// Axes sémantiques des niches (positions dans le vecteur 512-d), bien séparés
// pour que deux niches soient quasi orthogonales (cos ≈ 0) et que le moteur
// ANN les distingue clairement.
const (
	axisFoot  = 10
	axisAnime = 20
	axisCook  = 30
)

// vecAt512 construit un littéral pgvector 512-d avec des valeurs aux positions
// données (index 0-based). Chaque item porte une composante propre
// (100/110 + niche*100 + k) pour que deux items d'une même niche ne soient pas
// des quasi-duplicats parfaits (cos intra-niche ≈ 0.735 < seuil MMR 0.92),
// tout en restant fortement alignés sur l'axe de leur niche (cos ≈ 0.857).
func vecAt512(pairs ...[2]float64) string {
	parts := make([]string, 512)
	for i := range parts {
		parts[i] = "0"
	}
	for _, p := range pairs {
		idx, val := int(p[0]), p[1]
		if idx >= 0 && idx < 512 {
			parts[idx] = strconv.FormatFloat(val, 'f', -1, 32)
		}
	}
	return "[" + strings.Join(parts, ",") + "]"
}

func parseF32(s string) []float32 {
	v, _ := vectorfeed.ParseLit(s)
	return v
}

// journeyNiche regroupe les ids d'une niche du monde de test.
type journeyNiche struct {
	prefix   string
	authorID string
	pubID    string
	arts     []string
	posts    []string
}

// seedJourneyWorld crée 3 niches (foot, anime, cuisine) avec un auteur, une
// publication, 6 articles et 6 pensées embeddés chacune, plus un lecteur dont
// le vecteur part de « anime + cuisine » (aucun foot au départ).
func seedJourneyWorld(t *testing.T) (readerID string, niches map[string]*journeyNiche) {
	t.Helper()
	ctx := context.Background()
	if _, err := poolTest.Exec(ctx, `TRUNCATE TABLE
		"Post", "Article", "User", "Publication", "Follows", "BlockedUser",
		"ContentFeedback", "ReadingSession", "FeedImpression", "Like",
		"Bookmark", "Highlight", "Notification", "_CoAuthors" CASCADE`); err != nil {
		t.Fatalf("truncate: %v", err)
	}

	readerID = "00000000-0000-0000-0000-00000000a010"
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "User" (id, email, username, name, role, "createdAt", "updatedAt", embedding)
		 VALUES ($1, 'reader@j.test', 'journey-reader', 'Lectrice', 'user', now(), now(), $2::vector)`,
		readerID, vecAt512([2]float64{axisAnime, 1}, [2]float64{axisCook, 1})); err != nil {
		t.Fatalf("seed lectrice: %v", err)
	}

	niches = map[string]*journeyNiche{}
	for i, n := range []struct {
		prefix string
		axis   int
	}{
		{"foot", axisFoot},
		{"anime", axisAnime},
		{"cook", axisCook},
	} {
		authorID := fmt.Sprintf("00000000-0000-0000-0000-00000000a00%d", i+1)
		pubID := "pub_" + n.prefix
		if _, err := poolTest.Exec(ctx,
			`INSERT INTO "User" (id, email, username, name, role, "createdAt", "updatedAt")
			 VALUES ($1, $2||'@j.test', $2, $2, 'creator', now(), now())`,
			authorID, n.prefix+"_author"); err != nil {
			t.Fatalf("seed auteur %s: %v", n.prefix, err)
		}
		if _, err := poolTest.Exec(ctx,
			`INSERT INTO "Publication" (id, type, name, slug, "createdAt", "updatedAt")
			 VALUES ($1, 'PERSONAL', $2, $2, now(), now())`, pubID, "Pub "+n.prefix); err != nil {
			t.Fatalf("seed publication %s: %v", n.prefix, err)
		}

		niche := &journeyNiche{prefix: n.prefix, authorID: authorID, pubID: pubID}
		// 6 articles + 6 pensées par niche, embeddés sur l'axe de la niche.
		for k := 0; k < 6; k++ {
			artID := fmt.Sprintf("%s_art_%d", n.prefix, k)
			if _, err := poolTest.Exec(ctx,
				`INSERT INTO "Article" (id, title, slug, content, published, visibility, "readingTime",
				                        status, "publicationId", "authorId", "createdAt", "updatedAt", embedding)
				 VALUES ($1, $2, $2, $3, true, 'PUBLIC', 8, 'PUBLISHED', $4, $5, now(), now(), $6::vector)`,
				artID, "Article "+n.prefix+" "+fmt.Sprint(k), "<p>Corps "+n.prefix+"</p>", pubID, authorID,
				vecAt512([2]float64{float64(n.axis), 1}, [2]float64{float64(100 + i*100 + k), 0.6})); err != nil {
				t.Fatalf("seed article %s: %v", artID, err)
			}
			niche.arts = append(niche.arts, artID)

			postID := fmt.Sprintf("%s_post_%d", n.prefix, k)
			if _, err := poolTest.Exec(ctx,
				`INSERT INTO "Post" (id, content, "authorId", "createdAt", "updatedAt", tags,
				                     visibility, "contentVisibility", "isDraft", "replyRestriction",
				                     "likeCount", "repostCount", "replyCount", embedding)
				 VALUES ($1, $2, $3, now(), now(), ARRAY[$4]::text[],
				         'public', 'PUBLIC', false, 'everyone', 0, 0, 0, $5::vector)`,
				postID, "Pensée "+n.prefix+" "+fmt.Sprint(k), authorID, n.prefix,
				vecAt512([2]float64{float64(n.axis), 1}, [2]float64{float64(110 + i*100 + k), 0.6})); err != nil {
				t.Fatalf("seed pensée %s: %v", postID, err)
			}
			niche.posts = append(niche.posts, postID)
		}
		niches[n.prefix] = niche
	}
	return readerID, niches
}

// shareOf compte la part d'items d'une niche dans un résultat du moteur.
func shareOf(res EngineResult, prefix string) float64 {
	total := len(res.Items)
	if total == 0 {
		return 0
	}
	n := 0
	for _, it := range res.Items {
		if strings.HasPrefix(it.ID, prefix+"_") {
			n++
		}
	}
	return float64(n) / float64(total)
}

// userCosines lit l'embedding du lecteur et renvoie les cosinus avec les axes
// des trois niches (et leur somme, garde-fou de normalisation).
func userCosines(t *testing.T, userID string) (cosFoot, cosAnime, cosCook float64) {
	t.Helper()
	var txt string
	if err := poolTest.QueryRow(context.Background(),
		`SELECT "embedding"::text FROM "User" WHERE id=$1`, userID).Scan(&txt); err != nil {
		t.Fatalf("lecture embedding: %v", err)
	}
	v, ok := vectorfeed.ParseLit(txt)
	if !ok {
		t.Fatalf("embedding illisible: %q", txt)
	}
	cosFoot = cosine(v, parseF32(vecAt512([2]float64{axisFoot, 1})))
	cosAnime = cosine(v, parseF32(vecAt512([2]float64{axisAnime, 1})))
	cosCook = cosine(v, parseF32(vecAt512([2]float64{axisCook, 1})))
	return cosFoot, cosAnime, cosCook
}

// TestJourney_FullReaderJourney_MovesEmbeddingAndFeed est LE test du parcours
// complet demandé : connexion en tant qu'un compte, lecture de 2-3 articles de
// sa niche, like, bookmark, surlignage, « voir plus », publication d'une
// pensée, rejet d'une autre niche — puis vérification que l'embedding et le
// « Pour vous » ont évolué.
func TestJourney_FullReaderJourney_MovesEmbeddingAndFeed(t *testing.T) {
	ctx := context.Background()
	readerID, niches := seedJourneyWorld(t)
	foot, anime := niches["foot"], niches["anime"]

	svc := newTestService()
	track := tracking.NewService(poolTest)
	postsSvc := posts.NewService(poolTest, nil, nil)
	high := highlights.NewService(poolTest)

	// ▸ État de départ : le lecteur penche anime+cuisine, pas foot.
	before, err := svc.PersonalizedEngine(ctx, readerID, 10, 0, 15)
	if err != nil {
		t.Fatalf("feed initial: %v", err)
	}
	footShareBefore := shareOf(before, "foot")
	cosFoot0, cosAnime0, cosCook0 := userCosines(t, readerID)

	// ▸ 1. Abonnement à la publication foot (nourrit l'onglet Abonnements ;
	//    le suivi ne touche PAS l'embedding — seule la consommation le fait).
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Follows" (id, "readerId", "publicationId", "createdAt")
		 VALUES ('follow_j1', $1, 'pub_foot', now())`, readerID); err != nil {
		t.Fatalf("follow: %v", err)
	}

	// ▸ 2. Lecture : 2 articles foot en entier + 1 partiel.
	for _, s := range []struct {
		art, status         string
		scroll, dwell, mins int
	}{
		{foot.arts[0], "READ_COMPLETE", 95, 240, 12},
		{foot.arts[1], "READ_COMPLETE", 90, 220, 10},
		{foot.arts[2], "READ_PARTIAL", 45, 90, 4},
	} {
		if _, err := track.TrackReadingSession(ctx, readerID, s.art, "feed", s.status, s.scroll, s.dwell, s.mins, nil, nil); err != nil {
			t.Fatalf("lecture %s: %v", s.art, err)
		}
	}

	// ▸ 3. Deux likes sur des pensées foot.
	for _, p := range []string{foot.posts[0], foot.posts[1]} {
		if _, err := postsSvc.ToggleLike(ctx, p, readerID); err != nil {
			t.Fatalf("like %s: %v", p, err)
		}
	}

	// ▸ 4. Un bookmark sur un article foot.
	if _, err := postsSvc.ToggleBookmark(ctx, foot.arts[0], readerID); err != nil {
		t.Fatalf("bookmark: %v", err)
	}

	// ▸ 5. Un surlignage (l'engagement le plus fort, α=0.20).
	if _, err := high.Create(ctx, foot.arts[1], readerID, "Passage très juste sur le jeu sans ballon", nil, false, 3); err != nil {
		t.Fatalf("highlight: %v", err)
	}

	// ▸ 6. « Voir plus » sur un article foot.
	if _, _, err := track.TrackShowMore(ctx, readerID, foot.arts[3], ""); err != nil {
		t.Fatalf("show-more: %v", err)
	}

	// ▸ 7. Publication d'une pensée foot : le worker l'embed puis applique
	//    CREATE_POST (α=0.12) — on simule ici cette étape du worker.
	if _, err := postsSvc.Create(ctx, readerID, "<p>Le pressing moderne a changé le foot</p>", []string{"foot"}, nil, nil); err != nil {
		t.Fatalf("création pensée: %v", err)
	}
	if err := vectorfeed.ApplyInteraction(ctx, poolTest, readerID,
		parseF32(vecAt512([2]float64{axisFoot, 1})), vectorfeed.InteractionCreatePost); err != nil {
		t.Fatalf("EMA create-post: %v", err)
	}

	// ▸ 8. Rejet de l'anime : « Voir moins » (0.15) + bounce (0.06).
	if _, _, err := track.TrackShowLess(ctx, readerID, anime.arts[0], ""); err != nil {
		t.Fatalf("show-less: %v", err)
	}
	if _, err := track.TrackReadingSession(ctx, readerID, anime.arts[1], "feed", "BOUNCE", 5, 8, 1, nil, nil); err != nil {
		t.Fatalf("bounce: %v", err)
	}

	// ▸ Vérifications embedding : le vecteur a dérivé vers le foot, loin de
	//    l'anime rejeté, et la cuisine (non consommée) a reculé aussi.
	cosFoot1, cosAnime1, cosCook1 := userCosines(t, readerID)
	if cosFoot1 <= 0.7 {
		t.Fatalf("embedding: cos(foot) après parcours = %v, attendu > 0.7 (dérive vers la niche manquée)", cosFoot1)
	}
	if cosAnime1 >= 0.4 {
		t.Fatalf("embedding: cos(anime) après parcours = %v, attendu < 0.4 (rejet « voir moins » + bounce ignorés ?)", cosAnime1)
	}
	if cosCook1 >= 0.6 {
		t.Fatalf("embedding: cos(cuisine) après parcours = %v, attendu < 0.6 (la niche non consommée doit reculer)", cosCook1)
	}
	if cosFoot1 <= cosAnime1+0.3 || cosFoot1 <= cosCook1+0.2 {
		t.Fatalf("embedding: le foot (%v) doit dominer l'anime (%v) et la cuisine (%v)", cosFoot1, cosAnime1, cosCook1)
	}
	t.Logf("embedding: cos foot %.3f→%.3f · anime %.3f→%.3f · cuisine %.3f→%.3f",
		cosFoot0, cosFoot1, cosAnime0, cosAnime1, cosCook0, cosCook1)

	// ▸ Vérification « Pour vous » : le foot prend la majorité du top-10.
	after, err := svc.PersonalizedEngine(ctx, readerID, 10, 0, 15)
	if err != nil {
		t.Fatalf("feed après parcours: %v", err)
	}
	footShareAfter := shareOf(after, "foot")
	animeShareAfter := shareOf(after, "anime")
	if footShareAfter < 0.5 {
		t.Fatalf("« Pour vous »: part foot après parcours = %.2f, attendu ≥ 0.5", footShareAfter)
	}
	if footShareAfter <= footShareBefore+0.3 {
		t.Fatalf("« Pour vous »: part foot %.2f → %.2f, le parcours doit la faire progresser", footShareBefore, footShareAfter)
	}
	if footShareAfter <= animeShareAfter {
		t.Fatalf("« Pour vous »: foot %.2f doit dépasser anime %.2f après le parcours", footShareAfter, animeShareAfter)
	}
	t.Logf("« Pour vous » top-10: foot %.2f → %.2f · anime %.2f · (départ foot %.2f)",
		footShareBefore, footShareAfter, animeShareAfter, footShareBefore)
}

// ── Toutes les interactions qui touchent l'embedding ────────────────────────
//
// Table-driven : chaque type d'interaction (positif EMA ou négatif) est joué
// UNE fois depuis le même vecteur de départ, et on vérifie la direction du
// déplacement ET l'ordre des poids (un surlignage déplace plus qu'un like,
// lui-même plus qu'un clic ; « voir moins » éloigne plus que le bounce).

func seedVectorUser(t *testing.T, userID, vec string) {
	t.Helper()
	if _, err := poolTest.Exec(context.Background(),
		`INSERT INTO "User" (id, email, username, name, role, "createdAt", "updatedAt", embedding)
		 VALUES ($1::uuid, $2, $3, 'Vec', 'user', now(), now(), $4::vector)
		 ON CONFLICT (id) DO UPDATE SET embedding = EXCLUDED.embedding, "updatedAt" = now()`,
		userID, userID+"@j.test", "v"+userID[len(userID)-4:], vec); err != nil {
		t.Fatalf("seed user: %v", err)
	}
}

func readUserVec(t *testing.T, userID string) []float32 {
	t.Helper()
	var txt string
	if err := poolTest.QueryRow(context.Background(),
		`SELECT "embedding"::text FROM "User" WHERE id=$1`, userID).Scan(&txt); err != nil {
		t.Fatalf("read vec: %v", err)
	}
	v, _ := vectorfeed.ParseLit(txt)
	return v
}

func TestInteractions_AllTypes_WeightsOrdering(t *testing.T) {
	ctx := context.Background()
	if _, err := poolTest.Exec(ctx, `TRUNCATE TABLE
		"Post", "Article", "User", "Publication", "Follows", "BlockedUser",
		"ContentFeedback", "ReadingSession", "FeedImpression", "Like",
		"Bookmark", "Highlight", "Notification", "_CoAuthors" CASCADE`); err != nil {
		t.Fatalf("truncate: %v", err)
	}

	type posRow struct {
		name  string
		it    vectorfeed.InteractionType
		alpha float64
	}
	// Ordre croissant des poids EMA (cf. vectorfeed.emaWeights).
	posRows := []posRow{
		{"CLICK", vectorfeed.InteractionClick, 0.03},
		{"READ_PARTIAL", vectorfeed.InteractionReadPartial, 0.05},
		{"LIKE", vectorfeed.InteractionLike, 0.08},
		{"SHOW_MORE", vectorfeed.InteractionShowMore, 0.12},
		{"READ_COMPLETE", vectorfeed.InteractionReadComplete, 0.12},
		{"CREATE_POST", vectorfeed.InteractionCreatePost, 0.12},
		{"BOOKMARK", vectorfeed.InteractionBookmark, 0.16},
		{"HIGHLIGHT", vectorfeed.InteractionHighlight, 0.20},
	}
	start := vecAt512([2]float64{axisFoot, 1}, [2]float64{axisAnime, 1})
	target := parseF32(vecAt512([2]float64{axisFoot, 1}))
	cosBefore := cosine(parseF32(start), target) // 0.707…

	deltas := map[string]float64{}
	for i, r := range posRows {
		userID := fmt.Sprintf("00000000-0000-0000-0000-00000000b%03d", i+1)
		seedVectorUser(t, userID, start)
		if err := vectorfeed.ApplyInteraction(ctx, poolTest, userID, target, r.it); err != nil {
			t.Fatalf("%s: %v", r.name, err)
		}
		d := cosine(readUserVec(t, userID), target) - cosBefore
		deltas[r.name] = d
		if d <= 0 {
			t.Fatalf("%s (α=%.2f): delta cos = %v, attendu > 0 (rapprochement vers la cible)", r.name, r.alpha, d)
		}
	}

	// Ordre strict des poids : même α ⇒ même déplacement, α croissant ⇒
	// déplacement croissant. C'est la hiérarchie « surlignage > bookmark >
	// lecture finie/like/clic » qui rend la personnalisation calibrée.
	prevAlpha, prevDelta := -1.0, math.Inf(-1)
	for _, r := range posRows {
		d := deltas[r.name]
		if r.alpha == prevAlpha {
			if math.Abs(d-prevDelta) > 1e-3 {
				t.Fatalf("%s (α=%.2f): delta %v doit être identique au précédent %v (même poids)", r.name, r.alpha, d, prevDelta)
			}
		} else if d <= prevDelta {
			t.Fatalf("%s (α=%.2f): delta %v doit être STRICTEMENT supérieur à %v (ordre des poids violé)", r.name, r.alpha, d, prevDelta)
		}
		prevAlpha, prevDelta = r.alpha, d
	}

	// Négatifs : « voir moins » (0.15) éloigne plus que le bounce (0.06) —
	// les intensités réellement utilisées par tracking/service.go.
	animeTarget := parseF32(vecAt512([2]float64{axisAnime, 1}))
	cosAnimeBefore := cosine(parseF32(start), animeTarget)
	negDeltas := map[string]float64{}
	for i, ng := range []struct {
		name     string
		strength float64
	}{
		{"BOUNCE", 0.06},
		{"SHOW_LESS", 0.15},
	} {
		userID := fmt.Sprintf("00000000-0000-0000-0000-00000000c%03d", i+1)
		seedVectorUser(t, userID, start)
		if err := vectorfeed.ApplyNegative(ctx, poolTest, userID, animeTarget, ng.strength); err != nil {
			t.Fatalf("%s: %v", ng.name, err)
		}
		d := cosine(readUserVec(t, userID), animeTarget) - cosAnimeBefore
		negDeltas[ng.name] = d
		if d >= 0 {
			t.Fatalf("%s (strength=%.2f): delta cos = %v, attendu < 0 (éloignement)", ng.name, ng.strength, d)
		}
	}
	if math.Abs(negDeltas["SHOW_LESS"]) <= math.Abs(negDeltas["BOUNCE"]) {
		t.Fatalf("« voir moins » (%.3f) doit éloigner plus que le bounce (%.3f)", negDeltas["SHOW_LESS"], negDeltas["BOUNCE"])
	}
	t.Logf("deltas positifs: %v", deltas)
	t.Logf("deltas négatifs: %v", negDeltas)
}
