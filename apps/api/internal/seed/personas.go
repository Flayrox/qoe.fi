// Personas — milieux et centres d'intérêt du seed « top du top ».
//
// L'ancien seed ne produisait que des « journalistes indépendants sérieux »
// avec des noms « Prénom Nom ». Pour ressembler à un vrai réseau, on génère
// des comptes de tous les milieux (foot, gaming, anime, cuisine, musique,
// mode, fitness, tech, photo, voyage, streaming, e-sport, jardin, famille,
// études…) avec une vraie proportion de pseudonymes/nicknames, des bios et
// des pensées cohérentes avec le profil, et une photo de profil assortie au
// genre. Les comptes « éditoriaux » sérieux existent toujours, mais ils ne
// sont plus la majorité.

package seed

import (
	"fmt"
	"strings"
)

// topAgeRanges suit l'enum AgeRange du schéma (ordre = pondération).
var topAgeRanges = []string{
	"UNDER_18", "AGE_18_24", "AGE_25_34", "AGE_35_44",
	"AGE_45_54", "AGE_55_64", "AGE_65_PLUS", "PREFER_NOT_TO_SAY",
}

// persona regroupe tout ce qui définit un milieu : probabilité de genre,
// distribution d'âge, pool de pseudos, de surnoms d'affichage, de bios et de
// pensées propres au milieu.
type persona struct {
	key      string
	label    string
	tags     []string
	maleProb float64
	ageW     []float64 // pondérations alignées sur topAgeRanges
	pseudos  []string  // handles (sans @)
	nicks    []string  // noms d'affichage décontractés
	bios     []string
	thoughts []string
}

