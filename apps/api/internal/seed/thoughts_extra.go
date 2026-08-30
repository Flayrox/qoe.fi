// Banque élargie de pensées par milieu (persona.key → pensées réalistes).
//
// On enrichit énormément les pools de chaque persona pour que les créateurs
// d'un même milieu n'aient pas tous les mêmes 8 pensées. Chaque pensée est
// écrite à la main, dans la voix du milieu (concrète, souvent vécue, parfois
// humoristique), pour que deux comptes du même thème restent réalistes et
// distincts au lieu de rejouer le même texte. thoughtFor fusionne ces pools
// avec ceux de la persona (voir mergedNicheThoughts).
package seed

// extraThoughtsByKey : pensées additionnelles par clé de persona (foot,
// gaming, anime, cuisine, musique, mode, fitness, tech, photo, voyage,
// streaming, esport, jardin, famille, etudes, editorial).
var extraThoughtsByKey = map[string][]string{
	"foot": {
		"Aucun projet, aucun mercato, un seul but de la tête à la 90e : c'est pour ça qu'on y retourne.",
		"On dit mercato comme on dit miracle. En janvier comme à minuit, tout peut arriver.",
		"Mon équipe a signé un joueur que personne ne connaissait. Même lui.",
		"Le vrai supporter connaît les 11 titulaires ET la composition du banc des remplaçants de la réserve.",
		"Perdre en barrage, c'est le deuil national. En foot de quartier, on ajoute la fierté.",
		"Un lundi gris sans débats du week-end, ce n'est pas un lundi. C'est une infection à la pelouse.",
		"J'ai expliqué le hors-jeu à ma sœur trois fois. On a fini par regarder un film.",
		"La pelouse tondue à 3 millimètres, les banderoles qui claquent, les tifos qui montent : rien ne remplace le virage.",
		"Deux matches en 72 heures et on se plaint. Le samedi, on a couru 60 minutes de plus pour moins de spectacle.",
		"Un bon arbitre, c'est celui dont on ne parle pas. Là, on en parle.",
		"Le foot féminin mérite plus que des mi-temps de 45 minutes à rallonge dans les débats.",
		"J'ai offert le maillot à mon neveu. Depuis, il me corrige sur le xG.",
		"Revoir le résumé en boucle jusqu'à 2h du mat alors qu'on connaît le score : c'est la vraie addiction.",
		"Il pleut, 17 joueurs de la réserve, un car qui part trop tôt : c'est un dimanche en 5e division.",
		"Le pressing, c'est aussi courir vers le ballon pour ne pas avoir à penser où il va.",
		"On ne choisit pas son club, c'est lui qui vous choisit, et il choisit mal.",
	},
	"gaming": {
		"Le vrai trophée d'un jeu, c'est le moment où l'on se dit « je vais y retourner juste pour la map ».",
		"Ma bibliothèque de jeux terminés est une grande bibliothèque. Ma bibliothèque achetée aussi. Ce ne sont pas les mêmes.",
		"Solo queue avec du café à minuit : la plus belle et la pire des expériences en ligne.",
		"Le patch a nerf mon main. Je vais devoir apprendre un nouveau jeu, donc une vraie rupture.",
		"On cria RL, on parla glitch, on évoqua un dev sans flemme : la communauté est une science.",
		"Le tuto obligatoire que tout le monde saute, puis les options qu'on règle pendant 40 minutes.",
		"Ragequit à 3h, oubli de sauvegarder à 3h01. La session se termine dans la colère ET dans le rien.",
		"Un bon retro game coûte moins cher qu'une heure de microtransactions.",
		"Le vrai endgame du MMO, c'est de retomber sur ses amis d'il y a dix ans en plein donjon.",
		"Le platinum de mon jeu préféré, c'est 100 h de plus pour un emblème. Zéro regret.",
		"Quand le co-op a plus d'imprévus que le solo, c'est que le jeu a du cœur.",
		"Une partie de speedrun ratée vaut un duel : c'est la course contre sa propre mémoire.",
		"Le bruit d'un ventilo de PC qui s'emballe au boss final, c'est de la musique.",
		"Le skill, c'est de savoir quand fermer le jeu et aller dormir. Personne ne l'a encore.",
		"Content créé par un fan, patch anti-triche, mise à jour gratuite : le studio écoute, ça se voit.",
		"On vote avec sa manette. Le studio qui vous respecte, vous le remboursez en heures de jeu.",
	},
	"anime": {
		"On ne spoile pas. On spoile jamais. Le dénouement se mérite, comme tout bon shōnen.",
		"Le doublage français a un charme, mais la VOST fait voyager dans la prononciation d'origine.",
		"Fini l'odyssée, j'attends le chapitre comme une nouvelle, en tournant les pages deux fois par mois.",
		"Un bon anime sait rendre émouvant un simple échange de regards entre deux personnages.",
		"Revoir la saison 1 dix ans plus tard, c'est retrouver une partie de soi.",
		"Mon étagère de mangas a une organisation très précise : par pile émotionnelle.",
		"Le vrai spoiler, c'est de montrer la figurine avant l'épisode.",
		"Vivre un arc de 30 chapitres pour trois minutes d'émotion : le manga a le temps pour lui.",
		"Cosplay raté l'an dernier, cosplay grandi l'année d'après. La couture est une ascension.",
		"Le studio qui respecte l'œuvre d'origine, on le sent dans chaque frame.",
		"Un personnage secondaire volé la vedette : signe que l'écriture fait confiance à son univers.",
		"Le générique de fin laissé tourner jusqu'au bout, les yeux dans le vide : on connaît tous ça.",
		"J'ai appris le japonais en regardant des sous-titres. Aujourd'hui je dis « de rien » sans y penser.",
		"Le cosplay en public, c'est un pari. Les regards, puis les sourires : pari gagné.",
		"Un manga de huit tomes qui te suit ta vie entière, c'est rarement un hasard.",
	},
	"cuisine": {
		"Faire son pain, c'est l'école de la patience : lever, pétrir, attendre, recommencer.",
		"Le secret d'une bonne sauce, c'est de la goûter au moins quatre fois, en cachette.",
		"Un panier de légumes de saison au marché du dimanche vaut tous les abonnements.",
		"Rater une brioche, c'est apprendre l'humidité de sa propre cuisine.",
		"Le vrai luxe, c'est un plat mijoté le matin qui embaume la maison toute la journée.",
		"On jette le noir du gâteau raté, on garde le cœur : la cuisine est une leçon de résilience.",
		"Une recette de grand-mère, c'est un secret à moitié écrit, l'autre moitié en mémoire.",
		"Le food-truck du coin change de carte chaque semaine. Il a le droit de se prendre pour un chef.",
		"Zéro gaspi : les épluchures en soupe, les restes en omelette, la mie rassise en croûtons.",
		"Le cumin, c'est la couleur du soleil dans une assiette. La coriandre, c'est la discussion de famille.",
		"Quand le four sonne à 21h, la maison passe au second plan.",
		"Les épices sont achetées au poids, jamais en poudre depuis le placard de la grand-mère.",
		"Un barbecue raté le dimanche, c'est un barbecue réussi en couple : on en parle encore lundi.",
		"La pâtisserie, c'est la chimie qui a le beau rôle, avec du sucre en plus.",
		"Apprendre à faire sa propre huile, sa pâte, son levain : c'est se réapproprier le goût.",
	},
	"musique": {
		"Un concert dans une salle de 200 personnes vaut tous les stades du monde.",
		"La playlist du matin décide de la journée. En tout cas elle en met le ton.",
		"Ressortir un vinyle des années 80, c'est entendre les fêtes de ses parents.",
		"Le morceau qui accroche en fond de bar est toujours mieux que celui qu'on cherche en boucle.",
		"Soutenir un artiste de la scène locale, c'est payer un billet qui va ailleurs que dans une caverne de données.",
		"Le live d'un artiste inconnu peut bouleverser plus que le tube de l'été.",
		"Un sample réutilisé avec une nouvelle idée, c'est l'histoire de la musique en une minute.",
		"La vraie théorie, c'est qu'on écoute la même chanson jusqu'à ce qu'elle devienne la nôtre.",
		"Le volume qui monte dans le casque, c'est la distance entre le métro et le reste du monde.",
		"Un concert le dimanche soir rebranche pour la semaine.",
		"L'artiste qui parle de la foule avant le premier morceau a déjà gagné quelque chose.",
		"Le générique qui hurle, la basse qui tient la route : c'est une émotion qui n'a pas besoin de sous-titres.",
	},
	"mode": {
		"Une pièce chinée en friperie à 3 euros vaut tous les fast-fashion du monde.",
		"Le style, c'est d'abord ce qu'on assume. La tendance vient après.",
		"Second main, upcycling, réparation : la mode qui dure est une mode qui réfléchit.",
		"Un vestiaire capsule : dix pièces qui se portent les unes avec les autres, pas quarante qui se complètent sur un cintre.",
		"La couture d'une retouche maison change une silhouette plus qu'une étiquette.",
		"Les sneakers qu'on garde dix ans ont plus de caractère que celles qu'on change chaque saison.",
		"Un vide-dressing, c'est donner ses vêtements une deuxième vie et se débarrasser de sa culpabilité.",
		"Les couleurs qu'on porte révèlent souvent les saisons qu'on traverse, même sans le dire.",
		"Le bien s'achète, le bon se transmet. Une veste de père peut faire un beau manteau de fils.",
		"Un défilé, c'est une fiction. La vraie mode, c'est dans la rue, le matin, dans le métro.",
		"Le denim brut qui se patine avec le temps : le vêtement qui raconte sa propre histoire.",
		"Se réconcilier avec son corps commence parfois par une coupe bien pensée. L'étiquette n'y change rien.",
	},
	"fitness": {
		"La séance que tu redoutais hier est celle qui te définit aujourd'hui. Va faire tes reps.",
		"Courir 20 minutes vaut mieux que deux heures de motivation sur YouTube.",
		"Le vrai progress, c'est de réussir à remonter le temps de repos sans y penser.",
		"Une semaine off, c'est une recharge. Pas une trahison.",
		"La douleur de séance est une conversation. La blessure, une coupure du téléphone.",
		"Le jour où tu abandonnes la balance pour les sensations, tout change.",
		"Le cardio ingrat du mardi n'a peur de rien, même pas du lundi.",
		"Un repas réussi compte autant que la séance. La récup, c'est un sport aussi.",
		"S'entraîner seul, c'est apprendre à se battre contre sa propre excuse.",
		"Le marathon, c'est 42 km de conversation avec soi-même. On finit par se connaître.",
		"La salle me rappelle, l'extérieur me challenge, la douche me pardonne tout.",
		"Le vrai rituel du dimanche soir, c'est de préparer sa semaine, y compris ses séances.",
	},
	"tech": {
		"Un bug trouvé à minuit vaut une médaille. Un bug corrigé à minuit, une légende.",
		"Le meilleur code, c'est celui qu'on comprend dans trois ans, pas celui qu'on admire aujourd'hui.",
		"Un side project, c'est un investissement en cafés et en doutes, avec un retour incertain.",
		"Open source, c'est apprendre en lisant le code des autres, et parfois en le critiquant au-dessus d'un café.",
		"Le legacy code n'est pas un ennemi : c'est l'historique de tout ce que l'équipe a survécu.",
		"Une refactor sans test, c'est un saut en parachute sans vérifier le sac.",
		"Le déploiement du vendredi soir relève de la foi plus que de l'ingénierie.",
		"Comprendre une stack, c'est comme apprendre une langue : on commence par le vocabulaire, puis les exceptions.",
		"Un hackathon, c'est 48 heures pour découvrir que le café est une pépite logistique.",
		"Le code legacy qu'on n'ose pas toucher, c'est le cimetière des bonnes intentions.",
		"L'IA change les outils, pas la curiosité : la vraie veille, c'est de rester curieux.",
		"Un terminal bien configuré vaut une journée bien passée.",
		"Le test qui passe à contrecœur, c'est le test qui posera question dans six mois.",
		"Apprendre un nouveau langage, c'est redevenir débutant pour devenir meilleur.",
	},
	"photo": {
		"L'argentique, c'est le frisson de ne pas savoir avant d'avoir tiré. Chaque clic est un pari.",
		"La lumière du matin sur un visage endormi vaut tous les studios du monde.",
		"Un portrait réussi ne montre pas un visage, il raconte un silence.",
		"Le noir et blanc enlève la couleur, mais il ajoute la direction du regard.",
		"Tirer ses photos en chambre noire, c'est un rituel : l'odeur, la musique, le temps suspendu.",
		"Partir sans son appareil pour un jour : c'est là que l'on voit l'œil travailler.",
		"Une bonne photo de rue, c'est un hasard qui ne demande qu'à se reproduire.",
		"Le détail d'une main, d'une couture, d'un regard : c'est la vie qui se cache dans le cadre.",
		"Un tirage sur papier, c'est une photographie qui n'est plus une donnée numérique.",
		"Pressez le déclencheur au bon moment et la scène devient un souvenir, pas une preuve.",
	},
	"voyage": {
		"Un train de nuit, c'est le meilleur pays pour dormir, on y arrive chez soi d'une autre manière.",
		"Prendre un sac et un billet bon marché, c'est ouvrir une porte que l'ennui a refermée.",
		"Le carnet de voyage, c'est la boîte à souvenirs avant les souvenirs eux-mêmes.",
		"Un hôte bizarre, une langue bafouillée, un itinéraire raté : c'est un voyage réussi.",
		"Revoir un endroit dix ans plus tard, c'est découvrir qu'on n'est plus le même voyageur.",
		"Le voyageur préfère la saison creuse : les paysages sont à moitié vides à moitié secrets.",
		"Marcher dans une ville inconnue, c'est apprendre à se tromper pour mieux trouver.",
		"Le vrai luxe, c'est de savoir d'où on part et d'où on revient.",
		"Une carte froissée vaut mieux qu'une connexion. Enfin, les deux, à la limite.",
		"Le retour à la maison fait partie du voyage : il transforme même le quotidien.",
	},
	"streaming": {
		"Un live à 23h un mardi : c'est le rendez-vous, c'est la communauté qui respire.",
		"Le chat qui déraille, la donation, l'instant où tout bascule : le live est un théâtre.",
		"La VOD c'est l'archive, le live c'est l'instant. Les deux se complètent.",
		"Faire un clip, c'est une couverture de l'ange en 60 secondes.",
		"Mon setup de streaming est un compromis entre confort et câble.",
		"Un streamer heureux, c'est une vibes qui traverse l'écran. On ne peut pas la fake.",
		"Le planning hebdo, c'est un contrat avec sa communauté : on y tient.",
		"Un don qui arrive au bon moment, un raid, un Follow : le soutien prend vraiment des formes.",
		"Stream en pyjama légal, avec une caméra à moitié réglée : c'est la sincérité.",
		"Collab, c'est multiplier l'énergie et diviser la pression.",
	},
	"esport": {
		"Un draft, une win condition, un courage : l'e-sport mérite son stade.",
		"On regarde une équipe qui remonte 0-2, c'est une leçon de management.",
		"La VOD review, c'est la réunion où l'on apprend sans avoir à perdre en direct.",
		"Une org qui investit dans sa seconde équipe, c'est une org qui pense à demain.",
		"Le crowd qui hurle le nom d'un play à 1HP : là, c'est du sport, sans terrain.",
		"Scrim contre les meilleurs, c'est perdre dix fois pour apprendre la onzième.",
		"Un patch de meta fait souvent plus de victimes qu'un mauvais coach.",
		"Le ranké, c'est le miroir de nos batches : on espère et on remonte.",
		"Une finale en BO5, un player qui tremble, une équipe qui croit : l'e-sport se vit.",
	},
	"jardin": {
		"Un semis de tomates en février, c'est parier sur l'été dès l'hiver.",
		"Le compost, c'est apprendre que rien ne se perd, tout se transforme, même les épluchures.",
		"Arroser au bon moment, c'est écouter la terre pleurer.",
		"Le rosier qui résiste malgré l'erreur d'entretien : c'est une leçon de ténacité.",
		"Permaculture, c'est jardiner avec le vivant au lieu de lutter contre lui.",
		"La récolte du potager a le goût de l'effort, pas celui de la perfection.",
		"Un mercredi au jardin, c'est un rendez-vous avec les abeilles et le silence.",
		"Bouter, c'est offrir quelques tiges pour une nouvelle vie.",
		"Suivre les phases de la lune pour les semis, c'est renouer avec le cycle des choses.",
		"Le jardin n'exige rien, il attend tout. Et il le rend bien.",
	},
	"famille": {
		"Le dimanche matin, la cuisine s'organise : chacun son rituel, le café pour les plus anciens.",
		"Récupérer les enfants à l'école, c'est parfois la seule course qu'on gagne.",
		"Anniversaire surprise réussi = 30 personnes et aucune photo. La preuve.",
		"Un week-end à bricoler avec son père, c'est apprendre la patience en trois projets.",
		"Les courses, les devoirs, les matchs : une famille moderne est une logistique amoureuse.",
		"Ado dans la maison, c'est souvent un lundi sur deux compris.",
		"Le repas du dimanche soir, c'est le dernier refuge d'une semaine qui avance trop vite.",
		"Organiser un goûter d'anniversaire, c'est un business plan sans chiffre.",
		"Une voiture à six places, quatre enfants, deux parents : c'est une épopée quotidienne.",
		"On ne choisit pas sa famille, mais on peut choisir de la défendre.",
	},
	"etudes": {
		"Un partiel de rattrapage, c'est le rendez-vous avec soi-même.",
		"Réviser en colocation, c'est partager le stress et les fiches.",
		"Le budget étudiant est un jeu de survie : le loyer, les pâtes, le ciné.",
		"Un stage, c'est découvrir que le travail d'équipe s'apprend aussi au bureau.",
		"Le mémoire, c'est la première fois où l'on construit quelque chose seul et entier.",
		"Un amphis plein, une feuille vide : la rentrée est un sport de fond.",
		"Les assos étudiantes, c'est où l'on apprend à s'engager, pas seulement à réussir.",
		"Un prêt étudiant pour un diplôme : on espère que l'avenir est remboursé.",
		"La vie au campus, c'est une parenthèse où chaque journée ressemble à une opportunité.",
		"Regarder les aînés réussir, c'est imaginer ce que nous deviendrons plus tard.",
	},
	"editorial": {
		"Un lecteur qui paie pour ton travail, c'est une confiance plus exigeante qu'un algorithme.",
		"Écrire long, c'est donner du temps au lecteur, pas lui voler de l'attention.",
		"L'indépendance, c'est la capacité à écrire pour ses lecteurs, pas pour ses annonceurs.",
		"Une newsletter bien tenue devient un rendez-vous, une habitude, une fidélité.",
		"La patience est la première compétence de l'écriture. La relecture, la seconde.",
		"Un article qui prend position éclairera celui qui hésite, même s'il fâche les autres.",
		"Vie privée et débat public : les deux se ménagent mais ne se sacrifient pas.",
		"Le financement par les lecteurs réinvente le métier : on redevient l'écrit, pas le clic.",
		"Une source confirmée vaut mieux que dix ouï-dire.",
		"L'expertise se construit dans la durée, pas dans la vitesse de réaction.",
	},
}

// mergedNicheThoughts fusionne les pensées écrites de la persona avec la banque
// élargie du même milieu. L'injection de milliers de doubles devenait le
// symptôme d'une seule source : on redonne du volume sans perdre la voix.
func mergedNicheThoughts(per *persona) []string {
	pool := make([]string, 0, len(per.thoughts)+len(extraThoughtsByKey[per.key]))
	pool = append(pool, per.thoughts...)
	pool = append(pool, extraThoughtsByKey[per.key]...)
	return pool
}

// stableAnchor calcule un ancrage déterministe (hash FNV-1a) à partir de l'id
// d'un compte : chaque auteur tire ainsi sa propre fenêtre dans les pools, ce
// qui fait office de « voix par auteur ». Deux créateurs d'une même niche
// tombent rarement sur la même pensée ou le même mot de titre au même moment,
// sans casser le déterminisme global du seed.
func stableAnchor(id string) uint64 {
	const off = 1099511628211
	var h uint64 = 14695981039346656037
	for i := 0; i < len(id); i++ {
		h ^= uint64(id[i])
		h *= off
	}
	return h
}
