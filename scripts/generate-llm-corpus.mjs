#!/usr/bin/env node
// =====================================================================
// 🤖 Générateur de corpus LLM — contenu réaliste pour le seed qoe.fi
// =====================================================================
// Appelle Gemini (round-robin sur 2 modèles flash-lite, 15 req/min chacun)
// et écrit un corpus JSONL propre dans packages/db/prisma/fixtures/corpus/.
//
// Sorties :
//   articles.jsonl        — articles riches (35% médias / 65% créateurs,
//                           ~25% paywall, co-auteurs, keyQuote)
//   thoughts.jsonl        — pensées racines signées + tags thématiques
//   replies.jsonl         — fils L1 (réponse à une pensée) & L2 (sous-réponses)
//   comments.jsonl        — commentaires d'articles (+ quelques réponses)
//   quotes.jsonl          — commentaires accompagnant des citations d'articles
//   highlight-notes.jsonl — notes de marge contextuelles pour surlignages
//
// Idempotent : relance = complète uniquement ce qui manque.
//
// Usage :
//   GEMINI_API_KEY=... node scripts/generate-llm-corpus.mjs [--force]
// =====================================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORPUS_DIR = path.join(__dirname, '..', 'packages', 'db', 'prisma', 'fixtures', 'corpus');

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
  console.error('❌ GEMINI_API_KEY manquant.');
  process.exit(1);
}

const MODELS = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'];
const RPM_PER_MODEL = 15;
const MIN_INTERVAL_MS = Math.ceil(60000 / RPM_PER_MODEL); // 4000 ms
const MAX_OUTPUT_TOKENS = 32000;

const TARGETS = {
  articles: 120,
  thoughts: 400,
  repliesL1: 250,
  repliesL2: 100,
  commentsRoot: 150,
  commentsReplies: 50,
  quotes: 80,
  highlightNotes: 60,
};

const MEDIA_SLUGS = [
  'la-vigie-epistemique',
  'polis-praxis',
  'algorithmes-et-cite',
  'anthropocene-terroirs',
  'sovereign-web',
  'kairos-review',
  'atelier-critique',
  'chroma-journal',
  'terra-incognita',
  'cybernetics-society',
  'economie-heterodoxe',
  'observatoire-futur',
  'grand-continent-marges',
  'diogene-moderne',
  'ethique-et-code',
  'la-voix-du-peuple',
  'la-table-du-dimanche',
  'chemins-interieurs',
  'debats-et-societe',
  'les-fondements-du-vivant',
  'la-revue-des-formes',
  'agora-heterodoxe',
  'cahiers-de-la-resonance',
];

const THEMES = [
  "Philosophie de l'esprit",
  'Souveraineté numérique',
  'Écologie & climat',
  'Intelligence artificielle',
  'Économie hétérodoxe',
  'Littérature & poésie',
  'Sciences & méthode',
  'Politique & société',
  'Histoire des idées',
  'Techno-critique',
  'Vie quotidienne & attention',
  'Art & esthétique',
  'Biologie & vivant',
  'Psychologie',
  'Voyages & géographie',
  'Cuisine & culture',
];

// ─── Rate limiter round-robin ───────────────────────────────────────
const slots = MODELS.map((m) => ({ model: m, nextAt: 0 }));

async function acquireSlot() {
  // Choisit le modèle dont le prochain créneau est le plus proche
  slots.sort((a, b) => a.nextAt - b.nextAt);
  const slot = slots[0];
  const now = Date.now();
  const wait = Math.max(0, slot.nextAt - now);
  slot.nextAt = Math.max(now, slot.nextAt) + MIN_INTERVAL_MS;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  return slot.model;
}

let requestCount = 0;
async function callGemini(prompt) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const model = await acquireSlot();
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: { 'x-goog-api-key': API_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 1.05,
              maxOutputTokens: MAX_OUTPUT_TOKENS,
              responseMimeType: 'application/json',
            },
          }),
          signal: AbortSignal.timeout(180000),
        }
      );
      requestCount++;
      if (res.status === 429 || res.status >= 500) {
        const backoff = attempt * 15000;
        console.warn(`  ⏳ ${res.status} sur ${model}, retry dans ${backoff / 1000}s…`);
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
      return JSON.parse(text);
    } catch (err) {
      if (attempt === 4) throw err;
      console.warn(`  ⚠️ Tentative ${attempt} échouée (${err.message}), retry…`);
      await new Promise((r) => setTimeout(r, attempt * 8000));
    }
  }
}

