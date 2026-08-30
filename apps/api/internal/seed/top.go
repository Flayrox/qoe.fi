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
	"maps"
	"net/http"
	"slices"
	"sort"
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
	if len(items) == 0 {
		var zero T
		return zero
	}
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
	Posts        []TopPost
	PostIDs      []string
	ReadingSess  int
	Follows      int
	Likes        int
	Subscribers  int
	Embeddings   int
}

// TopPost est une pensée générée (contenu + tags), utilisée notamment pour
// calculer l'embedding sémantique dans EmbedTop.
type TopPost struct {
	ID      string
	Content string
	Tags    []string
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
	Bio       string
	Interests []string
	Gender    string
	AgeRange  string
}

type TopPublication struct {
	ID        string
	OwnerID   string
	Name      string
	Slug      string
	Subdomain string
	Bio       string
	Accent    string
	Tags      []string
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

// topFirstNames sont séparés par genre pour que les comptes « Prénom Nom »
// soient cohérents avec le genre et la photo de profil attribués.
var topMaleFirstNames = []string{
	"Noé", "Lucas", "Gabriel", "Louis", "Arthur", "Hugo", "Nathan", "Théo", "Adam", "Victor",
	"Paul", "Nino", "Eliott", "Marius", "Axel", "Isaac", "Raphaël", "Jules", "Antoine", "Enzo",
	"Léo", "Yanis", "Mehdi", "Karim", "Bastien", "Thibault", "Simon", "Hugo",
}

var topFemaleFirstNames = []string{
	"Ambre", "Clara", "Inès", "Léa", "Emma", "Manon", "Chloé", "Camille", "Sarah", "Zoé",
	"Eva", "Lina", "Rose", "Mila", "Alice", "Margaux", "June", "Lou", "Nour", "Romy",
	"Jade", "Inaya", "Fatou", "Océane", "Charlotte", "Élise", "Maëlle", "Nina",
}

func topFirstName(rng *prng, gender string) string {
	switch gender {
	case "MALE":
		return prngPick(rng, topMaleFirstNames)
	case "FEMALE":
		return prngPick(rng, topFemaleFirstNames)
	default:
		if rng.next() < 0.5 {
			return prngPick(rng, topMaleFirstNames)
		}
		return prngPick(rng, topFemaleFirstNames)
	}
}

var topLastNames = []string{
	"Martin", "Bernard", "Dubois", "Moreau", "Laurent", "Simon", "Michel", "Lefebvre", "Leroy",
	"Roux", "Fournier", "Girard", "Bonnet", "Lambert", "Mercier", "Blanc", "Henry", "Garnier",
	"Rousseau", "Faure", "André", "Guérin", "Boyer", "Renard", "Chevalier", "Lemaire", "Perrin",
	"Colin", "Vidal", "Gauthier", "Renaud", "Barre", "Dupont", "Petit", "Fontaine", "Caron",
	"Robin", "Masson", "Marchand", "Olivier",
}

var topAccents = []string{"#c5a880", "#3ecf8e", "#5b8def", "#e4572e", "#8e5bde", "#2aa198", "#d65f76", "#6b8e23"}

var topCountries = []string{"FR", "FR", "FR", "BE", "CH", "CA", "LU", "MC", "SN", "MA", "DE", "ES"}

// topTopics : le sujet, un titre et des blocs suffisamment longs pour que le
// seed ressemble à une vraie bibliothèque éditoriale. Les blocs sont répétés
// avec variation contrôlée : on dépasse toujours 3 000 mots sans copier-coller
// un article identique.
type topTopic struct {
	title  string
	paras  [3]string
	tags   []string
	editor bool
}

var topTopics = []topTopic{
	{"%s : le quotidien d'une rédaction locale", [3]string{
		"<p>Le journalisme commence rarement par un scoop : il commence par un carnet, un périmètre de quartier et une habitude de travail.</p>",
		"<p>Conseils municipaux, portraits de commerçants, faits divers ordinaires : c'est sur ce terreau que la confiance se construit.</p>",
		"<p>Une rédaction locale vivante, c'est une démocratie qui respire.</p>"},
		[]string{"medias", "local"}, true},
	{"%s : cuisiner avec les saisons", [3]string{
		"<p>Un légume de saison n'a pas besoin d'artifice : il a besoin d'être respecté.</p>",
		"<p>Courgettes en été, potiron en automne, agrumes en hiver : le calendrier guide naturellement les menus.</p>",
		"<p>Cuisiner avec les saisons, c'est manger mieux, dépenser moins et redécouvrir le goût.</p>"},
		[]string{"saison", "cuisine"}, false},
	{"%s : le rythme du quotidien", [3]string{
		"<p>Nos journées sont faites de rituels minuscules qui passent inaperçus : le café du matin, la marche de midi, le tour de clé du soir.</p>",
		"<p>Ralentir ne veut pas dire ne rien faire : c'est choisir où l'on met son attention.</p>",
		"<p>Le rythme est une décision, pas une fatalité.</p>"},
		[]string{"quotidien", "rythme"}, false},
	{"%s : la résilience territoriale à l'ère de l'Anthropocène", [3]string{
		"<p>L'urgence écologique exige que nous repensions nos modes de subsistance et d'organisation collective à l'échelle des territoires.</p>",
		"<p>La résilience n'est pas un repli frileux, mais une réappropriation joyeuse de nos forces de production et de nos communs.</p>",
		"<p>Des initiatives locales montrent qu'une autre répartition du pouvoir est possible.</p>"},
		[]string{"ecologie", "territoire"}, true},
	{"%s : une soirée sans écran", [3]string{
		"<p>Un repas sans notification, une conversation sans téléphone posé sur la table : l'exercice paraît simple, il est radical.</p>",
		"<p>Les premières minutes sont étranges, puis les idées reviennent, comme des invités timides.</p>",
		"<p>On ne se souvient pas des heures défilées sur les réseaux. On se souvient des soirées où l'on était là.</p>"},
		[]string{"quotidien", "ecrans"}, false},
	{"%s : enquêter, écrire, publier", [3]string{
		"<p>Un article commence par une question qui ne nous lâche pas.</p>",
		"<p>Vérifier ses sources, se relire, accepter de se tromper puis de se corriger : le métier est un art de la rigueur.</p>",
		"<p>Écrire pour être lu, pas pour être scandé.</p>"},
		[]string{"journalisme", "ecriture"}, true},
	{"%s : la valeur du travail bien fait", [3]string{
		"<p>Il existe des gestes qu'on ne peut pas bâcler : couper une poutre, coudre une ourlet, relire un texte.</p>",
		"<p>Le soin apporté à un détail transforme l'objet, mais surtout celui qui le fait.</p>",
		"<p>Le travail bien fait est une fierté silencieuse qui vaut tous les applaudissements.</p>"},
		[]string{"travail", "artisanat"}, false},
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
	{"%s : le marché du samedi matin", [3]string{
		"<p>Le marché du samedi a son rythme : les producteurs arrivent avant l'aube, les habitués connaissent les étals.</p>",
		"<p>Marchander, goûter, discuter : un commerce qui garde le contact humain.</p>",
		"<p>Le panier du marché raconte une région, une saison, une manière de vivre.</p>"},
		[]string{"marche", "local"}, false},
	{"%s : chronique d'une reconversion industrielle", [3]string{
		"<p>La désindustrialisation n'était pas une fatalité : elle était un choix.</p>",
		"<p>Les territoires qui se réindustrialisent misent sur l'innovation locale et les circuits courts.</p>",
		"<p>La reconversion industrielle est une affaire de patience et de volonté politique.</p>"},
		[]string{"industrie", "territoire"}, false},
	{"%s : réparer au lieu de jeter", [3]string{
		"<p>Recoudre, revisser, ressouder : la réparation est une compétence politique et joyeuse.</p>",
		"<p>Chaque objet sauvé de la poubelle est une petite victoire contre la surconsommation.</p>",
		"<p>Réparer, c'est donner une seconde vie aux choses et un sens à nos gestes.</p>"},
		[]string{"reparation", "consommation"}, false},
	{"Pourquoi les mangas savent raconter le monde", [3]string{
		"<p>Du récit d'aventure au journal intime dessiné, le manga accueille des rythmes et des sensibilités que les formats pressés oublient.</p>",
		"<p>On y parle de transmission, d'amitié, de travail, de monstres et de cuisine avec la même attention aux gestes.</p>",
		"<p>Cette lecture populaire mérite mieux que les frontières entre culture légitime et plaisir coupable.</p>"},
		[]string{"manga", "culture"}, false},
	{"Filmer l'ordinaire sans l'aplatir", [3]string{
		"<p>Un film peut commencer dans une cuisine, un bus ou une conversation qui semble ne mener nulle part.</p>",
		"<p>Le cinéma nous apprend à regarder les silences, les raccords et les corps qui changent de place dans un cadre.</p>",
		"<p>La critique n'est pas un classement : c'est une manière de prolonger la séance après le générique.</p>"},
		[]string{"films", "culture"}, false},
	{"Voyager sans collectionner les paysages", [3]string{
		"<p>Voyager lentement, c'est accepter de ne pas tout voir et de laisser un lieu résister à nos habitudes de visiteur.</p>",
		"<p>Un train, une langue mal prononcée et une table partagée racontent parfois davantage qu'un itinéraire optimisé.</p>",
		"<p>Le retour fait partie du voyage : il transforme la maison et le regard que l'on porte sur elle.</p>"},
		[]string{"voyage", "carnet"}, false},
	{"La culture commence souvent dans une petite salle", [3]string{
		"<p>Une librairie indépendante, un concert dans une cave ou une exposition montée par trois amis peuvent changer une ville.</p>",
		"<p>Ces lieux fragiles fabriquent des rencontres qui ne se mesurent ni en audiences ni en parts de marché.</p>",
		"<p>Les soutenir, c'est défendre une culture vécue, contradictoire et accessible.</p>"},
		[]string{"culture", "local"}, true},
	{"Romance : apprendre à rester dans la conversation", [3]string{
		"<p>Les histoires d'amour ne commencent pas toujours par un coup de foudre ; elles naissent aussi d'une attention répétée.</p>",
		"<p>Entre les messages maladroits, les silences et les rendez-vous déplacés, aimer demande de négocier sans se perdre.</p>",
		"<p>La romance devient intéressante lorsqu'elle laisse une place entière aux deux personnes, à leurs doutes et à leur liberté.</p>"},
		[]string{"romance", "relations"}, false},
	{"La recette de famille n'est jamais seulement une recette", [3]string{
		"<p>Une soupe, un gâteau ou une pâte peuvent conserver la mémoire d'une maison mieux qu'un album photo.</p>",
		"<p>Modifier un ingrédient n'est pas trahir : chaque génération traduit le plat avec les produits et le temps dont elle dispose.</p>",
		"<p>La cuisine quotidienne est un art discret, social et profondément politique sans avoir besoin de grands discours.</p>"},
		[]string{"cuisine", "famille"}, false},
	{"Pourquoi on joue encore après avoir compris les règles", [3]string{
		"<p>Les jeux nous offrent une expérience rare : recommencer sans que l'échec efface complètement ce que l'on a appris.</p>",
		"<p>Dans une partie coopérative, la stratégie compte moins que la manière dont un groupe se parle quand tout devient incertain.</p>",
		"<p>Jouer n'est pas fuir le réel ; c'est parfois le laboratoire le plus honnête pour observer nos choix.</p>"},
		[]string{"jeux", "societe"}, false},
	{"Le jardin partagé comme école de patience", [3]string{
		"<p>Au jardin, rien ne répond à la vitesse d'une notification. Il faut observer, arroser, attendre et recommencer.</p>",
		"<p>Les parcelles rapprochent des personnes qui ne se seraient peut-être jamais parlé ailleurs.</p>",
		"<p>La nature n'est pas un décor reposant : c'est une relation concrète avec le temps, les limites et les autres vivants.</p>"},
		[]string{"nature", "jardin"}, false},
	{"%s : la tactique a changé le foot moderne", [3]string{
		"<p>Le football d'aujourd'hui se joue d'abord dans les statistiques et les couloirs de passes, avant même de se jouer sur la pelouse.</p>",
		"<p>Du pressing géométrique aux données de course, chaque club moderne ressemble à un laboratoire où l'intuition a cédé la place à la mesure.</p>",
		"<p>Pourtant, les supporters savent que le jeu reste un sport de quartier, d'émotion et de hasard — et c'est tant mieux.</p>"},
		[]string{"foot", "tactique"}, false},
	{"%s : ce que le jeu vidéo dit de nous", [3]string{
		"<p>Le jeu vidéo est devenu le premier loisir culturel au monde, et pourtant on continue de le traiter comme un passe-temps d'adolescent.</p>",
		"<p>Chaque génération de joueurs raconte quelque chose de son époque : la quête, la coopération, la performance, l'évasion.</p>",
		"<p>Regarder ce qu'on joue — et pourquoi on joue — en dit long sur qui l'on est.</p>"},
		[]string{"gaming", "culture"}, false},
	{"%s : l'animation japonaise, art mondial", [3]string{
		"<p>On l'a longtemps traitée comme une niche : entre saisons diffusées en simulcast, openings cultes et films aux chiffres globaux, l'animation japonaise s'est imposée comme un pilier de la culture mondiale.</p>",
		"<p>De l'adaptation d'un shonen à succès d'audience au seinen confidentiel porté par une communauté de fans, chaque saison renouvelle l'exigence de dessin, de montage et de rythme.</p>",
		"<p>Doublages, OST marquantes, figures collector et cosplay transforment une œuvre fermée en monde partagé.</p>"},
		[]string{"anime", "manga"}, false},
	{"%s : cosplay et conventions, la communauté anime en chair et en os", [3]string{
		"<p>Derrière les écrans, la culture anime se vit aussi dans les conventions et les concours de cosplay, où des milliers de fans se retrouvent chaque saison.</p>",
		"<p>Vendeurs de figurines, étals de doujinshi, panels de studios et cosplayeurs en armure : l'événement transforme une passion parfois solitaire en famille choisie.</p>",
		"<p>Cosplayer un personnage, c'est lui rendre hommage tout en inventant sa propre version — l'endroit exact où la fiction devient une vraie communauté.</p>"},
		[]string{"anime", "cosplay"}, false},
	{"%s : la scène musicale indépendante résiste", [3]string{
		"<p>Concentrée, algorithmisée, la musique en streaming n'a jamais été aussi riche — ni aussi uniforme.</p>",
		"<p>Les labels indépendants et les salles de quartier fabriquent pourtant une scène vivante, fragile et indispensable.</p>",
		"<p>Soutenir les artistes directement, c'est choisir une musique qui ne ressemble pas à une playlist optimisée.</p>"},
		[]string{"musique", "independance"}, false},
	{"%s : vie privée, le retour de bâton", [3]string{
		"<p>Après deux décennies de collecte massive, les utilisateurs redécouvrent que leurs données sont un patrimoine, pas une ressource gratuite.</p>",
		"<p>Applications chiffrées, hébergement personnel, consentement : une contre-offensive silencieuse s'organise.</p>",
		"<p>La vie privée n'est pas une nostalgie : c'est une infrastructure technique et politique.</p>"},
		[]string{"tech", "vieprivee"}, false},
	{"%s : la seconde main, nouvelle frontière de la mode", [3]string{
		"<p>Friperies, vide-dressing, revente en ligne : la seconde main a cessé d'être un recours pour devenir un choix.</p>",
		"<p>Elle prolonge la vie des vêtements, réduit la pression sur les ressources et invente de nouvelles économies locales.</p>",
		"<p>Le style n'est plus une question de budget, mais de regard.</p>"},
		[]string{"mode", "seconde_main"}, false},
	{"%s : le sport comme hygiène mentale", [3]string{
		"<p>Courir, nager, soulever : l'activité physique est l'un des rares remèdes dont l'efficacité sur l'anxiété est documentée.</p>",
		"<p>Au-delà du corps, le sport fabrique de la régularité, du temps pour soi et une fierté simple.</p>",
		"<p>Il ne s'agit pas de performance : il s'agit de se retrouver.</p>"},
		[]string{"sport", "sante"}, false},
	{"%s : les créateurs, nouveaux patrons du divertissement", [3]string{
		"<p>Streams, chaînes, podcasts : une génération de créateurs a construit des audiences que les médias traditionnels envient.</p>",
		"<p>Sans intermédiaires, avec des revenus directs et un lien quotidien avec leur communauté, ils réinventent la production.</p>",
		"<p>Le modèle a ses limites, mais il a définitivement changé la donne.</p>"},
		[]string{"streaming", "createurs"}, false},
	{"%s : l'e-sport entre sport et spectacle", [3]string{
		"<p>Des stades remplis pour des finales de jeux vidéo : l'e-sport est devenu un spectacle de masse qui emprunte au sport ses codes.</p>",
		"<p>Entraînements millimétrés, transferts, sponsors : les équipes professionnelles calquent leur management sur les clubs historiques.</p>",
		"<p>La question n'est plus de savoir si c'est un sport, mais ce que cette industrie nous apprend du jeu.</p>"},
		[]string{"esport", "gaming"}, false},
	{"%s : grandir avec un frère ou une sœur", [3]string{
		"<p>On ne choisit pas ses frères et sœurs, mais on les choisit le reste de sa vie.</p>",
		"<p>Partager une chambre, se disputer une console, se prêter un manteau : la fratrie est une école de négociation.</p>",
		"<p>Les souvenirs d'enfance ont presque toujours un frère ou une sœur dans le cadre.</p>"},
		[]string{"famille", "fratrie"}, false},
	{"%s : réinventer l'université après les amphis vides", [3]string{
		"<p>Les amphithéâtres se vident, les plateformes se remplissent : l'enseignement supérieur cherche un second souffle.</p>",
		"<p>Hybride, orientée projet, connectée au terrain, l'université de demain doit réconcilier masse et accompagnement.</p>",
		"<p>La vraie question n'est pas la technologie, mais ce qu'on attend d'un diplôme.</p>"},
		[]string{"etudes", "education"}, false},
	{"%s : ce que nos animaux de compagnie changent en nous", [3]string{
		"<p>Un chien qui remue la queue à 7h du matin, un chat qui dort sur le clavier : ces présences silencieuses transforment nos journées.</p>",
		"<p>Adopter, c'est accepter une responsabilité, mais c'est aussi découvrir une fidélité que peu de relations humaines égalent.</p>",
		"<p>Les refuges débordent pourtant, et chaque adoption est une victoire modeste mais réelle.</p>"},
		[]string{"animaux", "quotidien"}, false},
	{"%s : la série qui a changé notre rapport au temps", [3]string{
		"<p>En quelques années, la série est devenue la forme narrative dominante : plus longue, plus lente, plus intime que le film.</p>",
		"<p>Le binge-watching a remplacé le rendez-vous hebdomadaire, et avec lui une autre manière de vivre les histoires.</p>",
		"<p>La question n'est pas de savoir si c'est mieux, mais ce que cette bascule dit de nous.</p>"},
		[]string{"series", "culture"}, false},
	{"%s : l'argent, ce tabou qu'on devrait discuter", [3]string{
		"<p>On parle de tout, sauf d'argent. Le salaire, le loyer, les dettes restent des sujets que l'on tait par pudeur.</p>",
		"<p>Cette omerta coûte cher : mal informés, mal conseillés, beaucoup naviguent à vue dans leurs finances.</p>",
		"<p>En parler simplement, sans jargon ni jugement, est le premier pas vers plus d'autonomie.</p>"},
		[]string{"argent", "quotidien"}, false},
	{"%s : marcher pour retrouver le monde", [3]string{
		"<p>La randonnée ne demande ni abonnement ni matériel coûteux : une paire de chaussures et l'envie de ralentir.</p>",
		"<p>Marcher, c'est retrouver un rythme que les écrans nous ont volé, et un rapport direct au paysage.</p>",
		"<p>Les sentiers se remplissent chaque week-end, preuve que le besoin de lenteur est massif.</p>"},
		[]string{"randonnee", "nature"}, false},
	{"%s : lire, encore et toujours", [3]string{
		"<p>La lecture résiste à toutes les prédictions de disparition, du livre papier au format audio, en passant par l'ebook.</p>",
		"<p>Lire, c'est accepter de prendre le temps qu'il faut, dans une époque qui n'en a jamais assez.</p>",
		"<p>Les librairies indépendantes, les clubs et les bibliothèques portent cette flamme mieux que les algorithmes.</p>"},
		[]string{"lecture", "culture"}, false},
	{"Pourquoi je suis (encore) à 700 points en Valorant", [3]string{
		"<p>Trois parties par soir, un agent favori, une carte que je connais par cœur : et pourtant la ranked stagne.</p>",
		"<p>Le vrai skill, j'ai mis du temps à le comprendre, c'est de ne pas tilt après la troisième défaite d'affilée.</p>",
		"<p>Entre la visée, la carte et les comms, Valorant reste le meilleur terrain pour se fâcher tout seul.</p>"},
		[]string{"valorant", "esport"}, false},
	{"Ma liste de jeux indie à ne pas rater : %s", [3]string{
		"<p>Un studio de trois personnes, une idée toute simple et un budget minuscule suffisent parfois à faire le jeu de l'année.</p>",
		"<p>Ces pépites artisanales osent des mécaniques que les grosses productions n'essaient plus.</p>",
		"<p>Faire travailler les petits studios, c'est voter pour la variété du jeu vidéo de demain.</p>"},
		[]string{"gaming", "indie"}, false},
	{"Pourquoi One Piece reste le plus grand récit de notre époque", [3]string{
		"<p>Deux décennies, plus de mille chapitres, une carte qui s'agrandit de tome en tome : le pari était fou, il a tenu.</p>",
		"<p>L'équipage de Luffy traverse moins des batailles que des amitiés, des rêves et des deuils.</p>",
		"<p>Relire One Piece, c'est retrouver un vieux camarade qui n'a jamais cessé de grandir.</p>"},
		[]string{"onepiece", "manga"}, false},
	{"JoJo's Bizarre Adventure et les memes qui l'ont rendu culte", [3]string{
		"<p>Des poses improbables, des noms de pouvoirs délirants et des répliques entrées dans la culture web.</p>",
		"<p>La série a su transformer l'exagération en marque de fabrique et les fans en communauté soudée.</p>",
		"<p>Les memes ne remplacent pas le manga, ils lui offrent une seconde vie.</p>"},
		[]string{"jojo", "anime"}, false},
	{"Le cosplay One Piece : un rêve d'enfant devenu costume", [3]string{
		"<p>Couper, coudre, coller un chapeau de paille ou une épée trois fois trop grande : le cosplay est un artisanat.</p>",
		"<p>En convention, incarner son personnage préféré fait naître des rencontres que rien n'aurait permises.</p>",
		"<p>On ne cosplaye pas pour un concours, on cosplaye parce qu'un personnage nous a sauvés un jour.</p>"},
		[]string{"onepiece", "cosplay"}, false},
	{"Prendre soin de ses cheveux bouclés, une année d'essais", [3]string{
		"<p>J'ai testé les crèmes, les sérums, les coiffures protectrices et énormément de patience.</p>",
		"<p>Le secret, j'ai compris, c'est moins le produit que la régularité et l'hydratation.</p>",
		"<p>Mes boucles ont fini par me parler, et j'ai appris à les écouter.</p>"},
		[]string{"cheveux", "beaute"}, false},
	{"Les musées qu'on visite enfin tout seul", [3]string{
		"<p>Un musée, c'est d'abord un rythme : le tien. On s'arrête devant un tableau quand il nous arrête.</p>",
		"<p>Visiter sans guide ni hâte, c'est découvrir que les belles salles gardent des secrets pour les visiteurs curieux.</p>",
		"<p>La solitude dans un musée est une des rares solitudes que l'on ne veut pas quitter.</p>"},
		[]string{"musee", "culture"}, false},
	{"Trois livres à lire cet hiver, choisis avec soin", [3]string{
		"<p>Un roman, un essai, un recueil de nouvelles : un programme d'hiver pensé pour les longues soirées.</p>",
		"<p>Les bonnes recommandations valent mieux que les palmarès, elles viennent de quelqu'un qui vous connaît.</p>",
		"<p>La lecture est un voyage immobile, et l'hiver est sa saison préférée.</p>"},
		[]string{"lecture", "livres"}, false},
	{"Organiser son premier voyage solo, sans stresser", [3]string{
		"<p>Un billet, une auberge, un carnet : le premier voyage seul tient dans deux valises et beaucoup d'appréhension.</p>",
		"<p>Manger à sa faim, se perdre, renoncer à un plan : on découvre ses propres règles.</p>",
		"<p>On rentre changé, pas parce qu'on a vu le monde, mais parce qu'on s'est vus à travers lui.</p>"},
		[]string{"voyage", "solo"}, false},
	{"Pourquoi le capitalisme a-t-il tenu ses promesses ?", [3]string{
		"<p>Moins de pauvreté extrême, plus de confort, des écrans partout : une partie des promesses est tenue.</p>",
		"<p>Mais les inégalités qui se creusent, la planète qui chauffe et les vies précarisées racontent une autre histoire.</p>",
		"<p>Le débat mérite mieux que des slogans : il est à peine bien posé.</p>"},
		[]string{"politique", "economie"}, false},
	{"Le socialisme n'est pas un gros mot", [3]string{
		"<p>Solidarité, services publics, temps de travail choisi : les idées que l'on rabâche ont toujours de la vigueur.</p>",
		"<p>Ce que l'on refuse de discuter finit par décider à notre place, en secret.</p>",
		"<p>Penser le commun n'est pas une nostalgie, c'est un horizon.</p>"},
		[]string{"politique", "socialisme"}, false},
	{"Ce que les privilèges nous apprennent sur nous-mêmes", [3]string{
		"<p>Un héritage, un logement garanti, des parents bien placés : on ne voit pas toujours ce qu'on a reçu.</p>",
		"<p>Regarder ses privilèges sans culpabilité, c'est enfin savoir d'où l'on part.</p>",
		"<p>L'égalité ne consiste pas à nier les différences, mais à ne plus les payer.</p>"},
		[]string{"politique", "inegalites"}, false},
	{"Pourquoi je ne supporte plus les mêmes visages en politique", [3]string{
		"<p>Les mêmes débats, les mêmes têtes, les mêmes promesses à échéance : l'essai est devenu une relecture.</p>",
		"<p>La politique se rejoue devant nous, mais un électorat plus exigeant peut en changer le casting.</p>",
		"<p>Renouveler la vie publique, ce n'est pas un caprice : c'est de la lucidité.</p>"},
		[]string{"politique", "renouvellement"}, false},
	{"Des budgets qui rognent les services publics, pomme par pomme", [3]string{
		"<p>Une ligne ici, un poste là, une fermeture annoncée en douce : c'est ainsi que le service public s'étiole.</p>",
		"<p>Écoles, hôpitaux, transports : quand l'argent manque, c'est l'égalité d'accès qui paie.</p>",
		"<p>Suivre les budgets au lieu de les subir est devenu un devoir de citoyen.</p>"},
		[]string{"politique", "services_publics"}, false},
	{"%s : courir sans se prendre la tête", [3]string{
		"<p>Pas de chrono, pas d'appli qui juge : juste la régularité, le souffle et le bitume du matin.</p>",
		"<p>La muscu à la maison, le 10 km du dimanche ou la séance de yoga : le sport commence là où on arrête de se comparer.</p>",
		"<p>Se bouger, c'est aussi reprendre la main sur son énergie de la journée.</p>"},
		[]string{"fitness", "sport", "sante"}, false},
	{"%s : capturer la lumière des rues", [3]string{
		"<p>Un appareil en bandoulière, des reflets dans les vitrines, une silhouette qui traverse : la photo est partout, il suffit de regarder.</p>",
		"<p>L'argentique réapprend la patience, le numérique la réactivité : les deux se nourrissent.</p>",
		"<p>Photographier, c'est écrire avec la lumière — et chacun peut apprendre à le faire.</p>"},
		[]string{"photo", "argentique", "art"}, false},
	{"%s : créer devant sa caméra", [3]string{
		"<p>Allumer sa caméra, c'est accepter d'être vu avant d'être parfait : le premier direct est toujours le plus dur.</p>",
		"<p>Entre le montage qui s'éternise et la régularité qui rassure, chaque créateur trouve son propre tempo.</p>",
		"<p>Créer en direct, c'est bâtir une communauté autour d'une vraie présence.</p>"},
		[]string{"twitch", "streaming", "createurs"}, false},
	{"%s : mercato, rumeurs et coups de bluff", [3]string{
		"<p>Chaque été, le mercato transforme les clubs en salle des marchés : agents, clauses libératoires et transferts qui se jouent à minuit.</p>",
		"<p>Derrière les annonces officielles, il y a les négociations qui échouent, les joueurs qui font grève de l'entraînement et les présidents qui bluffent.</p>",
		"<p>Le mercato, c'est la preuve que le foot se joue aussi en dehors du terrain.</p>"},
		[]string{"foot", "mercato"}, false},
	{"%s : supporters, virages et ambiances de stade", [3]string{
		"<p>Avant même le coup d'envoi, le virage chante : les supporters sont le douzième homme, celui qu'aucune statistique ne mesure.</p>",
		"<p>Des tifos préparés pendant des semaines aux déplacements qui finissent à 4h du matin, la passion ne se programme pas.</p>",
		"<p>Un stade plein, c'est une ville qui retient son souffle pendant 90 minutes.</p>"},
		[]string{"foot", "supporter"}, false},
	{"%s : la photo de rue, capter l'instant", [3]string{
		"<p>La photo de rue n'attend pas le décor parfait : elle guette la coïncidence, le regard, l'ombre qui traverse le trottoir.</p>",
		"<p>Marcher sans but, l'appareil à l'épaule, reste la meilleure école de composition qui soit.</p>",
		"<p>Une bonne photo de rue raconte une histoire que personne n'avait vue.</p>"},
		[]string{"photo", "rue"}, false},
	{"%s : l'intelligence artificielle au quotidien", [3]string{
		"<p>L'IA n'est plus une promesse de laboratoire : elle écrit nos e-mails, résume nos réunions et recommande nos playlists.</p>",
		"<p>Entre gains de temps réels et dépendance tranquille, il devient urgent d'apprendre à l'utiliser sans se faire utiliser.</p>",
		"<p>Le bon usage de l'IA, c'est finalement une question d'hygiène mentale.</p>"},
		[]string{"tech", "ia"}, false},
	{"%s : concerts, petites salles et découvertes live", [3]string{
		"<p>Il y a quelque chose qu'aucun algorithme ne remplace : le son d'une petite salle, la sueur, le premier rang.</p>",
		"<p>Les artistes qu'on découvre en première partie deviennent souvent ceux qu'on suit toute sa vie.</p>",
		"<p>Aller voir un groupe inconnu un mardi soir, c'est le meilleur investissement culturel qui existe.</p>"},
		[]string{"musique", "live"}, false},
	{"%s : friperies et mode qui dure", [3]string{
		"<p>La friperie du samedi matin cache des trésors pour qui prend le temps de fouiller : une veste des années 90, un jean parfaitement usé.</p>",
		"<p>Porter de la seconde main, c'est affirmer un style sans participer à la course au neuf.</p>",
		"<p>La mode la plus durable reste celle qu'on trouve, pas celle qu'on achète.</p>"},
		[]string{"mode", "friperie"}, false},
}

var topTitleWords = []string{"La longue marche", "Le rendez-vous manqué", "L'heure des choix", "Le vertige", "La promesse", "L'angle mort", "La fracture", "Le pari", "L'héritage", "Le basculement", "Le carnet ouvert", "Le détour nécessaire", "Les jours ordinaires", "La dernière séance", "La première fois", "Le bon moment", "La petite lumière", "Le chemin de traverse", "Les gestes simples", "La saison des pluies", "Le goût des autres", "L'après-midi d'automne", "La table du dimanche", "La carte et le territoire", "Les nuits d'été", "Le train de 7h47", "La maison d'enfance", "Le plat du jour", "La fenêtre ouverte", "Les copains d'abord"}

var topTopicExtras = map[string][]string{
	"manga":   {"One Piece", "Nausicaä", "Akira", "le club de lecture", "les planches en noir et blanc"},
	"films":   {"la salle de quartier", "le montage", "les génériques", "le documentaire", "la séance de minuit"},
	"voyage":  {"un train de nuit", "Lisbonne", "Kyoto", "un carnet froissé", "le retour à la maison"},
	"culture": {"la librairie", "un musée", "la musique indépendante", "la traduction", "la scène locale"},
	"romance": {"la rencontre", "les messages à 2 h 17", "le premier café", "la distance", "le courage de rester"},
	"cuisine": {"le marché", "la recette de famille", "le pain chaud", "les épices", "la table du dimanche"},
	"jeux":    {"le jeu de rôle", "la partie coopérative", "la console portable", "les dés", "la découverte"},
	"nature":  {"le jardin partagé", "les oiseaux", "la forêt", "la pluie", "la patience"},
}

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
	"mdr trop vrai %s",
	"GG pour ce post. %s, c'est exactement ça.",
	"%s, je valide à 100%.",
	"On peut en reparler autour d'un café ? %s mérite un vrai débat.",
	"up ! %s, quelqu'un devait le dire.",
	"Je suis pas d'accord mais je respecte. %s, c'est discutable.",
	"La 2e mi-temps de ce fil va être chaude, %s c'est du lourd.",
	"Je lis en silence d'habitude, mais %s, là, fallait que je réponde.",
	"Sauvegarde direct. %s, tu es sur quelque chose.",
	"Enfin quelqu'un qui pose les mots sur %s.",
	"%s : je l'ai partagé à toute la famille, ils vont débattre.",
	"Je suis le rejoindre sur %s, le timing tombe bien.",
}

