// Package seed — générateur déterministe de la DB « top du top ».
//
// Remplace l'ancien seed-large.ts + lib/seed-umami.ts + lib/seed-reading-sessions.ts
// (supprimés avec Prisma) : même profil réaliste, 100 % Go, PRNG seedé (même
// seed → mêmes données à chaque exécution), idempotent via WipeAll + inserts.
//
//	Users ~500 (40% créateurs, loi puissance d'abonnés)
//	Publications PERSONAL + catégories
//	Articles ~200 (corpus de sujets, premium ~15%)
//	Pensées ~1480 (racines + réponses)
//	Follows / likes / abonnés / wallet / bookmarks
//	ReadingSessions ~5700 sur 14 jours
//	Umami ~10.5k events / ~2.3k sessions sur 30 jours (RunTopUmami)
package seed

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ---------------------------------------------------------------------------
// PRNG déterministe (mulberry32 — même graphe à chaque exécution)
// ---------------------------------------------------------------------------

type prng struct{ state uint32 }

func newPRNG(seed uint32) *prng { return &prng{state: seed} }

func (p *prng) next() float64 {
	p.state += 0x6D2B79F5
	t := p.state
	t = (t ^ (t >> 15)) * (t | 1)
	t ^= t + ((t ^ (t >> 7)) * (t | 61))
	return float64((t^(t>>14))&0xFFFFFFFF) / 4294967296.0
}

func (p *prng) intn(n int) int {
	if n <= 0 {
		return 0
	}
	return int(p.next() * float64(n))
}

func prngPick[T any](p *prng, items []T) T {
	return items[p.intn(len(items))]
}