// ─── Persistance JSONL incrémentale ────────────────────────────────
function corpusFile(name) {
  fs.mkdirSync(CORPUS_DIR, { recursive: true });
  return path.join(CORPUS_DIR, name);
}

function loadJsonl(name) {
  const f = corpusFile(name);
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

function appendJsonl(name, items) {
  if (items.length === 0) return;
  fs.appendFileSync(corpusFile(name), items.map((i) => JSON.stringify(i)).join('\n') + '\n');
}

const pad = (n, w = 3) => String(n).padStart(w, '0');

// ─── Prompts ────────────────────────────────────────────────────────

async function generateArticles(existing) {
  const need = TARGETS.articles - existing.length;
  if (need <= 0) return [];
  console.log(`\n📰 Articles : ${existing.length}/${TARGETS.articles} → ${need} à générer`);
  const PER_BATCH = 8;
  const batches = Math.ceil(need / PER_BATCH);
  const out = [];
  for (let b = 0; b < batches; b++) {
    const count = Math.min(PER_BATCH, need - out.length);
    const prompt = `Tu es un éditeur francophone qui prépare le lancement d'une plateforme de blogs indépendants (style Substack français, ton intellectuel mais accessible).

Génère EXACTEMENT ${count} articles de fond en français, au format JSON : un tableau d'objets.

Chaque objet a ces champs :
- "key": "A${pad(existing.length + out.length + 1)}" puis A${pad(existing.length + out.length + 2)}, etc. (incrément strict, unique)
- "title": titre accrocheur (5-12 mots)
- "slug": slug-url-kebab-case du titre
- "theme": thème parmi : ${THEMES.map((t) => `"${t}"`).join(', ')}
- "channel": soit "media:<slug>" avec slug parmi [${MEDIA_SLUGS.join(', ')}] (~35% des articles), soit "personal" (~65%, blog personnel d'un créateur)
- "authorName": nom d'auteur francophone crédible et varié (prénom + nom, pas de célébrités réelles)
- "coAuthors": tableau de 0 à 2 noms d'auteurs différents (prénoms+noms) ; vide pour la plupart, rempli pour ~30% des articles
- "isPremium": true pour ~25% (paywall), sinon false
- "readingTime": entier 4 à 18
- "publishedAtOffsetDays": entier 1 à 90 (ancienneté en jours)
- "publishHour": "HH:MM" réaliste
- "keyQuote": citation marquante extraite de l'article (1-2 phrases)
- "contentHtml": HTML riche en français (800-1200 mots), structuré :
  "<p class=\\"lead\\">…</p>" en introduction, plusieurs "<h2>…</h2>", des "<p>…</p>",
  au moins une liste "<ul><li>…</li></ul>" OU une citation "<blockquote><p>…</p></blockquote>".
  Si isPremium=true, insérer le marqueur exact <!--paywall--> après le 2e paragraphe
  (le reste de l'article est derrière le paywall). Pas de style inline, pas d'image, pas de script.

Sujets DIVERS et réalistes : varie les thèmes, les angles (essai, chronique, analyse, retour d'expérience), les tons. Écris du vrai contenu substantiel, pas du remplissage.
Réponds UNIQUEMENT avec le tableau JSON.`;
    process.stdout.write(`  📝 Batch articles ${b + 1}/${batches} (${count} articles)… `);
    const arr = await callGemini(prompt);
    const items = Array.isArray(arr) ? arr : (arr.articles ?? []);
    let ok = 0;
    for (const it of items) {
      if (!it?.title || !it?.contentHtml) continue;
      out.push({
        key: it.key || `A${pad(existing.length + ok + 1)}`,
        title: it.title,
        slug: it.slug,
        theme: it.theme,
        channel: it.channel || 'personal',
        authorName: it.authorName,
        coAuthors: Array.isArray(it.coAuthors) ? it.coAuthors.slice(0, 2) : [],
        isPremium: !!it.isPremium,
        readingTime: it.readingTime,
        publishedAtOffsetDays: it.publishedAtOffsetDays,
        publishHour: it.publishHour,
        keyQuote: it.keyQuote,
        contentHtml: it.contentHtml,
      });
      ok++;
    }
    console.log(`✓ ${ok} valides`);
  }
  appendJsonl('articles.jsonl', out);
  return out;
}

async function generateThoughts(existing) {
  const need = TARGETS.thoughts - existing.length;
  if (need <= 0) return [];
  console.log(`\n💭 Pensées racines : ${existing.length}/${TARGETS.thoughts} → ${need} à générer`);
  const PER_BATCH = 60;
  const batches = Math.ceil(need / PER_BATCH);
  const out = [];
  for (let b = 0; b < batches; b++) {
    const count = Math.min(PER_BATCH, need - out.length);
    const startIdx = existing.length + out.length + 1;
    const prompt = `Génère EXACTEMENT ${count} posts courts de réseau social en français (plateforme intellectuelle type Twitter/Substack Notes).

Format JSON : tableau d'objets avec :
- "key": "T${pad(startIdx)}", T${pad(startIdx + 1)}, … (incrément strict)
- "content": post de 40 à 280 caractères, voix personnelle et authentique. Mélange : opinions tranchées, questions ouvertes, micro-récits du quotidien, réflexions sur la lecture/écriture/technologie/vie privée/nature/travail. Quelques-uns avec humour ou ironie légère. PAS de hashtags génériques comme #bonjour.
- "tags": tableau de 1 à 3 tags pertinents sans accent (ex: ["lecture","souverainete"])
Varie fortement les tons et sujets. Réponds UNIQUEMENT avec le tableau JSON.`;
    process.stdout.write(`  💭 Batch pensées ${b + 1}/${batches} (${count})… `);
    const arr = await callGemini(prompt);
    const items = Array.isArray(arr) ? arr : (arr.thoughts ?? []);
    let ok = 0;
    for (const it of items) {
      if (!it?.content || typeof it.content !== 'string') continue;
      out.push({
        key: it.key || `T${pad(startIdx + ok)}`,
        content: it.content.slice(0, 500),
        tags: Array.isArray(it.tags) ? it.tags.slice(0, 3) : [],
      });
      ok++;
    }
    console.log(`✓ ${ok} valides`);
  }
  appendJsonl('thoughts.jsonl', out);
  return out;
}

async function generateReplies(thoughts, existing) {
  const needL1 = TARGETS.repliesL1 - existing.filter((r) => r.level === 1).length;
  const needL2 = TARGETS.repliesL2 - existing.filter((r) => r.level === 2).length;
  const out = [];
  if (needL1 > 0) {
    console.log(`\n↩️  Réponses L1 : besoin de ${needL1}`);
    const PARENTS_PER_PROMPT = 25;
    const REPLIES_PER_PARENT = 2;
    const batches = Math.ceil(
      Math.min(needL1, thoughts.length * 2) / (PARENTS_PER_PROMPT * REPLIES_PER_PARENT)
    );
    let parentCursor = 0;
    let made = 0;
    for (let b = 0; b < batches && made < needL1; b++) {
      const parents = [];
      for (
        let i = 0;
        i < PARENTS_PER_PROMPT && parents.length * REPLIES_PER_PARENT + made < needL1;
        i++
      ) {
        parents.push(thoughts[parentCursor % thoughts.length]);
        parentCursor++;
      }
      const startIdx = existing.length + out.length + 1;
      const prompt = `Voici des posts de réseau social (format JSON) :
${JSON.stringify(
  parents.map((p) => ({ key: p.key, content: p.content })),
  null,
  0
)}

Pour CHACUN de ces posts, génère ${REPLIES_PER_PARENT} réponses directes, en français, comme le feraient des utilisateurs distincts.
Réactions variées : accord argumenté, désaccord poli, anecdote personnelle liée, question de clarification, nuance/complément.
Format JSON : tableau d'objets {"key":"R${pad(startIdx)}","parentKey":"T001","content":"…"} (keys incrémentales R${pad(startIdx)}, R${pad(startIdx + 1)}, … ; 60-240 caractères).
Réponds UNIQUEMENT avec le tableau JSON.`;
      process.stdout.write(`  ↩️  Batch L1 ${b + 1}/${batches}… `);
      const arr = await callGemini(prompt);
      const items = Array.isArray(arr) ? arr : (arr.replies ?? []);
      let ok = 0;
      for (const it of items) {
        if (!it?.content || !it?.parentKey) continue;
        if (!parents.some((p) => p.key === it.parentKey)) continue;
        out.push({
          key: it.key || `R${pad(startIdx + ok)}`,
          parentKey: it.parentKey,
          level: 1,
          content: it.content.slice(0, 500),
        });
        ok++;
      }
      made += ok;
      console.log(`✓ ${ok} réponses`);
    }
  }
  if (needL2 > 0) {
    console.log(`\n↩️↩️ Sous-réponses L2 : besoin de ${needL2}`);
    const l1 = [...existing.filter((r) => r.level === 1), ...out.filter((r) => r.level === 1)];
    const PARENTS_PER_PROMPT = 20;
    const batches = Math.ceil(needL2 / PARENTS_PER_PROMPT);
    let cursor = 0;
    let made = 0;
    for (let b = 0; b < batches && made < needL2; b++) {
      const parents = [];
      for (let i = 0; i < PARENTS_PER_PROMPT && parents.length + made < needL2; i++) {
        parents.push(l1[cursor % l1.length]);
        cursor++;
      }
      const startIdx = existing.length + out.length + 1;
      const prompt = `Voici des réponses à des posts de réseau social (JSON) :
${JSON.stringify(
  parents.map((p) => ({ key: p.key, content: p.content })),
  null,
  0
)}

Pour CHACUNE, génère UNE sous-réponse (réponse à la réponse), courte (30-160 caractères), naturelle : rebond, approbation, objection, blague discrète…
Format JSON : tableau d'objets {"key":"R${pad(startIdx)}","parentKey":"<key du parent>","content":"…"} (keys incrémentales).
Réponds UNIQUEMENT avec le tableau JSON.`;
      process.stdout.write(`  ↩️↩️ Batch L2 ${b + 1}/${batches}… `);
      const arr = await callGemini(prompt);
      const items = Array.isArray(arr) ? arr : (arr.replies ?? []);
      let ok = 0;
      for (const it of items) {
        if (!it?.content || !it?.parentKey) continue;
        if (!parents.some((p) => p.key === it.parentKey)) continue;
        out.push({
          key: it.key || `R${pad(startIdx + ok)}`,
          parentKey: it.parentKey,
          level: 2,
          content: it.content.slice(0, 300),
        });
        ok++;
      }
      made += ok;
      console.log(`✓ ${ok} sous-réponses`);
    }
  }
  appendJsonl('replies.jsonl', out);
  return out;
}

async function generateComments(articles, existing) {
  const needRoot = TARGETS.commentsRoot - existing.filter((c) => !c.replyToKey).length;
  const needRep = TARGETS.commentsReplies - existing.filter((c) => c.replyToKey).length;
  const out = [];
  if (needRoot > 0 && articles.length > 0) {
    console.log(`\n💬 Commentaires d'articles : besoin de ${needRoot}`);
    const ARTICLES_PER_PROMPT = 6;
    const COMMENTS_PER_ARTICLE = 4;
    const batches = Math.ceil(needRoot / (ARTICLES_PER_PROMPT * COMMENTS_PER_ARTICLE));
    let cursor = 0;
    let made = 0;
    for (let b = 0; b < batches && made < needRoot; b++) {
      const slice = [];
      for (
        let i = 0;
        i < ARTICLES_PER_PROMPT && slice.length * COMMENTS_PER_ARTICLE + made < needRoot;
        i++
      ) {
        slice.push(articles[cursor % articles.length]);
        cursor++;
      }
      const startIdx = existing.length + out.length + 1;
      const prompt = `Voici des articles de blog (titre + citation centrale) :
${JSON.stringify(
  slice.map((a) => ({ key: a.key, title: a.title, keyQuote: a.keyQuote })),
  null,
  0
)}

Génère ${COMMENTS_PER_ARTICLE} commentaires de lecteurs pour chaque article, en français.
Commentaires CRÉDIBLES et spécifiques au contenu cité (pas de « super article » générique) : réaction argumentée, expérience vécue, désaccord respectueux, question précise, complément d'information.
Format JSON : tableau d'objets {"key":"C${pad(startIdx)}","articleKey":"<key>","content":"…"} (40-300 caractères, keys incrémentales C${pad(startIdx)}, …).
Réponds UNIQUEMENT avec le tableau JSON.`;
      process.stdout.write(`  💬 Batch commentaires ${b + 1}/${batches}… `);
      const arr = await callGemini(prompt);
      const items = Array.isArray(arr) ? arr : (arr.comments ?? []);
      let ok = 0;
      for (const it of items) {
        if (!it?.content || !it?.articleKey) continue;
        if (!slice.some((a) => a.key === it.articleKey)) continue;
        out.push({
          key: it.key || `C${pad(startIdx + ok)}`,
          articleKey: it.articleKey,
          replyToKey: null,
          content: it.content.slice(0, 500),
        });
        ok++;
      }
      made += ok;
      console.log(`✓ ${ok}`);
    }
  }
  if (needRep > 0 && out.length + existing.length > 0) {
    const allRoots = [...existing.filter((c) => !c.replyToKey), ...out];
    console.log(`\n💬 Réponses aux commentaires : besoin de ${needRep}`);
    const PARENTS_PER_PROMPT = 20;
    const batches = Math.ceil(needRep / PARENTS_PER_PROMPT);
    let cursor = 0;
    let made = 0;
    for (let b = 0; b < batches && made < needRep; b++) {
      const parents = [];
      for (let i = 0; i < PARENTS_PER_PROMPT && parents.length + made < needRep; i++) {
        parents.push(allRoots[cursor % allRoots.length]);
        cursor++;
      }
      const startIdx = existing.length + out.length + 1;
      const prompt = `Voici des commentaires de lecteurs (JSON) :
${JSON.stringify(
  parents.map((c) => ({ key: c.key, content: c.content })),
  null,
  0
)}

Pour CHACUN, génère UNE réponse courte (30-150 caractères) : acquiescement nuancé, contre-exemple, remerciement, précision.
Format JSON : tableau d'objets {"key":"C${pad(startIdx)}","articleKey":"<articleKey du parent>","replyToKey":"<key parent>","content":"…"}.
Réponds UNIQUEMENT avec le tableau JSON.`;
      process.stdout.write(`  💬 Batch réponses ${b + 1}/${batches}… `);
      const arr = await callGemini(prompt);
      const items = Array.isArray(arr) ? arr : (arr.comments ?? []);
      let ok = 0;
      for (const it of items) {
        if (!it?.content || !it?.replyToKey) continue;
        if (!parents.some((p) => p.key === it.replyToKey)) continue;
        const parent = parents.find((p) => p.key === it.replyToKey);
        out.push({
          key: it.key || `C${pad(startIdx + ok)}`,
          articleKey: parent.articleKey,
          replyToKey: it.replyToKey,
          content: it.content.slice(0, 300),
        });
        ok++;
      }
      made += ok;
      console.log(`✓ ${ok}`);
    }
  }
  appendJsonl('comments.jsonl', out);
  return out;
}

async function generateQuotes(articles, existing) {
  const need = TARGETS.quotes - existing.length;
  if (need <= 0 || articles.length === 0) return [];
  console.log(`\n❝ Citations d'articles : besoin de ${need}`);
  const PER_BATCH = 20;
  const batches = Math.ceil(need / PER_BATCH);
  const out = [];
  let cursor = Math.floor(articles.length / 2);
  for (let b = 0; b < batches; b++) {
    const count = Math.min(PER_BATCH, need - out.length);
    const slice = [];
    for (let i = 0; i < count; i++) {
      slice.push(articles[(cursor + i * 3) % articles.length]);
    }
    cursor += count * 3;
    const prompt = `Voici des articles (titre + citation centrale) :
${JSON.stringify(
  slice.map((a) => ({ key: a.key, title: a.title, keyQuote: a.keyQuote })),
  null,
  0
)}

Un utilisateur partage chaque citation sur le réseau social avec un commentaire personnel qui accompagne le partage.
Génère un commentaire par article : pourquoi cette phrase lui parle, ce qu'elle change dans sa façon de voir, un lien avec son vécu ou une autre lecture. 60-220 caractères, ton personnel, PAS de « grande citation » ni flatterie générique.
Format JSON : tableau d'objets {"articleKey":"<key>","commentary":"…"}. Réponds UNIQUEMENT avec le tableau JSON.`;
    process.stdout.write(`  ❝ Batch quotes ${b + 1}/${batches}… `);
    const arr = await callGemini(prompt);
    const items = Array.isArray(arr) ? arr : (arr.quotes ?? []);
    let ok = 0;
    for (const it of items) {
      if (!it?.commentary || !it?.articleKey) continue;
      const art = articles.find((a) => a.key === it.articleKey);
      if (!art) continue;
      out.push({ articleKey: it.articleKey, excerpt: art.keyQuote, commentary: it.commentary });
      ok++;
    }
    console.log(`✓ ${ok}`);
  }
  appendJsonl('quotes.jsonl', out);
  return out;
}

async function generateHighlightNotes(articles, existing) {
  const need = TARGETS.highlightNotes - existing.length;
  if (need <= 0 || articles.length === 0) return [];
  console.log(`\n🖍️ Notes de marge : besoin de ${need}`);
  const PER_BATCH = 20;
  const batches = Math.ceil(need / PER_BATCH);
  const out = [];
  let cursor = 7;
  for (let b = 0; b < batches; b++) {
    const count = Math.min(PER_BATCH, need - out.length);
    const slice = [];
    for (let i = 0; i < count; i++) {
      slice.push(articles[(cursor + i * 5) % articles.length]);
    }
    cursor += count * 5;
    const prompt = `Voici des passages surlignés par des lecteurs (extraits d'articles) :
${JSON.stringify(
  slice.map((a) => ({ quote: a.keyQuote })),
  null,
  0
)}

Chaque lecteur laisse parfois une note de marge publique attachée à son surlignage.
Génère une note par passage : mise en perspective (autre auteur/théorie/expérience), question soulevée, ou prolongement concret. 40-200 caractères, style lecteur éclairé mais naturel.
Format JSON : tableau d'objets {"quote":"<extrait exact>","note":"…"}. Réponds UNIQUEMENT avec le tableau JSON.`;
    process.stdout.write(`  🖍️ Batch notes ${b + 1}/${batches}… `);
    const arr = await callGemini(prompt);
    const items = Array.isArray(arr) ? arr : (arr.notes ?? []);
    let ok = 0;
    for (const it of items) {
      if (!it?.note || !it?.quote) continue;
      out.push({ quote: it.quote, note: it.note });
      ok++;
    }
    console.log(`✓ ${ok}`);
  }
  appendJsonl('highlight-notes.jsonl', out);
  return out;
}

// ─── Main ───────────────────────────────────────────────────────────
async function main() {
  console.log('🤖 Génération du corpus LLM pour le seed qoe.fi');
  console.log(`   Modèles : ${MODELS.join(' ⇄ ')} (${RPM_PER_MODEL} req/min chacun)\n`);

  const t0 = Date.now();

  const existingArticles = loadJsonl('articles.jsonl');
  const articles = [...existingArticles, ...(await generateArticles(existingArticles))];
  if (articles.length === 0) throw new Error('Aucun article généré — impossible de continuer.');

  const existingThoughts = loadJsonl('thoughts.jsonl');
  const thoughts = [...existingThoughts, ...(await generateThoughts(existingThoughts))];

  const existingReplies = loadJsonl('replies.jsonl');
  const replies = [...existingReplies, ...(await generateReplies(thoughts, existingReplies))];

  const existingComments = loadJsonl('comments.jsonl');
  const comments = [...existingComments, ...(await generateComments(articles, existingComments))];

  const existingQuotes = loadJsonl('quotes.jsonl');
  const quotes = [...existingQuotes, ...(await generateQuotes(articles, existingQuotes))];

  const existingNotes = loadJsonl('highlight-notes.jsonl');
  const notes = [...existingNotes, ...(await generateHighlightNotes(articles, existingNotes))];

  console.log('\n📊 Corpus final :');
  console.log(`   Articles           : ${articles.length}`);
  console.log(
    `     ├─ médias        : ${articles.filter((a) => String(a.channel).startsWith('media')).length}`
  );
  console.log(`     ├─ créateurs     : ${articles.filter((a) => a.channel === 'personal').length}`);
  console.log(`     └─ paywalls      : ${articles.filter((a) => a.isPremium).length}`);
  console.log(`   Pensées racines    : ${thoughts.length}`);
  console.log(
    `   Réponses L1/L2     : ${replies.filter((r) => r.level === 1).length} / ${replies.filter((r) => r.level === 2).length}`
  );
  console.log(`   Commentaires       : ${comments.length}`);
  console.log(`   Citations partagées: ${quotes.length}`);
  console.log(`   Notes de marge     : ${notes.length}`);
  console.log(`\n⏱️  ${((Date.now() - t0) / 1000) | 0}s — ${requestCount} requêtes Gemini`);
}

main().catch((e) => {
  console.error('\n❌ Erreur génération :', e.message);
  process.exit(1);
});
