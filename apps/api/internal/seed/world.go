// Package seed — Monde vivant.
//
// Couche « ville vivante » posée PAR-DESSUS RunTop (top.go) : là où RunTop
// fabrique du volume déterministe (500 users, 1500 posts…), RunWorld ajoute
// une petite société qui se connaît — les gens se follow, se répondent, se
// taquinent, se mute, se bloquent, partagent des private jokes, publient des
// articles qui répondent à d'autres articles, votent des polls, alimentent
// des tendances — et TOUT est donc loggable et rejouable (mêmes ids
// déterministes → idempotent).
//
// Contrat : RunWorld doit être appelé APRÈS RunTop, sur une base siniverse
// vierge (ou repeuplée identiquement). Il est idempotent sur ses propres
// slices (purge puis réinsertion par ids connus).

package seed

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// ---------------------------------------------------------------------------
// Cast — une quinzaine de vraies identités loggables avec des pseudos variés
// (insta/pinterest/sérieux/mèmes). Le reste du top reste du décor peuplé.
// ---------------------------------------------------------------------------

type worldCharacter struct {
	id          string
	email       string
	username    string
	name        string
	bio         string
	role        string // creator | user
	isCertified bool
	layout      string
	accent      string
	publication string // slug pour la pub perso (créateurs)
	mutedWords  []string
	gender      string
	ageRange    string
	theme       string // dossier de photos thématiques (assets/avatars/themed/)
}

func worldCast() []worldCharacter {
	return []worldCharacter{
		{
			id: topUUID(900, "wc"), email: "ambre.feuillet@qoe.dev", username: "ambre.feuillet",
			name: "Ambre Feuillet", bio: "Ancienne alertée culture, éditorialiste. Je fouille les coulisses de l'éco de l'attention.",
			role: "creator", isCertified: true, layout: "editorial", accent: "#3ecf8e",
			publication: "ambrefeuillet", mutedWords: []string{"promo", "météo"}, gender: "FEMALE", ageRange: "AGE_35_44",
		},
		{
			id: topUUID(901, "wc"), email: "noe.hertig@qoe.dev", username: "noehertig",
			name: "Noé Hertig", bio: "Écologiste de terrain. Les solutions existent, il manque l'audace.",
			role: "creator", isCertified: true, layout: "minimal", accent: "#5b8def",
			publication: "noehertig", mutedWords: []string{"rendez-vous de comptes", "politick"}, gender: "MALE", ageRange: "AGE_35_44",
		},
		{
			id: topUUID(902, "wc"), email: "clara.vigo@qoe.dev", username: "claravixo",
			name: "Clara Vigo", bio: "photos mal cadrées + enquêtes locales. insta girl devenue éditorialiste.",
			role: "creator", isCertified: false, layout: "magazine", accent: "#e4572e",
			publication: "claravigo", mutedWords: []string{"météo"}, gender: "FEMALE", ageRange: "AGE_25_34",
		},
		{
			id: topUUID(903, "wc"), email: "raphael.meriot@qoe.dev", username: "raphmeriot",
			name: "Raphaël Mériot", bio: "Essayiste. Le temps long comme méthode de publication.",
			role: "creator", isCertified: true, layout: "minimal", accent: "#8e5bde",
			publication: "raphmeriot", gender: "MALE", ageRange: "AGE_45_54",
		},
		{
			id: topUUID(904, "wc"), email: "ines.durand@qoe.dev", username: "ines.drd",
			name: "Inès Durand", bio: "Data journaliste. Je traque les algorithmes de capture.",
			role: "creator", isCertified: false, layout: "editorial", accent: "#2aa198",
			publication: "inesdrd", gender: "FEMALE", ageRange: "AGE_25_34",
		},
		{
			id: topUUID(905, "wc"), email: "lucas.benoist@qoe.dev", username: "lcs_ben",
			name: "Lucas Benoist", bio: "chroniqueur nocturne. Le @lcs_ben des 2h du mat.",
			role: "creator", isCertified: false, layout: "anecdote", accent: "#d65f76",
			publication: "lcsben", gender: "MALE", ageRange: "AGE_25_34",
		},
		{
			id: topUUID(906, "wc"), email: "mara.coulibaly@qoe.dev", username: "mara.c",
			name: "Mara Coulibaly", bio: "Podcasteuse et autrice. Je raconte la ville qui vient.",
			role: "creator", isCertified: true, layout: "minimal", accent: "#6b8e23",
			publication: "marac", gender: "FEMALE", ageRange: "AGE_35_44",
		},
		{
			id: topUUID(907, "wc"), email: "lea.perrin@qoe.dev", username: "lea.perrin",
			name: "Léa Perrin", bio: "journalisme de l'attention. jamais de clic pour le clic.",
			role: "creator", isCertified: false, layout: "editorial", accent: "#5b8def",
			publication: "leaperrin", gender: "FEMALE", ageRange: "AGE_35_44",
		},
		// Lecteurs actifs (feed personnalisé, loggables).
		{id: topUUID(910, "wc"), email: "rubie.rd@qoe.dev", username: "rubie.rd", name: "Rubie",
			bio: "lectrice passionnée, bookmarker compulsive.", role: "user", gender: "FEMALE", ageRange: "AGE_18_24"},
		{id: topUUID(911, "wc"), email: "theo.d@qoe.dev", username: "theo.d", name: "Théo D.",
			bio: "je lis beaucoup, je commente peu, je reposte trop.", role: "user", gender: "MALE", ageRange: "AGE_18_24"},
		{id: topUUID(912, "wc"), email: "zoe.view@qoe.dev", username: "zoe.view", name: "Zoé",
			bio: "recommandations > algorithmes toujours.", role: "user", gender: "FEMALE", ageRange: "AGE_18_24"},
		{id: topUUID(913, "wc"), email: "axelle.ronde@qoe.dev", username: "axelle.r", name: "Axelle R.",
			bio: "fil en vrac, signal fort.", role: "user", gender: "FEMALE", ageRange: "AGE_25_34"},
		{
			id: topUUID(914, "wc"), email: "bilal.kara@qoe.dev", username: "bilou_gg",
			name: "Bilal Kara", bio: "streamer et joueur. ranked la nuit, montage le jour, café en continu.",
			role: "creator", isCertified: false, layout: "minimal", accent: "#e4572e",
			publication: "bilougg", mutedWords: []string{"spoiler"}, gender: "MALE", ageRange: "AGE_25_34", theme: "streaming",
		},
		{
			id: topUUID(915, "wc"), email: "aicha.diallo@qoe.dev", username: "aicha.du.virage",
			name: "Aïcha Diallo", bio: "supportrice de la première heure. le foot se vit au virage, se raconte partout.",
			role: "creator", isCertified: false, layout: "editorial", accent: "#2aa198",
			publication: "aichaduvirage", mutedWords: []string{"var"}, gender: "FEMALE", ageRange: "AGE_25_34", theme: "foot",
		},
		{id: topUUID(916, "wc"), email: "hugo.l@qoe.dev", username: "hugo.l", name: "Hugo L.",
			bio: "anime, gaming et siestes. je lis les spoilers puis je regarde quand même.", role: "user", gender: "MALE", ageRange: "AGE_18_24"},
	}
}

