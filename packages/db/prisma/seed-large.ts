// =====================================================================
// 🚀 Qoe.fi — Massive, Realistic & Production-Grade Data Seed Engine
// =====================================================================
// Génère en ~5s un univers complet et cohérent :
// - Ingestion automatique de tous les articles JSON dans `.exemple-json/`
// - 500 Utilisateurs réalistes (UUIDs Supabase, avatars, pays, pronoms)
// - 15 Médias / Rédactions (avec Publication MEDIA + MediaMember roles)
// - Publications personnelles : UNE par utilisateur (500) — parité prod
// - 200+ Articles complets en HTML riche (citations, listes, paywalls)
// - 1 300+ Pensées (racines, réponses L1, sous-réponses L2, reposts, quotes)
// - 450+ Commentaires sous les articles (avec fils hiérarchiques)
// - 850+ Surlignages (Highlights) avec commentaires en marge et upvotes
// - 3 600+ Follows (Lecteurs -> Publications)
// - 6 000+ Likes sur les posts
// - 550+ Signets (Bookmarks) distribués
// - 450+ Abonnés & Tiers payants (Subscribers)
// - 160+ Lettres de lecteurs aux auteurs
// - Médias uploadés avec propriétaire obligatoire (MediaAsset) + pièces jointes
// - Webhooks sortants & livraisons, clés API, notifications & préférences
// - Réglages utilisateurs, starter packs, sondages, liens sociaux, wallet
// - Apps OAuth de démo, tendances, promos, config système, recommandations
// =====================================================================

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import {
  ContentVisibility,
  Gender,
  AgeRange,
  MediaAssetStatus,
  MediaAssetTargetType,
  NotificationType,
  OAuthClientStatus,
  OAuthClientType,
  PrismaClient,
  PublicationType,
  SubscriptionStatus,
} from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { embedAllUsers } from './embed-users';
import { createSeedImages, type SeedImages } from './lib/seed-images';
import { seedUmami } from './lib/seed-umami';
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

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