var topPersonas = []persona{
	{
		key: "foot", label: "Football", tags: []string{"foot", "ligue1", "supporter"},
		maleProb: 0.8,
		ageW:     []float64{0.04, 0.25, 0.32, 0.2, 0.1, 0.06, 0.02, 0.01},
		pseudos:  []string{"leBossDuTerrain", "flo_du_92", "tifoDeOuf", "virageSud", "penaltyKing", "neufEtDemi", "gardienDeNuit", "cramponsUse", "derbyDuSoir", "horsJeuPermanent"},
		nicks:    []string{"Flo", "Kévin", "Dédé", "Le Boss", "Bebeto", "Titi", "Nino", "Jojo"},
		bios: []string{
			"Supporter du dimanche et joueur du lundi soir. La VAR, c'est la pluie : tout le monde en parle, personne n'y peut rien.",
			"Foot de quartier, foot pro, foot des stats. Je regarde tout, je joue peu, je commente beaucoup.",
			"Abonné au virage depuis 15 ans. Ma voix ne s'en remettra pas, mon cœur non plus.",
			"Je collectionne les maillots et les mauvaises excuses pour rater la gym.",
		},
		thoughts: []string{
			"Ce soir c'est derby. Le voisin supporte l'autre camp : silence radio jusqu'au coup de sifflet final.",
			"Un 4-4-2 bien placé bat toujours un 4-3-3 en rodage. C'est mathématique.",
			"La VAR a tué la joie du but, mais elle a sauvé mon pronostic. Bilan mitigé.",
			"Le foot de quartier, c'est là que tout commence : les crampons usés, la pelouse interdite, la légende.",
			"3-0 à la pause et on a quand même réussi à se faire peur. On ne se refait pas.",
			"Un bon pressing vaut mieux qu'un mauvais mercato.",
			"Je ne pleure pas devant les films. Je pleure devant les montées en Ligue des Champions.",
			"Le gardien de mon équipe encaisse un but de 30 mètres. On va dire que c'était du vent.",
		},
	},
	{
		key: "gaming", label: "Gaming", tags: []string{"gaming", "jeuxvideo"},
		maleProb: 0.72,
		ageW:     []float64{0.1, 0.35, 0.3, 0.14, 0.07, 0.03, 0, 0.01},
		pseudos:  []string{"xX_shadow_Xx", "noScopeMax", "gamer4life", "platinumTilt", "lagFreeOuRien", "tryhardeur", "carapuce", "lootBoxLeo", "speedrunSacha", "soloQueue", "pauseCafe"},
		nicks:    []string{"Maxou", "Sacha", "Loulou", "Tof", "Riri", "Keke", "Choupi", "Pouet"},
		bios: []string{
			"Gamer depuis la PS1, ranké diamant, âgé mentalement de 12 ans.",
			"Je joue pour m'amuser, mais je tilt quand je perds. La nuance est importante.",
			"Ma bibliothèque Steam est un musée de bonnes intentions.",
			"Casual le jour, sweat de tryhard la nuit. Ne me parlez pas de la meta.",
		},
		thoughts: []string{
			"GG à l'équipe. On a perdu mais on a bien ri, c'est ça l'essentiel.",
			"Un patch, un nerf, une meta : la vie de joueur est un cycle éternel.",
			"Je disais « juste une partie » à 22h. Il est 3h du matin et je suis en promo.",
			"Le vrai endgame, c'est de ranger son bureau après une session.",
			"60 FPS en 4K, mais pas de quoi s'acheter un frigo plein. Priorités.",
			"Ragequit à 1h du mat' : je repars dans 5 minutes, promis.",
			"Le tuto du jeu me prend plus de temps que la moitié de ma vie.",
			"Un bon glitch vaut mieux qu'une mise à jour propre.",
		},
	},
	{
		key: "anime", label: "Anime & Manga", tags: []string{"anime", "manga", "cosplay"},
		maleProb: 0.55,
		ageW:     []float64{0.12, 0.38, 0.28, 0.12, 0.06, 0.02, 0, 0.02},
		pseudos:  []string{"kira_chan", "otakuDu92", "narutoFan", "senpaiSama", "chibiNova", "sakura_blossom", "mangaAddict", "onePieceLover", "waifuHunter", "studioGhibli", "cosplayYuki"},
		nicks:    []string{"Yuki", "Nova", "Kira", "Sakura", "Chibi", "Nino", "Lili", "Sacha"},
		bios: []string{
			"Otaku assumée, une étagère de mangas, deux cosplays, trois projets de tattoo.",
			"Je regarde tout, je lis tout, je spoile rien (ou presque).",
			"En couple avec ma bibliothèque de shônen. Ne jugez pas.",
			"J'apprends le japonais depuis 10 ans. Je sais toujours pas dire bonjour sans stresser.",
		},
		thoughts: []string{
			"On ne choisit pas son anime de réconfort. Il choisit son moment.",
			"Le générique de fin me parle plus que la série parfois. Oui je le revendique.",
			"Un bon arc filler vaut mieux qu'un arc rushé. Dites-le plus fort.",
			"J'ai pleuré devant un manga à la terrasse d'un café. Le serveur a fait comme si de rien n'était.",
			"Le cosplay, c'est 10% de couture et 90% de stress le jour J.",
			"Reregarder son anime préféré avec ses 12 ans de moins, c'est un voyage dans le temps.",
			"Le manga papier, c'est une odeur, un bruit de page, une vie. L'écran ne remplacera jamais ça.",
			"J'attends le prochain chapitre comme d'autres attendent leur paie.",
		},
	},
	{
		key: "cuisine", label: "Cuisine", tags: []string{"cuisine", "recettes"},
		maleProb: 0.35,
		ageW:     []float64{0.02, 0.15, 0.28, 0.25, 0.15, 0.1, 0.04, 0.01},
		pseudos:  []string{"chefMomo", "cuisineDeMamie", "papillesEnFolie", "cook_and_chill", "marmitonDuSud", "foodieLou", "casseroleRouge", "brunchDuDimanche", "patissierDuCoin"},
		nicks:    []string{"Momo", "Mamie Claudette", "Lou", "Nanou", "Zézette", "Gigi", "Chlo", "Doudou"},
		bios: []string{
			"Je cuisine ce qu'il y a dans le frigo et je transforme le désespoir en carbonara.",
			"Recettes de grand-mère, produits du marché et coups de gueule sur les plats préparés.",
			"Pâtissière du dimanche, apprentie toutes les autres semaines.",
			"Je goûte, je goûte, je goûte. La recette n'est jamais finie, c'est un art.",
		},
		thoughts: []string{
			"Recette du soir : ce qu'il y a dans le frigo + l'impro. Résultat : un plat culte de la maison.",
			"Le gras, c'est la vie. Mais le beurre, c'est la patrie.",
			"Une bonne sauce tomate mijotée 3h vaut toutes les applications de rencontre.",
			"Ma grand-mère mesurait tout « au pif ». Moi je pèse au gramme. On a les mêmes résultats, elle a moins de vaisselle.",
			"Le pain qui sort du four à 22h un dimanche, c'est le vrai luxe.",
			"J'ai raté le plat. J'ai dit « c'est une nouvelle recette ». Je mens à table.",
			"La cuisine, c'est de la chimie qu'on peut manger.",
			"Premier essai de ramen maison. Les nouilles ont pris le contrôle de la cuisine.",
		},
	},
	{
		key: "musique", label: "Musique", tags: []string{"musique", "concert"},
		maleProb: 0.5,
		ageW:     []float64{0.04, 0.3, 0.32, 0.18, 0.09, 0.04, 0.01, 0.02},
		pseudos:  []string{"soundCheck", "beatMakerDu69", "laBassiste", "headbanger", "vinyleClub", "chanteurDeDouche", "guitareSeche", "playlistDuVendredi"},
		nicks:    []string{"Pixelle", "Léa", "Guitou", "Babs", "Fifou", "Loulou", "Keke", "Zézette"},
		bios: []string{
			"Bassiste dans un groupe qui répète plus qu'il ne joue. C'est déjà ça.",
			"Je fais des playlists comme d'autres font des enfants : avec amour et sans sommeil.",
			"Vinyle, cassette, mp3, streaming : j'ai tout connu et je râle à chaque fois.",
			"Concert tous les mois, acouphènes tous les jours. Bilan positif.",
		},
		thoughts: []string{
			"Le silence entre deux morceaux en concert, c'est la meilleure partie du set.",
			"Ma playlist du vendredi soir est un document historique.",
			"On a répété 3 heures pour jouer 20 minutes devant 12 personnes. Meilleure soirée de l'année.",
			"Le vinyle, c'est du culte. Le crackle, c'est le parfum du temps.",
			"Une chanson qui me passait à la radio à 15 ans me fait encore tout arrêter.",
			"Le meilleur album de l'année est sorti en 1998.",
			"Chanter sous la douche avec une brosse à cheveux, on ne fait pas mieux.",
			"Le métronome est mon ennemi depuis 20 ans.",
		},
	},
	{
		key: "mode", label: "Mode & Streetwear", tags: []string{"mode", "streetwear"},
		maleProb: 0.3,
		ageW:     []float64{0.05, 0.35, 0.35, 0.15, 0.06, 0.02, 0, 0.02},
		pseudos:  []string{"sneakHunter", "lookDuJour", "modeDeRue", "basketsEtBaguette", "instaMode", "vintageVibe", "friperieQueen", "dressingMinimal"},
		nicks:    []string{"Chlo", "Lili", "Lou", "Yuki", "Nova", "Léa", "Pixelle", "Kira"},
		bios: []string{
			"Friperies, vintage et bonnes affaires. Mon dressing est un musée du recyclage.",
			"Je poste mes looks du jour entre deux cours et trois cafés.",
			"La mode, c'est du second degré. Les sneakers, c'est du premier.",
			"Moins mais mieux : mon placard a une philosophie.",
		},
		thoughts: []string{
			"Trouvé une veste en cuir à 15€ en friperie. Je me sens invincible.",
			"Le style, c'est savoir quoi ne pas mettre.",
			"Ma garde-robe est 100% seconde main et 100% mes coups de cœur.",
			"Les sneakers blanches le premier jour, c'est le plus beau jour de leur vie.",
			"J'ai acheté une fringue « pour les vacances ». Les vacances sont dans 6 mois. C'est un projet.",
			"La fast fashion nous coûte plus cher que ce qu'elle nous fait économiser.",
			"Un vêtement bien porté vaut mieux qu'un vêtement cher.",
			"Le look de ce matin : j'ai pris le premier truc dans le placard. Et pourtant je bosse dans la mode.",
		},
	},
	{
		key: "fitness", label: "Fitness & Sport", tags: []string{"fitness", "sport"},
		maleProb: 0.55,
		ageW:     []float64{0.03, 0.28, 0.34, 0.2, 0.1, 0.03, 0.01, 0.01},
		pseudos:  []string{"coachMomo", "salleDeMuscu", "runningGirl", "5kmDuMatin", "proteinShake", "squatQueen", "muscuDuCoin", "stepEtSueur"},
		nicks:    []string{"Momo", "Coach", "Nanou", "Fifou", "Dédé", "Loulou", "Keke", "Babs"},
		bios: []string{
			"5km avant le travail, salle le soir. La sueur est ma méditation.",
			"Je cours pour le cardio, je m'arrête pour les photos.",
			"Coach du dimanche : je motive les autres et je me gave de chips en rentrant.",
			"La salle, c'est ma deuxième maison. La première, c'est le canapé.",
		},
		thoughts: []string{
			"5km ce matin à 7h. La ville appartient à ceux qui se lèvent tôt (et à ceux qui dorment encore, soyons honnêtes).",
			"J'ai fait 3 squats et je me considère comme en forme. C'est un mode de vie.",
			"Le plus dur dans le sport, c'est de trouver ses chaussettes.",
			"La deuxième série est toujours la pire. La troisième, on est mort. La quatrième n'existe pas.",
			"J'écoute des podcasts de course à pied en mangeant des pâtes. Équilibre.",
			"Le vrai coach, c'est celui qui te dit de t'arrêter quand il faut.",
			"La salle à 19h un lundi : tout le monde a pris les mêmes bonnes résolutions, ça sent le neuf.",
			"Mon record personnel : rester 4 jours d'affilée sans me blesser.",
		},
	},
	{
		key: "tech", label: "Tech & Dev", tags: []string{"tech", "dev", "numerique"},
		maleProb: 0.75,
		ageW:     []float64{0.02, 0.25, 0.4, 0.2, 0.08, 0.03, 0.01, 0.01},
		pseudos:  []string{"devDuDimanche", "scriptKiddie", "terminalAddict", "error404", "openSourceKid", "ctoDuSoir", "bugHunter", "selfHosted", "vimOuRien", "raspberryPi"},
		nicks:    []string{"Tof", "Maxou", "Sacha", "Nino", "Riri", "Jojo", "Keke", "Guitou"},
		bios: []string{
			"Dev le jour, débuggeur la nuit. Mon terminal est mon journal intime.",
			"Je code des trucs que personne n'utilise avec un plaisir immense.",
			"Self-hosting, vie privée et open source : je suis ce qu'on appelle un cas social numérique.",
			"J'explique la tech à ma grand-mère. C'est mon vrai job.",
		},
		thoughts: []string{
			"Ça marchait tout à l'heure. J'ai rien changé. Je jure.",
			"Le café est une variable d'environnement.",
			"J'ai passé 3h à automatiser une tâche de 5 minutes. Rentabilisé dans 36 ans.",
			"Le code d'hier soir me fait honte. Le code d'il y a 3 mois me fait horreur.",
			"Un `git push` à 2h du matin, c'est une déclaration d'amour à la prod.",
			"Ma meilleure fonction : celle qui fait semblant de charger pendant que je réfléchis.",
			"La doc, c'est comme les vacances : on dit qu'on va en faire, puis plus jamais.",
			"Le cloud, c'est juste l'ordinateur de quelqu'un d'autre.",
		},
	},
	{
		key: "photo", label: "Photo & Art", tags: []string{"photo", "argentique", "art"},
		maleProb: 0.5,
		ageW:     []float64{0.02, 0.25, 0.33, 0.2, 0.12, 0.05, 0.01, 0.02},
		pseudos:  []string{"instaxAddict", "focaleFixe", "trenteCinqMm", "lightroomAddict", "shutterbug", "polaroidPapa", "argentiqueLover", "boitierNoir"},
		nicks:    []string{"Pixelle", "Léa", "Guitou", "Nanou", "Chlo", "Lili", "Babs", "Pouet"},
		bios: []string{
			"Je photographie la lumière qui traîne dans les rues et les visages qui l'attrapent.",
			"Argentique le dimanche, smartphone les autres jours. La pellicule est ma conscience.",
			"Un appareil autour du cou et des yeux partout.",
			"Je prends 400 photos pour en garder 3. C'est le métier.",
		},
		thoughts: []string{
			"J'ai développé mes photos argentiques. 36 poses, 2 ratées, 34 souvenirs. Le compte est bon.",
			"La meilleure lumière du jour est à 17h, et personne ne m'en fera démordre.",
			"Un polaroid, c'est une photo qui prend son temps. On a oublié ça.",
			"Je photographie les gens dans la rue sans qu'ils le voient. Je suis un paparazzi bienveillant.",
			"Le flou artistique, c'est quand on a raté la mise au point. Ça arrive à tout le monde.",
			"Une photo ratée aujourd'hui, un souvenir magique dans 20 ans.",
			"Le noir et blanc cache la mauvaise balance des blancs.",
			"Mon chat est mon modèle principal. Il est en burn-out.",
		},
	},
	{
		key: "voyage", label: "Voyage", tags: []string{"voyage", "sacamain"},
		maleProb: 0.45,
		ageW:     []float64{0.03, 0.32, 0.3, 0.18, 0.1, 0.04, 0.01, 0.02},
		pseudos:  []string{"globetrotter", "sacADosPerdu", "backpacker", "carnetDeRoute", "nomadeDuWeekend", "hostelHopper", "trainDeNuit", "passportStamps"},
		nicks:    []string{"Loulou", "Nova", "Sacha", "Lou", "Lili", "Tof", "Fifou", "Chlo"},
		bios: []string{
			"Un sac à dos, un carnet, et le prochain train qui part.",
			"Je voyage lentement et je raconte tout (trop) en rentrant.",
			"Collectionneur de tampons de passeport et de gares improbables.",
			"Je pars avec 8kg. Je reviens avec 12kg de souvenirs et de pierres.",
		},
		thoughts: []string{
			"Un train de nuit, une couchette, et 10h pour regarder le paysage défiler. Le luxe ultime.",
			"Le meilleur resto du voyage, c'est celui où il n'y a que des locaux.",
			"Perdu dans une ville inconnue sans réseau. Retrouvé grâce à un panneau et un inconnu. Le monde va bien.",
			"Voyager, c'est accepter de ne pas tout voir et de laisser un lieu résister.",
			"Ma valise pèse 23kg. Le max autorisé. Je pars 3 jours.",
			"Le retour fait partie du voyage : il transforme la maison.",
			"Un carnet de voyage rempli vaut tous les souvenirs numériques du monde.",
			"L'aéroport à 5h du matin, c'est le seul endroit où tout le monde est triste pareil.",
		},
	},
	{
		key: "streaming", label: "Streaming & Créateurs", tags: []string{"twitch", "youtube", "createurs"},
		maleProb: 0.6,
		ageW:     []float64{0.08, 0.4, 0.3, 0.12, 0.06, 0.02, 0, 0.02},
		pseudos:  []string{"streamerDu62", "liveAddict", "clippeur", "chatMouille", "modDuChat", "vodVulture", "subGoal", "emoteChaser"},
		nicks:    []string{"Maxou", "Keke", "Nino", "Sacha", "Loulou", "Choupi", "Titi", "Riri"},
		bios: []string{
			"Je streame le soir, je monte le jour, je dors jamais. Like et abonne-toi (je rigole, ou pas).",
			"Modérateur de 4 chats. J'ai vu des choses que vous ne verrez jamais.",
			"Créateur de contenu à 3 vues. La 4e, c'est ma mère.",
			"Je regarde plus de streams que de films. C'est un choix de vie.",
		},
		thoughts: []string{
			"130 viewers en live ce soir. C'est mon record. Je pleure un peu.",
			"Le clip a 2 millions de vues. Le créateur a toujours 3 abonnés. Le mystère du web.",
			"Un raid sur mon stream, c'est comme un colis surprise : on ne sait jamais ce qu'il y a dedans.",
			"Le chat écrit plus vite que je ne parle. Je perds. Je perds toujours.",
			"Streamer, c'est jouer à un jeu tout en parlant à des gens qui regardent quelqu'un d'autre jouer.",
			"J'ai eu un sub goal à 3h du mat'. Les gens ont la bonté.",
			"Ma caméra est allumée, mon cerveau est en veille. On dit bonjour à tout le monde.",
			"Le mod du chat est le vrai patron. Je ne fais qu'obéir.",
		},
	},
	{
		key: "esport", label: "E-sport", tags: []string{"esport", "lol", "valorant"},
		maleProb: 0.85,
		ageW:     []float64{0.08, 0.45, 0.3, 0.1, 0.04, 0.01, 0, 0.02},
		pseudos:  []string{"challengerEUW", "aceClutch", "ratiod", "jungleCarry", "headshotFred", "eloSlave", "smurfDetector", "towerDive"},
		nicks:    []string{"Fred", "Maxou", "Tof", "Keke", "Nino", "Jojo", "Riri", "Dédé"},
		bios: []string{
			"Ranked toute la nuit, la saison pro, enfin presque. Un jour. Peut-être.",
			"Je carry mes amis, je feed en solo. Le contraste me définit.",
			"Mon ELO est une lettre d'amour que personne ne veut recevoir.",
			"J'analyse les replays comme d'autres regardent des matchs de foot.",
		},
		thoughts: []string{
			"Ace clutch 1v5 en overtime. Personne ne l'a vu. Je le raconte quand même.",
			"Le smurf, c'est le mec qui te détruit en étant meilleur que toi ET en te faisant chier.",
			"On a perdu parce que le jungler n'a pas ganké. Le jungler, c'était moi. On a perdu parce que je n'ai pas ganké.",
			"La draft, c'est 50% de la victoire. Les 50 autres, c'est de la prière.",
			"Mon taux de victoire en soloQ est le reflet exact de ma santé mentale.",
			"GG EZ après une partie tendue : le summum de la maturité en ligne.",
			"Un tower dive raté à 2hp, c'est une expérience de mort imminente.",
			"Je ferme le jeu à 2h. Je le rouvre à 2h05. On ne se refait pas.",
		},
	},
	{
		key: "jardin", label: "Jardin & Bricolage", tags: []string{"jardin", "bricolage", "nature"},
		maleProb: 0.55,
		ageW:     []float64{0.01, 0.1, 0.25, 0.28, 0.2, 0.1, 0.05, 0.01},
		pseudos:  []string{"papyJardin", "potagerDeMamie", "tournevis", "bricoDuSamedi", "serreEnCiel", "tondeuseTango", "greffeurFou", "compostHero"},
		nicks:    []string{"Papy Jean", "Dédé", "Gigi", "Mamie Claudette", "Jojo", "Titi", "Nanou", "Zézette"},
		bios: []string{
			"Mon potager est plus productif que mon compte épargne.",
			"Le samedi, je bricole. Le dimanche, je répare ce que j'ai bricolé samedi.",
			"3 tomates, 2 courgettes et une fierté immense : ma récolte annuelle.",
			"Le compost, c'est ma fierté secrète. Ne le dites à personne.",
		},
		thoughts: []string{
			"Première tomate de la saison. Je vais la manger avec le respect qu'elle mérite.",
			"J'ai planté des salades. Le lapin du quartier a fait un festin. On partage, c'est la vie.",
			"Une perceuse, un dimanche, et l'étagère est de travers. C'est le charme du fait main.",
			"Le compost ne sent pas bon, mais il sent la vie. Nuance.",
			"Arroser le jardin à 7h, c'est méditer avec des manches.",
			"J'ai réparé le volet moi-même. J'ai utilisé 3 fois plus de clous que prévu. Il est solide, c'est l'essentiel.",
			"La tondeuse est partie en fumée. L'herbe, elle, repousse. Justice immanente.",
			"Mes outils sont mieux rangés que ma vie.",
		},
	},
	{
		key: "famille", label: "Famille & Quotidien", tags: []string{"famille", "quotidien", "humour"},
		maleProb: 0.35,
		ageW:     []float64{0.01, 0.05, 0.3, 0.32, 0.18, 0.09, 0.04, 0.01},
		pseudos:  []string{"mamanDebordee", "papaPoule", "kifferLaVie", "caveAFaire", "dinette", "reposDeFamille", "allomamanbobo", "souperDeFamille"},
		nicks:    []string{"Maman", "Nanou", "Doudou", "Zézette", "Gigi", "Papa", "Loulou", "Choupi"},
		bios: []string{
			"Deux enfants, un chien, un hamster et une cave à vider. La vie est belle, surtout en pyjama.",
			"Je cuisine, je conduis, je console, je range. Je suis un couteau suisse parental.",
			"Le quotidien est une aventure. Surtout le lundi matin.",
			"Famille nombreuse, patience comptée, amour illimité.",
		},
		thoughts: []string{
			"Le lundi matin, tout le monde cherche ses chaussures SAUF moi. Aujourd'hui c'est moi qui les ai cachées.",
			"Mon enfant a demandé pourquoi le ciel est bleu. J'ai dit « parce que ». La science peut attendre.",
			"Le repas de famille dure 4h et personne ne se souvient du menu. C'est ça, l'important.",
			"J'ai rangé la cave. J'ai retrouvé 3 vélos, un sapin et ma jeunesse.",
			"Faire les devoirs avec un enfant fatigué, c'est de la diplomatie de haut niveau.",
			"Le chien a mangé le devoir. L'excuse est plus vieille que lui.",
			"On a dit « un petit dîner tranquille ». Il est 23h, on est 12, et le voisin joue de la trompette. Vivre.",
			"La liste de courses est un roman d'amour avec la réalité.",
		},
	},
	{
		key: "etudes", label: "Études & Campus", tags: []string{"etudes", "campus", "jeunes"},
		maleProb: 0.45,
		ageW:     []float64{0.15, 0.7, 0.1, 0.02, 0.01, 0.01, 0, 0.01},
		pseudos:  []string{"studyGram", "prepasEnFolie", "coursderecre", "bdeAddict", "bibliothequeHumaine", "crousDeLaMort", "amphiDuFond", "pauseCafet"},
		nicks:    []string{"Chlo", "Sacha", "Nino", "Lili", "Maxou", "Lou", "Nova", "Titi"},
		bios: []string{
			"En prépa, donc pas de vie sociale, mais un carnet bien rempli.",
			"Étudiante, déléguée du BDE, et toujours en retard de 5 minutes.",
			"Je récite mes cours dans le métro. Les gens me prennent pour un fou. Ils ont raison.",
			"La bibliothèque est ma deuxième chambre. Le Crous, ma cantine.",
		},
		thoughts: []string{
			"Réviser 3 chapitres le soir de l'examen : la méthode de travail la plus répandue de France.",
			"Le café de la cafet' est indescriptible. On en parle comme d'un rite de passage.",
			"Mon groupe de projet a enfin répondu. On rend dans 12h. On est partis.",
			"La bibliothèque à 22h pendant les partiels : tout le monde est dans le même bateau, et le bateau coule doucement.",
			"Un amphithéâtre bondé à 8h, c'est le son de la défaite.",
			"Le BDE organise une soirée. Le budget est un mystère. La soirée sera légendaire.",
			"J'ai pris la place du fond pour « mieux voir ». On sait tous ce que ça veut dire.",
			"Le diplôme se gagne dans les 3 jours avant chaque examen. C'est comme ça.",
		},
	},
	{
		key: "editorial", label: "Éditorial & Indépendant", tags: []string{"medias", "ecriture", "independance"},
		maleProb: 0.5,
		ageW:     []float64{0.01, 0.15, 0.35, 0.25, 0.14, 0.07, 0.02, 0.01},
		pseudos:  []string{"plumeLibre", "carnetPublic", "veilleEdition", "reporterDeTerrain", "essayisteDuDimanche", "chroniqueUse", "lecteurProfond", "bibliothecaire"},
		nicks:    []string{"Léa", "Noé", "Camille", "Raphaël", "Inès", "Arthur", "Sarah", "Théo"},
		bios: []string{
			"Journaliste indépendant·e, je couvre les mutations du numérique et des médias.",
			"Écrivain·e et essayiste. Le temps long comme méthode, le papier comme terrain.",
			"Rédaction indépendante, financement par les lecteurs, zéro pub. Le reste est littérature.",
			"Je lis, je note, j'écris. La lecture profonde est un sport de combat.",
		},
		thoughts: []string{
			"Dans un monde saturé de plateformes, posséder son propre espace de publication n'est plus un luxe : c'est une condition de survie.",
			"L'attention n'est pas une ressource à exploiter, c'est l'essence même de notre conscience libre.",
			"Un média indépendant est un média qui peut se permettre de déplaire à ses financeurs.",
			"Le temps long est la seule stratégie qui ne puisse pas être copiée.",
			"La lecture profonde est un sport de combat à l'ère du scroll infini.",
			"Les algorithmes optimisent l'engagement ; les éditeurs cultivent la confiance. Ce ne sont pas les mêmes métriques.",
			"Le journalisme de qualité se finance par la fidélité, pas par la viralité.",
			"Écrire lentement, c'est penser loin.",
		},
	},
}