// ---------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------

// castCreatorsIds / castReadersIdx indexent les entrées du cast par rôle.
func castRoleIdx(cast []worldCharacter, role string) []int {
	var out []int
	for i, c := range cast {
		if c.role == role {
			out = append(out, i)
		}
	}
	return out
}

func hashStr(s string) int {
	h := 0
	for _, r := range s {
		h = h*31 + int(r)
	}
	if h < 0 {
		h = -h
	}
	return h
}

// ---------------------------------------------------------------------------
// 🧠 Génération
// ---------------------------------------------------------------------------

// RunWorld insère la couche « monde vivant » après RunTop. Idempotent.
func RunWorld(ctx context.Context, pool *pgxpool.Pool) error {
	cast := worldCast()

	if err := seedWorldUsers(ctx, pool, cast); err != nil {
		return err
	}
	if err := seedWorldRelations(ctx, pool, cast); err != nil {
		return err
	}
	if err := seedWorldConversations(ctx, pool, cast); err != nil {
		return err
	}
	if err := seedWorldArticles(ctx, pool, cast); err != nil {
		return err
	}
	if err := seedWorldArticleComments(ctx, pool, cast); err != nil {
		return err
	}
	if err := seedWorldPollsAndTrends(ctx, pool, cast); err != nil {
		return err
	}
	if err := seedWorldReadingsAndNotifs(ctx, pool, cast); err != nil {
		return err
	}
	return nil
}

