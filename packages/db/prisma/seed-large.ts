// =====================================================================
// 🚀 Qoe.fi — Massive, Realistic & Production-Grade Data Seed Engine
// =====================================================================
// Génère en ~5s un univers complet et cohérent :
// - Ingestion automatique de tous les articles JSON dans `.exemple-json/`
// - 500 Utilisateurs réalistes (UUIDs Supabase, avatars, pays, pronoms)
// - 15 Médias / Rédactions (avec Publication MEDIA + MediaMember roles)
// - 80 Publications personnelles de créateurs
// - 200+ Articles complets en HTML riche (citations, listes, paywalls)
// - 1 300+ Pensées (racines, réponses L1, sous-réponses L2, reposts, quotes)
// - 450+ Commentaires sous les articles (avec fils hiérarchiques)
// - 850+ Surlignages (Highlights) avec commentaires en marge et upvotes
// - 3 600+ Follows (Lecteurs -> Publications)
// - 6 000+ Likes sur les posts
// - 550+ Signets (Bookmarks) distribués
// - 450+ Abonnés & Tiers payants (Subscribers)
// - 160+ Lettres de lecteurs aux auteurs
// =====================================================================

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import {
  ContentVisibility,
  Gender,
  AgeRange,
  PrismaClient,
  PublicationType,
  SubscriptionStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();

// ─── Utilitaires & Identifiants ───
function cuid(): string {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 10);
  const randomPart2 = Math.random().toString(36).substring(2, 10);
  return `c${timestamp}${randomPart}${randomPart2}`.slice(0, 25);
}

function uuid(): string {
  return randomUUID();
}

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomItems<T>(arr: T[], count: number): T[] {
  const shuffled = [...arr].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, Math.min(count, arr.length));
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomDate(daysAgoMin: number, daysAgoMax: number): Date {
  const now = Date.now();
  const pastDays = randomInt(daysAgoMin, daysAgoMax);
  return new Date(now - pastDays * 24 * 60 * 60 * 1000 - randomInt(0, 86400000));
}

function parsePublishDate(offsetDays?: number, publishHour?: string): Date {
  const now = new Date();
  const days = typeof offsetDays === 'number' ? offsetDays : randomInt(1, 30);
  const targetDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  if (publishHour && publishHour.includes(':')) {
    const [h, m] = publishHour.split(':').map((v) => parseInt(v, 10));
    targetDate.setHours(h || 9, m || 0, randomInt(0, 59), 0);
  } else {
    targetDate.setHours(randomInt(8, 20), randomInt(0, 59), randomInt(0, 59), 0);
  }
  return targetDate;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

async function batchInsert<T>(
  label: string,
  modelDelegate: any,
  items: T[],
  chunkSize = 150
): Promise<number> {
  if (!modelDelegate || items.length === 0) return 0;
  const start = Date.now();
  let inserted = 0;

  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    await modelDelegate.createMany({
      data: chunk,
      skipDuplicates: true,
    });
    inserted += chunk.length;
  }

  const duration = Date.now() - start;
  console.log(
    `  ├─ ✓ ${label.padEnd(30)} : ${inserted.toString().padStart(6)} records [${duration}ms]`
  );
  return inserted;
}

// ─── Chargement Dynamique & Robuste des Articles JSON ───
interface ExternalArticle {
  title: string;
  slug?: string;
  theme?: string;
  authorName?: string;
  publicationSlug?: string;
  readingTime?: number;
  isPremium?: boolean;
  publishedAtOffsetDays?: number;
  publishHour?: string;
  keyQuote?: string;
  contentHtml?: string;
}

function parseArticlesString(rawStr: string): ExternalArticle[] {
  let str = rawStr.trim();
  try {
    const parsed = JSON.parse(str);
    if (typeof parsed.response === 'string') str = parsed.response;
    else if (Array.isArray(parsed.response)) return parsed.response;
    else if (Array.isArray(parsed.articles)) return parsed.articles;
    else if (Array.isArray(parsed)) return parsed;
  } catch {}

  // Fix LLM unescaped tail: </p>} -> </p>"}
  str = str.replace(/(<\/[a-zA-Z0-9]+>)\s*\}/g, '$1"}');

  try {
    const direct = JSON.parse(str);
    if (Array.isArray(direct)) return direct;
  } catch {}

  // Extraction ciblée par regex pour tolérer les micro-erreurs de syntaxe
  const regex = /\{"title":[\s\S]*?(?:<\/[a-zA-Z0-9]+>"?)\s*\}/g;
  const matches = str.match(regex) || [];
  const results: ExternalArticle[] = [];
  for (const m of matches) {
    let fixed = m;
    if (!fixed.endsWith('"}')) {
      fixed = fixed.replace(/\s*\}$/, '"}');
    }
    try {
      results.push(JSON.parse(fixed));
    } catch {}
  }
  return results;
}

function loadExternalArticles(): ExternalArticle[] {
  const possibleDirs = [
    path.resolve(process.cwd(), '.exemple-json'),
    path.resolve(process.cwd(), '../../.exemple-json'),
    path.resolve(__dirname, '../../../.exemple-json'),
    path.resolve(__dirname, '../../../../.exemple-json'),
  ];
  const targetDir = possibleDirs.find((d) => fs.existsSync(d));
  if (!targetDir) {
    console.log('  ℹ Aucun dossier .exemple-json trouvé, utilisation des templates par défaut.');
    return [];
  }

  const files = fs.readdirSync(targetDir).filter((f) => f.endsWith('.json'));
  const articles: ExternalArticle[] = [];

  for (const file of files) {
    try {
      const fullPath = path.join(targetDir, file);
      const raw = fs.readFileSync(fullPath, 'utf-8');
      const parsedItems = parseArticlesString(raw);

      if (parsedItems.length > 0) {
        articles.push(...parsedItems);
        console.log(`  ├─ 📄 Chargé : ${file} (${parsedItems.length} articles)`);
      } else {
        console.warn(`  ⚠️ Aucun article extrait de ${file}`);
      }
    } catch (err) {
      console.warn(`  ⚠️ Erreur lecture ${file}:`, err);
    }
  }

  return articles;
}

// ─── Dictionnaires Éditoriaux ───
const FIRST_NAMES = [
  'Alexandre',
  'Camille',
  'Éléonore',
  'Gabriel',
  'Sophie',
  'Lucas',
  'Léa',
  'Julien',
  'Chloé',
  'Hugo',
  'Emma',
  'Arthur',
  'Manon',
  'Antoine',
  'Inès',
  'Théo',
  'Clara',
  'Maxime',
  'Sarah',
  'Nicolas',
  'Juliette',
  'Paul',
  'Alice',
  'Thomas',
  'Zoé',
  'Romain',
  'Louise',
  'Guillaume',
  'Mathilde',
  'Vincent',
  'Amélie',
  'Florian',
  'Lucie',
  'Adrien',
  'Margaux',
  'Simon',
  'Marie',
  'Benoît',
  'Hélène',
  'Cédric',
  'Élise',
  'Marc',
  'Diane',
  'Sébastien',
  'Aurélie',
  'David',
  'Jeanne',
  'Laurent',
  'Noémie',
  'Damien',
  'Marcus',
  'Elena',
  'Stefan',
  'Aurelia',
  'Soren',
  'Julian',
  'Freja',
  'Nikolai',
  'Astrid',
  'Mateo',
  'Chiara',
  'Kenji',
  'Yuki',
  'Leila',
  'Tariq',
  'Fatima',
  'Idris',
  'Maya',
  'Kiran',
  'Nadia',
  'Victor',
  'Victoire',
  'Gaspard',
  'Céleste',
  'Augustin',
  'Garance',
  'Émile',
  'Salomé',
  'Anatole',
  'Roxane',
];