// topGeneralThoughts — pool général (vie, humour, philosophie du quotidien)
// utilisé quand le persona n'a pas de pensée ou pour les comptes sans
// intérêt dominant.
var topGeneralThoughts = []struct {
	text string
	tags []string
}{
	{"Je cours après le bus comme on court après ses rêves : en sueur et en retard.", []string{"humour", "quotidien"}},
	{"Ma liste de choses à faire ce week-end : 1) rien 2) recommencer.", []string{"humour", "quotidien"}},
	{"Le café est la seule religion dont je respecte les heures.", []string{"humour", "quotidien"}},
	{"Je n'ai pas perdu mes clés, je les ai rangées dans un endroit très sûr. C'est plus grave.", []string{"humour", "quotidien"}},
	{"Le lundi, je suis une personne différente. La personne qui regrette le dimanche.", []string{"humour", "quotidien"}},
	{"La météo ment, le GPS ment, le réveil ment. Le café, jamais.", []string{"humour", "quotidien"}},
	{"Je fais des listes pour ne rien oublier, puis j'oublie les listes.", []string{"humour", "quotidien"}},
	{"Le plus court chemin entre deux points, c'est la pause.", []string{"humour", "quotidien"}},
	{"Aujourd'hui j'ai appris quelque chose : il y a encore des gens qui lisent les conditions générales.", []string{"humour", "quotidien"}},
	{"Le dimanche soir, je planifie ma semaine comme un général. Le lundi matin, je capitule.", []string{"humour", "quotidien"}},
	{"On me dit de vivre l'instant présent. J'ai déjà prévu quoi manger dans 4h.", []string{"humour", "quotidien"}},
	{"J'ai demandé à l'IA de ranger ma vie. Elle m'a conseillé une sieste. Elle a raison.", []string{"humour", "quotidien"}},
	{"Les bonnes résolutions sont des graines plantées en janvier et arrosées jusqu'au 15.", []string{"humour", "quotidien"}},
	{"Le secret du bonheur, c'est d'avoir un bon voisin. Et un bon café.", []string{"humour", "quotidien"}},
}