// seedWorldUsers upsert des comptes du cast et relia leur publication perso.
// Chaque personnage reçoit une vraie photo de profil assortie à son genre
// (catalogue de photos réelles), comme le reste des comptes générés.
func seedWorldUsers(ctx context.Context, pool *pgxpool.Pool, cast []worldCharacter) error {
	avatars := loadAvatarCatalog()
	for i, ch := range cast {
		role := ch.role
		avatar := avatars.pick(ch.gender, ch.theme)
		if _, err := pool.Exec(ctx, `
			INSERT INTO "User" (id, email, username, name, role, "isCertified", "hasCompletedOnboarding", gender, "ageRange", "logoUrl", "createdAt", "updatedAt")
			VALUES ($1,$2,$3,$4,$5,$6, true, $7, $8, $9, now() - interval '120 days', now())
			ON CONFLICT (id) DO UPDATE SET
			  email = $2, username = $3, name = $4, role = $5,
			  "isCertified" = $6, "hasCompletedOnboarding" = true, "updatedAt" = now()`,
			ch.id, ch.email, ch.username, ch.name, role, ch.isCertified, ch.gender, ch.ageRange, avatar); err != nil {
			return fmt.Errorf("world user %s: %w", ch.id, err)
		}

		if ch.role == "creator" {
			// Publication perso du créateur : id déterministe (topID). Upsert sur
			// la clé primaire pour l'idempotence.
			pubID := topID("pubw", int(i))
			if _, err := pool.Exec(ctx, `
			INSERT INTO "Publication" (id, type, name, slug, subdomain, bio, "logoUrl", "headerImageUrl", "accentColor", "layoutStyle", "createdAt", "updatedAt")
			VALUES ($1,'PERSONAL',$2,$3,$4,$5,$6,$7,$8,$9, now() - interval '120 days', now())
			ON CONFLICT (id) DO UPDATE SET
			  name = $2, slug = $3, subdomain = $4, bio = $5, "accentColor" = $6, "layoutStyle" = $7, "updatedAt" = now()`,
				pubID, ch.name, ch.username, ch.publication, ch.bio, avatar, visualURL(i+8, "editorial_landscape"), ch.accent, ch.layout); err != nil {
				return fmt.Errorf("world pub %s: %w", ch.username, err)
			}
			if _, err := pool.Exec(ctx, `
				UPDATE "User" SET "publicationId" = $2, "updatedAt" = now() WHERE id = $1`,
				ch.id, pubID); err != nil {
				return fmt.Errorf("world link user/pub %s: %w", ch.id, err)
			}
		}
	}
	return nil
}

// seedWorldRelations : follows organiques + 1 blocage + mutes + mots mus.
func seedWorldRelations(ctx context.Context, pool *pgxpool.Pool, cast []worldCharacter) error {
	creators := castRoleIdx(cast, "creator")
	readers := castRoleIdx(cast, "user")

	// 1. Suivis (bande entre créateurs + lecteurs → créateurs favoris), ids
	//    déterministes (préfixe wflw — évite la collision avec les flw de RunTop).
	if _, err := pool.Exec(ctx, `DELETE FROM "Follows" WHERE id LIKE 'wflw_%'`); err != nil {
		return fmt.Errorf("world follows purge: %w", err)
	}
	plan := [][2]int{}
	for _, a := range creators {
		for _, b := range creators {
			if a == b {
				continue
			}
			if (a*7+b*13)%10 < 4 {
				plan = append(plan, [2]int{a, b})
			}
		}
	}
	for _, r := range readers {
		for k := 0; k < 3; k++ {
			plan = append(plan, [2]int{r, creators[(r*11+k*29)%len(creators)]})
		}
	}
	seen := map[[2]int]bool{}
	seq := 0
	for _, p := range plan {
		if seen[p] {
			continue
		}
		seen[p] = true
		follower := cast[p[0]].id
		pubID := topID("pubw", int(p[1])) // publication du créateur suivi
		if _, err := pool.Exec(ctx, `
			INSERT INTO "Follows" (id, "readerId", "publicationId", "createdAt")
			VALUES ($1,$2,$3, now() - interval '60 days')
			ON CONFLICT ("readerId", "publicationId") DO NOTHING`,
			topID("wflw", int(seq)), follower, pubID); err != nil {
			return fmt.Errorf("world follow: %w", err)
		}
		seq++
	}

	// 2. Un blocage (drame léger) : Noé bloque Lucas repris à la BAND E.
	if _, err := pool.Exec(ctx, `
		INSERT INTO "BlockedUser" (id, "creatorId", "readerId", "createdAt")
		VALUES ($1,$2,$3, now() - interval '20 days') ON CONFLICT DO NOTHING`,
		topID("blk", 1), cast[1].id, cast[5].id); err != nil {
		return fmt.Errorf("world block: %w", err)
	}

	// 3. Mutes mutuels (Clara ↔ Léa).
	for _, w := range [][2]int{{2, 7}, {7, 2}} {
		if _, err := pool.Exec(ctx, `
			INSERT INTO "MutedUser" (id, "muterId", "mutedId", "createdAt")
			VALUES ($1,$2,$3, now() - interval '30 days') ON CONFLICT DO NOTHING`,
			topID("mut", int(100+w[0]*10+w[1])), cast[w[0]].id, cast[w[1]].id); err != nil {
			return fmt.Errorf("world mute: %w", err)
		}
	}

	// 4. Mots mus par user (allusions à la vibe) + NotificationPreference.
	mwdSeq := 0
	for i, ch := range cast {
		for _, wd := range ch.mutedWords {
			if _, err := pool.Exec(ctx, `
				INSERT INTO "MutedWord" (id, word, "userId", "createdAt")
				VALUES ($1,$2,$3, now()) ON CONFLICT ("userId", word) DO NOTHING`,
				topID("mwd", mwdSeq), wd, ch.id); err != nil {
				return fmt.Errorf("world muted word: %w", err)
			}
			mwdSeq++
		}
		if _, err := pool.Exec(ctx, `
			INSERT INTO "NotificationPreference" (id, "userId", "createdAt", "updatedAt")
			VALUES ($1, $2, now(), now()) ON CONFLICT ("userId") DO NOTHING`,
			topID("wnpref", i), ch.id); err != nil {
			return fmt.Errorf("world notif pref: %w", err)
		}
		if _, err := pool.Exec(ctx, `
			INSERT INTO "UserSettings" (id, "userId", "createdAt", "updatedAt")
			VALUES ($1, $2, now(), now()) ON CONFLICT ("userId") DO NOTHING`,
			topID("wsettings", i), ch.id); err != nil {
			return fmt.Errorf("world user settings: %w", err)
		}
	}
	return nil
}