const LAST_NAMES = [
  'Leroy',
  'Moreau',
  'Dubois',
  'Fontaine',
  'Laurent',
  'Mercier',
  'Rousseau',
  'Girard',
  'Bonnet',
  'Gautier',
  'Lemaire',
  'Perrin',
  'Robin',
  'Clément',
  'Morin',
  'Gérard',
  'Boyer',
  'Marchand',
  'Masson',
  'Dumas',
  'Vidal',
  'Duval',
  'Roche',
  'Renaud',
  'Picard',
  'Colin',
  'Barbier',
  'Arnaud',
  'Aubry',
  'Guillot',
  'Vaneck',
  'Sterling',
  'Kovacs',
  'Novak',
  'Lindqvist',
  'Castillo',
  'Moretti',
  'Takahashi',
  'Al-Mansoor',
  'Sharma',
  'Lombard',
  'Delaunay',
  'Charpentier',
  'Meunier',
  'Peltier',
  'Perrot',
  'Blanchard',
  'Guichard',
  'Benoit',
  'Carpentier',
];

const BIOS_CREATORS = [
  'Chercheur indépendant en épistémologie appliquée et éthique des systèmes computationnels.',
  'Philosophe des techniques. Écrit sur l’autonomie de la pensée face aux algorithmes.',
  'Journaliste d’investigation focalisé sur les infrastructures critiques et la souveraineté numérique.',
  'Écologiste politique, auteur d’essais sur le biorégionalisme et la décroissance conviviale.',
  'Architecte de protocoles décentralisés. Passionné de cryptographie et de résistance à la censure.',
  'Critique d’art et essayiste. Explore la résonance du sensible à l’ère de l’IA.',
  'Typographe et designer d’interfaces de lecture lente. Obsédé par la lisibilité et l’attention.',
  'Économiste hétérodoxe, s’intéresse aux monnaies libres, à la dette écologique et aux biens communs.',
  'Docteur en sciences cognitives. Analyse les effets de l’infobésité sur la démocratie.',
  'Poète et traducteur. Tisse des ponts entre herméneutique classique et cyberespace souverain.',
  'Sociologue du numérique. Enquête sur les communautés pair-à-pair et les nouvelles guildes.',
  'Anthropologue des marges, documente les laboratoires vivants et les collectifs autonomes.',
  'Développeur cypherpunk & écrivain. Le code libre comme condition nécessaire de la liberté.',
  'Spécialiste de géopolitique eurasienne et des luttes pour les détroits et câbles sous-marins.',
];

const BIOS_MEDIAS = [
  {
    name: 'La Vigie Épistémique',
    slug: 'la-vigie-epistemique',
    bio: 'Revue critique des sciences, des méthodes et des biais cognitifs contemporains.',
    color: '#1e293b',
    categories: [
      'Méthodologie Scientifique',
      'Biais & Rationalité',
      'Philosophie de l’Esprit',
      'Histoire des Idées',
    ],
  },
  {
    name: 'Polis & Praxis',
    slug: 'polis-praxis',
    bio: 'Théorie politique, souveraineté étatique et analyse géopolitique des réseaux.',
    color: '#0f172a',
    categories: [
      'Souveraineté Numérique',
      'Géopolitique de l’Énergie',
      'Démocratie Délibérative',
      'Institutions',
    ],
  },
  {
    name: 'Algorithmes & Cité',
    slug: 'algorithmes-et-cite',
    bio: 'Penser l’impact des modèles génératifs et de l’automatisation sur le contrat social.',
    color: '#312e81',
    categories: [
      'Éthique de l’IA',
      'Gouvernance Algorithmique',
      'Agents Autonomes',
      'Alignement & Société',
    ],
  },
  {
    name: 'Anthropocène & Terroirs',
    slug: 'anthropocene-terroirs',
    bio: 'Écologie profonde, résilience territoriale et réinvention de l’habitat.',
    color: '#064e3b',
    categories: [
      'Biorégionalisme',
      'Agroécologie Radicale',
      'Sobriété Énergétique',
      'Écologie Politique',
    ],
  },
  {
    name: 'The Sovereign Web',
    slug: 'sovereign-web',
    bio: 'Architectures pair-à-pair, cryptographie appliquée et émancipation informationnelle.',
    color: '#18181b',
    categories: [
      'Protocoles Décentralisés',
      'Chiffrement P2P',
      'Identité Auto-Souveraine',
      'Libre Accès',
    ],
  },
  {
    name: 'Kairós Review',
    slug: 'kairos-review',
    bio: 'Essais littéraires, critique d’art et poétique de l’instant présent.',
    color: '#701a75',
    categories: [
      'Essais Littéraires',
      'Poésie Contemporaine',
      'Esthétique du Temps',
      'Critique Textuelle',
    ],
  },
  {
    name: 'L’Atelier Critique',
    slug: 'atelier-critique',
    bio: 'Design spéculatif, typographie artisanale et ergonomie des espaces de lecture.',
    color: '#831843',
    categories: [
      'Typographie & Mise en Page',
      'Design Spéculatif',
      'Ergonomie Cognitive',
      'Architecture',
    ],
  },
  {
    name: 'Chroma Journal',
    slug: 'chroma-journal',
    bio: 'Arts visuels, cinéma d’auteur, photographie documentaire et esthétique.',
    color: '#4c0519',
    categories: [
      'Cinéma d’Auteur',
      'Photographie Documentaire',
      'Histoire de la Peinture',
      'Art Numérique',
    ],
  },
  {
    name: 'Terra Incognita',
    slug: 'terra-incognita',
    bio: 'Carnets d’expédition, géographie sensible et anthropologie des marges.',
    color: '#78350f',
    categories: [
      'Carnets de Voyage',
      'Anthropologie Visuelle',
      'Marges Géographiques',
      'Ethnographie',
    ],
  },
  {
    name: 'Cybernetics & Society',
    slug: 'cybernetics-society',
    bio: 'Systèmes complexes, rétroactions sociales et dynamiques d’auto-organisation.',
    color: '#1e1b4b',
    categories: [
      'Théorie des Systèmes',
      'Rétroactions Sociales',
      'Dynamiques de Réseau',
      'Complexité',
    ],
  },
  {
    name: 'Revue d’Économie Hétérodoxe',
    slug: 'economie-heterodoxe',
    bio: 'Dépasser le consensus néoclassique : monnaie, travail et valeur réelle.',
    color: '#14532d',
    categories: [
      'Théorie Monétaire',
      'Économie Écologique',
      'Dette & Capital',
      'Histoire Économique',
    ],
  },
  {
    name: 'L’Observatoire du Futur',
    slug: 'observatoire-futur',
    bio: 'Prospective civilisationnelle, singularité technologique et horizons 2050-2100.',
    color: '#0e7490',
    categories: [
      'Prospective Technologique',
      'Risques Existentiels',
      'Exploration Spatiale',
      'Futurs',
    ],
  },
  {
    name: 'Le Grand Continent & Marges',
    slug: 'grand-continent-marges',
    bio: 'Analyses stratégiques, frontières contestées et souverainetés eurasiennes.',
    color: '#1e3a8a',
    categories: [
      'Géopolitique Eurasienne',
      'Détroits Stratégiques',
      'Guerre Hybride',
      'Diplomatie',
    ],
  },
  {
    name: 'Diogène Moderne',
    slug: 'diogene-moderne',
    bio: 'Philosophie cynique, stoïcienne et minimale appliquée au tumulte contemporain.',
    color: '#365314',
    categories: [
      'Stoïcisme Quotidien',
      'Ascèse Numérique',
      'Éthique du Dénuement',
      'Sagesse Antique',
    ],
  },
  {
    name: 'Éthique & Code',
    slug: 'ethique-et-code',
    bio: 'Le logiciel libre comme projet politique, droit du cyberespace et communs.',
    color: '#581c87',
    categories: [
      'Licences Libres',
      'Communs Numériques',
      'Gouvernance Décentralisée',
      'Crypto-Droit',
    ],
  },
  {
    name: 'La Voix du Peuple',
    slug: 'la-voix-du-peuple',
    bio: 'Tribune citoyenne, coups de gueule du quotidien et bon sens populaire.',
    color: '#b91c1c',
    categories: ['Coups de Gueule', 'Vie Quotidienne', 'Consommation', 'Travail'],
  },
  {
    name: 'La Table du Dimanche',
    slug: 'la-table-du-dimanche',
    bio: 'Cuisine de terroir, recettes de famille et convivialité retrouvée.',
    color: '#c2410c',
    categories: ['Cuisine de Terroir', 'Recettes Familiales', 'Marché & Produits', 'Convivialité'],
  },
  {
    name: 'Chemins Intérieurs',
    slug: 'chemins-interieurs',
    bio: 'Spiritualité incarnée, quête de sens, méditation et dialogue des fois.',
    color: '#4338ca',
    categories: ['Spiritualité du Quotidien', 'Théologie & Doute', 'Pardon & Paix', 'Silence'],
  },
  {
    name: 'Débats & Société',
    slug: 'debats-et-societe',
    bio: 'Citoyenneté locale, engagement associatif et démocratie participative.',
    color: '#047857',
    categories: ['Vie Locale & Mairies', 'Bénévolat & Sport', 'Services Publics', 'Éducation'],
  },
  {
    name: 'Les Fondements du Vivant',
    slug: 'les-fondements-du-vivant',
    bio: 'Revue de biologie théorique, épigénétique et écologie de la santé.',
    color: '#059669',
    categories: ['Épigénétique', 'Santé Autonome', 'Écologie Corporelle', 'Biologie'],
  },
  {
    name: 'La Revue des Formes',
    slug: 'la-revue-des-formes',
    bio: 'Esthétique typographique, archéologie des médias et design du temps long.',
    color: '#6b21a8',
    categories: ['Typographie & Formes', 'Histoire des Médias', 'Design de Lecture', 'Monochromie'],
  },
  {
    name: 'Agora Hétérodoxe',
    slug: 'agora-heterodoxe',
    bio: 'Économie des communs, écoféminisme et sociologie critique du travail.',
    color: '#9d174d',
    categories: ['Communs & Ostrom', 'Écoféminisme', 'Sociologie du Travail', 'Démographie'],
  },
  {
    name: 'Cahiers de la Résonance',
    slug: 'cahiers-de-la-resonance',
    bio: 'Philosophie du temps vécu, neurosciences et phénoménologie de la durée.',
    color: '#1e40af',
    categories: ['Temps & Durée', 'Phénoménologie', 'Neurosciences', 'Philosophie'],
  },
];