// ---------------------------------------------------------------------------
// Helpers de sélection
// ---------------------------------------------------------------------------

// personaWeights construit les pondérations des personas (l'éditorial reste
// présent mais minoritaire pour que le réseau ressemble à un vrai réseau).
func personaWeights() []float64 {
	w := make([]float64, len(topPersonas))
	for i := range topPersonas {
		w[i] = 2.0
		if topPersonas[i].key == "editorial" {
			w[i] = 0.8
		}
	}
	return w
}

// randomPersona tire un milieu selon les pondérations.
func randomPersona(rng *prng) *persona {
	return &topPersonas[rng.weightedIndex(personaWeights())]
}

// themeForKey associe un milieu à un dossier de photos thématiques
// (assets/avatars/themed/<theme>/). Les milieux sans dossier — l'éditorial
// notamment — gardent les photos de profil réelles classiques (bucket genre).
func themeForKey(key string) string {
	switch key {
	case "foot", "fitness":
		return "sports" // tableau sports-pfp (foot, sport, fitness)
	case "esport", "gaming":
		return "gaming"
	case "anime", "cuisine", "musique", "mode", "tech", "photo",
		"voyage", "streaming", "jardin", "famille", "etudes":
		return key
	case "editorial":
		return "lecture" // conseils-de-lecture
	}
	return ""
}