// ---------------------------------------------------------------------------
// Conversations — fils de réponses + reposts + private jokes + quotes.
// ---------------------------------------------------------------------------

var worldQuotes = []string{
	"un média indépendant est un média qui peut se permettre de déplaire à ses financeurs.",
	"le silence est la condition de toute pensée originale.",
	"la lecture profonde est un sport de combat à l'ère du scroll infini.",
	"le vrai luxe, c'est de pouvoir choisir de ne pas être connecté.",
	"la résilience commence là où s'arrête la course à la croissance.",
	"rien ne vaut la lenteur délibérée d'un texte pensé, écrit, relu.",
	"repriser le contrôle de ses écrits, c'est reprendre le contrôle de sa parole.",
	"les algorithmes cultivent l'engagement, les éditeurs cultivent la confiance.",
	"la ville n'est pas un décor, c'est une conversation entre habitants.",
	"l'indépendance financière des créateurs commence par la propriété de leur audience.",
	"le derby, c'est 90 minutes de pure émotion et une semaine de mauvaise foi.",
	"ranked en solo queue, c'est le plus grand jeu de survie jamais créé.",
	"un bon plat maison vaut tous les restaurants du monde.",
	"le vrai endgame, c'est de ranger son bureau après une session.",
}

var worldPrivateJokes = []string{
	"on re-parle du café-croissant comme d'une data center cette semaine ou jamais ?",
	"le deal avec @noehertig : il ne publie pas de photo de son potager, on ne le signale pas à l'association.",
	"@raphmeriot écoute 35 min de podcast pour dire 'oui, comme je le pensais'. legend.",
	"clara poste une photo 🍓 et la légende fait 3 paragraphes. on est où là ?",
}

var worldReplyTemplates = []string{
	"exactement ce que je me disais en lisant.",
	"prends mon upvote mais je nuance la fin.",
	"c'est le genre de fil qu'on garde pour plus tard, merci.",
	"on peut aller plus loin : %s",
	"énorme. on en parle dans la prochaine reco ?",
	"haha, bande d'alliés, vous êtes prêts ?",
	"ok c'est dit, je signe.",
	"%s … sauf que moi je dirais l'inverse, et on a raison tous les deux.",
}