const ARTICLE_FALLBACK_TEMPLATES = [
  {
    title: "La souveraineté de l'attention à l'ère des flux algorithmiques",
    quote:
      "L'attention n'est pas une ressource marchande : elle est la condition première de notre souveraineté existentielle.",
    tags: ['épistémologie', 'souveraineté', 'attention', 'philosophie'],
    points: [
      "L'économie de la capture contre le temps long",
      "L'impératif de l'ascèse informationnelle",
      'Reconstruire des sanctuaires de délibération',
    ],
  },
  {
    title: 'Le paradoxe du doute méthodique dans la post-vérité',
    quote:
      "Le doute hyperbolique devient un poison lorsqu'il cesse d'être une méthode pour muter en nihilisme épistémique.",
    tags: ['esprit-critique', 'méthode', 'rationalité'],
    points: [
      "La fabrique de l'incertitude manufacturée",
      "Quand le scepticisme sert l'inertie",
      'Pour une hygiène des sources primaires',
    ],
  },
  {
    title: "L'illusion de la synthèse : quand l'IA aplatit la pensée divergente",
    quote:
      "L'intelligence n'est pas la régression vers la moyenne probabiliste, mais la rupture singulière avec l'attendu.",
    tags: ['ia', 'modèles', 'créativité', 'pensée'],
    points: [
      'La tyrannie du token le plus probable',
      "L'atrophie du style personnel",
      "Préserver l'hétérogénéité des corpus dissidents",
    ],
  },
];

const THOUGHT_TEMPLATES = [
  "La liberté d'expression sans souveraineté sur son canal de distribution n'est qu'un droit de parole dans une cour de récréation privée.",
  'Lire un texte exigeant de 20 pages sans toucher à son téléphone est devenu un acte de résistance intellectuelle majeur.',
  "Nous ne manquons pas d'informations : nous sommes saturés de signaux faibles artificiellement amplifiés pour saturer notre bande passante.",
  "L'algorithme ne cherche pas à vous informer : il cherche à prédire votre prochaine seconde d'inattention pour la monétiser.",
  "La véritable indépendance d'un média ne se mesure pas à ses statuts juridiques, mais à l'absence totale de traqueurs publicitaires dans son code source.",
  "Si votre identité numérique peut être révoquée d'un simple clic par une plateforme privée, vous n'êtes pas un citoyen du web : vous êtes un locataire précaire.",
  "L'écriture longue oblige à ordonner ses contradictions. Le flux instantané les exacerbe pour maximiser les réactions épidermiques.",
  "La frugalité numérique n'est pas un retour en arrière : c'est l'art d'utiliser des outils précis sans devenir l'instrument de leur modèle d'affaires.",
  "Penser contre soi-même est le seul vaccin efficace contre la polarisation des bulles d'opinion algorithmiques.",
  "L'open source est bien plus qu'une méthode de développement : c'est un projet de civilisation fondé sur le partage inconditionnel du savoir.",
  'Un bon livre ne vous donne pas des réponses toutes faites : il élargit le périmètre de vos questions légitimes.',
  'Chaque fois que vous annotez un texte en marge, vous conversez à travers le temps avec son auteur et ses futurs lecteurs.',
  'Le consensus immédiat est suspect. Les idées les plus fécondes commencent presque toujours par sembler déplacées ou paradoxales.',
  "La décentralisation technique sans culture politique partagée n'aboutit qu'à recréer les mêmes féodalités sous d'autres protocoles.",
  "Le plus grand luxe de notre époque n'est pas l'accès illimité à la connaissance, mais la préservation d'espaces vierges de toute sollicitation.",
];

const THOUGHT_REPLY_TEMPLATES = [
  "Tout à fait d'accord avec cette prémisse. J'ajouterais que cela nécessite aussi une refonte complète de nos habitudes de lecture quotidienne.",
  "C'est un point crucial, mais ne sous-estimez-vous pas la capacité d'adaptation des structures institutionnelles existantes ?",
  "Exactement ce que démontrait Ivan Illich dans 'La Convivialité' : l'outil passe un seuil où il asservit l'artisan.",
  'Cette formulation résume parfaitement le problème. La souveraineté commence par la maîtrise de ses propres clés cryptographiques.',
  "Nuance importante toutefois : la simplicité apparente des plateformes centralisées répond à un réel besoin d'accessibilité grand public.",
  "Je vous rejoins sur le diagnostic. Quelle serait selon vous la première étape pragmatique pour un collectif qui veut s'émanciper ?",
  "Brillant condensé. Cela rejoint l'article publié hier sur l'atrophie de l'attention profonde.",
  "C'est précisément l'angle mort de la plupart des débats actuels sur l'éthique de l'IA : on traite les symptômes, jamais l'infrastructure.",
];