// pickAgeRange tire une tranche d'âge selon la pondération du persona.
func pickAgeRange(rng *prng, w []float64) string {
	if len(w) != len(topAgeRanges) {
		w = []float64{0.03, 0.25, 0.3, 0.2, 0.12, 0.06, 0.02, 0.02}
	}
	return topAgeRanges[rng.weightedIndex(w)]
}

// pickGender tire un genre selon la probabilité « homme » du persona. Une
// petite part de comptes préfère ne pas le renseigner (avatar neutre).
func pickGender(rng *prng, maleProb float64) string {
	r := rng.next()
	if r < 0.03 {
		return "PREFER_NOT_TO_SAY"
	}
	if rng.next() < maleProb {
		return "MALE"
	}
	return "FEMALE"
}

// pickPseudoAccount décide si le compte porte un pseudonyme (vrai réseau)
// plutôt qu'un « Prénom Nom » classique.
func pickPseudoAccount(rng *prng, role string) bool {
	if role == "creator" {
		return rng.next() < 0.62
	}
	return rng.next() < 0.55
}

// ── Cohérence genre / pseudonyme ────────────────────────────────────────────
// Sur un vrai réseau, un compte masculin ne s'appelle pas « mamanDebordee ».
// Les pools de surnoms/pseudos sont filtrés par genre quand l'entrée est
// clairement genrée ; les entrées neutres restent disponibles pour tous.