func seedWorldConversations(ctx context.Context, pool *pgxpool.Pool, cast []worldCharacter) error {
	if _, err := pool.Exec(ctx, `DELETE FROM "Post" WHERE id LIKE 'world_post_%'`); err != nil {
		return fmt.Errorf("world posts purge: %w", err)
	}

	rootID := func(n int) string { return fmt.Sprintf("world_post_root_%d", n) }
	replyID := func(root, n int) string { return fmt.Sprintf("world_post_r%d_%d", root, n) }

	type thread struct {
		author   int
		text     string
		tags     []string
		members  bool
		replies  [][2]int // [castIdx, quoteIdxPattern] (légende)
		likeBase int
		repost   int
	}
	threads := []thread{
		{
			author: 0, text: worldQuotes[0], tags: []string{"medias", "independance"},
			replies:  [][2]int{{1, 1}, {3, 0}, {4, 1}, {6, 6}, {2, 7}, {7, 6}},
			likeBase: 21, repost: 9,
		},
		{
			author: 3, text: worldQuotes[4], tags: []string{"ecologie", "territoire"},
			replies:  [][2]int{{1, 0}, {6, 4}, {5, 1}},
			likeBase: 13, repost: 5,
		},
		{
			author: 5, text: worldQuotes[2], tags: []string{"lecture", "attention"},
			replies:  [][2]int{{2, 5}, {4, 2}},
			likeBase: 8, repost: 2,
		},
		// private joke en MEMBERS_ONLY
		{
			author: 5, text: worldPrivateJokes[0], tags: []string{"bande", "off"}, members: true,
			replies:  [][2]int{{2, 7}, {1, 5}},
			likeBase: 4, repost: 0,
		},
		// Derby soir — le foot au virage (Aïcha, cast 13).
		{
			author: 13, text: "Ce soir c'est derby. Le voisin supporte l'autre camp, je garde le silence jusqu'au coup de sifflet final. #derby",
			tags:     []string{"foot", "derby"},
			replies:  [][2]int{{1, 10}, {6, 2}, {5, 12}},
			likeBase: 19, repost: 6,
		},
		// SoloQ à 1h du matin — le gamer (Bilal, cast 12).
		{
			author: 12, text: "SoloQ à 1h du mat', trois défaites d'affilée. Je ferme. Je rouvre. Je suis le problème. #gaming",
			tags:     []string{"gaming", "soloq"},
			replies:  [][2]int{{4, 11}, {2, 4}, {7, 13}},
			likeBase: 11, repost: 3,
		},
	}

	now := time.Now().UTC()
	for ti, th := range threads {
		vis := "public"
		cvis := "PUBLIC"
		restrict := "everyone"
		if th.members {
			vis = "followers"
			cvis = "MEMBERS_ONLY"
			restrict = "followers"
		}
		rID := rootID(ti)
		if _, err := pool.Exec(ctx, `
			INSERT INTO "Post" (id, content, "authorId", "createdAt", "updatedAt", tags, visibility, "contentVisibility", "isDraft", "replyRestriction", "likeCount", "repostCount", "replyCount")
			VALUES ($1,$2,$3,$4,$4,$5,$6,$7,false,$8,$9,$10,$11)
			ON CONFLICT (id) DO UPDATE SET content=$2, tags=$5, "updatedAt"=$4`,
			rID, th.text, cast[th.author].id, now.Add(-10*24*time.Hour),
			th.tags, vis, cvis, restrict, th.likeBase, th.repost, len(th.replies)); err != nil {
			return fmt.Errorf("world root post: %w", err)
		}

		for n, rep := range th.replies {
			who := cast[rep[0]]
			text := worldReplyTemplates[(ti*3+n)%len(worldReplyTemplates)]
			if i := strings.Index(text, "%s"); i >= 0 {
				text = fmt.Sprintf(text, worldQuotes[(ti*5+n)%len(worldQuotes)])
			}
			pID := replyID(ti, n)
			if _, err := pool.Exec(ctx, `
				INSERT INTO "Post" (id, content, "authorId", "createdAt", "updatedAt", visibility, "contentVisibility", "isDraft", "replyRestriction", "likeCount", "parentId", "rootId")
				VALUES ($1,$2,$3,$4,$4,$5,$6,false,'everyone',$7,$8,$8)
				ON CONFLICT (id) DO UPDATE SET content=$2, visibility=$5, "contentVisibility"=$6, "updatedAt"=$4`,
				pID, text, who.id, now.Add(-time.Duration((10*24-(2+n)*5))*time.Hour),
				vis, cvis, 2+n, rID); err != nil {
				return fmt.Errorf("world reply: %w", err)
			}
			// Notif REPLY qualifiée (indéterminée mais toujours présentable).
			if _, err := pool.Exec(ctx, `
				INSERT INTO "Notification" (id, "recipientId", "senderId", type, "thoughtId", "isRead", "createdAt")
				VALUES ($1,$2,$3,'REPLY',$4,false,$5) ON CONFLICT (id) DO NOTHING`,
				fmt.Sprintf("world_notif_reply_%d_%d", ti, n), cast[th.author].id, who.id, rID,
				now.Add(-time.Duration((10*24-(2+n)*5))*time.Hour)); err != nil {
				return fmt.Errorf("world reply notif: %w", err)
			}
		}
	}

	// Repost par un lecteur du thread public 0 + quote-article par Lucas.
	if _, err := pool.Exec(ctx, `
		INSERT INTO "Post" (id, content, "authorId", "createdAt", "updatedAt", visibility, "contentVisibility", "isDraft", "repostCount", "repostId")
		VALUES ($1, '—', $2, now() - interval '2 days', now() - interval '2 days', 'public', 'PUBLIC', false, 1, $3)
		ON CONFLICT (id) DO NOTHING`,
		"world_post_repost_0", cast[readerIdxOf(cast)].id, rootID(0)); err != nil {
		return fmt.Errorf("world repost: %w", err)
	}

	return nil
}