const ARTICLE_COMMENT_TEMPLATES = [
  "Analyse d'une grande lucidité. La deuxième partie met le doigt sur le véritable point de bascule démocratique.",
  "J'ai particulièrement apprécié la distinction opérée entre décentralisation technique et souveraineté politique.",
  'Une lecture salutaire. Pensez-vous consacrer un prochain essai aux modèles de financement coopératifs ?',
  'Merci pour cette rigueur conceptuelle. Cela tranche nettement avec les commentaires superficiels habituels.',
  'Très éclairant. À mettre en lien direct avec les écrits de Jacques Ellul sur le système technicien.',
];

function buildArticleHtml(title: string, quote: string, points: string[]): string {
  return `
<p class="lead">Dans un contexte où les canaux d'attention sont saturés par l'immédiateté, la question de <strong>${title.toLowerCase()}</strong> ne relève plus du simple débat technique, mais d'une véritable urgence épistémologique. Penser cette dynamique exige de rompre avec les évidences commodes et de remonter aux racines structurelles du phénomène.</p>

<h2>1. Anatomie de la rupture contemporaine</h2>
<p>Il apparaît clairement que les forces motrices qui façonnent notre rapport à l'information ne sont pas neutres. Elles incarnent des choix politiques et architecturaux implicites qui orientent nos représentations collectives et contraignent notre capacité de jugement critique.</p>

<blockquote>
  <p>« ${quote} »</p>
</blockquote>

<p>L'observation attentive des pratiques révèle une tension constante entre l'exigence d'autonomie et les dispositifs d'incitation algorithmique. Pour éclairer cette friction, trois dimensions fondamentales méritent d'être isolées :</p>
<ul>
  <li><strong>${points[0]}</strong> : une mutation profonde des repères d'évaluation de la vérité.</li>
  <li><strong>${points[1]}</strong> : la réorganisation des espaces de sociabilité autour de métriques d'engagement.</li>
  <li><strong>${points[2]}</strong> : la nécessité de forger de nouvelles vertus épistémiques individuelles et collectives.</li>
</ul>

<!--paywall-->

<h2>2. Les chemins de la souveraineté et de l'émancipation</h2>
<p>Face à ces constats, la posture de simple spectateur désabusé s'avère insuffisante. L'émancipation passe par la reconquête outillée de nos espaces d'expression. Cela suppose de concevoir des architectures ouvertes, des protocoles décentralisés et des sanctuaires de délibération libérés du dictat de la rentabilité publicitaire.</p>
<p>En définitive, la pensée vivante ne se laisse pas réduire à une somme de données quantifiables. Elle demeure cette étincelle irréductible qui naît de la friction féconde entre esprits libres, attentifs et résolus à habiter le monde avec lucidité.</p>

<h2>Conclusion : vers une éthique de l'attention partagée</h2>
<p>Le défi de notre siècle n'est pas d'accumuler davantage de signaux, mais d'élever la qualité de notre présence au texte et au monde. C'est précisément à cette tâche que doit s'atteler toute publication qui refuse la servitude volontaire des esprits.</p>
`.trim();
}