// topCommentTemplates alimentent les fils de commentaires d'articles : chaque
// article retenu reçoit 2 à 4 avis variés d'autres comptes de sa niche.
var topCommentTemplates = []string{
	"Article essentiel, et %s est bien le point que je retiens.",
	"Je découvre ce sujet grâce à vous, merci pour la clarté.",
	"%s : je n'étais pas convaincu, vous m'avez fait changer d'avis.",
	"Enfin un média qui prend le temps d'aller au fond de %s.",
	"À partager largement. %s, c'est trop peu discuté.",
	"Lu deux fois pour bien digérer. %s mérite une vraie suite.",
	"Je partage le constat, même si %s reste à creuser localement.",
	"le passage sur %s valait à lui seul l'article.",
	"Ça change des titres racoleurs. %s, c'est du sérieux.",
	"Mon beau-père va adorer %s, je lui envoie tout de suite.",
	"J'ai commenté pour en reparler plus tard, %s c'est exactement ça.",
	"Je ne suis pas d'accord sur la fin, mais %s est très bien vu.",
	"Faites une suite sur %s, je signe.",
	"Rangé dans mes favoris. %s, merci pour ce travail.",
	"Enfin écrit simplement. %s, tout le monde devrait le lire.",
	"Je relance le fil : qui d'autre a vécu %s comme ça ?",
	"L'auteur a tout compris à %s, chapeau.",
	"Un bel angle. %s méritait qu'on en parle aussi honnêtement.",
}