var nickGender = map[string]string{
	"Léa": "F", "Lili": "F", "Chlo": "F", "Lou": "F", "Nanou": "F", "Zézette": "F",
	"Gigi": "F", "Babs": "F", "Kira": "F", "Sakura": "F", "Chibi": "F", "Pixelle": "F",
	"Nova": "F", "Maman": "F", "Mamie Claudette": "F", "Claudette": "F", "Momo": "F",
	"Papy Jean": "M", "Papa": "M", "Le Boss": "M", "Bebeto": "M", "Dédé": "M",
	"Fred": "M", "Guitou": "M", "Tof": "M", "Kévin": "M", "Maxou": "M", "Jojo": "M",
	"Nino": "M", "Riri": "M", "Titi": "M", "Coach": "M",
}

var pseudoGender = map[string]string{
	"mamanDebordee": "F", "cuisineDeMamie": "F", "potagerDeMamie": "F", "squatQueen": "F",
	"runningGirl": "F", "friperieQueen": "F", "laBassiste": "F", "chanteurDeDouche": "M",
	"papaPoule": "M", "leBossDuTerrain": "M", "papyJardin": "M", "coachMomo": "M",
}

// poolForGender filtre un pool en excluant les entrées du genre opposé ; si
// le pool filtré est vide, on retombe sur le pool complet (entrées neutres).
func poolForGender(pool []string, gender string, gendered map[string]string) []string {
	if gender != "MALE" && gender != "FEMALE" {
		return pool
	}
	opposite := "F"
	if gender == "FEMALE" {
		opposite = "M"
	}
	out := make([]string, 0, len(pool))
	for _, s := range pool {
		if gendered[s] != opposite {
			out = append(out, s)
		}
	}
	if len(out) == 0 {
		return pool
	}
	return out
}