func readerIdxOf(cast []worldCharacter) int {
	for i, c := range cast {
		if c.role == "user" {
			return i
		}
	}
	return 0
}

// ---------------------------------------------------------------------------
// Articles interconnectés + co-auteurs.
// ---------------------------------------------------------------------------

type worldArticle struct {
	id, pub, author, title, slug, content string
	tags                                  []string
	premium                               bool
}

func seedWorldArticles(ctx context.Context, pool *pgxpool.Pool, cast []worldCharacter) error {
	// Quelques articles repères rendent visibles les sujets de niche dans un
	// petit seed de test, même quand le nombre d'articles demandé est faible.
	articles := []worldArticle{
		{
			id: topID("wart", 1), pub: topID("pubw", 0), author: cast[0].id,
			title: "Réponse au manifeste pour un journalisme de l'attention", slug: "reponse-manifeste-attention",
			content: "<p>Un manifeste circule. Je veux lui répondre point par point — pas pour détruire, pour préciser.</p><p>Le financement par les lecteurs n'est pas l'unique voie : il en est une précieuse, mais il faut voir les angles morts de la pureté attentionnelle.</p>",
		},
		{
			id: topID("wart", 2), pub: topID("pubw", 6), author: cast[6].id,
			title: "Comment on construit une ville qui écoute", slug: "ville-qui-ecoute",
			premium: true,
			content: "<p>La ville qui vient ne se décrète pas, elle se co-écrit. Premier chapitre : la concertation comme pratique quotidienne.</p><p>Ce passage est réservé aux abonnés premium. La suite de l'analyse est exclusive.</p>",
		},
		{
			id: topID("wart", 3), pub: topID("pubw", 2), author: cast[2].id,
			title: "Pourquoi les mangas savent raconter le monde", slug: "mangas-raconter-le-monde",
			content: "<p>Les mangas donnent une place particulière aux gestes, aux silences et aux mondes intérieurs.</p><p>Lire une série, c'est aussi partager une conversation entre générations.</p>", tags: []string{"manga", "culture"},
		},
		{
			id: topID("wart", 4), pub: topID("pubw", 5), author: cast[5].id,
			title: "Un train de nuit et quelques films", slug: "train-de-nuit-films",
			content: "<p>Voyager et regarder un film ont en commun une chose : accepter de ne pas contrôler entièrement le rythme.</p><p>Voici un carnet de route entre salles, gares et souvenirs.</p>", tags: []string{"films", "voyage", "culture"},
		},
		{
			id: topID("wart", 5), pub: topID("pubw", 7), author: cast[7].id,
			title: "La romance après le premier message", slug: "romance-apres-premier-message",
			content: "<p>Les relations commencent souvent dans l'espace fragile entre curiosité et maladresse.</p><p>Prendre soin d'une conversation est déjà une manière de prendre soin de l'autre.</p>", tags: []string{"romance", "relations"},
		},
		{
			id: topID("wart", 6), pub: topID("pubw", 12), author: cast[12].id,
			title: "Le grinding n'est pas du travail, c'est une discipline", slug: "grinding-discipline",
			content: "<p>On me demande comment je peux passer des heures sur un jeu. La vraie question, c'est comment on peut ne pas comprendre qu'une partie, c'est un projet.</p><p>Le grinding, c'est de la régularité : chaque soir, un peu. Comme l'écriture, comme le sport. La discipline n'a pas de genre.</p>", tags: []string{"gaming", "discipline"},
		},
		{
			id: topID("wart", 7), pub: topID("pubw", 13), author: cast[13].id,
			title: "Pourquoi le 4-3-3 a remplacé le 4-4-2", slug: "433-remplace-442",
			content: "<p>On a tous un souvenir du 4-4-2 de notre enfance. Puis un jour, tout le monde a basculé sur le 4-3-3. Que s'est-il passé ?</p><p>Le football moderne aime les triangles. Le 4-3-3 en fabrique partout : au milieu, sur les côtés, devant. Le 4-4-2, lui, alignait des lignes.</p>", tags: []string{"foot", "tactique"},
		},
	}
	for _, a := range articles {
		vis := "PUBLIC"
		if a.premium {
			vis = "PAID_SUBSCRIBERS"
		}
		if _, err := pool.Exec(ctx, `
			INSERT INTO "Article" (id, title, slug, content, "imageUrl", published, status, visibility, "isPremium", "readingTime", "semanticTags", "publicationId", "authorId", "createdAt", "updatedAt")
			VALUES ($1,$2,$3,$4,$5,true,'PUBLISHED',$6::"ContentVisibility",$7,6,$8,$9,$10, now() - interval '5 days', now() - interval '5 days')
			ON CONFLICT ("publicationId", slug) DO UPDATE SET title=$2, content=$4, visibility=$6::"ContentVisibility", "isPremium"=$7, "updatedAt"=now()`,
			a.id, a.title, a.slug, a.content, visualURL(len(a.slug), "editorial_landscape"), vis, a.premium, a.tags, a.pub, a.author); err != nil {
			return fmt.Errorf("world article %s: %w", a.slug, err)
		}
	}
	// Co-auteur sur la réponse éditoriale.
	if _, err := pool.Exec(ctx, `
		INSERT INTO "ArticleAttribution" (id, "articleId", "userId", role, "order", "isVisible", "consentStatus", "createdAt", "updatedAt")
		VALUES ($1, $2, $3, 'CO_AUTHOR', 1, true, 'ACCEPTED', now(), now())
		ON CONFLICT ("articleId","userId") DO NOTHING`,
		topID("wattr", 1), topID("wart", 1), cast[2].id); err != nil {
		return fmt.Errorf("world attribution: %w", err)
	}
	return nil
}