// =====================================================================
// 🎯 MAIN SEED FUNCTION
// =====================================================================
async function main() {
  console.log('\n==================================================================');
  console.log('  🌱 QOE.FI — AMORÇAGE DU JEU DE DONNÉES MASSIF & RÉALISTE');
  console.log('==================================================================\n');

  const startAll = Date.now();

  // -------------------------------------------------------------------
  // 0. CHARGEMENT DES ARTICLES JSON EXTERNES
  // -------------------------------------------------------------------
  console.log('📂 [0/13] Analyse du dossier des articles générés (.exemple-json)...');
  const externalArticles = loadExternalArticles();
  console.log(
    `  ✓ ${externalArticles.length} articles riches découverts dans les fichiers JSON.\n`
  );

  // -------------------------------------------------------------------
  // 1. NETTOYAGE PRÉALABLE SÉCURISÉ
  // -------------------------------------------------------------------
  console.log('🧹 [1/13] Nettoyage préalable des tables locales...');
  try {
    await prisma.annotationUpvote.deleteMany({}).catch(() => {});
    await prisma.annotationComment.deleteMany({}).catch(() => {});
    await prisma.highlight.deleteMany({}).catch(() => {});
    await prisma.articleComment.deleteMany({}).catch(() => {});
    await prisma.letter.deleteMany({}).catch(() => {});
    await prisma.bookmark.deleteMany({}).catch(() => {});
    await prisma.like.deleteMany({}).catch(() => {});
    await prisma.subscriber.deleteMany({}).catch(() => {});
    await prisma.follows.deleteMany({}).catch(() => {});
    await prisma.articleAttribution.deleteMany({}).catch(() => {});
    await prisma.thought.deleteMany({}).catch(() => {});
    await prisma.article.deleteMany({}).catch(() => {});
    await prisma.category.deleteMany({}).catch(() => {});
    await prisma.tier.deleteMany({}).catch(() => {});
    await prisma.mediaAuditLog.deleteMany({}).catch(() => {});
    await prisma.mediaMember.deleteMany({}).catch(() => {});
    await prisma.media.deleteMany({}).catch(() => {});
    await prisma.user.updateMany({ data: { publicationId: null } }).catch(() => {});
    await prisma.publication.deleteMany({}).catch(() => {});
    await prisma.user.deleteMany({}).catch(() => {});
    console.log('  ✓ Base de données réinitialisée.\n');
  } catch (err) {
    console.warn('  ⚠️ Note lors du nettoyage préalable.');
  }

  // -------------------------------------------------------------------
  // 2. 500 UTILISATEURS (UUID v4) + Auteurs spécifiques des JSON
  // -------------------------------------------------------------------
  console.log('👥 [2/13] Création de 500 utilisateurs (UUIDs v4)...');
  const usedUsernames = new Set<string>();
  const usersToInsert: any[] = [];
  const authorNameToUserMap = new Map<string, any>();

  const genders: Gender[] = [
    Gender.FEMALE,
    Gender.MALE,
    Gender.NON_BINARY,
    Gender.OTHER,
    Gender.PREFER_NOT_TO_SAY,
  ];
  const ageRanges: AgeRange[] = [
    AgeRange.AGE_18_24,
    AgeRange.AGE_25_34,
    AgeRange.AGE_35_44,
    AgeRange.AGE_45_54,
    AgeRange.AGE_55_64,
  ];
  const countries = ['FR', 'BE', 'CH', 'CA', 'DE', 'GB', 'ES', 'IT', 'US'];
  const pronounsList = ['il/lui', 'elle/la', 'iel', 'they/them', null];

  // 1. Ajouter d'abord les auteurs identifiés dans les JSON
  const externalAuthorNames = Array.from(
    new Set(externalArticles.map((a) => a.authorName).filter(Boolean))
  ) as string[];

  for (const authorName of externalAuthorNames) {
    const id = uuid();
    const handle = slugify(authorName);
    usedUsernames.add(handle);

    const userObj = {
      id,
      email: `${handle}@qoe.fi`,
      username: handle,
      name: authorName,
      role: 'creator',
      isCertified: true,
      logoUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=${handle}`,
      gender: Gender.PREFER_NOT_TO_SAY,
      ageRange: AgeRange.AGE_35_44,
      countryCode: 'FR',
      languageCode: 'fr',
      pronouns: null,
      hasCompletedOnboarding: true,
      createdAt: randomDate(150, 365),
      updatedAt: new Date(),
    };
    usersToInsert.push(userObj);
    authorNameToUserMap.set(authorName, userObj);
  }

  // 2. Compléter jusqu'à 500 utilisateurs
  while (usersToInsert.length < 500) {
    const id = uuid();
    const fn = randomItem(FIRST_NAMES);
    const ln = randomItem(LAST_NAMES);
    const fullName = `${fn} ${ln}`;

    const baseHandle = slugify(`${fn}-${ln}`);
    let handle = baseHandle;
    let counter = 1;
    while (usedUsernames.has(handle)) {
      handle = `${baseHandle}-${counter++}`;
    }
    usedUsernames.add(handle);

    const i = usersToInsert.length;
    let role = 'user';
    if (i < 80) role = 'creator';
    else if (i < 95) role = 'superadmin';

    const logoUrl =
      i % 2 === 0
        ? `https://images.unsplash.com/photo-${1500000000000 + ((i * 1234567) % 90000000)}?auto=format&fit=crop&w=256&h=256&q=80`
        : `https://api.dicebear.com/7.x/bottts/svg?seed=${handle}`;

    usersToInsert.push({
      id,
      email: `${handle}@qoe.fi`,
      username: handle,
      name: fullName,
      role,
      isCertified: i < 30,
      logoUrl,
      gender: randomItem(genders),
      ageRange: randomItem(ageRanges),
      countryCode: randomItem(countries),
      languageCode: 'fr',
      pronouns: randomItem(pronounsList),
      hasCompletedOnboarding: true,
      createdAt: randomDate(120, 365),
      updatedAt: new Date(),
    });
  }

  await batchInsert('Users', prisma.user, usersToInsert);

  const allUsers = usersToInsert;
  const creators = allUsers.filter((u) => u.role === 'creator');
  const readers = allUsers.filter((u) => u.role === 'user' || u.role === 'superadmin');

  // -------------------------------------------------------------------
  // 3. PUBLICATIONS (MÉDIAS + PERSONNELLES)
  // -------------------------------------------------------------------
  console.log('\n📰 [3/13] Création des Publications (Médias + Personnelles)...');
  const pubsToInsert: any[] = [];
  const mediaConfigs: { pubId: string; meta: (typeof BIOS_MEDIAS)[0] }[] = [];
  const userPubConfigs: { userId: string; pubId: string }[] = [];
  const slugToPubMap = new Map<string, string>();

  // 23 Médias
  BIOS_MEDIAS.forEach((m) => {
    const pubId = cuid();
    pubsToInsert.push({
      id: pubId,
      type: PublicationType.MEDIA,
      name: m.name,
      slug: m.slug,
      bio: m.bio,
      logoUrl: `https://api.dicebear.com/7.x/shapes/svg?seed=${m.slug}&backgroundColor=0f172a`,
      isCertified: true,
      subdomain: m.slug,
      accentColor: m.color,
      themeMode: 'system',
      layoutStyle: 'minimal',
      createdAt: randomDate(180, 300),
      updatedAt: new Date(),
    });
    mediaConfigs.push({ pubId, meta: m });
    slugToPubMap.set(m.slug, pubId);
  });

  // Publications personnelles des créateurs
  creators.forEach((c, idx) => {
    const pubId = cuid();
    const bioText = BIOS_CREATORS[idx % BIOS_CREATORS.length];
    const pSlug = `carnets-${c.username}`;
    pubsToInsert.push({
      id: pubId,
      type: PublicationType.PERSONAL,
      name: `Les Carnets de ${c.name.split(' ')[0]}`,
      slug: pSlug,
      bio: bioText,
      logoUrl: c.logoUrl,
      isCertified: idx < 15,
      subdomain: c.username,
      accentColor: '#1e293b',
      themeMode: 'system',
      layoutStyle: 'minimal',
      createdAt: c.createdAt,
      updatedAt: new Date(),
    });
    userPubConfigs.push({ userId: c.id, pubId });
    slugToPubMap.set(pSlug, pubId);
    slugToPubMap.set(c.username, pubId);
  });

  await batchInsert('Publications', prisma.publication, pubsToInsert);

  // Mise à jour de User.publicationId
  for (const item of userPubConfigs) {
    await prisma.user.update({
      where: { id: item.userId },
      data: { publicationId: item.pubId },
    });
  }

  // -------------------------------------------------------------------
  // 4. MÉDIAS & ÉQUIPES DE RÉDACTION (Media, MediaMember, MediaAuditLog)
  // -------------------------------------------------------------------
  console.log('\n🏢 [4/13] Structuration des Rédactions & Équipes Média...');
  const mediasToInsert: any[] = [];
  const mediaMembersToInsert: any[] = [];
  const mediaLogsToInsert: any[] = [];
  const createdMedias: { id: string; pubId: string; name: string; categories: string[] }[] = [];

  mediaConfigs.forEach(({ pubId, meta }, mIdx) => {
    const mediaId = cuid();
    mediasToInsert.push({
      id: mediaId,
      publicationId: pubId,
      createdAt: randomDate(180, 300),
      updatedAt: new Date(),
    });
    createdMedias.push({ id: mediaId, pubId, name: meta.name, categories: meta.categories });

    const owner = creators[mIdx % creators.length];
    const editor = creators[(mIdx + 15) % creators.length];
    const writer1 = creators[(mIdx + 30) % creators.length];
    const writer2 = creators[(mIdx + 45) % creators.length];
    const viewer = readers[mIdx % readers.length];

    mediaMembersToInsert.push(
      {
        id: cuid(),
        mediaId,
        userId: owner.id,
        role: 'owner',
        permissions: ['manage_members', 'publish_any', 'edit_any'],
        status: 'active',
        createdAt: randomDate(150, 250),
        updatedAt: new Date(),
      },
      {
        id: cuid(),
        mediaId,
        userId: editor.id,
        role: 'editor',
        permissions: ['publish_any', 'edit_any'],
        status: 'active',
        createdAt: randomDate(120, 200),
        updatedAt: new Date(),
      },
      {
        id: cuid(),
        mediaId,
        userId: writer1.id,
        role: 'writer',
        permissions: ['submit_for_review'],
        status: 'active',
        createdAt: randomDate(60, 150),
        updatedAt: new Date(),
      },
      {
        id: cuid(),
        mediaId,
        userId: writer2.id,
        role: 'writer',
        permissions: ['submit_for_review'],
        status: 'active',
        createdAt: randomDate(60, 150),
        updatedAt: new Date(),
      },
      {
        id: cuid(),
        mediaId,
        userId: viewer.id,
        role: 'viewer',
        permissions: [],
        status: 'active',
        createdAt: randomDate(30, 90),
        updatedAt: new Date(),
      }
    );

    mediaLogsToInsert.push({
      id: cuid(),
      mediaId,
      actorId: owner.id,
      action: 'media.created',
      createdAt: randomDate(150, 250),
    });
  });

  await batchInsert('Medias', prisma.media, mediasToInsert);
  await batchInsert('Media Members', prisma.mediaMember, mediaMembersToInsert);
  await batchInsert('Media Audit Logs', prisma.mediaAuditLog, mediaLogsToInsert);

  // -------------------------------------------------------------------
  // 5. CATÉGORIES & TIERS D'ABONNEMENT (Category & Tier)
  // -------------------------------------------------------------------
  console.log('\n🏷️  [5/13] Création des catégories et des tiers tarifaires...');
  const categoriesToInsert: any[] = [];
  const createdCategories: { id: string; publicationId: string; name: string }[] = [];
  const tiersToInsert: any[] = [];
  const createdTiers: { id: string; publicationId: string }[] = [];

  createdMedias.forEach((m) => {
    m.categories.forEach((catName) => {
      const catId = cuid();
      categoriesToInsert.push({
        id: catId,
        publicationId: m.pubId,
        name: catName,
        slug: slugify(catName),
        description: `Rubrique dédiée : ${catName}.`,
      });
      createdCategories.push({ id: catId, publicationId: m.pubId, name: catName });
    });

    const tId = cuid();
    tiersToInsert.push({
      id: tId,
      publicationId: m.pubId,
      name: 'Membre Soutien',
      description:
        'Accès illimité aux enquêtes exclusives et participation aux débats de rédaction.',
      monthlyPriceCents: 700,
      yearlyPriceCents: 7000,
    });
    createdTiers.push({ id: tId, publicationId: m.pubId });
  });

  userPubConfigs.forEach(({ pubId }) => {
    const tId = cuid();
    tiersToInsert.push({
      id: tId,
      publicationId: pubId,
      name: 'Cercle de Lecture',
      description: 'Soutien direct à la création d’essais indépendants.',
      monthlyPriceCents: 500,
      yearlyPriceCents: 5000,
    });
    createdTiers.push({ id: tId, publicationId: pubId });
  });

  await batchInsert('Categories', prisma.category, categoriesToInsert);
  await batchInsert('Tiers', prisma.tier, tiersToInsert);

  // -------------------------------------------------------------------
  // 6. ARTICLES COMPLETS & ATTRIBUTIONS (Articles JSON + Templates)
  // -------------------------------------------------------------------
  console.log('\n📚 [6/13] Ingestion et composition des articles complets...');
  const articlesToInsert: any[] = [];
  const attributionsToInsert: any[] = [];
  const articleKeyExcerpts: { articleId: string; excerpt: string; authorId: string }[] = [];
  const usedSlugs = new Set<string>();

  // A. Ingestion des articles issus des fichiers JSON d'AI Studio
  for (const ext of externalArticles) {
    const articleId = cuid();
    const baseSlug = ext.slug ? slugify(ext.slug) : slugify(ext.title);
    let finalSlug = baseSlug;
    if (usedSlugs.has(finalSlug)) {
      finalSlug = `${baseSlug}-${articleId.slice(-6)}`;
    }
    usedSlugs.add(finalSlug);

    // Résoudre la publication
    let pubId = ext.publicationSlug ? slugToPubMap.get(ext.publicationSlug) : null;
    if (!pubId) {
      pubId = randomItem(createdMedias).pubId;
    }

    // Résoudre l'auteur
    let author = ext.authorName ? authorNameToUserMap.get(ext.authorName) : null;
    if (!author) {
      author = randomItem(creators);
    }

    // Date de publication réaliste
    const pubDate = parsePublishDate(ext.publishedAtOffsetDays, ext.publishHour);
    const isPrem = ext.isPremium ?? false;
    const visibility = isPrem ? ContentVisibility.PAID_SUBSCRIBERS : ContentVisibility.PUBLIC;

    // Catégorie
    const pubCats = createdCategories.filter((c) => c.publicationId === pubId);
    const cat = pubCats.length > 0 ? randomItem(pubCats) : null;
    const pubTiers = createdTiers.filter((t) => t.publicationId === pubId);

    const keyQuote =
      ext.keyQuote ||
      `« ${ext.title} » constitue un tournant décisif dans notre compréhension des enjeux contemporains.`;

    articlesToInsert.push({
      id: articleId,
      publicationId: pubId,
      authorId: author.id,
      categoryId: cat ? cat.id : null,
      tierId: isPrem && pubTiers[0] ? pubTiers[0].id : null,
      title: ext.title,
      slug: finalSlug,
      content:
        ext.contentHtml ||
        buildArticleHtml(ext.title, keyQuote, [
          'Perspective historique',
          'Analyse structurelle',
          'Propositions d’action',
        ]),
      imageUrl: `https://images.unsplash.com/photo-${1510000000000 + ((articlesToInsert.length * 456789) % 80000000)}?auto=format&fit=crop&w=1200&q=80`,
      published: true,
      isPremium: isPrem,
      visibility,
      readingTime: ext.readingTime || randomInt(6, 12),
      completionRate: 0.84,
      semanticTags: ext.theme
        ? [slugify(ext.theme), 'essai', 'lecture']
        : ['philosophie', 'souverainete'],
      isEditorPick: articlesToInsert.length < 15,
      allowPublicAnnotations: true,
      allowComments: true,
      status: 'PUBLISHED',
      createdAt: pubDate,
      updatedAt: pubDate,
    });

    articleKeyExcerpts.push({ articleId, excerpt: keyQuote, authorId: author.id });

    attributionsToInsert.push({
      id: cuid(),
      articleId,
      userId: author.id,
      role: 'PRIMARY_AUTHOR',
      order: 0,
      isVisible: true,
      consentStatus: 'ACCEPTED',
      createdAt: pubDate,
      updatedAt: pubDate,
    });
  }

  // B. Compléter avec les articles procéduraux pour atteindre 200 articles si besoin
  while (articlesToInsert.length < 200) {
    const idx = articlesToInsert.length;
    const tpl = ARTICLE_FALLBACK_TEMPLATES[idx % ARTICLE_FALLBACK_TEMPLATES.length];
    const articleId = cuid();
    const author = creators[idx % creators.length];
    const pub = idx % 2 === 0 ? randomItem(createdMedias) : randomItem(userPubConfigs);
    const pubId = 'pubId' in pub ? pub.pubId : (pub as any).id;

    const pubDate = randomDate(2, 120);
    const title = `${tpl.title} — Volume ${Math.floor(idx / 3) + 1}`;
    const slug = `${slugify(title)}-${articleId.slice(-6)}`;
    const isPrem = idx % 4 === 0;

    const html = buildArticleHtml(title, tpl.quote, tpl.points);

    articlesToInsert.push({
      id: articleId,
      publicationId: pubId,
      authorId: author.id,
      categoryId: null,
      tierId: null,
      title,
      slug,
      content: html,
      imageUrl: `https://images.unsplash.com/photo-${1490000000000 + ((idx * 789012) % 80000000)}?auto=format&fit=crop&w=1200&q=80`,
      published: true,
      isPremium: isPrem,
      visibility: isPrem ? ContentVisibility.PAID_SUBSCRIBERS : ContentVisibility.PUBLIC,
      readingTime: randomInt(5, 14),
      completionRate: 0.78,
      semanticTags: tpl.tags,
      isEditorPick: idx < 10,
      allowPublicAnnotations: true,
      allowComments: true,
      status: 'PUBLISHED',
      createdAt: pubDate,
      updatedAt: pubDate,
    });

    articleKeyExcerpts.push({ articleId, excerpt: tpl.quote, authorId: author.id });

    attributionsToInsert.push({
      id: cuid(),
      articleId,
      userId: author.id,
      role: 'PRIMARY_AUTHOR',
      order: 0,
      isVisible: true,
      consentStatus: 'ACCEPTED',
      createdAt: pubDate,
      updatedAt: pubDate,
    });
  }

  await batchInsert('Articles', prisma.article, articlesToInsert);
  await batchInsert('Article Attributions', prisma.articleAttribution, attributionsToInsert);

  // -------------------------------------------------------------------
  // 7. 1 300+ PENSÉES (Thought / Post)
  // -------------------------------------------------------------------
  console.log(
    '\n💬 [7/13] Génération de 1 300+ Pensées (Racines, Réponses L1 & L2, Quotes, Reposts)...'
  );
  const thoughtsToInsert: any[] = [];
  const rootThoughts: any[] = [];
  const l1Replies: any[] = [];

  // A. 600 Pensées racines
  for (let i = 0; i < 600; i++) {
    const id = cuid();
    const author = i < 350 ? randomItem(creators) : randomItem(readers);
    const content =
      i < THOUGHT_TEMPLATES.length
        ? THOUGHT_TEMPLATES[i]
        : `${randomItem(THOUGHT_TEMPLATES)} #${randomItem(['Philosophie', 'Souverainete', 'Epistemologie', 'Tech', 'WebLibre'])}`;

    const t = {
      id,
      authorId: author.id,
      content,
      tags: ['pensee', 'souverainete'],
      visibility: 'public',
      contentVisibility: ContentVisibility.PUBLIC,
      isDraft: false,
      isPinned: i < 15,
      likeCount: 0,
      replyCount: 0,
      repostCount: 0,
      parentId: null,
      rootId: null,
      repostId: null,
      quotedArticleId: null,
      quotedExcerpt: null,
      createdAt: randomDate(2, 90),
      updatedAt: new Date(),
    };
    thoughtsToInsert.push(t);
    rootThoughts.push(t);
  }

  // B. 450 Réponses directes (Level 1)
  const rootReplyCounts = new Map<string, number>();
  for (let i = 0; i < 450; i++) {
    const id = cuid();
    const root = randomItem(rootThoughts);
    const author = randomItem(allUsers);
    const content = randomItem(THOUGHT_REPLY_TEMPLATES);

    const t = {
      id,
      authorId: author.id,
      content,
      tags: [],
      visibility: 'public',
      contentVisibility: ContentVisibility.PUBLIC,
      isDraft: false,
      isPinned: false,
      likeCount: 0,
      replyCount: 0,
      repostCount: 0,
      parentId: root.id,
      rootId: root.id,
      repostId: null,
      quotedArticleId: null,
      quotedExcerpt: null,
      createdAt: new Date(root.createdAt.getTime() + randomInt(60000, 86400000)),
      updatedAt: new Date(),
    };
    thoughtsToInsert.push(t);
    l1Replies.push(t);
    rootReplyCounts.set(root.id, (rootReplyCounts.get(root.id) || 0) + 1);
  }

  // C. 150 Sous-réponses imbriquées (Level 2)
  for (let i = 0; i < 150; i++) {
    const id = cuid();
    const parentReply = randomItem(l1Replies);
    const author = randomItem(allUsers);
    const parentAuthor = allUsers.find((u) => u.id === parentReply.authorId);
    const content = `Point très pertinent @${parentAuthor?.username || 'auteur'} ! ${randomItem(THOUGHT_REPLY_TEMPLATES)}`;

    const t = {
      id,
      authorId: author.id,
      content,
      tags: [],
      visibility: 'public',
      contentVisibility: ContentVisibility.PUBLIC,
      isDraft: false,
      isPinned: false,
      likeCount: 0,
      replyCount: 0,
      repostCount: 0,
      parentId: parentReply.id,
      rootId: parentReply.rootId,
      repostId: null,
      quotedArticleId: null,
      quotedExcerpt: null,
      createdAt: new Date(parentReply.createdAt.getTime() + randomInt(30000, 43200000)),
      updatedAt: new Date(),
    };
    thoughtsToInsert.push(t);
    rootReplyCounts.set(parentReply.rootId, (rootReplyCounts.get(parentReply.rootId) || 0) + 1);
    rootReplyCounts.set(parentReply.id, (rootReplyCounts.get(parentReply.id) || 0) + 1);
  }

  // D. 100 Citations d'articles (Quotes)
  for (let i = 0; i < 100; i++) {
    const id = cuid();
    const artExcerpt = randomItem(articleKeyExcerpts);
    const author = randomItem(allUsers);
    const content = `Lecture indispensable aujourd'hui sur Qoe.fi. Ce passage résume parfaitement l'enjeu :`;

    thoughtsToInsert.push({
      id,
      authorId: author.id,
      content,
      tags: ['lecture', 'citation'],
      visibility: 'public',
      contentVisibility: ContentVisibility.PUBLIC,
      isDraft: false,
      isPinned: false,
      likeCount: 0,
      replyCount: 0,
      repostCount: 0,
      parentId: null,
      rootId: null,
      repostId: null,
      quotedArticleId: artExcerpt.articleId,
      quotedExcerpt: artExcerpt.excerpt,
      createdAt: randomDate(1, 60),
      updatedAt: new Date(),
    });
  }

  // Synchronisation des replyCount
  thoughtsToInsert.forEach((t) => {
    t.replyCount = rootReplyCounts.get(t.id) || 0;
  });

  await batchInsert('Thoughts / Posts', prisma.thought, thoughtsToInsert);

  // -------------------------------------------------------------------
  // 8. 450+ COMMENTAIRES D'ARTICLES (ArticleComment & Replies)
  // -------------------------------------------------------------------
  console.log('\n✍️  [8/13] Rédaction de 450+ Commentaires sous les articles...');
  const articleCommentsToInsert: any[] = [];
  const rootComments: any[] = [];

  // 350 Commentaires racine
  for (let i = 0; i < 350; i++) {
    const id = cuid();
    const art = randomItem(articlesToInsert);
    const author = randomItem(allUsers);
    const content = randomItem(ARTICLE_COMMENT_TEMPLATES);
    const c = {
      id,
      articleId: art.id,
      authorId: author.id,
      content,
      parentId: null,
      createdAt: new Date(art.createdAt.getTime() + randomInt(60000, 172800000)),
      updatedAt: new Date(),
    };
    articleCommentsToInsert.push(c);
    rootComments.push(c);
  }

  // 120 Réponses aux commentaires
  for (let i = 0; i < 120; i++) {
    const id = cuid();
    const parent = randomItem(rootComments);
    const author = randomItem(allUsers);
    articleCommentsToInsert.push({
      id,
      articleId: parent.articleId,
      authorId: author.id,
      content: `Tout à fait d'accord avec votre lecture. Cela ouvre une piste d'action concrète.`,
      parentId: parent.id,
      createdAt: new Date(parent.createdAt.getTime() + randomInt(60000, 86400000)),
      updatedAt: new Date(),
    });
  }

  await batchInsert('Article Comments', prisma.articleComment, articleCommentsToInsert);

  // -------------------------------------------------------------------
  // 9. 3 600+ RELATIONS SOCIALES FOLLOWS (Reader -> Publication)
  // -------------------------------------------------------------------
  console.log('\n🤝 [9/13] Génération du graphe social (3 600+ Follows)...');
  const followsToInsert: any[] = [];
  const followsSet = new Set<string>();

  while (followsToInsert.length < 3600) {
    const reader = randomItem(allUsers);
    const pub = randomItem(pubsToInsert);
    const key = `${reader.id}_${pub.id}`;

    if (!followsSet.has(key)) {
      followsSet.add(key);
      followsToInsert.push({
        id: cuid(),
        readerId: reader.id,
        publicationId: pub.id,
        createdAt: randomDate(10, 200),
      });
    }
  }

  await batchInsert('Follows', prisma.follows, followsToInsert);

  // -------------------------------------------------------------------
  // 10. 6 000+ LIKES SUR LES PENSÉES (Like -> Post)
  // -------------------------------------------------------------------
  console.log('\n❤️  [10/13] Distribution de 6 000+ Likes sur les Pensées...');
  const likesToInsert: any[] = [];
  const likeSet = new Set<string>();
  const postLikeCounters = new Map<string, number>();

  while (likesToInsert.length < 6000) {
    const user = randomItem(allUsers);
    const post = randomItem(thoughtsToInsert);
    const key = `${user.id}_${post.id}`;

    if (!likeSet.has(key)) {
      likeSet.add(key);
      likesToInsert.push({
        id: cuid(),
        userId: user.id,
        postId: post.id,
        createdAt: new Date(post.createdAt.getTime() + randomInt(1000, 86400000)),
      });
      postLikeCounters.set(post.id, (postLikeCounters.get(post.id) || 0) + 1);
    }
  }

  await batchInsert('Likes', prisma.like, likesToInsert);

  // -------------------------------------------------------------------
  // 11. 850+ SURLIGNAGES (Highlights, AnnotationComments, Upvotes)
  // -------------------------------------------------------------------
  console.log('\n🖍️  [11/13] Création de 850+ Surlignages et notes en marge...');
  const highlightsToInsert: any[] = [];
  const annotationCommentsToInsert: any[] = [];
  const annotationUpvotesToInsert: any[] = [];

  for (let i = 0; i < 850; i++) {
    const artExcerpt = randomItem(articleKeyExcerpts);
    const reader = randomItem(allUsers);
    const isPublic = Math.random() < 0.85;

    let note: string | null = null;
    if (isPublic && Math.random() < 0.7) {
      note = randomItem([
        'Formulation d’une grande clarté. Cela rejoint directement la thèse de Hartmut Rosa sur l’aliénation.',
        'Passage central : la souveraineté ne se délègue pas, elle s’exerce par l’attention.',
        'À mettre en regard avec les travaux sur les biens communs d’Elinor Ostrom.',
        'Un argument imparable contre les partisans du solutionnisme technologique.',
      ]);
    }

    const hlId = cuid();
    highlightsToInsert.push({
      id: hlId,
      articleId: artExcerpt.articleId,
      readerId: reader.id,
      text: artExcerpt.excerpt,
      note,
      isPublic,
      isOfficial: i < 50,
      upvotesCount: 0,
      createdAt: randomDate(2, 60),
    });

    if (isPublic && note) {
      if (Math.random() < 0.5) {
        annotationCommentsToInsert.push({
          id: cuid(),
          highlightId: hlId,
          authorId: randomItem(allUsers).id,
          content: 'Excellente remarque en marge, je partage cette mise en perspective.',
          createdAt: randomDate(1, 30),
        });
      }
      const upvoters = randomItems(allUsers, randomInt(1, 4));
      upvoters.forEach((upv) => {
        annotationUpvotesToInsert.push({
          id: cuid(),
          highlightId: hlId,
          userId: upv.id,
          createdAt: randomDate(1, 30),
        });
      });
    }
  }

  await batchInsert('Highlights', prisma.highlight, highlightsToInsert);
  await batchInsert('Annotation Comments', prisma.annotationComment, annotationCommentsToInsert);
  await batchInsert('Annotation Upvotes', prisma.annotationUpvote, annotationUpvotesToInsert);

  // -------------------------------------------------------------------
  // 12. 550+ SIGNETS ALÉATOIRES (Bookmarks)
  // -------------------------------------------------------------------
  console.log('\n🔖 [12/13] Sauvegarde aléatoire de 550+ Signets de lecture...');
  const bookmarksToInsert: any[] = [];
  const bookmarkSet = new Set<string>();

  while (bookmarksToInsert.length < 550) {
    const reader = randomItem(allUsers);
    const art = randomItem(articlesToInsert);
    const key = `${reader.id}_${art.id}`;

    if (!bookmarkSet.has(key)) {
      bookmarkSet.add(key);
      bookmarksToInsert.push({
        id: cuid(),
        readerId: reader.id,
        articleId: art.id,
        createdAt: new Date(art.createdAt.getTime() + randomInt(60000, 259200000)),
      });
    }
  }

  await batchInsert('Bookmarks', prisma.bookmark, bookmarksToInsert);

  // -------------------------------------------------------------------
  // 13. 450+ ABONNÉS & 160+ LETTRES (Subscribers & Letters)
  // -------------------------------------------------------------------
  console.log('\n💳 [13/13] Enregistrement de 450+ Abonnés & 160+ Lettres...');
  const subscribersToInsert: any[] = [];
  const subSet = new Set<string>();

  while (subscribersToInsert.length < 450) {
    const reader = randomItem(readers);
    const pub = randomItem(pubsToInsert);
    const key = `${reader.email}_${pub.id}`;

    if (!subSet.has(key)) {
      subSet.add(key);
      const pubTiers = createdTiers.filter((t) => t.publicationId === pub.id);
      const chosenTier = pubTiers.length > 0 && Math.random() < 0.4 ? pubTiers[0].id : null;

      subscribersToInsert.push({
        id: cuid(),
        email: reader.email,
        publicationId: pub.id,
        userId: reader.id,
        tierId: chosenTier,
        status: SubscriptionStatus.ACTIVE,
        isActive: true,
        isPremium: Boolean(chosenTier),
        createdAt: randomDate(5, 150),
        updatedAt: new Date(),
      });
    }
  }

  await batchInsert('Subscribers', prisma.subscriber, subscribersToInsert);

  const lettersToInsert: any[] = [];
  for (let i = 0; i < 165; i++) {
    const art = randomItem(articlesToInsert);
    const sender = randomItem(readers);
    if (sender.id !== art.authorId) {
      lettersToInsert.push({
        id: cuid(),
        senderId: sender.id,
        recipientId: art.authorId,
        articleId: art.id,
        content: `Cher auteur,\n\nVotre récent article "${art.title}" a suscité chez moi une vive réflexion. J'ai particulièrement apprécié la façon dont vous liez l'infrastructure matérielle à la souveraineté intellectuelle.\n\nBien à vous,\n${sender.name}`,
        isPublic: Math.random() < 0.25,
        createdAt: randomDate(1, 45),
      });
    }
  }

  await batchInsert('Letters', prisma.letter, lettersToInsert);

  // -------------------------------------------------------------------
  // RÉSUMÉ FINAL
  // -------------------------------------------------------------------
  const totalSec = ((Date.now() - startAll) / 1000).toFixed(2);
  console.log('\n==================================================================');
  console.log('  ✨ AMORÇAGE MASSIF TERMINÉ AVEC SUCCÈS !');
  console.log('==================================================================');
  console.table({
    'Articles JSON Ingestés': externalArticles.length,
    'Utilisateurs (User)': usersToInsert.length,
    'Médias & Rédactions': createdMedias.length,
    'Publications (Total)': pubsToInsert.length,
    'Articles Complets': articlesToInsert.length,
    'Pensées / Posts': thoughtsToInsert.length,
    'Commentaires Articles': articleCommentsToInsert.length,
    'Relations Follows': followsToInsert.length,
    Likes: likesToInsert.length,
    'Surlignages (Highlights)': highlightsToInsert.length,
    'Signets (Bookmarks)': bookmarksToInsert.length,
    'Abonnés (Subscribers)': subscribersToInsert.length,
    'Lettres aux Auteurs': lettersToInsert.length,
  });
  console.log(`⏱️  Temps total d'exécution : ${totalSec}s\n`);
}

main()
  .catch((e) => {
    console.error('\n❌ Erreur lors du seed :', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