// topHandleStyles — variantes de pseudos réalistes construites autour d'un
// surnom : chiffres, départements, suffixes plateforme, déco gamer…
var topHandleStyles = []string{
	"%s", "%s_du_92", "xX_%s_Xx", "%s_off", "%s.ytb", "%s_42", "le.vrai.%s",
	"just_%s", "%s_gaming", "real_%s", "%s_officiel", "%s_du_quartier",
	"%s_lover", "iam_%s", "pas_%s", "%s_93", "%s_du_web",
}

// pseudoFromNick construit un handle à partir d'un surnom + style.
func pseudoFromNick(rng *prng, nick string) string {
	base := slugify(nick)
	style := prngPick(rng, topHandleStyles)
	out := fmt.Sprintf(style, base)
	if rng.next() < 0.3 {
		out += fmt.Sprintf("%d", 10+rng.intn(9899))
	}
	return out
}

// humanizeHandle transforme un handle en nom d'affichage lisible
// (« xX_flo_du_92_Xx » → « Flo ») : on retire les décorations gamer puis on
// garde la première partie avant les séparateurs.
func humanizeHandle(handle string) string {
	for _, pre := range []string{"xX", "Xx", "XX"} {
		if strings.HasPrefix(handle, pre) {
			handle = handle[len(pre):]
			break
		}
	}
	handle = strings.TrimLeft(handle, "_.-")
	for _, sep := range []string{"_", ".", "-"} {
		if i := strings.Index(handle, sep); i > 0 {
			handle = handle[:i]
		}
	}
	handle = strings.TrimLeft(handle, "_.-")
	if handle == "" {
		return "Utilisateur"
	}
	return strings.ToUpper(handle[:1]) + handle[1:]
}