func seedWorldArticleComments(ctx context.Context, pool *pgxpool.Pool, cast []worldCharacter) error {
	comments := []struct {
		id, article, author, content string
	}{
		{"world_comment_manga_1", topID("wart", 3), cast[9].id, "Je l'ai ajouté à ma liste : merci pour les références et pour le ton accessible."},
		{"world_comment_film_1", topID("wart", 4), cast[10].id, "Le passage sur les salles de quartier m'a rappelé pourquoi je préfère parfois une petite salle vide."},
		{"world_comment_romance_1", topID("wart", 5), cast[11].id, "Très juste sur les messages maladroits. On sent que le texte laisse de la place aux lecteurs."},
		{"world_comment_manga_2", topID("wart", 3), cast[2].id, "J'ajoute une voix au débat : le dessin porte souvent ce que le dialogue ne sait pas dire."},
		{"world_comment_foot_1", topID("wart", 7), cast[12].id, "Enfin quelqu'un qui explique la bascule du 4-4-2 au 4-3-3 sans jargon. Merci pour ce texte."},
		{"world_comment_gaming_1", topID("wart", 6), cast[9].id, "Le passage sur la régularité m'a parlé. Je range mon bureau après avoir lu, promis."},
	}
	for _, c := range comments {
		if _, err := pool.Exec(ctx, `
			INSERT INTO "ArticleComment" (id, content, "articleId", "authorId", "createdAt", "updatedAt")
			VALUES ($1,$2,$3,$4,now() - interval '2 days',now() - interval '2 days')
			ON CONFLICT (id) DO UPDATE SET content=$2, "updatedAt"=now()`, c.id, c.content, c.article, c.author); err != nil {
			return fmt.Errorf("world article comment: %w", err)
		}
	}
	return nil
}

// ---------------------------------------------------------------------------
// Polls + tendances.
// ---------------------------------------------------------------------------

func seedWorldPollsAndTrends(ctx context.Context, pool *pgxpool.Pool, cast []worldCharacter) error {
	pollID := topID("wpol", 1)
	opts := []string{"Souveraineté numérique", "Écologie territoriale", "Journalisme d'attention", "Ville qui écoute"}
	if _, err := pool.Exec(ctx, `
			INSERT INTO "Poll" (id, "thoughtId", "expiresAt", "createdAt")
			VALUES ($1,'world_post_root_1', now() + interval '30 days', now() - interval '2 days')
			ON CONFLICT (id) DO UPDATE SET "expiresAt" = EXCLUDED."expiresAt"`, pollID); err != nil {
		return fmt.Errorf("world poll: %w", err)
	}
	for i, t := range opts {
		if _, err := pool.Exec(ctx, `
			INSERT INTO "PollOption" (id, "pollId", text, "order")
			VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO NOTHING`,
			topID("wpop", int(i)), pollID, t, i); err != nil {
			return fmt.Errorf("world poll opt: %w", err)
		}
	}
	for i := 0; i < len(cast)-2; i++ {
		if _, err := pool.Exec(ctx, `
			INSERT INTO "PollVote" (id, "pollId", "optionId", "userId", "createdAt")
			VALUES ($1,$2,$3,$4, now() - interval '30 hours') ON CONFLICT ("pollId","userId") DO NOTHING`,
			topID("wvote", int(i)), pollID, topID("wpop", int(i%len(opts))), cast[i].id); err != nil {
			return fmt.Errorf("world poll vote: %w", err)
		}
	}
	for _, tr := range []struct {
		tag   string
		count int
	}{
		{"#souverainete", 1240}, {"#ecologie", 890}, {"#attention", 512}, {"#villeqoe", 331}, {"#bande", 214},
		{"#ligue1", 780}, {"#gaming", 540}, {"#anime", 430}, {"#cuisine", 310}, {"#esport", 265},
	} {
		if _, err := pool.Exec(ctx, `
			INSERT INTO "Trend" (id, hashtag, count, "createdAt", "updatedAt")
			VALUES ($1,$2,$3, now() - interval '10 days', now())
			ON CONFLICT (hashtag) DO UPDATE SET count = EXCLUDED.count, "updatedAt" = now()`,
			topID("wtr", int(hashStr(tr.tag))), tr.tag, tr.count); err != nil {
			return fmt.Errorf("world trend: %w", err)
		}
	}
	return nil
}