// weightedIndex retourne l'index d'un élément selon des poids (loi puissance…).
func (p *prng) weightedIndex(weights []float64) int {
	total := 0.0
	for _, w := range weights {
		total += w
	}
	r := p.next() * total
	for i, w := range weights {
		r -= w
		if r <= 0 {
			return i
		}
	}
	return len(weights) - 1
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

// TopOptions pilote la génération (défauts = profil de la top DB restaurée).
type TopOptions struct {
	Users           int // 500
	CreatorsRatio   float64
	Articles        int // 200
	Posts           int // 1480
	ReadingSessions int // ~5700
	PremiumRatio    float64
	// SeedUmami génère les événements Umami (nécessite UmamiDSN).
	SeedUmami bool
	UmamiDSN  string
}

func (o TopOptions) defaults() TopOptions {
	if o.Users <= 0 {
		o.Users = 500
	}
	if o.CreatorsRatio <= 0 {
		o.CreatorsRatio = 0.4
	}
	if o.Articles <= 0 {
		o.Articles = 200
	}
	if o.Posts <= 0 {
		o.Posts = 1480
	}
	if o.ReadingSessions <= 0 {
		o.ReadingSessions = 5700
	}
	if o.PremiumRatio <= 0 {
		o.PremiumRatio = 0.15
	}
	return o
}

// TopResult expose les entités générées (réutilisées par umami/embeddings).
type TopResult struct {
	Users        []TopUser
	Publications []TopPublication
	Articles     []TopArticle
	PostIDs      []string
	ReadingSess  int
	Follows      int
	Likes        int
	Subscribers  int
}

type TopUser struct {
	ID        string
	Email     string
	Name      string
	Username  string
	Role      string
	Country   string
	CreatedAt time.Time
	PubID     string // publication PERSONAL si créateur
}

type TopPublication struct {
	ID        string
	OwnerID   string
	Name      string
	Slug      string
	Subdomain string
	Bio       string
	Accent    string
}

type TopArticle struct {
	ID            string
	PublicationID string
	AuthorID      string
	Slug          string
	Title         string
	Content       string
	CategoryID    string
	Premium       bool
	ReadingTime   int
	CreatedAt     time.Time
}

// ---------------------------------------------------------------------------
// Corpus (compact mais varié — même esprit que l'ancien seed LLM)
// ---------------------------------------------------------------------------

var topFirstNames = []string{
	"Ambre", "Noé", "Clara", "Lucas", "Inès", "Gabriel", "Léa", "Raphaël", "Emma", "Louis",
	"Chloé", "Arthur", "Manon", "Jules", "Camille", "Hugo", "Sarah", "Nathan", "Zoé", "Théo",
	"Eva", "Adam", "Lina", "Victor", "Rose", "Antoine", "Mila", "Paul", "Alice", "Nino",
	"Margaux", "Eliott", "June", "Sacha", "Lou", "Marius", "Nour", "Axel", "Romy", "Isaac",
}

var topLastNames = []string{
	"Martin", "Bernard", "Dubois", "Moreau", "Laurent", "Simon", "Michel", "Lefebvre", "Leroy",
	"Roux", "Fournier", "Girard", "Bonnet", "Lambert", "Mercier", "Blanc", "Henry", "Garnier",
	"Rousseau", "Faure", "André", "Guérin", "Boyer", "Renard", "Chevalier", "Lemaire", "Perrin",
	"Colin", "Vidal", "Gauthier", "Renaud", "Barre", "Dupont", "Petit", "Fontaine", "Caron",
	"Robin", "Masson", "Marchand", "Olivier",
}

var topAccents = []string{"#c5a880", "#3ecf8e", "#5b8def", "#e4572e", "#8e5bde", "#2aa198", "#d65f76", "#6b8e23"}

var topCountries = []string{"FR", "FR", "FR", "FR", "BE", "CH", "CA", "LU", "MC", "SN"}

// topTopics : titre (pattern avec %s) + 3 paragraphes de corps.
var topTopics = []struct {
	title  string
	paras  [3]string
	tags   []string
	editor bool
}{
	{"%s : la souveraineté des médias indépendants", [3]string{
		"<p>Dans un monde saturé de plateformes, posséder son propre espace de publication n'est plus un luxe : c'est une condition de survie éditoriale.</p>",
		"<p>Cet article explore ce que signifie réellement être souverain sur son audience, son contenu et ses revenus, loin des algorithmes de capture de l'attention.</p>",
		"<p>La conclusion est simple : ceux qui écrivent pour durer finissent toujours par gagner la confiance de leur lectorat.</p>"},
		[]string{"souverainete", "medias"}, true},
	{"Pourquoi %s gagne toujours sur le temps long", [3]string{
		"<p>L'économie de l'attention récompense le bruit. L'histoire, elle, récompense la constance.</p>",
		"<p>Les médias et les auteurs qui écrivent pour durer, qui refusent la course au clic, construisent un actif que rien ne peut dévaluer.</p>",
		"<p>Le temps long n'est pas une posture : c'est une stratégie de publication et de revenus.</p>"},
		[]string{"temps", "independance"}, true},
	{"L'architecture du silence numérique : %s", [3]string{
		"<p>Le silence n'est pas l'absence de contenu : c'est une architecture de lecture.</p>",
		"<p>Conçue autour de cette idée — moins d'interruptions, plus de sens — la lecture profonde redevient possible.</p>",
		"<p>Chaque détail d'interface doit servir cette trajectoire : l'esprit qui retrouve son chemin.</p>"},
		[]string{"attention", "silence"}, true},
	{"%s : la résilience territoriale à l'ère de l'Anthropocène", [3]string{
		"<p>L'urgence écologique exige que nous repensions nos modes de subsistance et d'organisation collective à l'échelle des territoires.</p>",
		"<p>La résilience n'est pas un repli frileux, mais une réappropriation joyeuse de nos forces de production et de nos communs.</p>",
		"<p>Des initiatives locales montrent qu'une autre répartition du pouvoir est possible.</p>"},
		[]string{"ecologie", "territoire"}, true},
	{"Reprendre le contrôle de %s à l'ère des plateformes", [3]string{
		"<p>Chaque seconde d'attention est marchandée au plus offrant par des algorithmes de capture.</p>",
		"<p>Reprendre le contrôle de ses écrits, c'est refuser de livrer ses pensées aux machines de capture d'attention.</p>",
		"<p>Habiter sa propre plateforme sans intermédiaire de censure est le premier pas vers une écriture libre.</p>"},
		[]string{"souverainete", "numerique"}, false},
	{"Le manifeste pour un journalisme de %s", [3]string{
		"<p>Le journalisme moderne est mort de sa dépendance aux clics.</p>",
		"<p>Pour survivre et retrouver sa dignité, le journalisme doit devenir un sanctuaire pour l'attention du lecteur.</p>",
		"<p>Le financement par les lecteurs — et non par la publicité — est la seule voie durable.</p>"},
		[]string{"journalisme", "attention"}, true},
	{"%s : ce que cache l'économie de l'attention", [3]string{
		"<p>Le temps de lecture est une denrée rare, et la plupart des plateformes en vivent.</p>",
		"<p>Derrière les métriques d'engagement se cache un modèle économique qui épuise lecteurs et créateurs.</p>",
		"<p>Sortir de cette économie demande une architecture radicalement différente.</p>"},
		[]string{"attention", "economie"}, false},
	{"%s : penser la ville de demain", [3]string{
		"<p>La ville de demain se construit aujourd'hui, dans les interstices de l'urbanisme ordinaire.</p>",
		"<p>Mobilité douce, nature en ville, logement abordable : tout se tient.</p>",
		"<p>Les citoyens ne sont pas des spectateurs de la ville, ils en sont les architectes.</p>"},
		[]string{"ville", "urbanisme"}, false},
	{"L'école et %s : l'urgence d'une refondation", [3]string{
		"<p>Le système scolaire français traverse une crise de sens autant que de moyens.</p>",
		"<p>Refonder l'école, c'est d'abord redonner du temps aux enseignants et aux élèves.</p>",
		"<p>La liberté pédagogique est la première des libertés publiques.</p>"},
		[]string{"education"}, false},
	{"%s : plongée dans l'économie de la donnée", [3]string{
		"<p>La donnée est devenue la matière première de l'économie numérique.</p>",
		"<p>Mais qui possède réellement cette matière première ? Et à qui profite sa circulation ?</p>",
		"<p>La souveraineté des données personnelles est un enjeu démocratique majeur.</p>"},
		[]string{"donnees", "numerique"}, false},
	{"%s : chronique d'une reconversion industrielle", [3]string{
		"<p>La désindustrialisation n'était pas une fatalité : elle était un choix.</p>",
		"<p>Les territoires qui se réindustrialisent misent sur l'innovation locale et les circuits courts.</p>",
		"<p>La reconversion industrielle est une affaire de patience et de volonté politique.</p>"},
		[]string{"industrie", "territoire"}, false},
	{"%s : la bataille de l'espace public numérique", [3]string{
		"<p>L'espace public s'est déplacé, et avec lui les conditions du débat démocratique.</p>",
		"<p>Qui modère, qui finance, qui archive ? Autant de questions que les plateformes éludent.</p>",
		"<p>Réinventer un espace public numérique exige des outils que nous possédons enfin.</p>"},
		[]string{"democratie", "numerique"}, true},
}

var topTitleWords = []string{"La longue marche", "Le rendez-vous manqué", "L'heure des choix", "Le vertige", "La promesse", "L'angle mort", "La fracture", "Le pari", "L'héritage", "Le basculement"}

var topThoughts = []struct {
	text string
	tags []string
}{
	{"Dans un monde de stimulations algorithmiques continues, la lecture silencieuse est un acte de résistance spirituelle.", []string{"attention", "silence"}},
	{"L'attention n'est pas une ressource à exploiter, c'est l'essence même de notre conscience libre.", []string{"attention"}},
	{"Le vrai luxe moderne n'est pas d'être connecté partout, mais d'avoir le choix de s'isoler pour penser profondément.", []string{"silence"}},
	{"L'écologie politique n'est pas une liste de privations, mais le projet enthousiasmant d'une souveraineté partagée.", []string{"ecologie", "politique"}},
	{"Reprendre le contrôle de ses écrits, c'est refuser de livrer ses pensées aux machines de capture d'attention.", []string{"souverainete"}},
	{"Une communauté solide se construit sur la confiance et l'indépendance financière mutuelle, loin des intermédiaires publicitaires.", []string{"medias", "independance"}},
	{"La clarté de l'esprit commence par le dépouillement des notifications et des flux d'actualités anxiogènes.", []string{"attention"}},
	{"L'écriture longue forme nous force à structurer notre pensée, là où les réseaux de micro-messages l'émiettent.", []string{"ecriture"}},
	{"Nous devons repenser notre relation à la technologie : l'outil doit servir l'homme, non l'asservir à ses métriques d'engagement.", []string{"technologie", "ethique"}},
	{"La souveraineté n'est pas un repli : c'est la capacité de choisir ses dépendances.", []string{"souverainete"}},
	{"Un média indépendant est un média qui peut se permettre de déplaire à ses financeurs.", []string{"medias"}},
	{"Le temps long est la seule stratégie qui ne puisse pas être copiée.", []string{"temps"}},
	{"La lecture profonde est un sport de combat à l'ère du scroll infini.", []string{"lecture"}},
	{"L'indépendance financière des créateurs commence par la propriété de leur audience.", []string{"createurs", "independance"}},
	{"Rien ne vaut la lenteur délibérée d'un texte pensé, écrit, relu.", []string{"ecriture", "temps"}},
	{"Les algorithmes optimisent l'engagement ; les éditeurs cultivent la confiance. Ce ne sont pas les mêmes métriques.", []string{"medias", "algorithme"}},
	{"La ville n'est pas un décor : c'est une conversation permanente entre ses habitants.", []string{"ville"}},
	{"L'école doit apprendre à penser, pas seulement à restituer.", []string{"education"}},
	{"Nos données sont nos écrits : leur circulation est une question éditoriale.", []string{"donnees", "numerique"}},
	{"Habiter son propre espace numérique, c'est se réapproprier sa parole.", []string{"souverainete", "numerique"}},
	{"Le silence est la condition de toute pensée originale.", []string{"silence"}},
	{"La qualité prime sur la quantité : c'est une architecture, pas un slogan.", []string{"attention"}},
	{"Le journalisme de qualité se finance par la fidélité, pas par la viralité.", []string{"journalisme", "medias"}},
	{"La résilience commence là où s'arrête la course à la croissance.", []string{"ecologie"}},
}

var topReplyTemplates = []string{
	"Entièrement d'accord, et j'ajouterais que %s.",
	"Intéressant. Le parallèle avec %s mérite d'être creusé.",
	"Je nuance : %s dépend beaucoup du contexte local.",
	"Merci pour ce fil, c'est exactement ce dont on parle trop peu : %s.",
	"Je partage, même si %s reste à démontrer.",
	"Très juste. %s devrait être enseigné partout.",
	"Oui ! Et %s, on en parle quand ?",
}

var topCommentTemplates = []string{
	"Article essentiel. %s.",
	"Je découvre ce sujet grâce à vous, merci.",
	"%s : je n'étais pas convaincu, vous m'avez fait changer d'avis.",
	"Enfin un média qui prend le temps de %s.",
	"À partager largement. %s.",
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func topID(prefix string, n int) string {
	u := uuid.NewSHA1(uuid.NameSpaceDNS, []byte(fmt.Sprintf("qoe-top-%s-%d", prefix, n)))
	return prefix + "_" + strings.ReplaceAll(u.String(), "-", "")[:20]
}

func topUUID(n int, kind string) string {
	return uuid.NewSHA1(uuid.NameSpaceDNS, []byte(fmt.Sprintf("qoe-top-%s-%d", kind, n))).String()
}

// slugify normalise un titre en slug ASCII : accents retirés (é→e), ponctuation
// → tirets, minuscules.
func slugify(s string) string {
	var b strings.Builder
	for _, r := range strings.ToLower(s) {
		if r >= 128 {
			r = unaccent(r)
		}
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			b.WriteRune(r)
		case r == ' ' || r == '-' || r == '\'' || r == '’' || r == ':' || r == ',' || r == '(' || r == ')' || r == '«' || r == '»':
			b.WriteByte('-')
		}
	}
	out := strings.Trim(b.String(), "-")
	for strings.Contains(out, "--") {
		out = strings.ReplaceAll(out, "--", "-")
	}
	return out
}

// unaccent remplace les caractères accentués courants par leur équivalent ASCII.
func unaccent(r rune) rune {
	repl := map[rune]rune{
		'é': 'e', 'è': 'e', 'ê': 'e', 'ë': 'e', 'à': 'a', 'â': 'a', 'ä': 'a',
		'î': 'i', 'ï': 'i', 'ô': 'o', 'ö': 'o', 'ù': 'u', 'û': 'u', 'ü': 'u',
		'ç': 'c', 'œ': 'o', 'æ': 'a', 'ñ': 'n', 'ÿ': 'y', 'É': 'e', 'È': 'e',
	}
	if v, ok := repl[r]; ok {
		return v
	}
	return r
}

// wipeAll vide la base dans un ordre sûr (miroir de devtools.Reset).
func wipeAll(ctx context.Context, pool *pgxpool.Pool) error {
	tables := []string{
		"PollVote", "PollOption", "Poll", "StarterPackItem", "StarterPack",
		"Notification", "NotificationPreference", "AnnotationComment", "AnnotationUpvote",
		"ArticleComment", "ApiKey", "TranslationAuditLog", "CollaborationRequest",
		"MediaMember", "MediaInvite", "Recommendation", "Like", "Post", "Highlight",
		"Bookmark", "Subscriber", "WalletTransaction", "Follows", "MutedWord",
		"BlockedUser", "Letter", "ArticleSlugHistory", "ArticleSlug", "Article", "Tier",
		"Category", "NavigationItem", "SocialLink", "PartnerPromo", "Trend",
		"ReadingSession", "User", "SystemConfig", "Media", "Publication",
	}
	for _, t := range tables {
		if _, err := pool.Exec(ctx, fmt.Sprintf(`DELETE FROM "%s"`, t)); err != nil {
			return fmt.Errorf("wipe %s: %w", t, err)
		}
	}
	return nil
}

// ---------------------------------------------------------------------------
// RunTop — génération complète de la DB app
// ---------------------------------------------------------------------------

// RunTop régénère la base « top du top » (après wipe). Déterministe.
func RunTop(ctx context.Context, pool *pgxpool.Pool, opts TopOptions) (*TopResult, error) {
	opts = opts.defaults()
	rng := newPRNG(0x8F3B2A1C)
	now := time.Now().UTC().Truncate(time.Second)

	if err := wipeAll(ctx, pool); err != nil {
		return nil, err
	}

	res := &TopResult{}
	start := time.Now()
	log.Printf("[seed-top] génération : %d users, %d articles, %d pensées, %d sessions…",
		opts.Users, opts.Articles, opts.Posts, opts.ReadingSessions)

	// ── 1. Users + publications PERSONAL (créateurs) ───────────────────────
	creators := 0
	seenUsername := map[string]bool{}
	seenEmail := map[string]bool{}
	for i := 0; i < opts.Users; i++ {
		first := prngPick(rng, topFirstNames)
		last := prngPick(rng, topLastNames)
		name := first + " " + last
		username := slugify(first + last)
		for seenUsername[username] {
			username = fmt.Sprintf("%s%d", slugify(first+last), rng.intn(9999))
		}
		seenUsername[username] = true
		role := "user"
		if rng.next() < opts.CreatorsRatio {
			role = "creator"
		}
		domains := []string{"gmail.com", "outlook.fr", "proton.me", "icloud.com", "orange.fr"}
		email := fmt.Sprintf("%s.%s%d@%s", slugify(first), slugify(last), rng.intn(900)+100, prngPick(rng, domains))
		for seenEmail[email] {
			email = fmt.Sprintf("%s.%s%d@%s", slugify(first), slugify(last), rng.intn(900)+100, prngPick(rng, domains))
		}
		seenEmail[email] = true
		created := now.AddDate(0, 0, -rng.intn(180))

		u := TopUser{
			ID: topUUID(i, "user"), Email: email, Name: name, Username: username,
			Role: role, Country: prngPick(rng, topCountries), CreatedAt: created,
		}
		if role == "creator" {
			creators++
			pubID := topID("pub", i)
			pub := TopPublication{
				ID: pubID, OwnerID: u.ID, Name: name, Slug: username,
				Subdomain: username, Bio: biosFor(name, rng), Accent: prngPick(rng, topAccents),
			}
			u.PubID = pubID
			res.Publications = append(res.Publications, pub)
			if _, err := pool.Exec(ctx, `
				INSERT INTO "Publication" (id, type, name, slug, subdomain, bio, "isCertified", "accentColor", "layoutStyle", "createdAt", "updatedAt")
				VALUES ($1, 'PERSONAL', $2, $3, $4, $5, $6, $7, $8, $9, $9)`,
				pub.ID, pub.Name, pub.Slug, pub.Subdomain, pub.Bio, rng.next() < 0.25, pub.Accent, "minimal", created); err != nil {
				return nil, fmt.Errorf("publication %s: %w", pub.ID, err)
			}
		}
		if _, err := pool.Exec(ctx, `
			INSERT INTO "User" (id, email, username, name, role, "isCertified", "countryCode", "languageCode", "hasCompletedOnboarding", "publicationId", "createdAt", "updatedAt")
			VALUES ($1, $2, $3, $4, $5, $6, $7, 'fr', true, $8, $9, $9)`,
			u.ID, u.Email, u.Username, u.Name, u.Role, rng.next() < 0.06, u.Country, nullStr(u.PubID), created); err != nil {
			return nil, fmt.Errorf("user %s: %w", u.ID, err)
		}
		res.Users = append(res.Users, u)
	}
	log.Printf("[seed-top] ✔ %d users (%d créateurs)", len(res.Users), creators)

	// ── 2. Catégories (2-3 par publication créateur) ───────────────────────
	catNames := []string{"Souveraineté", "Écologie", "Politique", "Culture", "Économie", "Numérique"}
	catSlugs := []string{"souverainete", "ecologie", "politique", "culture", "economie", "numerique"}
	catByPub := map[string][]string{}
	catSeq := 0
	for _, pub := range res.Publications {
		nb := 2 + rng.intn(2)
		for c := 0; c < nb; c++ {
			ci := rng.intn(len(catNames))
			catID := topID("cat", catSeq)
			catSeq++
			if _, err := pool.Exec(ctx, `
				INSERT INTO "Category" (id, name, slug, description, "publicationId")
				VALUES ($1, $2, $3, $4, $5)`,
				catID, catNames[ci], fmt.Sprintf("%s-%s-%d", catSlugs[ci], slugify(pub.Slug), c), "Catégorie "+catNames[ci], pub.ID); err != nil {
				return nil, fmt.Errorf("category: %w", err)
			}
			catByPub[pub.ID] = append(catByPub[pub.ID], catID)
		}
	}

	// ── 3. Articles (~200, loi puissance sur les créateurs) ────────────────
	if len(res.Publications) == 0 {
		return nil, fmt.Errorf("aucun créateur généré — impossible de créer des articles")
	}
	var pubWeights []float64
	for range res.Publications {
		pubWeights = append(pubWeights, 1.0)
	}
	for i := 0; i < opts.Articles; i++ {
		pub := res.Publications[rng.weightedIndex(pubWeights)]
		cats := catByPub[pub.ID]
		topic := prngPick(rng, topTopics)
		title := fmt.Sprintf(topic.title, prngPick(rng, topTitleWords))
		content := "<p>" + topic.paras[0] + "</p><p>" + topic.paras[1] + "</p>" + topic.paras[2]
		premium := rng.next() < opts.PremiumRatio
		if premium {
			content += "<p>Ce passage est réservé aux abonnés premium de cette publication.</p><p>La suite de l'analyse est exclusive.</p>"
		}
		readingTime := 4 + rng.intn(7)
		created := now.AddDate(0, 0, -rng.intn(60)).Add(-time.Duration(rng.intn(12)) * time.Hour)
		art := TopArticle{
			ID:            topID("art", i),
			PublicationID: pub.ID,
			AuthorID:      pub.OwnerID,
			Slug:          fmt.Sprintf("%s-%d", slugify(title), i),
			Title:         title,
			Content:       content,
			Premium:       premium,
			ReadingTime:   readingTime,
			CreatedAt:     created,
		}
		if len(cats) > 0 {
			art.CategoryID = prngPick(rng, cats)
		}
		if _, err := pool.Exec(ctx, `
			INSERT INTO "Article" (id, title, slug, content, published, status, visibility,
				"isPremium", "isEditorPick", "readingTime", "semanticTags", "publicationId", "authorId", "categoryId", "createdAt", "updatedAt")
			VALUES ($1, $2, $3, $4, true, 'PUBLISHED', 'PUBLIC', $5, $6, $7, $8, $9, $10, $11, $12, $12)`,
			art.ID, art.Title, art.Slug, art.Content, art.Premium,
			topic.editor && rng.next() < 0.3, int32(art.ReadingTime), topic.tags,
			art.PublicationID, art.AuthorID, nullStr(art.CategoryID), created); err != nil {
			return nil, fmt.Errorf("article %s: %w", art.ID, err)
		}
		res.Articles = append(res.Articles, art)
	}
	log.Printf("[seed-top] ✔ %d articles", len(res.Articles))

	// ── 4. Pensées (~1480 : racines + réponses) ────────────────────────────
	// Poids : les créateurs publient plus (loi puissance).
	var userWeights []float64
	for _, u := range res.Users {
		if u.Role == "creator" {
			userWeights = append(userWeights, 3.0)
		} else {
			userWeights = append(userWeights, 0.4)
		}
	}
	rootCount := int(float64(opts.Posts) * 0.85)
	replyCount := opts.Posts - rootCount
	allPostIDs := make([]string, 0, opts.Posts)
	for i := 0; i < opts.Posts; i++ {
		author := res.Users[rng.weightedIndex(userWeights)]
		created := now.AddDate(0, 0, -rng.intn(14)).Add(-time.Duration(rng.intn(20)) * time.Hour)
		postID := topID("post", i)
		if i < rootCount {
			th := prngPick(rng, topThoughts)
			content := th.text
			if rng.next() < 0.5 {
				content += " #" + strings.Join(th.tags, " #")
			}
			if _, err := pool.Exec(ctx, `
				INSERT INTO "Post" (id, content, "authorId", tags, visibility, "isDraft", "likeCount", "repostCount", "replyCount", "createdAt", "updatedAt")
				VALUES ($1, $2, $3, $4, 'public', false, $5, $6, 0, $7, $7)`,
				postID, content, author.ID, th.tags, rng.intn(40), rng.intn(12), created); err != nil {
				return nil, fmt.Errorf("post root: %w", err)
			}
		} else {
			parent := allPostIDs[rng.intn(len(allPostIDs))]
			content := fmt.Sprintf(prngPick(rng, topReplyTemplates), prngPick(rng, topThoughts).tags[0])
			if _, err := pool.Exec(ctx, `
				INSERT INTO "Post" (id, content, "authorId", tags, visibility, "isDraft", "likeCount", "repostCount", "replyCount", "parentId", "rootId", "createdAt", "updatedAt")
				VALUES ($1, $2, $3, $4, 'public', false, $5, 0, 0, $6, $6, $7, $7)`,
				postID, content, author.ID, []string{}, rng.intn(10), parent, created); err != nil {
				return nil, fmt.Errorf("post reply: %w", err)
			}
		}
		allPostIDs = append(allPostIDs, postID)
	}
	res.PostIDs = allPostIDs
	log.Printf("[seed-top] ✔ %d pensées (%d racines / %d réponses)", len(allPostIDs), rootCount, replyCount)

	// ── 5. Follows (lecteurs → publications, loi puissance) ────────────────
	readerIDs := make([]string, 0)
	for _, u := range res.Users {
		if u.Role != "creator" {
			readerIDs = append(readerIDs, u.ID)
		}
	}
	// Chaque lecteur suit 1..n publications (dont quelques créateurs populaires).
	var pubFollowWeights []float64
	for range res.Publications {
		pubFollowWeights = append(pubFollowWeights, 1.0)
	}
	// Rendre les premières publications plus populaires (loi puissance).
	for j := range pubFollowWeights {
		pubFollowWeights[j] = 1.0 / float64(j+2) * 2.0
	}
	followSeq := 0
	seenFollow := map[string]bool{}
	for _, rid := range readerIDs {
		nb := 1 + rng.intn(12)
		for f := 0; f < nb; f++ {
			pub := res.Publications[rng.weightedIndex(pubFollowWeights)]
			key := rid + "|" + pub.ID
			if seenFollow[key] {
				continue
			}
			seenFollow[key] = true
			if _, err := pool.Exec(ctx, `
				INSERT INTO "Follows" (id, "readerId", "publicationId", "createdAt")
				VALUES ($1, $2, $3, $4)`,
				topID("flw", followSeq), rid, pub.ID, now.AddDate(0, 0, -rng.intn(90))); err != nil {
				return nil, fmt.Errorf("follow: %w", err)
			}
			followSeq++
			res.Follows++
		}
	}
	log.Printf("[seed-top] ✔ %d follows", res.Follows)

	// ── 6. Likes (~12k) + abonnés CRM (~1.5k) + wallet + bookmarks ────────
	likeSeq := 0
	seenLike := map[string]bool{}
	for i := 0; i < 12000; i++ {
		post := allPostIDs[rng.intn(len(allPostIDs))]
		user := res.Users[rng.intn(len(res.Users))]
		key := post + "|" + user.ID
		if seenLike[key] {
			continue
		}
		seenLike[key] = true
		if _, err := pool.Exec(ctx, `
			INSERT INTO "Like" (id, "postId", "userId", "createdAt")
			VALUES ($1, $2, $3, $4)`,
			topID("lik", likeSeq), post, user.ID, now.AddDate(0, 0, -rng.intn(14))); err != nil {
			return nil, fmt.Errorf("like: %w", err)
		}
		likeSeq++
		res.Likes++
	}
	subSeq := 0
	walletSeq := 0
	for i := 0; i < 1500; i++ {
		pub := res.Publications[rng.weightedIndex(pubFollowWeights)]
		premium := rng.next() < 0.3
		ltv := 0
		if premium {
			ltv = []int{500, 1000, 2000, 5000}[rng.intn(4)]
		}
		if _, err := pool.Exec(ctx, `
			INSERT INTO "Subscriber" (id, email, "isActive", "isPremium", "ltvCents", "receiveArticles", "publicationId", "createdAt", "updatedAt")
			VALUES ($1, $2, true, $3, $4, true, $5, $6, $6)`,
			topID("sub", subSeq), fmt.Sprintf("abonne%d@mail.com", subSeq), premium, ltv, pub.ID, now.AddDate(0, 0, -rng.intn(60))); err != nil {
			return nil, fmt.Errorf("subscriber: %w", err)
		}
		subSeq++
		res.Subscribers++
		if premium {
			if _, err := pool.Exec(ctx, `
				INSERT INTO "WalletTransaction" (id, "userId", "amountCents", type, "createdAt")
				VALUES ($1, $2, $3, 'SUBSCRIPTION_PAYMENT', $4)`,
				topID("wal", walletSeq), pub.OwnerID, ltv, now.AddDate(0, 0, -rng.intn(60))); err != nil {
				return nil, fmt.Errorf("wallet: %w", err)
			}
			walletSeq++
		}
	}
	bmkSeq := 0
	seenBmk := map[string]bool{}
	for i := 0; i < 800; i++ {
		reader := res.Users[rng.intn(len(res.Users))].ID
		art := res.Articles[rng.intn(len(res.Articles))].ID
		key := reader + "|" + art
		if seenBmk[key] {
			continue
		}
		seenBmk[key] = true
		if _, err := pool.Exec(ctx, `
			INSERT INTO "Bookmark" (id, "readerId", "articleId", "createdAt")
			VALUES ($1, $2, $3, $4)`,
			topID("bmk", bmkSeq), reader, art, now.AddDate(0, 0, -rng.intn(30))); err != nil {
			return nil, fmt.Errorf("bookmark: %w", err)
		}
		bmkSeq++
	}
	log.Printf("[seed-top] ✔ %d likes, %d abonnés CRM, %d wallet, %d bookmarks",
		res.Likes, res.Subscribers, walletSeq, bmkSeq)

	// ── 7. ReadingSessions (~5700 sur 14 jours) ────────────────────────────
	sessSeq := 0
	statuses := []string{"BOUNCE", "SKIM", "READ_PARTIAL", "READ_COMPLETE"}
	sources := []string{"feed", "feed", "feed", "subdomain", "subdomain", "direct", "notification"}
	for i := 0; i < opts.ReadingSessions; i++ {
		art := res.Articles[rng.intn(len(res.Articles))]
		user := res.Users[rng.intn(len(res.Users))]
		dwell := 15 + rng.intn(420)
		scroll := 15 + rng.intn(86)
		status := statuses[0]
		if scroll >= 80 && dwell < art.ReadingTime*60*35/100 {
			status = "SKIM"
		} else if scroll >= 85 && dwell >= art.ReadingTime*60 {
			status = "READ_COMPLETE"
		} else if scroll >= 25 {
			status = "READ_PARTIAL"
		}
		created := now.AddDate(0, 0, -rng.intn(14)).Add(-time.Duration(rng.intn(86400)) * time.Second)
		if _, err := pool.Exec(ctx, `
			INSERT INTO "ReadingSession" (id, "articleId", "userId", source, status, "scrollDepth", "dwellSeconds", "readingTimeMinutes", hostname, "createdAt")
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
			topID("rs", sessSeq), art.ID, user.ID, prngPick(rng, sources), status, scroll, dwell,
			art.ReadingTime, "qoe.test", created); err != nil {
			return nil, fmt.Errorf("reading session: %w", err)
		}
		sessSeq++
		res.ReadingSess++
	}
	log.Printf("[seed-top] ✔ %d reading sessions", res.ReadingSess)

	log.Printf("[seed-top] ✅ génération terminée en %s", time.Since(start).Round(time.Millisecond))
	return res, nil
}

// ---------------------------------------------------------------------------
// RunTopUmami — événements Umami (~10.5k events / ~2.3k sessions, 30 jours)
// ---------------------------------------------------------------------------

// RunTopUmami génère des données de trafic réalistes dans la DB Umami
// self-hosted (idempotent : purge les events/sessions du website avant insert).
func RunTopUmami(ctx context.Context, umamiPool *pgxpool.Pool, res *TopResult, opts TopOptions) error {
	opts = opts.defaults()
	rng := newPRNG(0x51A39C0E)
	now := time.Now().UTC().Truncate(time.Second)

	// Websites déjà provisionnés (umamiWebsiteId) — on se cale dessus.
	type website struct {
		id     string
		domain string
	}
	var sites []website
	rows, err := umamiPool.Query(ctx, `SELECT website_id::text, domain FROM website WHERE deleted_at IS NULL`)
	if err != nil {
		return fmt.Errorf("umami websites: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var w website
		if err := rows.Scan(&w.id, &w.domain); err != nil {
			return err
		}
		sites = append(sites, w)
	}
	if rows.Err() != nil {
		return rows.Err()
	}
	if len(sites) == 0 {
		return fmt.Errorf("aucun website Umami — le provisioner doit d'abord tourner")
	}

	// Idempotence : purge du website avant régénération.
	for _, s := range sites {
		if _, err := umamiPool.Exec(ctx,
			`DELETE FROM website_event WHERE website_id = $1`, s.id); err != nil {
			return fmt.Errorf("umami purge events: %w", err)
		}
		if _, err := umamiPool.Exec(ctx,
			`DELETE FROM session WHERE website_id = $1`, s.id); err != nil {
			return fmt.Errorf("umami purge sessions: %w", err)
		}
	}

	countries := []string{"FR", "FR", "FR", "FR", "BE", "CH", "CA", "DE", "LU", "MC"}
	browsers := []string{"Chrome", "Chrome", "Firefox", "Safari", "Edge", "Brave"}
	oss := []string{"Mac OS", "Windows", "Windows", "Linux", "iOS", "Android"}
	devices := []string{"desktop", "desktop", "mobile", "tablet"}
	referrers := []string{"", "", "", "google.com", "x.com", "bsky.app", "mastodon.social"}
	paths := []string{"/", "/", "/articles/", "/@", "/notifications", "/history"}

	events := 0
	sessions := 0
	for day := 29; day >= 0; day-- {
		base := now.AddDate(0, 0, -day)
		weekend := base.Weekday() == time.Saturday || base.Weekday() == time.Sunday
		nbSessions := 40 + rng.intn(40)
		if weekend {
			nbSessions = int(float64(nbSessions) * 0.8)
		}
		for s := 0; s < nbSessions; s++ {
			site := sites[rng.intn(len(sites))]
			// Pic 9-12h et 19-22h.
			roll := rng.next()
			var hour int
			if roll < 0.35 {
				hour = 9 + rng.intn(4)
			} else if roll < 0.7 {
				hour = 19 + rng.intn(4)
			} else {
				hour = rng.intn(24)
			}
			created := base.Add(time.Duration(hour)*time.Hour + time.Duration(rng.intn(3600))*time.Second)
			sessionID := uuid.NewSHA1(uuid.NameSpaceDNS, []byte(fmt.Sprintf("umami-sess-%d-%d", day, s))).String()

			// url_path du premier page_view : corrélé aux vrais articles du site.
			firstPath := prngPick(rng, paths)
			if firstPath == "/articles/" && len(res.Articles) > 0 {
				firstPath += res.Articles[rng.intn(len(res.Articles))].Slug
			} else if firstPath == "/@" {
				firstPath += res.Users[rng.intn(len(res.Users))].Username
			}
			nbViews := 1 + rng.intn(6)
			for v := 0; v < nbViews; v++ {
				path := firstPath
				if v > 0 {
					path = prngPick(rng, paths)
					if path == "/articles/" && len(res.Articles) > 0 {
						path += res.Articles[rng.intn(len(res.Articles))].Slug
					} else if path == "/@" {
						path += res.Users[rng.intn(len(res.Users))].Username
					}
				}
				if _, err := umamiPool.Exec(ctx, `
					INSERT INTO website_event (event_id, website_id, session_id, created_at, url_path, referrer_domain, page_title, event_type, event_name, hostname, visit_id)
					VALUES ($1, $2, $3, $4, $5, $6, $7, 1, 'pageview', $8, $1)`,
					uuid.NewSHA1(uuid.NameSpaceDNS, []byte(fmt.Sprintf("umami-ev-%d-%d-%d", day, s, v))).String(),
					site.id, sessionID, created.Add(time.Duration(v)*time.Minute), path,
					prngPick(rng, referrers), "qoe.fi — lecture souveraine", site.domain); err != nil {
					return fmt.Errorf("umami event: %w", err)
				}
				events++
			}
			if _, err := umamiPool.Exec(ctx, `
				INSERT INTO session (session_id, website_id, created_at, browser, os, device, screen, language, country, region, city, distinct_id)
				VALUES ($1, $2, $3, $4, $5, $6, $7, 'fr-FR', $8, $9, $10, $11)`,
				sessionID, site.id, created, prngPick(rng, browsers), prngPick(rng, oss), prngPick(rng, devices),
				[]string{"1440x900", "1920x1080", "390x844"}[rng.intn(3)], prngPick(rng, countries),
				"Île-de-France", "Paris", uuid.NewSHA1(uuid.NameSpaceDNS, []byte(fmt.Sprintf("umami-dist-%d-%d", day, s))).String()); err != nil {
				return fmt.Errorf("umami session: %w", err)
			}
			sessions++
		}
	}
	log.Printf("[seed-top] ✔ umami : %d sessions, %d events", sessions, events)
	return nil
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func nullStr(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func biosFor(name string, rng *prng) string {
	templates := []string{
		"Journaliste indépendante, je couvre les mutations du numérique.",
		"Écrivain et essayiste. J'explore la souveraineté à l'ère des plateformes.",
		"Créatrice de contenus — culture, écologie et politique.",
		"Rédacteur passionné par les médias indépendants et l'économie de l'attention.",
		"Autrice et chercheuse. Le temps long comme méthode.",
		"Journaliste local, enquêteur de terrain.",
		"Essayiste — numérique, démocratie et libertés.",
		"Podcasteuse et chroniqueuse. Je raconte la ville qui vient.",
	}
	return prngPick(rng, templates)
}

// ---------------------------------------------------------------------------
// EmbedTop — embeddings synchrones (articles + users) via le service Jina.
// ---------------------------------------------------------------------------

// EmbedTop calcule et persiste les vecteurs des articles et users générés
// (EMBEDDING_URL requis, sinon skip). Retourne les compteurs.
func EmbedTop(ctx context.Context, pool *pgxpool.Pool, res *TopResult, embeddingURL string) (int, int, error) {
	if embeddingURL == "" {
		log.Println("[seed-top] EMBEDDING_URL non défini — embeddings skip")
		return 0, 0, nil
	}
	type embedClient struct{ url string }
	client := &http.Client{Timeout: 90 * time.Second}

	embed := func(text string) ([]float64, error) {
		payload, _ := json.Marshal(map[string]any{"model": "jina-embeddings-v3", "input": text})
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, embeddingURL, strings.NewReader(string(payload)))
		if err != nil {
			return nil, err
		}
		req.Header.Set("Content-Type", "application/json")
		resp, err := client.Do(req)
		if err != nil {
			return nil, err
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			return nil, fmt.Errorf("embedding status %d", resp.StatusCode)
		}
		var out struct {
			Data []struct {
				Embedding []float64 `json:"embedding"`
			} `json:"data"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
			return nil, err
		}
		if len(out.Data) == 0 || len(out.Data[0].Embedding) == 0 {
			return nil, fmt.Errorf("embedding vide")
		}
		return out.Data[0].Embedding, nil
	}

	articles := 0
	for _, a := range res.Articles {
		text := a.Title + "\n\n" + stripHTML(a.Content)
		if strings.TrimSpace(text) == "" {
			continue
		}
		vec, err := embed(text)
		if err != nil {
			log.Printf("[seed-top] embed article %s: %v", a.ID, err)
			continue
		}
		if len(vec) > 512 {
			vec = vec[:512]
		}
		if _, err := pool.Exec(ctx, `UPDATE "Article" SET embedding = $2 WHERE id = $1`,
			a.ID, vectorLiteral(vec)); err != nil {
			return articles, 0, err
		}
		articles++
	}
	log.Printf("[seed-top] ✔ %d articles embeddés", articles)

	users := 0
	for _, u := range res.Users {
		bio := ""
		for _, p := range res.Publications {
			if p.OwnerID == u.ID {
				bio = p.Bio
				break
			}
		}
		text := strings.TrimSpace(u.Name + "\n\n" + bio)
		if text == "" {
			continue
		}
		vec, err := embed(text)
		if err != nil {
			continue
		}
		if len(vec) > 512 {
			vec = vec[:512]
		}
		if _, err := pool.Exec(ctx, `UPDATE "User" SET embedding = $2 WHERE id = $1`,
			u.ID, vectorLiteral(vec)); err != nil {
			return articles, users, err
		}
		users++
	}
	log.Printf("[seed-top] ✔ %d users embeddés", users)
	return articles, users, nil
}

func stripHTML(s string) string {
	var b strings.Builder
	inTag := false
	for _, r := range s {
		if r == '<' {
			inTag = true
			continue
		}
		if r == '>' {
			inTag = false
			continue
		}
		if !inTag {
			b.WriteRune(r)
		}
	}
	return strings.Join(strings.Fields(b.String()), " ")
}

func vectorLiteral(v []float64) string {
	var b strings.Builder
	b.WriteByte('[')
	for i, f := range v {
		if i > 0 {
			b.WriteByte(',')
		}
		b.WriteString(fmt.Sprintf("%g", f))
	}
	b.WriteByte(']')
	return b.String()
}