// ---------------------------------------------------------------------------
// Sélection de contenu cohérent avec le persona
// ---------------------------------------------------------------------------

// personaByTags retrouve le persona dont le premier tag correspond aux
// intérêts d'un utilisateur généré (les intérêts copient persona.tags).
func personaByTags(tags []string) *persona {
	if len(tags) == 0 {
		return nil
	}
	for i := range topPersonas {
		if len(topPersonas[i].tags) > 0 && topPersonas[i].tags[0] == tags[0] {
			return &topPersonas[i]
		}
	}
	return nil
}

// thoughtFor choisit une pensée cohérente avec le profil de l'auteur
// (70 % : pensée de son milieu ; sinon pool général éditorial).
func thoughtFor(rng *prng, u TopUser) (string, []string) {
	if per := personaByTags(u.Interests); per != nil {
		// Piscine mixte : pensées écrites de la persona + banque élargie du
		// même milieu (thoughts_extra.go). 96 % des racines restent dans la
		// niche de l'auteur — deux comptes du même milieu différent déjà
		// beaucoup plus que les 8 pensées d'origine.
		pool := mergedNicheThoughts(per)
		if len(pool) > 0 && rng.next() < 0.96 {
			// « Voix par auteur » : chaque compte est ancré sur sa propre fenêtre
			// du pool (hash stable de son id) → deux créateurs d'une même niche
			// tirent rarement la même pensée au même moment.
			k := int(stableAnchor(u.ID) % uint64(len(pool)))
			return pool[(k+rng.intn(len(pool)))%len(pool)], append([]string(nil), per.tags...)
		}
	}
	// Fallback neutre : on tire dans l'humour du quotidien (topGeneralThoughts)
	// plutôt que dans topThoughts (24 pensées « attention / temps long /
	// médias indépendants » qui saturaient tous les comptes).
	th := prngPick(rng, topGeneralThoughts)
	return th.text, th.tags
}

// topicForTags retrouve un sujet d'article aligné avec le milieu d'un
// créateur (foot → tactique, gaming → jeu vidéo…). Tous les sujets de la niche
// sont candidats, et le choix est déterministe par (auteur, index d'article) :
// deux créateurs d'une même niche n'ont pas les mêmes sujets, et un même
// créateur varie de sujet entre ses articles (« voix par auteur »).
func topicForTags(tags []string, anchor uint64) *topTopic {
	if len(tags) == 0 {
		return nil
	}
	// Matche par appartenance (et pas seulement le premier tag) : le sujet
	// cuisine est taggé "saison,cuisine", foot "foot,derby" … la clé de la
	// persona est donc trouvée où qu'elle soit dans la liste → plus d'article
	// générique. Un auteur multi-tags (foot+ligue1+supporter) retombe toujours
	// sur un sujet de sa niche.
	var matches []*topTopic
	for i := range topTopics {
		found := false
		for _, t := range topTopics[i].tags {
			for _, tag := range tags {
				if t == tag {
					found = true
					break
				}
			}
			if found {
				break
			}
		}
		if found {
			matches = append(matches, &topTopics[i])
		}
	}
	if len(matches) == 0 {
		return nil
	}
	return matches[int(anchor%uint64(len(matches)))]
}

// topicTitle construit le titre d'un article : le mot de titre n'est injecté
// que si le modèle du sujet contient bien un %s (sinon Sprintf produirait
// « %!(EXTRA …) » dans les titres).
func topicTitle(t topTopic, word string) string {
	if !strings.Contains(t.title, "%s") {
		return t.title
	}
	return fmt.Sprintf(t.title, word)
}