// UUID v5 déterministe (email → id stable entre deux reseeds). Nécessaire pour
// que les comptes Supabase Auth créés par le seed restent alignés sur les users
// publics (auth.users.id = "User".id) même après un migrate reset + reseed.
const UUID_NS = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'; // namespace DNS (fixe)
function uuidV5(name: string): string {
  const h = createHash('sha1')
    .update(UUID_NS.replace(/-/g, ''), 'hex')
    .update(Buffer.from(name, 'utf8'))
    .digest();
  h[6] = (h[6] & 0x0f) | 0x50; // version 5
  h[8] = (h[8] & 0x3f) | 0x80; // variant RFC 4122
  const hex = h.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function mapConcurrent<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, idx: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  let currentIdx = 0;
  async function worker() {
    while (currentIdx < items.length) {
      const idx = currentIdx++;
      results[idx] = await fn(items[idx], idx);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
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

function estimateReadingTime(html: string): number {
  const text = html.replace(/<[^>]*>/g, ' ');
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}

function randomCompletionRate(readingTime: number): number {
  // Plus l'article est long, plus la complétion baisse légèrement + variance
  const base = 0.88 - Math.min(0.25, (readingTime - 5) * 0.015);
  const jitter = (Math.random() - 0.5) * 0.18;
  const v = base + jitter;
  return Math.round(Math.min(0.96, Math.max(0.32, v)) * 100) / 100;
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

// ─── Corpus LLM (généré par scripts/generate-llm-corpus.mjs) ───
interface CorpusArticle extends ExternalArticle {
  key?: string;
  channel?: string; // 'media:<slug>' | 'personal'
  coAuthors?: string[];
}
interface CorpusThought {
  key: string;
  content: string;
  tags: string[];
}
interface CorpusReply {
  key: string;
  parentKey: string;
  level: 1 | 2;
  content: string;
}
interface CorpusComment {
  key: string;
  articleKey: string;
  replyToKey: string | null;
  content: string;
}
interface CorpusQuote {
  articleKey: string;
  excerpt: string;
  commentary: string;
}

function loadJsonlDir(name: string): any[] {
  const f = path.join(__dirname, 'fixtures', 'corpus', name);
  if (!fs.existsSync(f)) return [];
  return fs
    .readFileSync(f, 'utf-8')
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function loadCorpus() {
  const dir = path.join(__dirname, 'fixtures', 'corpus');
  if (!fs.existsSync(dir)) return null;
  return {
    articles: loadJsonlDir('articles.jsonl') as CorpusArticle[],
    thoughts: loadJsonlDir('thoughts.jsonl') as CorpusThought[],
    replies: loadJsonlDir('replies.jsonl') as CorpusReply[],
    comments: loadJsonlDir('comments.jsonl') as CorpusComment[],
    quotes: loadJsonlDir('quotes.jsonl') as CorpusQuote[],
    highlightNotes: loadJsonlDir('highlight-notes.jsonl') as { quote: string; note: string }[],
  };
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
  // 0. CHARGEMENT DU CORPUS LLM (+ fallback articles JSON externes)
  // -------------------------------------------------------------------
  const corpus = loadCorpus();
  let externalArticles: ExternalArticle[] = [];
  if (corpus && corpus.articles.length > 0) {
    externalArticles = corpus.articles;
    console.log(
      `📂 [0/25] Corpus LLM chargé : ${corpus.articles.length} articles, ${corpus.thoughts.length} pensées, ${corpus.replies.length} réponses, ${corpus.comments.length} commentaires.`
    );
  } else {
    console.log('📂 [0/25] Analyse du dossier des articles générés (.exemple-json)...');
    externalArticles = loadExternalArticles();
    console.log(
      `  ✓ ${externalArticles.length} articles riches découverts dans les fichiers JSON.\n`
    );
  }

  // -------------------------------------------------------------------
  // 1. NETTOYAGE PRÉALABLE SÉCURISÉ
  // -------------------------------------------------------------------
  console.log('🧹 [1/25] Nettoyage préalable des tables locales...');
  try {
    // Tables secondaires générées par le seed (enfants d'abord, cascade-safe)
    await prisma.notificationDelivery.deleteMany({}).catch(() => {});
    await prisma.notification.deleteMany({}).catch(() => {});
    await prisma.pollVote.deleteMany({}).catch(() => {});
    await prisma.pollOption.deleteMany({}).catch(() => {});
    await prisma.poll.deleteMany({}).catch(() => {});
    await prisma.mediaAttachment.deleteMany({}).catch(() => {});
    await prisma.mediaAsset.deleteMany({}).catch(() => {});
    await prisma.webhookDelivery.deleteMany({}).catch(() => {});
    await prisma.webhook.deleteMany({}).catch(() => {});
    await prisma.apiKey.deleteMany({}).catch(() => {});
    await prisma.userSettings.deleteMany({}).catch(() => {});
    await prisma.notificationPreference.deleteMany({}).catch(() => {});
    await prisma.starterPackItem.deleteMany({}).catch(() => {});
    await prisma.starterPack.deleteMany({}).catch(() => {});
    await prisma.socialLink.deleteMany({}).catch(() => {});
    await prisma.walletTransaction.deleteMany({}).catch(() => {});
    await prisma.oAuthConsent.deleteMany({}).catch(() => {});
    await prisma.oAuthToken.deleteMany({}).catch(() => {});
    await prisma.oAuthAuthorizationCode.deleteMany({}).catch(() => {});
    await prisma.oAuthClient.deleteMany({}).catch(() => {});
    await prisma.trend.deleteMany({}).catch(() => {});
    await prisma.partnerPromo.deleteMany({}).catch(() => {});
    await prisma.systemConfig.deleteMany({}).catch(() => {});
    await prisma.recommendation.deleteMany({}).catch(() => {});
    await prisma.collaborationRequest.deleteMany({}).catch(() => {});
    await prisma.mediaInvite.deleteMany({}).catch(() => {});
    await prisma.moderationReport.deleteMany({}).catch(() => {});
    await prisma.mutedWord.deleteMany({}).catch(() => {});
    await prisma.blockedUser.deleteMany({}).catch(() => {});
    await prisma.mutedUser.deleteMany({}).catch(() => {});
    await prisma.navigationItem.deleteMany({}).catch(() => {});
    await prisma.translationAuditLog.deleteMany({}).catch(() => {});
    await prisma.accountDeletionRequest.deleteMany({}).catch(() => {});
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
  // 1bis. IMAGES LOCALES (upload des fixtures vers le storage Supabase)
  // -------------------------------------------------------------------
  // Zéro image externe : avatars/logos/bannières SVG + photos covers sont
  // uploadés (upsert) dans les buckets du storage local, puis toutes les
  // URLs de la base pointent vers ce storage.
  console.log('🖼️  [1bis/25] Upload des images du seed vers le storage Supabase...');
  let img: SeedImages;
  try {
    img = await createSeedImages();
  } catch (err) {
    throw new Error(
      `[seed-images] Storage Supabase injoignable (${process.env.NEXT_PUBLIC_SUPABASE_URL}). ` +
        'Démarre le stack local (supabase start) et vérifie NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.'
    );
  }
  console.log(
    `  ✓ ${24 + 12 + 8 + 30} fichiers uploadés (upsert) dans user-media / media-branding / articles-media.\n`
  );

  // -------------------------------------------------------------------
  // 2. 500 UTILISATEURS (UUID v4) + Auteurs spécifiques des JSON
  // -------------------------------------------------------------------
  console.log('👥 [2/25] Création de 500 utilisateurs (UUIDs v4)...');
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
    new Set(
      externalArticles
        .flatMap((a) => {
          const corpusA = a as CorpusArticle;
          return [a.authorName, ...(corpusA.coAuthors ?? [])];
        })
        .filter(Boolean)
    )
  ) as string[];

  for (const [aIdx, authorName] of externalAuthorNames.entries()) {
    const handle = slugify(authorName);
    usedUsernames.add(handle);
    const id = uuidV5(`${handle}@qoe.fi`);

    const userObj = {
      id,
      email: `${handle}@qoe.fi`,
      username: handle,
      name: authorName,
      role: 'creator',
      isCertified: true,
      logoUrl: img.avatar(aIdx).url,
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

    const id = uuidV5(`${handle}@qoe.fi`);
    const i = usersToInsert.length;
    let role = 'user';
    if (i < 80) role = 'creator';
    else if (i < 95) role = 'superadmin';

    const logoUrl = img.avatar(i).url;

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
  console.log('\n📰 [3/25] Création des Publications (Médias + Personnelles)...');
  const pubsToInsert: any[] = [];
  const mediaConfigs: { pubId: string; meta: (typeof BIOS_MEDIAS)[0] }[] = [];
  const userPubConfigs: { userId: string; pubId: string }[] = [];
  const slugToPubMap = new Map<string, string>();

  // 23 Médias
  BIOS_MEDIAS.forEach((m, mIdx) => {
    const pubId = cuid();
    pubsToInsert.push({
      id: pubId,
      type: PublicationType.MEDIA,
      name: m.name,
      slug: m.slug,
      bio: m.bio,
      logoUrl: img.logo(mIdx).url,
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

  // Publications personnelles — UNE pour chaque utilisateur (parité prod :
  // chaque compte signé reçoit sa publication PERSONAL à l'inscription).
  // Sans elle, les pensées d'un user sont publiées mais son profil /username
  // est irrésolvable (404) car GetPublicationBySlugOrSubdomain part de la
  // table Publication.
  allUsers.forEach((c, idx) => {
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
  console.log('\n🏢 [4/25] Structuration des Rédactions & Équipes Média...');
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
  console.log('\n🏷️  [5/25] Création des catégories et des tiers tarifaires...');
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
  console.log('\n📚 [6/25] Ingestion et composition des articles complets...');
  const articlesToInsert: any[] = [];
  const attributionsToInsert: any[] = [];
  const articleKeyExcerpts: { articleId: string; excerpt: string; authorId: string }[] = [];
  const usedSlugs = new Set<string>();

  // A. Ingestion des articles issus du corpus LLM (ou des JSON externes)
  const userIdToPersonalPub = new Map(userPubConfigs.map((u) => [u.userId, u.pubId]));
  const corpusKeyToArticle = new Map<string, { articleId: string; authorId: string }>();
  for (const ext of externalArticles) {
    const articleId = cuid();
    const baseSlug = ext.slug ? slugify(ext.slug) : slugify(ext.title);
    let finalSlug = baseSlug;
    if (usedSlugs.has(finalSlug)) {
      finalSlug = `${baseSlug}-${articleId.slice(-6)}`;
    }
    usedSlugs.add(finalSlug);

    // Résoudre l'auteur (créé à l'étape 2 si nom inconnu)
    let author = ext.authorName ? authorNameToUserMap.get(ext.authorName) : null;
    if (!author) {
      author = randomItem(creators);
    }

    // Résoudre la publication :
    //  - channel "media:<slug>" → rédaction média correspondante
    //  - channel "personal" → blog personnel de l'auteur
    const corpusA = ext as CorpusArticle;
    let pubId: string | null = null;
    if (corpusA.channel?.startsWith('media:')) {
      pubId = slugToPubMap.get(corpusA.channel.slice(6)) ?? null;
    } else if (corpusA.channel === 'personal') {
      pubId = userIdToPersonalPub.get(author.id) ?? null;
    }
    if (!pubId) {
      pubId =
        (ext.publicationSlug ? slugToPubMap.get(ext.publicationSlug) : null) ??
        userIdToPersonalPub.get(author.id) ??
        randomItem(createdMedias).pubId;
    }
    if (corpusA.key) {
      corpusKeyToArticle.set(corpusA.key, { articleId, authorId: author.id });
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

    const contentHtmlFinal =
      ext.contentHtml ||
      buildArticleHtml(ext.title, keyQuote, [
        'Perspective historique',
        'Analyse structurelle',
        'Propositions d’action',
      ]);
    const readingTimeComputed = estimateReadingTime(contentHtmlFinal);
    const completionRateComputed = randomCompletionRate(readingTimeComputed);

    articlesToInsert.push({
      id: articleId,
      publicationId: pubId,
      authorId: author.id,
      categoryId: cat ? cat.id : null,
      tierId: isPrem && pubTiers[0] ? pubTiers[0].id : null,
      title: ext.title,
      slug: finalSlug,
      content: contentHtmlFinal,
      imageUrl: img.cover(articlesToInsert.length).url,
      published: true,
      isPremium: isPrem,
      visibility,
      readingTime: readingTimeComputed,
      completionRate: completionRateComputed,
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

    // Co-auteurs / contributeurs (corpus LLM : ~30% des articles)
    const coAuthors = (ext as CorpusArticle).coAuthors ?? [];
    const roles = ['CO_AUTHOR', 'EDITOR', 'CONTRIBUTOR'];
    coAuthors.forEach((name, cIdx) => {
      const coUser = authorNameToUserMap.get(name);
      if (!coUser || coUser.id === author.id) return;
      attributionsToInsert.push({
        id: cuid(),
        articleId,
        userId: coUser.id,
        role: roles[cIdx % roles.length],
        order: cIdx + 1,
        isVisible: true,
        consentStatus: 'ACCEPTED',
        createdAt: pubDate,
        updatedAt: pubDate,
      });
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
    const rt = estimateReadingTime(html);
    const cr = randomCompletionRate(rt);

    articlesToInsert.push({
      id: articleId,
      publicationId: pubId,
      authorId: author.id,
      categoryId: null,
      tierId: null,
      title,
      slug,
      content: html,
      imageUrl: img.cover(idx).url,
      published: true,
      isPremium: isPrem,
      visibility: isPrem ? ContentVisibility.PAID_SUBSCRIBERS : ContentVisibility.PUBLIC,
      readingTime: rt,
      completionRate: cr,
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
    '\n💬 [7/25] Génération de 1 300+ Pensées (Racines, Réponses L1 & L2, Quotes, Reposts)...'
  );
  const thoughtsToInsert: any[] = [];
  const rootThoughts: any[] = [];
  const l1Replies: any[] = [];

  // A. Pensées racines — corpus LLM en priorité, templates en complément
  const corpusKeyToThought = new Map<string, any>();
  if (corpus && corpus.thoughts.length > 0) {
    console.log(`  💭 Corpus : ${corpus.thoughts.length} pensées rédigées par LLM`);
    corpus.thoughts.forEach((ct, i) => {
      const id = cuid();
      const author = i % 10 < 7 ? randomItem(creators) : randomItem(readers);
      const t = {
        id,
        authorId: author.id,
        content: ct.content,
        tags: ct.tags?.length ? ct.tags : ['pensee'],
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
      if (ct.key) corpusKeyToThought.set(ct.key, t);
    });
  }
  for (let i = rootThoughts.length; i < 600; i++) {
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

  // B. Réponses directes (Level 1) — corpus LLM en priorité
  const rootReplyCounts = new Map<string, number>();
  const corpusRepliesL1 = corpus?.replies.filter((r) => r.level === 1) ?? [];
  if (corpusRepliesL1.length > 0) {
    console.log(`  ↩️  Corpus : ${corpusRepliesL1.length} réponses L1 contextuelles`);
    for (const cr of corpusRepliesL1) {
      const root = corpusKeyToThought.get(cr.parentKey);
      if (!root) continue;
      const id = cuid();
      const author = randomItem(allUsers);
      const t = {
        id,
        authorId: author.id,
        content: cr.content,
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
      corpusKeyToThought.set(cr.key, t);
      rootReplyCounts.set(root.id, (rootReplyCounts.get(root.id) || 0) + 1);
    }
  }
  for (let i = l1Replies.length; i < 450; i++) {
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

  // C. Sous-réponses imbriquées (Level 2) — corpus LLM en priorité
  const corpusRepliesL2 = corpus?.replies.filter((r) => r.level === 2) ?? [];
  let l2Added = 0;
  if (corpusRepliesL2.length > 0) {
    console.log(`  ↩️↩️ Corpus : ${corpusRepliesL2.length} sous-réponses L2`);
    for (const cr of corpusRepliesL2) {
      const parentReply = corpusKeyToThought.get(cr.parentKey);
      if (!parentReply || !l1Replies.includes(parentReply)) continue;
      const id = cuid();
      const author = randomItem(allUsers);
      const t = {
        id,
        authorId: author.id,
        content: cr.content,
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
      l2Added++;
      rootReplyCounts.set(parentReply.rootId, (rootReplyCounts.get(parentReply.rootId) || 0) + 1);
      rootReplyCounts.set(parentReply.id, (rootReplyCounts.get(parentReply.id) || 0) + 1);
    }
  }
  for (let i = l2Added; i < 150; i++) {
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

  // D. Citations d'articles (Quotes) — commentaires LLM en priorité
  const corpusQuotes = corpus?.quotes ?? [];
  if (corpusQuotes.length > 0) {
    console.log(
      `  ❝ Corpus : ${corpusQuotes.length} citations partagées avec commentaire personnel`
    );
    for (const cq of corpusQuotes) {
      const target = corpusKeyToArticle.get(cq.articleKey);
      if (!target) continue;
      const id = cuid();
      const author = randomItem(allUsers);
      thoughtsToInsert.push({
        id,
        authorId: author.id,
        content: cq.commentary,
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
        quotedArticleId: target.articleId,
        quotedExcerpt: cq.excerpt,
        createdAt: randomDate(1, 60),
        updatedAt: new Date(),
      });
    }
  }
  for (let i = corpusQuotes.length; i < 100; i++) {
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

  // E. Reposts : pensées repartagées (repostId → thought source)
  const REPOST_COMMENTS = [
    'À lire absolument.',
    'Exactement ça.',
    'Je repartage, trop important.',
    'Ceci. Mille fois ceci.',
    'Ça mérite d’être vu par plus de monde.',
    'Très juste.',
  ];
  const repostCountMap = new Map<string, number>();
  for (let i = 0; i < 180; i++) {
    const source = randomItem(rootThoughts);
    if (!source) continue;
    const author = randomItem(allUsers);
    if (author.id === source.authorId) continue;
    thoughtsToInsert.push({
      id: cuid(),
      authorId: author.id,
      content: Math.random() < 0.5 ? randomItem(REPOST_COMMENTS) : '',
      tags: [],
      visibility: 'public',
      contentVisibility: ContentVisibility.PUBLIC,
      isDraft: false,
      isPinned: false,
      likeCount: 0,
      replyCount: 0,
      repostCount: 0,
      parentId: null,
      rootId: null,
      repostId: source.id,
      quotedArticleId: null,
      quotedExcerpt: null,
      createdAt: new Date(source.createdAt.getTime() + randomInt(3600000, 7 * 86400000)),
      updatedAt: new Date(),
    });
    repostCountMap.set(source.id, (repostCountMap.get(source.id) || 0) + 1);
  }

  // Synchronisation des compteurs reply & repost
  thoughtsToInsert.forEach((t) => {
    t.replyCount = rootReplyCounts.get(t.id) || 0;
    t.repostCount = repostCountMap.get(t.id) || 0;
  });

  await batchInsert('Thoughts / Posts', prisma.thought, thoughtsToInsert);

  // -------------------------------------------------------------------
  // 8. 450+ COMMENTAIRES D'ARTICLES (ArticleComment & Replies)
  // -------------------------------------------------------------------
  console.log('\n✍️  [8/25] Rédaction de 450+ Commentaires sous les articles...');
  const articleCommentsToInsert: any[] = [];
  const rootComments: any[] = [];

  // Commentaires racine — corpus LLM en priorité
  const corpusKeyToComment = new Map<string, any>();
  if (corpus && corpus.comments.length > 0) {
    const corpusRootComments = corpus.comments.filter((c) => !c.replyToKey);
    console.log(`  💬 Corpus : ${corpus.comments.length} commentaires contextuels`);
    for (const cc of corpusRootComments) {
      const target = corpusKeyToArticle.get(cc.articleKey);
      if (!target) continue;
      const art = articlesToInsert.find((a) => a.id === target.articleId);
      const id = cuid();
      const c = {
        id,
        articleId: target.articleId,
        authorId: randomItem(allUsers).id,
        content: cc.content,
        parentId: null,
        createdAt: art
          ? new Date(art.createdAt.getTime() + randomInt(60000, 172800000))
          : randomDate(1, 60),
        updatedAt: new Date(),
      };
      articleCommentsToInsert.push(c);
      rootComments.push(c);
      corpusKeyToComment.set(cc.key, c);
    }
    // Réponses aux commentaires (fils)
    for (const cc of corpus.comments.filter((c) => c.replyToKey)) {
      const parent = corpusKeyToComment.get(cc.replyToKey);
      const target = corpusKeyToArticle.get(cc.articleKey);
      if (!parent || !target) continue;
      const id = cuid();
      const c = {
        id,
        articleId: parent.articleId,
        authorId: randomItem(allUsers).id,
        content: cc.content,
        parentId: parent.id,
        createdAt: new Date(parent.createdAt.getTime() + randomInt(60000, 86400000)),
        updatedAt: new Date(),
      };
      articleCommentsToInsert.push(c);
      corpusKeyToComment.set(cc.key, c);
    }
  }

  // 350 Commentaires racine (complément templates)
  for (let i = rootComments.length; i < 350; i++) {
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
  console.log('\n🤝 [9/25] Génération du graphe social (3 600+ Follows)...');
  const followsToInsert: any[] = [];
  const followsSet = new Set<string>();

  // Couverture universelle : chaque utilisateur suit au moins 3 publications
  // (mélange médias + carnets personnels), et chaque publication a des abonnés.
  for (const u of allUsers) {
    let followed = 0;
    while (followed < 3) {
      const pub = pubsToInsert[randomInt(0, pubsToInsert.length - 1)];
      const key = `${u.id}_${pub.id}`;
      if (followsSet.has(key)) continue;
      followsSet.add(key);
      followsToInsert.push({
        id: cuid(),
        readerId: u.id,
        publicationId: pub.id,
        createdAt: randomDate(10, 300),
      });
      followed++;
    }
  }

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
  console.log('\n❤️  [10/25] Distribution de 6 000+ Likes sur les Pensées...');
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
  console.log('\n🖍️  [11/25] Création de 850+ Surlignages et notes en marge...');
  const highlightsToInsert: any[] = [];
  const annotationCommentsToInsert: any[] = [];
  const annotationUpvotesToInsert: any[] = [];

  // Notes de marge contextuelles du corpus LLM (cycle) + templates en secours
  const corpusNotes = corpus?.highlightNotes ?? [];
  let corpusNoteCursor = 0;
  const nextCorpusNote = (): string | null => {
    if (corpusNotes.length === 0) return null;
    const n = corpusNotes[corpusNoteCursor % corpusNotes.length].note;
    corpusNoteCursor++;
    return n;
  };
  const ANNOTATION_COMMENTS_POOL = [
    'Excellente remarque en marge, je partage cette mise en perspective.',
    'Ça rejoint exactement ce que je pensais en lisant le passage.',
    'Merci pour cette note, elle éclaire le texte autrement.',
    'Je nuancerais un point, mais l’idée centrale est juste.',
    'Cette mise en perspective mériterait presque son propre article.',
  ];

  for (let i = 0; i < 850; i++) {
    const artExcerpt = randomItem(articleKeyExcerpts);
    const reader = randomItem(allUsers);
    const isPublic = Math.random() < 0.85;

    let note: string | null = null;
    if (isPublic && Math.random() < 0.7) {
      note = nextCorpusNote();
      if (!note && Math.random() < 0.35) {
        note = randomItem([
          'Formulation d’une grande clarté. Cela rejoint directement la thèse de Hartmut Rosa sur l’aliénation.',
          'Passage central : la souveraineté ne se délègue pas, elle s’exerce par l’attention.',
          'À mettre en regard avec les travaux sur les biens communs d’Elinor Ostrom.',
          'Un argument imparable contre les partisans du solutionnisme technologique.',
        ]);
      }
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
          content: randomItem(ANNOTATION_COMMENTS_POOL),
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
  console.log('\n🔖 [12/25] Sauvegarde aléatoire de 550+ Signets de lecture...');
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
  console.log('\n💳 [13/25] Enregistrement de 450+ Abonnés & 160+ Lettres...');
  const subscribersToInsert: any[] = [];
  const subSet = new Set<string>();

  // Couverture universelle : chaque utilisateur est abonné à au moins 2
  // publications ET chaque publication a au moins 2 abonnés.
  for (const u of allUsers) {
    let subs = 0;
    while (subs < 2) {
      const pub = pubsToInsert[randomInt(0, pubsToInsert.length - 1)];
      const key = `${u.email}_${pub.id}`;
      if (subSet.has(key)) continue;
      subSet.add(key);
      const pubTiers = createdTiers.filter((t) => t.publicationId === pub.id);
      const chosenTier = pubTiers.length > 0 && Math.random() < 0.4 ? pubTiers[0].id : null;
      subscribersToInsert.push({
        id: cuid(),
        email: u.email,
        publicationId: pub.id,
        userId: u.id,
        tierId: chosenTier,
        status: SubscriptionStatus.ACTIVE,
        isActive: true,
        isPremium: Boolean(chosenTier),
        createdAt: randomDate(5, 150),
        updatedAt: new Date(),
      });
      subs++;
    }
  }
  // Chaque publication doit avoir ≥ 2 abonnés
  for (const pub of pubsToInsert) {
    let count = subscribersToInsert.filter((s) => s.publicationId === pub.id).length;
    let guard = 0;
    while (count < 2 && guard < 20) {
      guard++;
      const reader = randomItem(readers);
      const key = `${reader.email}_${pub.id}`;
      if (subSet.has(key)) continue;
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
      count++;
    }
  }

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
  const excerptByArticle = new Map(articleKeyExcerpts.map((e) => [e.articleId, e.excerpt]));
  for (let i = 0; i < 165; i++) {
    const art = randomItem(articlesToInsert);
    const sender = randomItem(readers);
    if (sender.id !== art.authorId) {
      const excerpt = excerptByArticle.get(art.id);
      const angle = excerpt
        ? `Ce passage en particulier m'a marqué :\n\n« ${excerpt} »\n\nJe l'ai surligné et relu plusieurs fois.`
        : `J'ai particulièrement apprécié la façon dont vous reliez le concret et les idées.`;
      lettersToInsert.push({
        id: cuid(),
        senderId: sender.id,
        recipientId: art.authorId,
        articleId: art.id,
        content: `Cher auteur,\n\nVotre article "${art.title}" a suscité chez moi une vive réflexion.\n\n${angle}\n\nMerci pour ce texte, et hâte de lire la suite.\n\nBien à vous,\n${sender.name}`,
        isPublic: Math.random() < 0.25,
        createdAt: randomDate(1, 45),
      });
    }
  }

  await batchInsert('Letters', prisma.letter, lettersToInsert);

  // -------------------------------------------------------------------
  // 14. MÉDIAS UPLOADÉS & PIÈCES JOINTES (MediaAsset + MediaAttachment)
  // -------------------------------------------------------------------
  console.log(
    '\n📎 [14/25] Génération des médias uploadés (MediaAsset) & pièces jointes (MediaAttachment)...'
  );
  const mediaAssetsToInsert: any[] = [];
  const mediaAttachmentsToInsert: any[] = [];

  // A. Marque des rédactions : logo + bannière + couvertures d'articles attachées
  createdMedias.forEach((m, mIdx) => {
    const owner = creators[mIdx % creators.length];
    const mediaArticles = articlesToInsert.filter((a) => a.publicationId === m.pubId);
    const coverArts = mediaArticles.slice(0, Math.min(3, mediaArticles.length));

    const logoImg = img.logo(mIdx);
    const bannerImg = img.mediaBanner(mIdx);
    mediaAssetsToInsert.push(
      {
        id: cuid(),
        sha256: sha256(`${m.id}-logo-${mIdx}`),
        url: logoImg.url,
        storagePath: `media/${m.pubId}/logo.svg`,
        bucket: 'media-branding',
        mimeType: logoImg.mimeType,
        width: logoImg.width,
        height: logoImg.height,
        sizeBytes: logoImg.sizeBytes,
        blurhash: 'L6PZfSi_.AyE_3t7t7R**0o#DgR4',
        isNsfw: false,
        isSensitive: false,
        status: MediaAssetStatus.ATTACHED,
        targetType: MediaAssetTargetType.PUBLICATION_LOGO,
        ownerId: owner.id,
        attachedToId: null,
        createdAt: randomDate(150, 280),
        updatedAt: new Date(),
      },
      {
        id: cuid(),
        sha256: sha256(`${m.id}-banner-${mIdx}`),
        url: bannerImg.url,
        storagePath: `media/${m.pubId}/banner.svg`,
        bucket: 'media-branding',
        mimeType: bannerImg.mimeType,
        width: bannerImg.width,
        height: bannerImg.height,
        sizeBytes: bannerImg.sizeBytes,
        blurhash: 'L6PZfSi_.AyE_3t7t7R**0o#DgR4',
        isNsfw: false,
        isSensitive: false,
        status: MediaAssetStatus.ATTACHED,
        targetType: MediaAssetTargetType.PUBLICATION_BANNER,
        ownerId: owner.id,
        attachedToId: null,
        createdAt: randomDate(150, 280),
        updatedAt: new Date(),
      }
    );

    coverArts.forEach((art, cIdx) => {
      const coverImg = img.cover(mIdx * 3 + cIdx);
      mediaAssetsToInsert.push({
        id: cuid(),
        sha256: sha256(`${art.id}-cover`),
        url: art.imageUrl,
        storagePath: `media/${m.pubId}/articles/${art.id}/cover.jpg`,
        bucket: 'articles-media',
        mimeType: coverImg.mimeType,
        width: coverImg.width,
        height: coverImg.height,
        sizeBytes: coverImg.sizeBytes,
        blurhash: 'L6PZfSi_.AyE_3t7t7R**0o#DgR4',
        isNsfw: false,
        isSensitive: false,
        status: MediaAssetStatus.ATTACHED,
        targetType: MediaAssetTargetType.ARTICLE_COVER,
        ownerId: owner.id,
        attachedToId: art.id,
        createdAt: art.createdAt,
        updatedAt: new Date(),
      });
    });
  });

  // B. Avatars & bannières d'utilisateurs (upload personnel)
  for (let i = 0; i < 140; i++) {
    const user = allUsers[i % allUsers.length];
    const avatarImg = img.avatar(i);
    mediaAssetsToInsert.push({
      id: cuid(),
      sha256: sha256(`${user.id}-avatar-${i}`),
      url: user.logoUrl,
      storagePath: `users/${user.id}/avatar.svg`,
      bucket: 'user-media',
      mimeType: avatarImg.mimeType,
      width: avatarImg.width,
      height: avatarImg.height,
      sizeBytes: avatarImg.sizeBytes,
      blurhash: 'L6PZfSi_.AyE_3t7t7R**0o#DgR4',
      isNsfw: false,
      isSensitive: false,
      status: MediaAssetStatus.ATTACHED,
      targetType: MediaAssetTargetType.USER_AVATAR,
      ownerId: user.id,
      attachedToId: null,
      createdAt: user.createdAt,
      updatedAt: new Date(),
    });
    if (i % 3 === 0) {
      const bannerImg = img.banner(i);
      mediaAssetsToInsert.push({
        id: cuid(),
        sha256: sha256(`${user.id}-banner-${i}`),
        url: bannerImg.url,
        storagePath: `users/${user.id}/banner.svg`,
        bucket: 'user-media',
        mimeType: bannerImg.mimeType,
        width: bannerImg.width,
        height: bannerImg.height,
        sizeBytes: bannerImg.sizeBytes,
        blurhash: 'L6PZfSi_.AyE_3t7t7R**0o#DgR4',
        isNsfw: false,
        isSensitive: false,
        status: MediaAssetStatus.ATTACHED,
        targetType: MediaAssetTargetType.USER_BANNER,
        ownerId: user.id,
        attachedToId: null,
        createdAt: user.createdAt,
        updatedAt: new Date(),
      });
    }
  }

  // C. Pièces jointes aux pensées (MediaAttachment) + assets THOUGHT_ATTACHMENT
  for (let i = 0; i < 260 && i < thoughtsToInsert.length; i++) {
    const thought = thoughtsToInsert[i];
    const nb = randomInt(1, 2);
    for (let j = 0; j < nb; j++) {
      const attId = cuid();
      const attImg = img.cover(thoughtsToInsert.length + i * 2 + j);
      const url = attImg.url;
      mediaAttachmentsToInsert.push({
        id: attId,
        thoughtId: thought.id,
        type: 'IMAGE',
        url,
        altText: `Visuel joint à la pensée de ${thought.authorId.slice(0, 8)}`,
        width: attImg.width,
        height: attImg.height,
        order: j,
        createdAt: thought.createdAt,
      });
      mediaAssetsToInsert.push({
        id: cuid(),
        sha256: sha256(`${attId}-media`),
        url,
        storagePath: `thoughts/${thought.id}/attachment-${j}.jpg`,
        bucket: 'articles-media',
        mimeType: attImg.mimeType,
        width: attImg.width,
        height: attImg.height,
        sizeBytes: attImg.sizeBytes,
        blurhash: 'L6PZfSi_.AyE_3t7t7R**0o#DgR4',
        isNsfw: Math.random() < 0.02,
        isSensitive: Math.random() < 0.02,
        status: MediaAssetStatus.ATTACHED,
        targetType: MediaAssetTargetType.THOUGHT_ATTACHMENT,
        ownerId: thought.authorId,
        attachedToId: thought.id,
        createdAt: thought.createdAt,
        updatedAt: new Date(),
      });
    }
  }

  // D. Quelques assets orphelins (DRAFT_ORPHAN) pour tester le TTL de purge
  for (let i = 0; i < 40; i++) {
    const user = randomItem(allUsers);
    const orphanImg = img.cover(500 + i);
    mediaAssetsToInsert.push({
      id: cuid(),
      sha256: sha256(`orphan-${i}`),
      url: orphanImg.url,
      storagePath: `tmp/orphans/${cuid()}.jpg`,
      bucket: 'articles-media',
      mimeType: orphanImg.mimeType,
      width: orphanImg.width,
      height: orphanImg.height,
      sizeBytes: orphanImg.sizeBytes,
      blurhash: 'L6PZfSi_.AyE_3t7t7R**0o#DgR4',
      isNsfw: false,
      isSensitive: false,
      status: MediaAssetStatus.DRAFT_ORPHAN,
      targetType: MediaAssetTargetType.SHARED,
      ownerId: user.id,
      attachedToId: null,
      purgeDueAt: new Date(Date.now() + randomInt(1, 3) * 24 * 3600 * 1000),
      createdAt: randomDate(0, 2),
      updatedAt: new Date(),
    });
  }

  await batchInsert('MediaAssets', prisma.mediaAsset, mediaAssetsToInsert);
  await batchInsert('MediaAttachments', prisma.mediaAttachment, mediaAttachmentsToInsert);

  // -------------------------------------------------------------------
  // 15. WEBHOOKS & LIVRAISONS (Webhook + WebhookDelivery)
  // -------------------------------------------------------------------
  console.log('\n🕸️  [15/25] Génération des Webhooks sortants & livraisons...');
  const webhooksToInsert: any[] = [];
  const deliveriesToInsert: any[] = [];
  const WEBHOOK_EVENTS = [
    'article.published',
    'subscriber.created',
    'subscriber.updated',
    'media.member_added',
    'media.member_removed',
  ];

  createdMedias.forEach((m, mIdx) => {
    const events = randomItems(WEBHOOK_EVENTS, randomInt(2, 4));
    const webhookId = cuid();
    webhooksToInsert.push({
      id: webhookId,
      publicationId: m.pubId,
      name: mIdx % 2 === 0 ? 'Événements Rédactions' : 'Sync Contenu',
      url: `https://hooks.qoe-partners.dev/${slugify(m.name)}`,
      secret: sha256(`${m.id}-secret-${mIdx}`).slice(0, 32),
      events,
      active: mIdx % 5 !== 4,
      createdAt: randomDate(60, 200),
      updatedAt: new Date(),
    });

    for (let d = 0; d < randomInt(2, 5); d++) {
      const status = d === 0 ? 'SUCCESS' : randomItem(['SUCCESS', 'SUCCESS', 'FAILED', 'PENDING']);
      deliveriesToInsert.push({
        id: cuid(),
        webhookId,
        event: randomItem(events),
        payload: {
          event: randomItem(events),
          publicationId: m.pubId,
          timestamp: new Date().toISOString(),
        },
        status,
        httpStatus: status === 'SUCCESS' ? 200 : status === 'FAILED' ? 500 : null,
        responseBody:
          status === 'SUCCESS' ? '{"ok":true}' : status === 'FAILED' ? '{"error":"timeout"}' : null,
        attempts: status === 'PENDING' ? 0 : randomInt(1, 3),
        createdAt: randomDate(0, 30),
      });
    }
  });

  await batchInsert('Webhooks', prisma.webhook, webhooksToInsert);
  await batchInsert('Webhook Deliveries', prisma.webhookDelivery, deliveriesToInsert);

  // -------------------------------------------------------------------
  // 16. CLÉS API (ApiKey) — un jeu par rédaction
  // -------------------------------------------------------------------
  console.log('\n🔑 [16/25] Génération des clés API (ApiKey)...');
  const apiKeysToInsert: any[] = [];
  createdMedias.forEach((m, mIdx) => {
    const owner = creators[mIdx % creators.length];
    for (let k = 0; k < 2; k++) {
      const rawKey = `qoe_live_${Buffer.from(randomUUID()).toString('base64url').slice(0, 24)}`;
      apiKeysToInsert.push({
        id: cuid(),
        name: k === 0 ? 'Production — CMS' : 'Analytics',
        keyPrefix: rawKey.slice(0, 12),
        keyHash: sha256(rawKey),
        scopes: k === 0 ? ['READ', 'WRITE'] : ['READ', 'ANALYTICS'],
        userId: owner.id,
        lastUsedAt: Math.random() < 0.7 ? randomDate(0, 14) : null,
        createdAt: randomDate(30, 120),
      });
    }
  });
  await batchInsert('API Keys', prisma.apiKey, apiKeysToInsert);

  // -------------------------------------------------------------------
  // 17. NOTIFICATIONS & LIVRAISONS (Notification + NotificationDelivery)
  // -------------------------------------------------------------------
  console.log('\n🔔 [17/25] Génération des notifications & livraisons...');
  const notificationsToInsert: any[] = [];
  const notificationDeliveriesToInsert: any[] = [];
  const notifTypes = [
    NotificationType.LIKE,
    NotificationType.REPLY,
    NotificationType.FOLLOW,
    NotificationType.REPOST,
    NotificationType.MENTION,
    NotificationType.COMMENT,
  ];

  for (let i = 0; i < 620; i++) {
    const recipient = randomItem(allUsers);
    const sender = randomItem(allUsers);
    if (sender.id === recipient.id) continue;
    const type = randomItem(notifTypes);
    const thought = Math.random() < 0.6 ? randomItem(rootThoughts) : null;
    const article = Math.random() < 0.3 ? randomItem(articlesToInsert) : null;

    notificationsToInsert.push({
      id: cuid(),
      recipientId: recipient.id,
      senderId: sender.id,
      type,
      thoughtId: thought ? thought.id : null,
      articleId: article ? article.id : null,
      commentId: null,
      publicationId: null,
      isRead: Math.random() < 0.45,
      createdAt: randomDate(0, 30),
    });
  }

  for (const notif of notificationsToInsert) {
    if (Math.random() >= 0.7) continue;
    const channel = randomItem(['EMAIL', 'PUSH']);
    notificationDeliveriesToInsert.push({
      id: cuid(),
      notificationId: notif.id,
      channel,
      status: notif.isRead ? 'SENT' : randomItem(['QUEUED', 'SENT', 'SENT', 'FAILED']),
      recipient: `${notif.recipientId}@qoe.fi`,
      provider: channel === 'EMAIL' ? 'resend' : 'fcm',
      attempts: randomInt(0, 2),
      availableAt: notif.createdAt,
      sentAt:
        Math.random() < 0.8 ? new Date(notif.createdAt.getTime() + randomInt(1, 120) * 1000) : null,
      lastError: null,
      createdAt: notif.createdAt,
      updatedAt: new Date(),
      dedupeKey: `${notif.id}-${channel}`,
    });
  }

  await batchInsert('Notifications', prisma.notification, notificationsToInsert);
  await batchInsert(
    'Notification Deliveries',
    prisma.notificationDelivery,
    notificationDeliveriesToInsert
  );

  // -------------------------------------------------------------------
  // 18. RÉGLAGES UTILISATEURS (UserSettings + NotificationPreference)
  // -------------------------------------------------------------------
  console.log(
    '\n⚙️  [18/25] Génération des réglages utilisateurs & préférences de notification...'
  );
  const settingsToInsert: any[] = [];
  const notifPrefsToInsert: any[] = [];
  allUsers.forEach((u, i) => {
    settingsToInsert.push({
      id: cuid(),
      userId: u.id,
      profileVisibility: i % 11 === 0 ? 'FOLLOWERS' : i % 17 === 0 ? 'PRIVATE' : 'PUBLIC',
      allowMentions: i % 13 !== 0,
      allowCollaborationInvites: i % 19 !== 0,
      showSensitiveContent: i % 7 === 0,
      autoplayMedia: i % 9 !== 0,
      reduceMotion: i % 15 === 0,
      highContrast: i % 23 === 0,
      fontScale: randomInt(90, 120),
      defaultFeed: i % 5 === 0 ? 'DISCOVER' : 'FOLLOWING',
      createdAt: u.createdAt,
      updatedAt: new Date(),
    });
    notifPrefsToInsert.push({
      id: cuid(),
      userId: u.id,
      emailLikes: i % 12 !== 0,
      pushLikes: i % 10 !== 0,
      emailReplies: i % 8 !== 0,
      pushReplies: true,
      emailMentions: true,
      pushMentions: true,
      emailFollows: i % 9 !== 0,
      pushFollows: i % 14 !== 0,
      emailReposts: i % 11 !== 0,
      pushReposts: true,
      emailComments: i % 13 !== 0,
      pushComments: true,
      emailMedia: i % 16 !== 0,
      pushMedia: true,
      emailCollaborations: i % 7 !== 0,
      pushCollaborations: i % 18 !== 0,
      createdAt: u.createdAt,
      updatedAt: new Date(),
    });
  });
  await batchInsert('User Settings', prisma.userSettings, settingsToInsert);
  await batchInsert('Notification Preferences', prisma.notificationPreference, notifPrefsToInsert);

  // -------------------------------------------------------------------
  // 19. STARTER PACKS (StarterPack + StarterPackItem)
  // -------------------------------------------------------------------
  console.log('\n🚀 [19/25] Génération des Starter Packs...');
  const starterPacksToInsert: any[] = [];
  const starterPackItemsToInsert: any[] = [];
  createdMedias.forEach((m) => {
    const packId = cuid();
    starterPacksToInsert.push({
      id: packId,
      title: `${m.name} — La sélection d'auteurs à suivre`,
      description: 'Notre équipe recommande ces créateurs indépendants pour enrichir votre veille.',
      icon: randomItem(['🚀', '🌟', '📚', '🧭', '🎯']),
      publicationId: m.pubId,
      createdAt: randomDate(40, 150),
      updatedAt: new Date(),
    });
    randomItems(creators, randomInt(6, 10)).forEach((c) => {
      starterPackItemsToInsert.push({
        id: cuid(),
        starterPackId: packId,
        userId: c.id,
        createdAt: randomDate(40, 150),
      });
    });
  });
  await batchInsert('Starter Packs', prisma.starterPack, starterPacksToInsert);
  await batchInsert('Starter Pack Items', prisma.starterPackItem, starterPackItemsToInsert);

  // -------------------------------------------------------------------
  // 20. SONDAGES (Poll + PollOption + PollVote)
  // -------------------------------------------------------------------
  console.log('\n🗳️  [20/25] Génération des sondages (Polls)...');
  const pollsToInsert: any[] = [];
  const pollOptionsToInsert: any[] = [];
  const pollVotesToInsert: any[] = [];
  const POLL_TEMPLATES: [string, string[]][] = [
    [
      'Préférez-vous une lecture lente et approfondie, ou des formats courts ?',
      ['Lecture lente', 'Formats courts', 'Les deux'],
    ],
    [
      'Quel sujet faut-il traiter en priorité ?',
      ['Souveraineté numérique', 'Éducation', 'Économie', 'Culture'],
    ],
    [
      'Plutôt livre papier ou livre numérique ?',
      ['Papier', 'Numérique', 'Audiobook', 'Peu importe'],
    ],
    [
      'Faut-il réguler davantage les plateformes centralisées ?',
      ['Oui, fermement', 'Oui, avec prudence', 'Non', 'Sans avis'],
    ],
  ];
  for (let i = 0; i < 36 && i < rootThoughts.length; i++) {
    const thought = rootThoughts[i];
    const [question, options] = POLL_TEMPLATES[i % POLL_TEMPLATES.length];
    const pollId = cuid();
    pollsToInsert.push({
      id: pollId,
      thoughtId: thought.id,
      expiresAt: new Date(Date.now() + randomInt(2, 14) * 24 * 3600 * 1000),
      createdAt: thought.createdAt,
    });
    const optionIds = options.map((text, oIdx) => {
      const optId = cuid();
      pollOptionsToInsert.push({ id: optId, pollId, text, order: oIdx });
      return optId;
    });
    const daysSinceThought = Math.max(
      1,
      Math.round((Date.now() - thought.createdAt.getTime()) / 86400000)
    );
    const usedVoters = new Set<string>();
    for (let v = 0; v < randomInt(18, 90); v++) {
      const voter = randomItem(allUsers);
      if (usedVoters.has(voter.id)) continue;
      usedVoters.add(voter.id);
      pollVotesToInsert.push({
        id: cuid(),
        pollId,
        optionId: randomItem(optionIds),
        userId: voter.id,
        createdAt: randomDate(0, daysSinceThought),
      });
    }
  }
  await batchInsert('Polls', prisma.poll, pollsToInsert);
  await batchInsert('Poll Options', prisma.pollOption, pollOptionsToInsert);
  await batchInsert('Poll Votes', prisma.pollVote, pollVotesToInsert);

  // -------------------------------------------------------------------
  // 21. LIENS SOCIAUX, TRANSACTIONS & MODÉRATION SOCIALE
  //    (SocialLink + WalletTransaction + MutedWord/BlockedUser/MutedUser)
  // -------------------------------------------------------------------
  console.log(
    '\n🌐 [21/25] Génération des liens sociaux, transactions wallet & modération sociale...'
  );
  const socialLinksToInsert: any[] = [];
  createdMedias.forEach((m) => {
    const slug = slugify(m.name);
    [
      ['twitter', `https://x.com/${slug}`],
      ['mastodon', `https://mastodon.social/@${slug}`],
      ['website', `https://${slug}.qoe.fi`],
    ].forEach(([platform, url], sIdx) => {
      socialLinksToInsert.push({ id: cuid(), platform, url, order: sIdx, publicationId: m.pubId });
    });
  });
  userPubConfigs.forEach(({ pubId }, i) => {
    if (i % 4 !== 0) return;
    const username = allUsers[i].username ?? 'createur';
    [
      ['twitter', `https://x.com/${username}`],
      ['linkedin', `https://www.linkedin.com/in/${username}`],
    ].forEach(([platform, url], sIdx) => {
      socialLinksToInsert.push({ id: cuid(), platform, url, order: sIdx, publicationId: pubId });
    });
  });
  await batchInsert('Social Links', prisma.socialLink, socialLinksToInsert);

  const walletTxToInsert: any[] = [];
  for (let i = 0; i < 320; i++) {
    const user = randomItem(allUsers);
    const type = randomItem(['DEPOSIT', 'DEPOSIT', 'SUBSCRIPTION_PAYMENT', 'REFUND']);
    walletTxToInsert.push({
      id: cuid(),
      userId: user.id,
      amountCents:
        type === 'DEPOSIT'
          ? randomInt(500, 5000)
          : type === 'SUBSCRIPTION_PAYMENT'
            ? -randomInt(500, 900)
            : randomInt(100, 500),
      type,
      createdAt: randomDate(1, 120),
    });
  }
  await batchInsert('Wallet Transactions', prisma.walletTransaction, walletTxToInsert);

  const mutedWordsToInsert: any[] = [];
  const blockedUsersToInsert: any[] = [];
  const mutedUsersToInsert: any[] = [];
  const mutedWordSet = new Set<string>();
  const mutedUserSet = new Set<string>();
  for (let i = 0; i < 120; i++) {
    const user = randomItem(allUsers);
    const word = randomItem(['crypto', 'NFT', 'spam', 'pub', 'clickbait', 'fakenews']);
    const key = `${user.id}_${word}`;
    if (mutedWordSet.has(key)) continue;
    mutedWordSet.add(key);
    mutedWordsToInsert.push({ id: cuid(), word, userId: user.id, createdAt: randomDate(5, 90) });
  }
  const blockSet = new Set<string>();
  for (let i = 0; i < 60; i++) {
    const creator = randomItem(creators);
    const reader = randomItem(allUsers);
    if (creator.id === reader.id) continue;
    const key = `${creator.id}_${reader.id}`;
    if (blockSet.has(key)) continue;
    blockSet.add(key);
    blockedUsersToInsert.push({
      id: cuid(),
      creatorId: creator.id,
      readerId: reader.id,
      createdAt: randomDate(5, 90),
    });
    const mKey = `${reader.id}_${creator.id}`;
    if (Math.random() < 0.5 && !mutedUserSet.has(mKey)) {
      mutedUserSet.add(mKey);
      mutedUsersToInsert.push({
        id: cuid(),
        muterId: reader.id,
        mutedId: creator.id,
        createdAt: randomDate(5, 90),
      });
    }
  }
  await batchInsert('Muted Words', prisma.mutedWord, mutedWordsToInsert);
  await batchInsert('Blocked Users', prisma.blockedUser, blockedUsersToInsert);
  await batchInsert('Muted Users', prisma.mutedUser, mutedUsersToInsert);

  // -------------------------------------------------------------------
  // 22. APPLICATIONS OAuth DE DÉMO (OAuthClient + OAuthConsent)
  // -------------------------------------------------------------------
  console.log('\n🔐 [22/25] Génération des applications OAuth de démo...');
  const oauthClientsToInsert: any[] = [];
  const oauthConsentsToInsert: any[] = [];
  const oauthDemoApps: any[] = [
    {
      clientId: 'qoe_oauth_demo_reader',
      name: 'Reader Démo',
      description: 'Application de lecture tierce utilisant OAuth 2.1 / OIDC.',
      logoUrl: img.logo(0).url,
      homepageUrl: 'http://localhost:3000',
      redirectUris: ['http://localhost:3000/callback'],
      scopes: ['openid', 'profile', 'email'],
      clientType: OAuthClientType.CONFIDENTIAL,
      status: OAuthClientStatus.APPROVED,
    },
    {
      clientId: 'qoe_oauth_pkce_mobile',
      name: 'App Mobile PKCE',
      description: 'Client public mobile avec PKCE (S256).',
      logoUrl: img.logo(1).url,
      homepageUrl: 'https://qoe.fi',
      redirectUris: ['qoeapp://oauth/callback'],
      scopes: ['openid', 'profile'],
      clientType: OAuthClientType.PUBLIC,
      status: OAuthClientStatus.APPROVED,
    },
    {
      clientId: 'qoe_oauth_pending_analytics',
      name: 'Analytics Tierce',
      description: "App en attente de modération par l'équipe.",
      logoUrl: img.logo(2).url,
      homepageUrl: 'https://analytics.qoe.fi',
      redirectUris: ['https://analytics.qoe.fi/oauth/callback'],
      scopes: ['openid', 'email'],
      clientType: OAuthClientType.CONFIDENTIAL,
      status: OAuthClientStatus.PENDING,
    },
  ];
  oauthDemoApps.forEach((app, aIdx) => {
    const owner = creators[aIdx % creators.length];
    oauthClientsToInsert.push({
      id: cuid(),
      ...app,
      clientSecretHash:
        app.clientType === OAuthClientType.CONFIDENTIAL
          ? sha256(`demo-secret-${app.clientId}`)
          : null,
      ownerUserId: owner.id,
      createdAt: randomDate(20, 90),
      updatedAt: new Date(),
    });
  });
  const approvedClients = oauthClientsToInsert.filter(
    (c) => c.status === OAuthClientStatus.APPROVED
  );
  const consentSet = new Set<string>();
  for (let i = 0; i < 90 && approvedClients.length > 0; i++) {
    const client = randomItem(approvedClients);
    const user = randomItem(allUsers);
    const key = `${client.id}_${user.id}`;
    if (consentSet.has(key)) continue;
    consentSet.add(key);
    oauthConsentsToInsert.push({
      id: cuid(),
      clientId: client.id,
      userId: user.id,
      scopes: client.scopes,
      grantedAt: randomDate(10, 60),
      updatedAt: new Date(),
    });
  }
  await batchInsert('OAuth Clients', prisma.oAuthClient, oauthClientsToInsert);
  await batchInsert('OAuth Consents', prisma.oAuthConsent, oauthConsentsToInsert);

  // -------------------------------------------------------------------
  // 23. TENDANCES, PROMOS, CONFIG, RECOS & SIGNALEMENTS
  //    (Trend + PartnerPromo + SystemConfig + Recommendation + NavigationItem + ModerationReport + CollaborationRequest)
  // -------------------------------------------------------------------
  console.log(
    '\n📈 [23/25] Génération tendances, promos partenaires, config système, recommandations & signalements...'
  );
  const trendsToInsert: any[] = [];
  const TREND_TAGS = [
    '#SouveraineteNumerique',
    '#TechnoCritique',
    '#WebLibre',
    '#Education',
    '#OpenSource',
    '#Philosophie',
    '#Litterature',
    '#DataPrivacy',
    '#MediaIndependants',
    '#NumeriqueResponsable',
  ];
  TREND_TAGS.forEach((tag) => {
    trendsToInsert.push({
      id: cuid(),
      hashtag: tag,
      count: randomInt(400, 12000),
      createdAt: randomDate(1, 30),
      updatedAt: new Date(),
    });
  });
  await batchInsert('Trends', prisma.trend, trendsToInsert);

  const partnerPromosToInsert: any[] = [
    {
      id: cuid(),
      title: 'Soutenez la presse indépendante',
      description:
        'Découvrez les médias membres de notre réseau et abonnez-vous à tarif préférentiel.',
      ctaText: 'Découvrir',
      ctaUrl: 'https://qoe.fi/medias',
      imageUrl: img.cover(100).url,
      isActive: true,
      createdAt: randomDate(10, 60),
      updatedAt: new Date(),
    },
    {
      id: cuid(),
      title: 'Lire sans algorithme',
      description: 'Reprenez la main sur votre fil : suivez les créateurs qui comptent vraiment.',
      ctaText: 'Commencer',
      ctaUrl: 'https://qoe.fi',
      imageUrl: img.cover(101).url,
      isActive: true,
      createdAt: randomDate(10, 60),
      updatedAt: new Date(),
    },
    {
      id: cuid(),
      title: 'Offre étudiant',
      description: '-50% sur les abonnements premium pour les étudiants vérifiés.',
      ctaText: 'Vérifier',
      ctaUrl: 'https://qoe.fi/etudiants',
      imageUrl: null,
      isActive: false,
      createdAt: randomDate(10, 60),
      updatedAt: new Date(),
    },
  ];
  await batchInsert('Partner Promos', prisma.partnerPromo, partnerPromosToInsert);

  const systemConfigsToInsert: any[] = [
    {
      key: 'platform.maintenance_mode',
      value: 'false',
      description: 'Bascule de maintenance globale de la plateforme.',
      updatedAt: new Date(),
    },
    {
      key: 'platform.announcement',
      value: "Bienvenue sur qoe.fi — l'écosystème des médias indépendants.",
      description: "Message d'annonce affiché sur l'accueil.",
      updatedAt: new Date(),
    },
    {
      key: 'billing.default_currency',
      value: 'EUR',
      description: 'Devise par défaut des abonnements.',
      updatedAt: new Date(),
    },
    {
      key: 'moderation.auto_flag_threshold',
      value: '0.85',
      description: 'Seuil de score de modération automatique.',
      updatedAt: new Date(),
    },
    {
      key: 'media.asset_orphan_ttl_days',
      value: '3',
      description: 'TTL des MediaAsset DRAFT_ORPHAN avant purge.',
      updatedAt: new Date(),
    },
  ];
  await batchInsert('System Config', prisma.systemConfig, systemConfigsToInsert);

  const recommendationsToInsert: any[] = [];
  const recSet = new Set<string>();
  createdMedias.forEach((m) => {
    for (let r = 0; r < randomInt(2, 5); r++) {
      const rec = randomItem(userPubConfigs);
      const key = `${m.pubId}_${rec.pubId}`;
      if (recSet.has(key)) continue;
      recSet.add(key);
      recommendationsToInsert.push({
        id: cuid(),
        recommenderId: m.pubId,
        recommendedId: rec.pubId,
        description: `${m.name} recommande chaudement ce créateur indépendant.`,
        createdAt: randomDate(5, 60),
      });
    }
  });
  await batchInsert('Recommendations', prisma.recommendation, recommendationsToInsert);

  const navItemsToInsert: any[] = [];
  createdMedias.forEach((m) => {
    const labels = ['Accueil', 'À la une', 'Podcast', 'À propos', 'Contact'];
    labels.forEach((label, lIdx) => {
      navItemsToInsert.push({
        id: cuid(),
        label,
        url: lIdx === 0 ? null : `/${slugify(label)}`,
        order: lIdx,
        isExternal: false,
        publicationId: m.pubId,
        parentId: null,
      });
    });
  });
  await batchInsert('Navigation Items', prisma.navigationItem, navItemsToInsert);

  const moderationReportsToInsert: any[] = [];
  for (let i = 0; i < 25; i++) {
    const reporter = randomItem(allUsers);
    const target = randomItem([...rootThoughts, ...articlesToInsert]);
    const isThought = 'likeCount' in target;
    moderationReportsToInsert.push({
      id: cuid(),
      reporterId: reporter.id,
      targetId: target.id,
      targetType: isThought ? 'thought' : 'article',
      reason: randomItem([
        'Spam',
        'Contenu haineux',
        'Désinformation',
        'Harcèlement',
        'Contenu violent',
      ]),
      details:
        'Signalement généré automatiquement lors du seed pour tester le workflow de modération.',
      status: randomItem(['pending', 'pending', 'reviewed', 'dismissed']),
      createdAt: randomDate(1, 60),
      updatedAt: new Date(),
    });
  }
  await batchInsert('Moderation Reports', prisma.moderationReport, moderationReportsToInsert);

  const collabRequestsToInsert: any[] = [];
  const collabSet = new Set<string>();
  for (let i = 0; i < 30; i++) {
    const article = randomItem(articlesToInsert);
    const inviter = creators[i % creators.length];
    const invitee = randomItem(creators);
    if (inviter.id === invitee.id || invitee.id === article.authorId) continue;
    const key = `${article.id}_${invitee.id}`;
    if (collabSet.has(key)) continue;
    collabSet.add(key);
    collabRequestsToInsert.push({
      id: cuid(),
      articleId: article.id,
      inviterId: inviter.id,
      inviteeId: invitee.id,
      status: randomItem(['PENDING', 'PENDING', 'ACCEPTED', 'DECLINED']),
      requestedRole: 'CO_AUTHOR',
      requestedOrder: randomInt(1, 3),
      showOnPublicProfile: true,
      acceptedAt: Math.random() < 0.3 ? randomDate(1, 30) : null,
      createdAt: randomDate(5, 90),
      updatedAt: new Date(),
    });
  }
  await batchInsert('Collaboration Requests', prisma.collaborationRequest, collabRequestsToInsert);

  // -------------------------------------------------------------------
  // 24. COMPTES SUPABASE AUTH (login local password123)
  // -------------------------------------------------------------------
  console.log('\n🔐 [24/25] Création des comptes Supabase Auth (password123)...');
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!serviceKey || !supabaseUrl) {
    console.warn(
      '  ⚠️ SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL absents — comptes Auth non créés.'
    );
  } else {
    const adminUrl = `${supabaseUrl.replace(/\/+$/, '')}/auth/v1/admin/users`;
    let authCreated = 0;
    let authSkipped = 0;
    let authFailed = 0;
    await mapConcurrent(usersToInsert, 8, async (u) => {
      try {
        const res = await fetch(adminUrl, {
          method: 'POST',
          headers: {
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            id: u.id,
            email: u.email,
            password: 'password123',
            email_confirm: true,
            user_metadata: { name: u.name, username: u.username },
          }),
          signal: AbortSignal.timeout(10000),
        });
        if (res.ok) {
          authCreated++;
        } else {
          const body = await res.json().catch(() => ({}));
          const msg = body?.msg || body?.message || '';
          if (res.status === 422 || /already exists|already registered/i.test(msg)) {
            authSkipped++;
          } else {
            authFailed++;
            console.warn(`  ⚠️ Auth ${u.email}: ${res.status} ${msg}`);
          }
        }
      } catch (err) {
        authFailed++;
        console.warn(`  ⚠️ Auth ${u.email}:`, (err as Error).message);
      }
    });
    console.log(
      `  ├─ ✓ ${authCreated} comptes créés, ${authSkipped} déjà existants, ${authFailed} échecs.`
    );
  }

  // -------------------------------------------------------------------
  // 25. EMBEDDINGS PROFILS (jina-embeddings-v3, 512d — si le service répond)
  // -------------------------------------------------------------------
  console.log('\n🧠 [25/25] Génération des embeddings de profils (jina-embeddings-v3)...');
  const embedBase = (process.env.EMBEDDING_URL || 'http://127.0.0.1:8081').replace(/\/+$/, '');
  const embedderUp = await fetch(`${embedBase}/v1/models`, {
    signal: AbortSignal.timeout(3000),
  })
    .then((r) => r.ok)
    .catch(() => false);
  if (!embedderUp) {
    console.warn(
      `  ⚠️ Serveur d'embedding injoignable (${embedBase}) — embeddings non générés. Relancez \`pnpm embed:users && pnpm embed\` une fois le service démarré.`
    );
  } else {
    await embedAllUsers(prisma);
  }

  // -------------------------------------------------------------------
  // 26. UMAMI ANALYTICS (30j réalistes, si UMAMI_DATABASE_URL configuré)
  // -------------------------------------------------------------------
  console.log('\n📊 [26/26] Seed Umami analytics (30j réalistes)...');
  try {
    await seedUmami(prisma);
  } catch (e) {
    console.warn('  ⚠️ Seed Umami échoué :', (e as Error).message);
  }

  // -------------------------------------------------------------------
  // 27. HISTORIQUE LECTURE 14J (ReadingSession, perso seul, sources)
  // -------------------------------------------------------------------
  console.log('\n📖 [27/27] Seed historique lectures 14j (feed/subdomain/direct)...');
  try {
    const { seedReadingSessions } = await import('./lib/seed-reading-sessions.ts');
    await seedReadingSessions();
  } catch (e) {
    console.warn('  ⚠️ Seed ReadingSessions échoué :', (e as Error).message);
  }

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
    'Médias Uploadés (MediaAsset)': mediaAssetsToInsert.length,
    'Pièces Jointes (MediaAttachment)': mediaAttachmentsToInsert.length,
    'Webhooks & Livraisons': webhooksToInsert.length + deliveriesToInsert.length,
    'Clés API (ApiKey)': apiKeysToInsert.length,
    'Notifications & Livraisons':
      notificationsToInsert.length + notificationDeliveriesToInsert.length,
    'Réglages Utilisateurs (UserSettings)': settingsToInsert.length,
    'Starter Packs & Items': starterPacksToInsert.length + starterPackItemsToInsert.length,
    'Sondages (Poll/Options/Votes)':
      pollsToInsert.length + pollOptionsToInsert.length + pollVotesToInsert.length,
    'Apps OAuth Démo': oauthClientsToInsert.length,
    'Transactions Wallet': walletTxToInsert.length,
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