// ---------------------------------------------------------------------------
// Lectures réalistes + likes/notifications pour les comptes du cast.
// ---------------------------------------------------------------------------

func seedWorldReadingsAndNotifs(ctx context.Context, pool *pgxpool.Pool, cast []worldCharacter) error {
	// Lectures par les lecteurs sur les articles du monde.
	artIDs := []string{topID("wart", 1), topID("wart", 2)}
	rows, err := pool.Query(ctx, `SELECT id FROM "Article" ORDER BY "createdAt" DESC LIMIT 4`)
	if err != nil {
		return fmt.Errorf("world readings: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return err
		}
		artIDs = append(artIDs, id)
	}
	if err := rows.Err(); err != nil {
		return err
	}

	statuses := []string{"BOUNCE", "SKIM", "READ_PARTIAL", "READ_COMPLETE"}
	readers := castRoleIdx(cast, "user")
	for i, art := range artIDs {
		for ri := range readers {
			if (i*7+ri)%5 == 0 {
				continue
			}
			st := statuses[(i+ri)%len(statuses)]
			scroll := 15 + (i*ri)%86
			if st == "READ_COMPLETE" {
				scroll = 92
			} else if st == "SKIM" {
				scroll = 30 + (i*ri)%40
			}
			if _, err := pool.Exec(ctx, `
				INSERT INTO "ReadingSession" (id, "articleId", "userId", source, status, "scrollDepth", "dwellSeconds", "readingTimeMinutes", hostname, "createdAt")
				VALUES ($1,$2,$3,$4,$5,$6,$7,6,'qoe.test', now() - interval '4 days')
				ON CONFLICT (id) DO NOTHING`,
				topID("wrs", int(i*100+ri)), art, cast[readers[ri]].id, "feed", st, scroll, 20+(i+ri)*37); err != nil {
				return fmt.Errorf("world reading: %w", err)
			}
		}
	}

	// Likes par la bande sur le post racine (notifs LIKE).
	creators := castRoleIdx(cast, "creator")
	for i, c := range cast {
		if i == 0 || i == 1 { // l'auteur & le co-espoir ne se like pas
			continue
		}
		if _, err := pool.Exec(ctx, `
			INSERT INTO "Like" (id, "postId", "userId", "createdAt")
			VALUES ($1,'world_post_root_0',$2, now() - interval '3 days')
			ON CONFLICT ("postId","userId") DO NOTHING`,
			topID("wlik", int(i)), c.id); err != nil {
			return fmt.Errorf("world like: %w", err)
		}
		if _, err := pool.Exec(ctx, `
			INSERT INTO "Notification" (id, "recipientId", "senderId", type, "thoughtId", "isRead", "createdAt")
			VALUES ($1,$2,$3,'LIKE','world_post_root_0',false, now() - interval '3 days')
			ON CONFLICT (id) DO NOTHING`,
			fmt.Sprintf("world_notif_like_%d", i), cast[0].id, c.id); err != nil {
			return fmt.Errorf("world like notif: %w", err)
		}
	}
	_ = creators

	// Follow notifications pour les créateurs.
	for _, ci := range castRoleIdx(cast, "creator") {
		if _, err := pool.Exec(ctx, `
			INSERT INTO "Notification" (id, "recipientId", "senderId", type, "isRead", "createdAt")
			VALUES ($1,$2,$3,'FOLLOW',false, now() - interval '2 days')
			ON CONFLICT (id) DO NOTHING`,
			fmt.Sprintf("world_notif_follow_%d", ci), cast[ci].id, cast[readerIdxOf(cast)].id); err != nil {
			return fmt.Errorf("world follow notif: %w", err)
		}
	}
	return nil
}
