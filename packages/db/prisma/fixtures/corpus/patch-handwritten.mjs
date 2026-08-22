#!/usr/bin/env node
// Fusionne les articles rédigés à la main dans articles.jsonl (par clé).
import fs from 'node:fs';
import path from 'node:path';

const DIR = 'packages/db/prisma/fixtures/corpus';
const CORPUS = path.join(DIR, 'articles.jsonl');

const handwritten = {};
for (const f of fs.readdirSync(path.join(DIR, 'handwritten')).sort()) {
  Object.assign(
    handwritten,
    JSON.parse(fs.readFileSync(path.join(DIR, 'handwritten', f), 'utf-8'))
  );
}

const all = fs
  .readFileSync(CORPUS, 'utf-8')
  .split('\n')
  .filter(Boolean)
  .map((l) => JSON.parse(l));
let patched = 0,
  skipped = 0;
for (const a of all) {
  const content = handwritten[a.key];
  if (!content) continue;
  if (a.contentHtml.length >= 4500) {
    skipped++;
    continue;
  }
  a.title = content.title;
  a.slug = content.slug;
  a.theme = content.theme;
  a.keyQuote = content.keyQuote;
  a.contentHtml = content.contentHtml;
  if (a.isPremium && !a.contentHtml.includes('<!--paywall-->')) {
    const parts = a.contentHtml.split('</p>');
    a.contentHtml =
      parts.slice(0, 2).join('</p>') + '</p><!--paywall-->' + parts.slice(2).join('</p>');
  }
  patched++;
}
fs.writeFileSync(CORPUS, all.map((x) => JSON.stringify(x)).join('\n') + '\n');
console.log(`${patched} articles complétés à la main, ${skipped} déjà enrichis ignorés.`);

const lens = all.map((a) => a.contentHtml.length).sort((x, y) => x - y);
const remaining = all.filter((a) => a.contentHtml.length < 4500).map((a) => a.key);
console.log(
  `Corpus final : ${all.length} articles, min/méd/max = ${lens[0]}/${lens[Math.floor(lens.length / 2)]}/${lens[lens.length - 1]}`
);
console.log(
  remaining.length === 0
    ? '✅ Tous les articles sont complets.'
    : `⚠️ Restants courts : ${remaining.join(', ')}`
);