// seedArticleDiscussion crée des fils de commentaires réalistes sur une part des
// articles : chaque fil porte 2 à 4 avis signés par d'autres comptes tirés de la
// MÊME niche (leurs centres d'intérêt recoupent les tags de la publication) —
// tout profil abondé porte ainsi un vrai fil, et le contenu reste ancré niche.
func seedArticleDiscussion(ctx context.Context, pool *pgxpool.Pool, res *TopResult, rng *prng) error {
	readerByNiche := map[string][]*TopUser{}
	var allReaders []*TopUser
	for i := range res.Users {
		u := &res.Users[i]
		if u.Role == "creator" {
			continue
		}
		allReaders = append(allReaders, u)
		for _, it := range u.Interests {
			readerByNiche[it] = append(readerByNiche[it], u)
		}
	}
	if len(allReaders) == 0 {
		return nil
	}
	pubTags := map[string][]string{}
	for i := range res.Publications {
		pubTags[res.Publications[i].ID] = res.Publications[i].Tags
	}

	for i := range res.Articles {
		art := &res.Articles[i]
		anchor := stableAnchor(art.ID)
		if anchor%100 >= 40 {
			continue // ~60% des articles sans fil — l'édition reste crédible.
		}
		tags := pubTags[art.PublicationID]
		niche := ""
		if len(tags) > 0 {
			niche = tags[0]
		}
		nComments := 2 + int(anchor%3) // 2..4 commentaires par fil
		source := allReaders
		if niche != "" && len(readerByNiche[niche]) >= nComments {
			source = readerByNiche[niche]
		}
		if len(source) < nComments {
			source = allReaders
		}
		used := map[string]bool{}
		for k := 0; k < nComments && len(used) < len(source); k++ {
			c := source[int((anchor+uint64(k)*7919)%uint64(len(source)))]
			if used[c.ID] {
				continue
			}
			used[c.ID] = true
			tmpl := topCommentTemplates[int((anchor+uint64(k)*104729)%uint64(len(topCommentTemplates)))]
			content := tmpl
			if strings.Contains(tmpl, "%s") {
				w := niche
				if w == "" {
					w = "ce sujet"
				}
				content = fmt.Sprintf(tmpl, w)
			}
			id := topID(fmt.Sprintf("artcmt%d", i), k)
			created := art.CreatedAt.Add(time.Duration(2+int(anchor%12)) * time.Hour)
			if created.After(time.Now().UTC()) {
				created = time.Now().UTC().Add(-time.Hour)
			}
			if _, err := pool.Exec(ctx, `
				INSERT INTO "ArticleComment" (id, content, "articleId", "authorId", "createdAt", "updatedAt")
				VALUES ($1,$2,$3,$4,$5,$5)
				ON CONFLICT (id) DO NOTHING`,
				id, content, art.ID, c.ID, created); err != nil {
				return fmt.Errorf("article comment %s: %w", id, err)
			}
		}
	}
	return nil
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

// WipeTables est la liste UNIQUE des tables à vider, dans l'ordre sûr (les
// enfants avant les parents pour respecter les clés étrangères). Elle est
// partagée par RunTop (wipe avant régénération) et par devtools.Reset : les
// deux boutons doivent vider exactement la même base, sinon des résidus
// (ReadingSession, ArticleSlugHistory, OAuth*, MediaAsset…) survivent à un
// reset.
var WipeTables = []string{
	"PollVote", "PollOption", "Poll",
	"StarterPackItem", "StarterPack",
	"NotificationDelivery", "NotificationPreference", "Notification",
	"AnnotationUpvote", "AnnotationComment", "Highlight",
	"ArticleComment",
	"Letter", "Bookmark", "Follows", "Subscriber", "WalletTransaction",
	"MutedWord", "MutedUser", "BlockedUser",
	"MediaAttachment", "Like", "Post", "FeedImpression", "ContentFeedback", "ReadingSession",
	"ArticleAttribution", "ArticleSlugHistory", "ArticleSlug", "CollaborationRequest",
	"_CoAuthors", "collab_documents",
	"Article",
	"Category", "NavigationItem", "SocialLink", "Recommendation", "Tier",
	"MediaAuditLog", "MediaInvite", "MediaMember", "Media",
	"ApiKey", "WebhookDelivery", "Webhook", "TranslationAuditLog", "UserSettings",
	"AccountDeletionRequest", "OAuthConsent", "OAuthToken", "OAuthAuthorizationCode",
	"OAuthClient", "ModerationReport", "MediaAsset",
	"User",
	"Trend", "PartnerPromo", "SystemConfig",
	"Publication",
}

// WipeAll vide la base dans l'ordre sûr (liste WipeTables).
func WipeAll(ctx context.Context, pool *pgxpool.Pool) error {
	for _, t := range WipeTables {
		if _, err := pool.Exec(ctx, fmt.Sprintf(`DELETE FROM "%s"`, t)); err != nil {
			return fmt.Errorf("wipe %s: %w", t, err)
		}
	}
	return nil
}

// ---------------------------------------------------------------------------
// Alignement des interactions sur la niche (follows / likes / signets /
// surlignages). Tout choix passe par des slices TRIÉES : les maps Go ne sont
// pas ordonnées, on ne sélectionne jamais via une itération de map afin de
// rester déterministe (même seed → même graphe d'interactions).
// ---------------------------------------------------------------------------

// sortedIntKeys trie les clés entières d'un ensemble.
func sortedIntKeys(set map[int]bool) []int {
	out := make([]int, 0, len(set))
	for k := range set {
		out = append(out, k)
	}
	sort.Ints(out)
	return out
}

// publicationIndexesMatching retourne (triés) les indices de publications dont
// un tag chevauche les centres d'intérêt de l'utilisateur.
func publicationIndexesMatching(interests []string, pubByTag map[string][]int) []int {
	set := map[int]bool{}
	for _, t := range interests {
		for _, pi := range pubByTag[t] {
			set[pi] = true
		}
	}
	return sortedIntKeys(set)
}

// postIDsMatching retourne (triées) les id de pensées partageant un tag avec
// les intérêts de l'utilisateur.
func postIDsMatching(interests []string, postsByTag map[string][]string) []string {
	set := map[string]bool{}
	for _, t := range interests {
		for _, pid := range postsByTag[t] {
			set[pid] = true
		}
	}
	ids := make([]string, 0, len(set))
	for k := range set {
		ids = append(ids, k)
	}
	sort.Strings(ids)
	return ids
}

// articleIndexesMatching retourne (triés) les indices d'articles partageant un
// tag avec les intérêts de l'utilisateur.
func articleIndexesMatching(interests []string, artsByTag map[string][]int) []int {
	set := map[int]bool{}
	for _, t := range interests {
		for _, ai := range artsByTag[t] {
			set[ai] = true
		}
	}
	return sortedIntKeys(set)
}

// excerpt extrait un extrait lisible du début (HTML nettoyé) d'un article.
func excerpt(html string) string {
	s := strings.Join(strings.Fields(stripHTML(html)), " ")
	if s == "" {
		return ""
	}
	words := strings.Fields(s)
	n := 14
	if len(words) < n {
		n = len(words)
	}
	out := strings.Join(words[:n], " ")
	if n < len(words) {
		out += " …"
	}
	return out
}

// coverKindForTag associe un milieu à une des 4 couvertures embarquées, pour
// que les visuels de publication/article/post reflètent la niche du créateur
// (tech/gaming → "technology", écologie/nature/ville → "ecology", sinon
// paysage éditorial). Déterministe et borné au catalogue disponible.
var coverKindForTag = map[string]string{
	"tech": "technology", "vieprivee": "technology", "gaming": "technology", "esport": "technology",
	"ecologie": "ecology", "jardin": "ecology", "nature": "ecology", "randonnee": "ecology", "ville": "ecology",
}

func coverKind(tags []string) string {
	if len(tags) > 0 {
		if k, ok := coverKindForTag[tags[0]]; ok {
			return k
		}
	}
	return "editorial_landscape"
}

// coverURLFor sélectionne une couverture du thème du persona quand le
// catalogue local (assets/covers/themed) en a une, sinon retombe sur les
// paysages éditoriaux embarqués (coverKind). Cycle déterministe par thème.
func coverURLFor(c *coverCatalog, tags []string, index int) string {
	theme := ""
	if len(tags) > 0 {
		theme = themeForKey(tags[0])
	}
	if c != nil {
		if url, ok := c.pickCover(theme); ok {
			return url
		}
	}
	return visualURL(index, coverKind(tags))
}

// ---------------------------------------------------------------------------
// RunTop — génération complète de la DB app
// ---------------------------------------------------------------------------

// RunTop régénère la base « top du top » (après wipe). Déterministe.
func RunTop(ctx context.Context, pool *pgxpool.Pool, opts TopOptions) (*TopResult, error) {
	opts = opts.defaults()
	rng := newPRNG(0x8F3B2A1C)
	now := time.Now().UTC().Truncate(time.Second)

	// RunTop est le profil complet historique : il reste volontairement
	// destructif. Le nouveau mode additif est AddTop, utilisé par le bouton
	// d'enrichissement quand on veut conserver les données existantes.
	if err := WipeAll(ctx, pool); err != nil {
		return nil, err
	}

	res := &TopResult{}
	start := time.Now()
	log.Printf("[seed-top] génération : %d users, %d articles, %d pensées, %d sessions…",
		opts.Users, opts.Articles, opts.Posts, opts.ReadingSessions)

	// ── 1. Users + publications PERSONAL (créateurs) ───────────────────────
	// Chaque compte reçoit un milieu (foot, gaming, anime, cuisine…), une
	// identité (pseudonyme ou « Prénom Nom »), un genre/âge et une photo de
	// profil réelle assortie — comme dans un vrai réseau.
	avatars := loadAvatarCatalog()
	covers := loadCoverCatalog()
	creators := 0
	seenUsername := map[string]bool{}
	seenEmail := map[string]bool{}
	for i := 0; i < opts.Users; i++ {
		role := "user"
		if rng.next() < opts.CreatorsRatio {
			role = "creator"
		}
		per := randomPersona(rng)
		gender := pickGender(rng, per.maleProb)
		ageRange := pickAgeRange(rng, per.ageW)

		// Identité : pseudonyme (surnom + handle) ou « Prénom Nom » classique.
		// Les pools de surnoms/pseudos sont filtrés par genre pour rester
		// crédibles (pas de « mamanDebordee » sur un compte masculin).
		nickPool := poolForGender(per.nicks, gender, nickGender)
		pseudoPool := poolForGender(per.pseudos, gender, pseudoGender)
		var name, username string
		if pickPseudoAccount(rng, role) {
			handle := prngPick(rng, pseudoPool)
			if rng.next() < 0.5 {
				handle = pseudoFromNick(rng, prngPick(rng, nickPool))
			}
			username = slugify(handle)
			for seenUsername[username] {
				username = fmt.Sprintf("%s%d", slugify(handle), rng.intn(9999))
			}
			seenUsername[username] = true
			// Nom d'affichage : on favorise les surnoms du milieu (lisibles,
			// cohérents avec la niche) et on limite humanizeHandle, qui tronque
			// les handles en noms trop courts (« le.vrai.papa » → « Le »).
			if rng.next() < 0.75 {
				name = prngPick(rng, nickPool)
			} else {
				name = humanizeHandle(handle)
			}
		} else {
			first := topFirstName(rng, gender)
			last := prngPick(rng, topLastNames)
			name = first + " " + last
			username = slugify(first + last)
			for seenUsername[username] {
				username = fmt.Sprintf("%s%d", slugify(first+last), rng.intn(9999))
			}
			seenUsername[username] = true
		}

		domains := []string{"gmail.com", "outlook.fr", "proton.me", "icloud.com", "orange.fr", "hotmail.fr"}
		email := fmt.Sprintf("%s@%s", username, prngPick(rng, domains))
		for seenEmail[email] {
			email = fmt.Sprintf("%s%d@%s", username, rng.intn(9999), prngPick(rng, domains))
		}
		seenEmail[email] = true
		created := now.AddDate(0, 0, -rng.intn(180))
		bio := prngPick(rng, per.bios)
		if rng.next() < 0.25 {
			bio = biosFor(name, rng)
		}
		avatar := avatars.pick(gender, themeForKey(per.key))

		u := TopUser{
			ID: topUUID(i, "user"), Email: email, Name: name, Username: username,
			Role: role, Country: prngPick(rng, topCountries), CreatedAt: created,
			Bio: bio, Interests: append([]string(nil), per.tags...),
			Gender: gender, AgeRange: ageRange,
		}
		if role == "creator" {
			creators++
			pubID := topID("pub", i)
			pub := TopPublication{
				ID: pubID, OwnerID: u.ID, Name: name, Slug: username,
				Subdomain: username, Bio: bio, Accent: prngPick(rng, topAccents),
				Tags: append([]string(nil), per.tags...),
			}
			u.PubID = pubID
			res.Publications = append(res.Publications, pub)
			if _, err := pool.Exec(ctx, `
				INSERT INTO "Publication" (id, type, name, slug, subdomain, bio, "logoUrl", "headerImageUrl", "isCertified", "accentColor", "layoutStyle", "createdAt", "updatedAt")
				VALUES ($1, 'PERSONAL', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)`,
				pub.ID, pub.Name, pub.Slug, pub.Subdomain, pub.Bio, avatar, coverURLFor(covers, pub.Tags, i+4), rng.next() < 0.25, pub.Accent, []string{"minimal", "editorial", "magazine"}[i%3], created); err != nil {
				return nil, fmt.Errorf("publication %s: %w", pub.ID, err)
			}
		}
		if _, err := pool.Exec(ctx, `
			INSERT INTO "User" (id, email, username, name, role, "isCertified", "countryCode", "languageCode", gender, "ageRange", "hasCompletedOnboarding", "publicationId", "logoUrl", "createdAt", "updatedAt")
			VALUES ($1, $2, $3, $4, $5, $6, $7, 'fr', $8, $9, true, $10, $11, $12, $12)`,
			u.ID, u.Email, u.Username, u.Name, u.Role, rng.next() < 0.06, u.Country, gender, ageRange, nullStr(u.PubID), avatar, created); err != nil {
			return nil, fmt.Errorf("user %s: %w", u.ID, err)
		}
		res.Users = append(res.Users, u)
	}
	log.Printf("[seed-top] ✔ %d users (%d créateurs)", len(res.Users), creators)

	// ── 1b. Admin superadmin (aligné sur Supabase Auth) ───────────────────
	// La DB app contient les users générés (UUID déterministes sans compte Supabase
	// Auth). Sans cela, l'identité admin (admin@qoe.fi, id 85003f3c-… présent dans
	// auth.users) n'existe pas côté app : /v1/me → 404 (crash des pages) et le
	// cheim superadmin JWT des devtools/admin → 403. On recrée donc toujours
	// l'admin canonique + sa publication personnelle après le wipe.
	if err := upsertTopAdmin(ctx, pool); err != nil {
		return nil, err
	}

	// ── 2. Catégories (2-3 par publication créateur) ───────────────────────
	// Les catégories reflètent le milieu de la publication quand c'est possible
	// (un compte gaming a des catégories Gaming/Tech, pas Souveraineté).
	catNames := []string{"Football", "Gaming", "Anime", "Cuisine", "Musique", "Mode", "Sport", "Tech", "Voyage", "Culture", "Écologie", "Politique", "Économie", "Numérique"}
	catSlugs := []string{"football", "gaming", "anime", "cuisine", "musique", "mode", "sport", "tech", "voyage", "culture", "ecologie", "politique", "economie", "numerique"}
	catByKey := map[string]int{"foot": 0, "gaming": 1, "anime": 2, "cuisine": 3, "musique": 4, "mode": 5, "fitness": 6, "tech": 7, "voyage": 8}
	catByPub := map[string][]string{}
	catSeq := 0
	for _, pub := range res.Publications {
		nb := 2 + rng.intn(2)
		first := -1
		if len(pub.Tags) > 0 {
			if ci, ok := catByKey[pub.Tags[0]]; ok {
				first = ci
			}
		}
		for c := 0; c < nb; c++ {
			ci := first
			if ci < 0 || (c > 0 && rng.next() < 0.6) {
				ci = rng.intn(len(catNames))
			}
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
		// 100% : sujet aligné avec le milieu du créateur (foot, gaming…).
		// L'ancien 40% noyait toutes les publications sous des sujets génériques
		// (« temps long », « espace public numérique »…) identiques partout. Tous
		// les milieux du seed ont un sujet dédié, donc chaque profil ne publie
		// que du contenu de sa niche (cohérence « un profil = un milieu »).
		if t := topicForTags(pub.Tags, stableAnchor(pub.OwnerID)+uint64(i)); t != nil {
			topic = *t
		}
		// « Voix par auteur » : le mot de titre est phasé par l'id du compte, pas
		// tiré au hasard seul → deux créateurs d'une même niche n'enchaînent pas
		// les mêmes titres.
		word := topTitleWords[int((stableAnchor(pub.OwnerID)+uint64(rng.intn(len(topTitleWords))))%uint64(len(topTitleWords)))]
		title := topicTitle(topic, word)
		content := longFormContent(topic, rng)
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
			INSERT INTO "Article" (id, title, slug, content, "imageUrl", published, status, visibility,
				"isPremium", "isEditorPick", "readingTime", "semanticTags", "publicationId", "authorId", "categoryId", "createdAt", "updatedAt")
			VALUES ($1, $2, $3, $4, $5, true, 'PUBLISHED', 'PUBLIC', $6, $7, $8, $9, $10, $11, $12, $13, $13)`,
			art.ID, art.Title, art.Slug, art.Content, coverURLFor(covers, pub.Tags, i+8), art.Premium,
			topic.editor && rng.next() < 0.3, int32(art.ReadingTime), topic.tags,
			art.PublicationID, art.AuthorID, nullStr(art.CategoryID), created); err != nil {
			return nil, fmt.Errorf("article %s: %w", art.ID, err)
		}
		res.Articles = append(res.Articles, art)
	}

	// Articles canoniques — requis par l'e2e (core-journeys, security) qui
	// font référence à ces slugs exacts. Sans eux, ces specs échouaient : le
	// corpus -top génère des slugs dérivés du titre, pas ces identifiants fixes.
	canonical := []struct {
		slug, title, content, visibility string
		premium, editorPick              bool
	}{
		{"souverainete-medias-independants", "La souveraineté des médias indépendants",
			"<p>Dans un monde saturé de plateformes, posséder son propre espace de publication n'est plus un luxe : c'est une condition de survie éditoriale.</p><p>Cet article explore ce que signifie réellement être souverain sur son audience, son contenu et ses revenus.</p>",
			"PUBLIC", false, true},
		{"essai-premium-souverainete", "L'économie de l'attention, dix ans après",
			"<p>Premier paragraphe offert : le temps de lecture est une denrée rare.</p><p>Deuxième paragraphe offert : la plupart des plateformes en vivent.</p><!--paywall--><p>Ce passage est réservé aux abonnés premium de cette publication.</p><p>La suite de l'analyse est exclusive.</p>",
			"PAID_SUBSCRIBERS", true, false},
	}
	// Upsert avec ID déterministe — res.Articles doit porter un ID valide
	// (les bookmarks et EmbedTop piochent dessus ; un ID vide = FK cassée sur
	// Bookmark.articleId). On insère donc en direct avec un id canonique fixe.
	for i, a := range canonical {
		artID := topID("artc", i)
		if _, err := pool.Exec(ctx, `
			INSERT INTO "Article" (id, title, slug, content, "imageUrl", published, status, visibility,
				"isPremium", "isEditorPick", "readingTime", "semanticTags", "publicationId", "authorId", "createdAt", "updatedAt")
			VALUES ($1, $2, $3, $4, $5, true, 'PUBLISHED', $6, $7, $8, 6, $9, $10, $11, now(), now())
			ON CONFLICT ("publicationId", slug) DO UPDATE SET
			  title = $2, content = $4, visibility = $6, "isPremium" = $7, "isEditorPick" = $8, "updatedAt" = now()`,
			artID, a.title, a.slug, a.content, visualURL(200+i, "editorial_landscape"), a.visibility,
			a.premium, a.editorPick, []string{"edito"}, AdminPubID, AdminUserID); err != nil {
			return nil, fmt.Errorf("article canonique %s: %w", a.slug, err)
		}
		res.Articles = append(res.Articles, TopArticle{
			ID: artID, PublicationID: AdminPubID, AuthorID: AdminUserID,
			Slug: a.slug, Title: a.title, Content: a.content, Premium: a.premium,
			ReadingTime: 6, CreatedAt: time.Now().UTC().Truncate(time.Second),
		})
	}
	log.Printf("[seed-top] ✔ %d articles", len(res.Articles))

	// ── 3bis. Fils de commentaires d'articles ─────────────────────────────────
	// Donne à une part des articles un vrai fil de discussion : 2 à 4 avis
	// d'autres comptes, choisis dans la MÊME niche (leurs centres d'intérêt
	// recoupent les tags de l'article) → chaque profil abondé porte son fil.
	if err := seedArticleDiscussion(ctx, pool, res, rng); err != nil {
		return nil, err
	}

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
	// ~20% de réponses : assez de fils pour que chaque profil créateur abondé
	// porte une vraie discussion sous ses pensées (~370 fils).
	rootCount := int(float64(opts.Posts) * 0.80)
	replyCount := opts.Posts - rootCount
	allPostIDs := make([]string, 0, opts.Posts)
	postTags := map[string][]string{}       // tags par post (pour aligner les réponses)
	postCreatedAt := map[string]time.Time{} // date par post (pour répondre APRÈS son parent)
	for i := 0; i < opts.Posts; i++ {
		author := res.Users[rng.weightedIndex(userWeights)]
		created := now.AddDate(0, 0, -rng.intn(40)).Add(-time.Duration(rng.intn(24)) * time.Hour).Add(-time.Duration(rng.intn(60)) * time.Minute)
		postID := topID("post", i)
		var content string
		var tags []string
		if i < rootCount {
			// Pensée cohérente avec le milieu de l'auteur (foot, gaming…).
			text, tgs := thoughtFor(rng, author)
			tags = tgs
			content = text
			if rng.next() < 0.5 {
				content += " #" + strings.Join(tags, " #")
			}
			postImage := ""
			if rng.next() < 0.25 {
				postImage = coverURLFor(covers, author.Interests, i+16)
			}
			if _, err := pool.Exec(ctx, `
				INSERT INTO "Post" (id, content, "authorId", tags, "imageUrl", visibility, "isDraft", "likeCount", "repostCount", "replyCount", "createdAt", "updatedAt")
				VALUES ($1, $2, $3, $4, $5, 'public', false, $6, $7, 0, $8, $8)`,
				postID, content, author.ID, tags, postImage, rng.intn(40), rng.intn(12), created); err != nil {
				return nil, fmt.Errorf("post root: %w", err)
			}
			postTags[postID] = tags
			postCreatedAt[postID] = created
		} else {
			parent := allPostIDs[rng.intn(len(allPostIDs))]
			// Réponse alignée sur le milieu du post parent (tags hérités).
			tags = postTags[parent]
			if len(tags) == 0 {
				tags = prngPick(rng, topThoughts).tags
			}
			content = fmt.Sprintf(prngPick(rng, topReplyTemplates), tags[0])
			// La réponse date TOUJOURS après son parent (quelques minutes à
			// quelques heures) : des fils de discussion cohérents au lieu de
			// réponses qui datent d'avant le post auquel elles répondent.
			created = postCreatedAt[parent].Add(time.Duration(5+rng.intn(240)) * time.Minute)
			if _, err := pool.Exec(ctx, `
				INSERT INTO "Post" (id, content, "authorId", tags, visibility, "isDraft", "likeCount", "repostCount", "replyCount", "parentId", "rootId", "createdAt", "updatedAt")
				VALUES ($1, $2, $3, $4, 'public', false, $5, 0, 0, $6, $6, $7, $7)`,
				postID, content, author.ID, tags, rng.intn(10), parent, created); err != nil {
				return nil, fmt.Errorf("post reply: %w", err)
			}
			postTags[postID] = tags
			postCreatedAt[postID] = created
		}
		res.Posts = append(res.Posts, TopPost{ID: postID, Content: content, Tags: tags})
		allPostIDs = append(allPostIDs, postID)
	}
	res.PostIDs = allPostIDs
	log.Printf("[seed-top] ✔ %d pensées (%d racines / %d réponses)", len(allPostIDs), rootCount, replyCount)

	// ── 5. Follows (lecteurs → publications) ───────────────────────────────
	// Alignés sur la niche du lecteur : un profil foot suit des publications du
	// milieu foot (tags en commun), le reste (≈30%) va vers des publications
	// populaires hors-niche pour la découverte — l'onglet Abonnements devient
	// un vrai signal de profil plutôt qu'un bruit aléatoire.
	readerIDs := make([]string, 0)
	usrIdxByID := map[string]int{}
	for i, u := range res.Users {
		usrIdxByID[u.ID] = i
		if u.Role != "creator" {
			readerIDs = append(readerIDs, u.ID)
		}
	}
	// Index publications → indices par tag, + loi puissance de popularité.
	pubByTag := map[string][]int{}
	for pi := range res.Publications {
		for _, t := range res.Publications[pi].Tags {
			pubByTag[t] = append(pubByTag[t], pi)
		}
	}
	var pubFollowWeights []float64
	for j := range res.Publications {
		pubFollowWeights = append(pubFollowWeights, 2.0/float64(j+2))
	}
	followSeq := 0
	seenFollow := map[string]bool{}
	for _, rid := range readerIDs {
		niche := publicationIndexesMatching(res.Users[usrIdxByID[rid]].Interests, pubByTag)
		nb := 1 + rng.intn(12)
		start := rng.intn(len(niche) + 1)
		for f := 0; f < nb; f++ {
			var pi int
			if len(niche) > 0 && rng.next() < 0.7 {
				pi = niche[(start+f)%len(niche)]
			} else {
				pi = rng.weightedIndex(pubFollowWeights)
			}
			pub := res.Publications[pi]
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
	log.Printf("[seed-top] ✔ %d follows (alignés niche + populaires)", res.Follows)

	// ── 6. Likes (~12k) + abonnés CRM (~1.5k) + wallet + bookmarks ────────
	likeSeq := 0
	seenLike := map[string]bool{}
	// Index des pensées par tag (les tags sont alignés sur la niche de leur
	// auteur via thoughtFor) → on peut liker « dans son milieu ».
	postsByTag := map[string][]string{}
	for pid, tags := range postTags {
		for _, t := range tags {
			postsByTag[t] = append(postsByTag[t], pid)
		}
	}
	for i := 0; i < 12000; i++ {
		user := res.Users[rng.intn(len(res.Users))]
		var post string
		cand := postIDsMatching(user.Interests, postsByTag)
		if len(cand) > 0 && rng.next() < 0.78 {
			post = cand[rng.intn(len(cand))]
		} else {
			post = allPostIDs[rng.intn(len(allPostIDs))]
		}
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

	// ⚡ Bursts de vélocité (trending) : une douzaine de pensées reçoit un pic
	// de likes sur les dernières 48h (10-19 likes chacun), en plus du bruit de
	// fond étalé sur 14 jours. C'est le signal « vélocité 48h » du moteur de
	// feed (max(engagement cumulatif, vélocité)) : ces posts « chauds » montent
	// dans le feed de démo sans attendre que leur compteur cumulatif rattrape
	// les vieux contenus — le trending devient visible.
	//
	// On cible des posts à FAIBLE compteur cumulatif (likeCount < 15) : c'est là
	// que la vélocité a le plus d'effet visible (eng 0.3 → 1.0), pas sur les
	// posts déjà populaires (eng déjà à 1.0).
	var burstCandidates []string
	{
		bRows, err := pool.Query(ctx, `SELECT id FROM "Post"
			WHERE "parentId" IS NULL AND "repostId" IS NULL AND "deletedAt" IS NULL
			  AND "isDraft" = false AND "likeCount" < 15`)
		if err != nil {
			return nil, fmt.Errorf("candidats burst: %w", err)
		}
		for bRows.Next() {
			var id string
			if bRows.Scan(&id) == nil {
				burstCandidates = append(burstCandidates, id)
			}
		}
		bRows.Close()
	}
	for i := 0; i < 12 && len(burstCandidates) > 0; i++ {
		post := burstCandidates[rng.intn(len(burstCandidates))]
		burst := 10 + rng.intn(10) // 10 à 19 likes en 48h (cible vélocité : 8)
		for j := 0; j < burst; j++ {
			user := res.Users[rng.intn(len(res.Users))]
			key := post + "|" + user.ID
			if seenLike[key] {
				continue
			}
			seenLike[key] = true
			if _, err := pool.Exec(ctx, `
				INSERT INTO "Like" (id, "postId", "userId", "createdAt")
				VALUES ($1, $2, $3, $4)`,
				topID("lik", likeSeq), post, user.ID, now.Add(-time.Duration(rng.intn(48))*time.Hour)); err != nil {
				return nil, fmt.Errorf("like burst (trending): %w", err)
			}
			likeSeq++
			res.Likes++
		}
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
	// Index des articles (id + tags + texte) pour aligner signets et
	// surlignages sur la niche du lecteur.
	type artNiche struct {
		id      string
		tags    []string
		content string
	}
	var artNicheList []artNiche
	artNicheByTag := map[string][]int{}
	{
		rows, err := pool.Query(ctx, `SELECT id, COALESCE("semanticTags", '{}'), COALESCE(content, '') FROM "Article" WHERE published = true ORDER BY id`)
		if err != nil {
			return nil, fmt.Errorf("articles pour signets: %w", err)
		}
		for rows.Next() {
			var a artNiche
			if err := rows.Scan(&a.id, &a.tags, &a.content); err != nil {
				rows.Close()
				return nil, err
			}
			for _, t := range a.tags {
				artNicheByTag[t] = append(artNicheByTag[t], len(artNicheList))
			}
			artNicheList = append(artNicheList, a)
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return nil, err
		}
	}
	for i := 0; i < 800; i++ {
		ui := rng.intn(len(res.Users))
		reader := res.Users[ui]
		cand := articleIndexesMatching(reader.Interests, artNicheByTag)
		var artID string
		if len(cand) > 0 && rng.next() < 0.8 {
			artID = artNicheList[cand[rng.intn(len(cand))]].id
		} else {
			artID = res.Articles[rng.intn(len(res.Articles))].ID
		}
		key := reader.ID + "|" + artID
		if seenBmk[key] {
			continue
		}
		seenBmk[key] = true
		if _, err := pool.Exec(ctx, `
			INSERT INTO "Bookmark" (id, "readerId", "articleId", "createdAt")
			VALUES ($1, $2, $3, $4)`,
			topID("bmk", bmkSeq), reader.ID, artID, now.AddDate(0, 0, -rng.intn(30))); err != nil {
			return nil, fmt.Errorf("bookmark: %w", err)
		}
		bmkSeq++
	}

	// ── 6bis. Surlignages (Highlight) — signal EMA le plus fort (α=0.20) ──
	// La table Highlight était vide : ~40% des comptes surlignent maintenant
	// 2-3 passages d'articles de leur niche, pour que le profil vectoriel
	// dispose de ce signal explicite (comme en prod).
	hlSeq := 0
	for _, u := range res.Users {
		if rng.next() >= 0.4 {
			continue
		}
		cand := articleIndexesMatching(u.Interests, artNicheByTag)
		if len(cand) == 0 {
			continue
		}
		nhl := 2 + rng.intn(2)
		start := rng.intn(len(cand))
		for i := 0; i < nhl; i++ {
			art := artNicheList[cand[(start+i)%len(cand)]]
			phrase := excerpt(art.content)
			if phrase == "" {
				phrase = "Passage qui m'a marqué."
			}
			if _, err := pool.Exec(ctx, `
				INSERT INTO "Highlight" (id, text, "isPublic", "isOfficial", "upvotesCount", "readerId", "articleId", "createdAt", "quoteOrdinal")
				VALUES ($1, $2, true, false, $3, $4, $5, $6, $7)`,
				topID("hl", hlSeq), phrase, rng.intn(20), u.ID, art.id, now.AddDate(0, 0, -rng.intn(30)), i); err != nil {
				return nil, fmt.Errorf("highlight: %w", err)
			}
			hlSeq++
		}
	}
	log.Printf("[seed-top] ✔ %d likes, %d abonnés CRM, %d wallet, %d bookmarks, %d highlights",
		res.Likes, res.Subscribers, walletSeq, bmkSeq, hlSeq)

	// ── 7. ReadingSessions (~5700 sur 14 jours) ────────────────────────────
	// Alignées sur le milieu du lecteur : ~70% des sessions portent sur un
	// article partageant un tag avec les centres d'intérêt du user (un profil
	// foot lit des articles foot), le reste explore ailleurs (découverte
	// réaliste). La lecture devient ainsi un vrai signal de profil — en prod,
	// l'EMA vectorfeed l'applique sur chaque session (READ_COMPLETE fort,
	// READ_PARTIAL faible, SKIM clic, BOUNCE négatif).
	type artInfo struct {
		id          string
		tags        []string
		readingTime int
	}
	var artIndex []artInfo
	artByID := map[string]artInfo{}
	artByTag := map[string][]string{}
	{
		artRows, err := pool.Query(ctx, `SELECT id, COALESCE("semanticTags", '{}'), "readingTime" FROM "Article" WHERE published = true ORDER BY id`)
		if err != nil {
			return nil, fmt.Errorf("articles pour sessions: %w", err)
		}
		for artRows.Next() {
			var a artInfo
			if err := artRows.Scan(&a.id, &a.tags, &a.readingTime); err != nil {
				artRows.Close()
				return nil, err
			}
			artIndex = append(artIndex, a)
			artByID[a.id] = a
			for _, t := range a.tags {
				artByTag[t] = append(artByTag[t], a.id)
			}
		}
		artRows.Close()
		if err := artRows.Err(); err != nil {
			return nil, err
		}
	}

	sessSeq := 0
	statuses := []string{"BOUNCE", "SKIM", "READ_PARTIAL", "READ_COMPLETE"}
	sources := []string{"feed", "feed", "feed", "subdomain", "subdomain", "direct", "notification"}
	for i := 0; i < opts.ReadingSessions; i++ {
		user := res.Users[rng.intn(len(res.Users))]
		var art artInfo
		if rng.next() < 0.7 {
			var candidates []string
			for _, t := range user.Interests {
				candidates = append(candidates, artByTag[t]...)
			}
			if len(candidates) > 0 {
				art = artByID[candidates[rng.intn(len(candidates))]]
			}
		}
		if art.id == "" {
			art = artIndex[rng.intn(len(artIndex))]
		}
		dwell := 15 + rng.intn(420)
		scroll := 15 + rng.intn(86)
		status := statuses[0]
		if scroll >= 80 && dwell < art.readingTime*60*35/100 {
			status = "SKIM"
		} else if scroll >= 85 && dwell >= art.readingTime*60 {
			status = "READ_COMPLETE"
		} else if scroll >= 25 {
			status = "READ_PARTIAL"
		}
		created := now.AddDate(0, 0, -rng.intn(14)).Add(-time.Duration(rng.intn(86400)) * time.Second)
		if _, err := pool.Exec(ctx, `
			INSERT INTO "ReadingSession" (id, "articleId", "userId", source, status, "scrollDepth", "dwellSeconds", "readingTimeMinutes", hostname, "createdAt")
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
			topID("rs", sessSeq), art.id, user.ID, prngPick(rng, sources), status, scroll, dwell,
			art.readingTime, "qoe.test", created); err != nil {
			return nil, fmt.Errorf("reading session: %w", err)
		}
		sessSeq++
		res.ReadingSess++
	}

	// ⚡ Bursts de lecture (trending articles) : une demi-douzaine d'articles
	// reçoit un pic de lectures COMPLÈTES sur les dernières 48h (15-25 sessions,
	// cible vélocité article : 20). Comme pour les likes, ces articles « chauds »
	// montent dans les feeds de démo via la vélocité 48h du moteur.
	for i := 0; i < 6 && len(artIndex) > 0; i++ {
		art := artIndex[rng.intn(len(artIndex))]
		burst := 15 + rng.intn(11) // 15 à 25 lectures complètes en 48h
		for j := 0; j < burst; j++ {
			user := res.Users[rng.intn(len(res.Users))]
			created := now.Add(-time.Duration(rng.intn(48)) * time.Hour)
			if _, err := pool.Exec(ctx, `
				INSERT INTO "ReadingSession" (id, "articleId", "userId", source, status, "scrollDepth", "dwellSeconds", "readingTimeMinutes", hostname, "createdAt")
				VALUES ($1, $2, $3, 'feed', 'READ_COMPLETE', 95, $4, $5, 'qoe.test', $6)`,
				topID("rs", sessSeq), art.id, user.ID, art.readingTime*60, art.readingTime, created); err != nil {
				return nil, fmt.Errorf("session burst (trending): %w", err)
			}
			sessSeq++
			res.ReadingSess++
		}
	}
	log.Printf("[seed-top] ✔ %d reading sessions (alignées milieu + bursts trending)", res.ReadingSess)

	// ── 8. Monde vivant — couche « société connectée » loggable et unique.
	// Met en scène une bande de créateurs/lecteurs nommés : ils se suivent,
	// se répondent, se repostent, partagent des private jokes, publient des
	// articles qui répondent à d'autres articles, votent des polls et
	// alimentent des tendances + notifications. Idempotent sur ses slices.
	if err := RunWorld(ctx, pool); err != nil {
		return nil, fmt.Errorf("world: %w", err)
	}
	log.Printf("[seed-top] ✔ monde vivant (cast + discussions + articles + polls)")

	log.Printf("[seed-top] ✅ génération terminée en %s", time.Since(start).Round(time.Millisecond))
	return res, nil
}

// AddTop ajoute un lot de contenu riche sans supprimer les données déjà
// présentes. Les IDs portent un namespace dédié, donc un second passage est
// idempotent et ne duplique pas le lot.
func AddTop(ctx context.Context, pool *pgxpool.Pool, opts TopOptions) (*TopResult, error) {
	opts = opts.defaults()
	rng := newPRNG(0xA17D5EED)
	now := time.Now().UTC().Truncate(time.Second)
	res := &TopResult{}

	// Reprendre les utilisateurs et publications déjà présents permet de
	// brancher le contenu additionnel au graphe existant sans le remplacer.
	rows, err := pool.Query(ctx, `SELECT id::text, email, COALESCE(name,''), COALESCE(username,''), role, COALESCE("countryCode",'FR'), "createdAt", COALESCE("publicationId",'') FROM "User" WHERE role <> 'superadmin' ORDER BY "createdAt", id`)
	if err != nil {
		return nil, fmt.Errorf("addtop users: %w", err)
	}
	for rows.Next() {
		var u TopUser
		if err := rows.Scan(&u.ID, &u.Email, &u.Name, &u.Username, &u.Role, &u.Country, &u.CreatedAt, &u.PubID); err != nil {
			rows.Close()
			return nil, err
		}
		res.Users = append(res.Users, u)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(res.Users) == 0 {
		return nil, fmt.Errorf("addtop: aucun utilisateur existant")
	}

	var pubIDs []string
	pubRows, err := pool.Query(ctx, `SELECT id FROM "Publication" WHERE type = 'PERSONAL' ORDER BY id`)
	if err != nil {
		return nil, fmt.Errorf("addtop publications: %w", err)
	}
	if err == nil {
		for pubRows.Next() {
			var id string
			if pubRows.Scan(&id) == nil {
				pubIDs = append(pubIDs, id)
			}
		}
		pubRows.Close()
	}
	if len(pubIDs) == 0 {
		return nil, fmt.Errorf("addtop: aucune publication personnelle")
	}

	// La niche n'est pas persistée sur User/Publication : on l'infère du tag
	// dominant des pensées déjà en base — comme ça, le lot additif reste
	// cohérent avec chaque compte (pas d'article générique sur un profil foot).
	nicheByUser := map[string]string{}
	// Seuls les tags qui correspondent à un sujet d'article comptent pour la
	// niche : un créateur foot a les tags foot/ligue1/supporter (tous mappés),
	// mais un tag « humour » ne doit pas devenir sa niche — sinon le sujet
	// d'article retomberait sur la rotation globale (hors-niche).
	topicKeys := map[string]bool{}
	for _, tp := range topTopics {
		for _, tag := range tp.tags {
			topicKeys[tag] = true
		}
	}
	rowsN, err := pool.Query(ctx, `SELECT pp."authorId", t.t FROM "Post" pp, unnest(pp.tags) t
		WHERE pp.tags IS NOT NULL AND t.t = ANY($1)
		GROUP BY pp."authorId", t.t ORDER BY pp."authorId", count(*) DESC`, slices.Collect(maps.Keys(topicKeys)))
	if err != nil {
		return nil, fmt.Errorf("addtop niche query: %w", err)
	}
	for rowsN.Next() {
		var uid, tag string
		if rowsN.Scan(&uid, &tag) == nil {
			if _, ok := nicheByUser[uid]; !ok { // premier = tag dominant mappé
				nicheByUser[uid] = tag
			}
		}
	}
	rowsN.Close()
	for i := range res.Users {
		u := &res.Users[i]
		if niche := nicheByUser[u.ID]; niche != "" {
			u.Interests = []string{niche}
		}
	}

	covers := loadCoverCatalog()
	// Distribution cyclique (et non aléatoire) : avec le même volume d'articles
	// que de publications, chaque créateur recoit au moins un article dans son
	// fil — aucun profil avec zéro contenu éditorial.
	for i := 0; i < opts.Articles; i++ {
		pubID := pubIDs[i%len(pubIDs)]
		var authorID string
		if err := pool.QueryRow(ctx, `SELECT id::text FROM "User" WHERE "publicationId" = $1 LIMIT 1`, pubID).Scan(&authorID); err != nil {
			if err := pool.QueryRow(ctx, `SELECT id::text FROM "User" WHERE role='creator' ORDER BY id LIMIT 1`).Scan(&authorID); err != nil {
				return nil, err
			}
		}
		// Sujet aligné sur la niche du créateur (comme la passe principale).
		topic := topTopics[i%len(topTopics)]
		if niche := nicheByUser[authorID]; niche != "" {
			if t := topicForTags([]string{niche}, stableAnchor(authorID)+uint64(i)); t != nil {
				topic = *t
			}
		}
		// « Voix par auteur » sur le mot de titre, phasée par l'id du compte.
		word := topTitleWords[int((stableAnchor(authorID)+uint64(rng.intn(len(topTitleWords))))%uint64(len(topTitleWords)))]
		id := topID("addart", i)
		title := topicTitle(topic, word)
		content := longFormContent(topic, rng)
		cover := coverURLFor(covers, []string{nicheByUser[authorID]}, i+40)
		if _, err := pool.Exec(ctx, `INSERT INTO "Article" (id,title,slug,content,"imageUrl",published,status,visibility,"isPremium","isEditorPick","readingTime","semanticTags","publicationId","authorId","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,true,'PUBLISHED','PUBLIC',$6,$7,10,$8,$9,$10,$11,$11) ON CONFLICT (id) DO NOTHING`, id, title, fmt.Sprintf("%s-add-%d", slugify(title), i), content, cover, rng.next() < opts.PremiumRatio, topic.editor && rng.next() < .25, topic.tags, pubID, authorID, now.Add(-time.Duration(i)*time.Hour)); err != nil {
			return nil, err
		}
		res.Articles = append(res.Articles, TopArticle{ID: id, PublicationID: pubID, AuthorID: authorID, Title: title, Content: content})
	}
	for i := 0; i < opts.Posts; i++ {
		u := &res.Users[rng.intn(len(res.Users))]
		// Pensée cohérente avec le milieu de l'auteur (Interests inféré du
		// tag dominant de ses posts) — comme la passe principale.
		text, tags := thoughtFor(rng, *u)
		id := topID("addpost", i)
		if _, err := pool.Exec(ctx, `
			INSERT INTO "Post" (id,content,"authorId",tags,"imageUrl",visibility,"isDraft","likeCount","repostCount","replyCount","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,'public',false,$6,$7,0,$8,$8) ON CONFLICT (id) DO NOTHING`, id, text, u.ID, tags, visualURL(i+60, ""), rng.intn(80), rng.intn(20), now.Add(-time.Duration(i)*time.Hour)); err != nil {
			return nil, err
		}
		res.Posts = append(res.Posts, TopPost{ID: id, Content: text, Tags: tags})
		res.PostIDs = append(res.PostIDs, id)
	}
	// Fils de commentaires sur les articles additifs aussi.
	if err := seedArticleDiscussion(ctx, pool, res, rng); err != nil {
		return nil, err
	}
	return res, nil
}

// upsertTopAdmin recrée l'admin superadmin canonique (admin@qoe.fi) et sa
// publication personnelle après le wipe de RunTop. L'id AdminUserID correspond
// au compte Supabase Auth « Admin Sanctuaire », ce qui rend l'identité admin
// cohérente côté app (GET /v1/me) et côté RBAC (role superadmin).
func upsertTopAdmin(ctx context.Context, pool *pgxpool.Pool) error {
	if _, err := pool.Exec(ctx, `
		INSERT INTO "Publication" (id, type, name, slug, subdomain, "isCertified", "createdAt", "updatedAt")
		VALUES ($1, 'PERSONAL', 'Super Admin', 'admin', 'admin', true, now(), now())
		ON CONFLICT (id) DO UPDATE SET name = 'Super Admin', slug = 'admin',
		  subdomain = 'admin', "isCertified" = true, "updatedAt" = now()`,
		AdminPubID); err != nil {
		return fmt.Errorf("publication admin (top): %w", err)
	}
	if _, err := pool.Exec(ctx, `
		INSERT INTO "User" (id, email, username, name, role, "isCertified", "countryCode", "languageCode", "hasCompletedOnboarding", "publicationId", "createdAt", "updatedAt")
		VALUES ($1, 'admin@qoe.fi', 'admin', 'Admin Sanctuaire', 'superadmin', true, 'FR', 'fr', true, $2, now(), now())
		ON CONFLICT (id) DO UPDATE SET email = 'admin@qoe.fi', username = 'admin', name = 'Admin Sanctuaire',
		  role = 'superadmin', "isCertified" = true, "publicationId" = $2, "updatedAt" = now()`,
		AdminUserID, AdminPubID); err != nil {
		return fmt.Errorf("user admin (top): %w", err)
	}
	return nil
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

// topSentenceConnectors / topSentenceClauses — banque de phrases générique
// pour construire des articles longs variés sans répéter mécaniquement les 3
// paragraphes du sujet (l'ancien seed cyclait les mêmes blocs 72 fois).
var topSentenceConnectors = []string{
	"", "En pratique,", "Pour autant,", "Dans les faits,", "Prenons un exemple concret :",
	"À bien des égards,", "Sur le terrain,", "Au quotidien,", "Sans surprise,",
	"D'un autre côté,", "Finalement,", "À y regarder de près,", "Reste une nuance :",
	"Force est de constater que", "Il faut le dire :", "Ce n'est pas un hasard si",
}

var topSentenceClauses = []string{
	"le sujet mérite mieux qu'un raccourci.",
	"les acteurs concernés le savent depuis longtemps.",
	"rien ne se règle par décret du jour au lendemain.",
	"les habitudes ont la vie dure.",
	"la question est plus nuancée qu'il n'y paraît.",
	"il y a un écart entre le discours et la réalité du terrain.",
	"chaque territoire vit la situation à son rythme.",
	"les solutions existent, il manque souvent la volonté.",
	"on observe une lente mais réelle prise de conscience.",
	"le temps est une variable que les décideurs oublient trop souvent.",
	"les chiffres racontent une partie de l'histoire, pas toute l'histoire.",
	"il faut regarder ce qui se passe en dehors des métropoles.",
	"les générations suivantes jugeront nos choix actuels.",
	"la simplicité apparente cache des mécanismes complexes.",
	"le débat public a besoin de faits, pas de slogans.",
	"l'expérience locale montre que c'est possible.",
	"le compromis n'est pas une faiblesse, c'est une méthode.",
	"les effets se mesurent sur la durée, pas à l'instant.",
	"beaucoup préfèrent l'immédiateté à la solidité.",
	"la confiance se construit dans la durée.",
	"les témoignages convergent sur l'essentiel.",
	"le détail change souvent la conclusion.",
	"il reste beaucoup à faire, et c'est une bonne nouvelle.",
	"les initiatives fleurissent quand on leur laisse de l'air.",
	"la méthode compte autant que le résultat.",
}

func longFormContent(topic topTopic, rng *prng) string {
	var b strings.Builder
	// Intro : les 3 paragraphes du sujet.
	for i := 0; i < 3; i++ {
		b.WriteString(topic.paras[i])
	}
	// Développement : ~45 phrases construites à partir d'une banque variée
	// (clauses générales + paragraphes du sujet + mots de titre), pour que
	// deux articles du même sujet ne se ressemblent pas.
	clauses := make([]string, 0, len(topSentenceClauses)+9)
	clauses = append(clauses, topSentenceClauses...)
	for i := 0; i < 9; i++ {
		clauses = append(clauses, topic.paras[i%3])
	}
	for i := 0; i < 45; i++ {
		clause := prngPick(rng, clauses)
		clause = strings.TrimPrefix(clause, "<p>")
		clause = strings.TrimSuffix(clause, "</p>")
		conn := prngPick(rng, topSentenceConnectors)
		sentence := clause
		if conn != "" {
			// Minuscule de la PREMIÈRE RUNE (pas du premier octet : une
			// clause peut commencer par « À », « É »… multi-octets en UTF-8,
			// et clause[:1] tronquerait l'octet → texte invalide rejeté par
			// Postgres (SQLSTATE 22021)).
			rs := []rune(clause)
			if len(rs) > 0 {
				sentence = conn + " " + strings.ToLower(string(rs[0])) + string(rs[1:])
			}
		}
		b.WriteString("<p>" + sentence + "</p>")
	}
	// Conclusion : une ouverture.
	b.WriteString("<p>" + prngPick(rng, topSentenceClauses) + "</p>")
	return b.String()
}

func biosFor(name string, rng *prng) string {
	templates := []string{
		"Journaliste indépendante, je couvre les mutations du quotidien.",
		"Écrivain et essayiste. J'écris sur ce qui nous entoure, sans en faire trop.",
		"Créatrice de contenus — culture, écologie et politique.",
		"Rédacteur passionné par les histoires ordinaires.",
		"Autrice et chercheuse. J'écris sur la vie des gens, tout simplement.",
		"Journaliste local, enquêteur de terrain.",
		"Essayiste. J'aime les grands sujets abordés par les petites portes.",
		"Podcasteuse et chroniqueuse. Je raconte la ville qui vient.",
		"Photographe amateur, je documente les détails que les flux oublient.",
		"Développeuse, cycliste et lectrice du dimanche — pas forcément dans cet ordre.",
		"Bibliothécaire, parent, collectionneur de carnets et d'idées imparfaites.",
		"Illustrateur freelance, entre deux cafés et trois croquis.",
		"Chercheuse en sciences sociales, curieuse des usages ordinaires.",
		"Je fais des listes, je rate mes trains et je lis les notes de bas de page.",
		"Maman de deux enfants, je cherche de belles histoires entre l'école et le dîner.",
		"Cinéphile du dimanche, collectionneur de billets et de génériques oubliés.",
		"Passionné de manga, de cafés calmes et de voyages sans programme.",
		"Je cuisine pour comprendre les villes et je note tout dans un carnet bleu.",
		"Lectrice compulsive, joueuse occasionnelle, toujours partante pour une bonne discussion.",
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

	// Les requêtes sont « base-wide » (embedding IS NULL) et non limitées à
	// res.* : le wipe de RunTop préserve le casting éditorial canonique du
	// seed de base (users + leurs articles/pensées). Ces comptes ne sont pas
	// dans res.Users/res.Posts ; sans cette couverture, ils resteraient sans
	// vecteur et leurs contenus ne remonteraient jamais par similarité.

	articles := 0
	rows, err := pool.Query(ctx, `SELECT id, title, content FROM "Article"
		WHERE "embedding" IS NULL AND published = true`)
	if err != nil {
		return 0, 0, err
	}
	for rows.Next() {
		var id, title, content string
		if err := rows.Scan(&id, &title, &content); err != nil {
			rows.Close()
			return articles, 0, err
		}
		text := title + "\n\n" + stripHTML(content)
		// Le service d'inférence local (llama.cpp) rejette les entrées trop
		// longues (>~2k chars, contexte court). Le titre + le début du corps
		// suffisent pour la similarité sémantique ; on borne donc l'entrée.
		if len(text) > 1800 {
			text = text[:1800]
		}
		if strings.TrimSpace(text) == "" {
			continue
		}
		vec, err := embed(text)
		if err != nil {
			log.Printf("[seed-top] embed article %s: %v", id, err)
			continue
		}
		if len(vec) > 512 {
			vec = vec[:512]
		}
		if _, err := pool.Exec(ctx, `UPDATE "Article" SET embedding = $2 WHERE id = $1`,
			id, vectorLiteral(vec)); err != nil {
			rows.Close()
			return articles, 0, err
		}
		articles++
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return articles, 0, err
	}
	rows.Close()
	log.Printf("[seed-top] ✔ %d articles embeddés", articles)

	posts := 0
	rows, err = pool.Query(ctx, `SELECT id, content, tags FROM "Post"
		WHERE "embedding" IS NULL AND "deletedAt" IS NULL AND "isDraft" = false`)
	if err != nil {
		return articles, 0, err
	}
	for rows.Next() {
		var id, content string
		var tags []string
		if err := rows.Scan(&id, &content, &tags); err != nil {
			rows.Close()
			return articles, 0, err
		}
		text := strings.TrimSpace(content)
		if text == "" {
			continue
		}
		if len(tags) > 0 {
			text = text + "\n\nTags : " + strings.Join(tags, ", ")
		}
		vec, err := embed(text)
		if err != nil {
			log.Printf("[seed-top] embed post %s: %v", id, err)
			continue
		}
		if len(vec) > 512 {
			vec = vec[:512]
		}
		if _, err := pool.Exec(ctx, `UPDATE "Post" SET embedding = $2, "updatedAt" = now() WHERE id = $1`,
			id, vectorLiteral(vec)); err != nil {
			rows.Close()
			return articles, 0, err
		}
		posts++
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return articles, 0, err
	}
	rows.Close()
	log.Printf("[seed-top] ✔ %d pensées embeddées", posts)

	// Users — contenu d'abord : le profil d'un user = la moyenne des
	// embeddings de SES pensées (jamais sa bio, cohérent avec le worker de
	// prod). Un seul UPDATE base-wide.
	ct, err := pool.Exec(ctx, `
		UPDATE "User" u
		SET embedding = m.mean, "updatedAt" = now()
		FROM (
			SELECT p."authorId" AS uid, avg(p."embedding") AS mean
			FROM "Post" p
			WHERE p."embedding" IS NOT NULL AND p."deletedAt" IS NULL
			  AND p."isDraft" = false AND p."isHiddenByAuthor" = false
			GROUP BY p."authorId"
		) m
		WHERE u.id = m.uid AND u."embedding" IS NULL`)
	if err != nil {
		return articles, 0, err
	}
	users := int(ct.RowsAffected())

	// Puis lecture : les comptes sans pensée mais avec de vraies sessions de
	// lecture reçoivent un vecteur issu de CE QU'ILS LISENT — moyenne des
	// articles lus avec un signal positif (READ_COMPLETE/PARTIAL/SKIM, comme
	// l'EMA prod sur les lectures). Les bounces sont exclus : un user 100%
	// bounces reste en cold start. Pas de repli bio : un user sans aucune
	// activité reste en cold start (fraîcheur/engagement), comme en prod.
	ct2, err := pool.Exec(ctx, `
		UPDATE "User" u
		SET embedding = sub.mean, "updatedAt" = now()
		FROM (
			SELECT rs."userId" AS uid,
			       avg(a."embedding") FILTER (WHERE rs.status IN ('READ_COMPLETE','READ_PARTIAL','SKIM')) AS mean
			FROM "ReadingSession" rs
			JOIN "Article" a ON a.id = rs."articleId" AND a."embedding" IS NOT NULL
			GROUP BY rs."userId"
		) sub
		WHERE u.id = sub.uid AND u."embedding" IS NULL AND sub.mean IS NOT NULL`)
	if err != nil {
		return articles, users, err
	}
	users += int(ct2.RowsAffected())
	log.Printf("[seed-top] ✔ %d users embeddés (pensées + lecture, sans bio)", users)
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
