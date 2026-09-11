// =====================================================================
// 🔒 Garde-fou zéro-fuite du paywall (build-breaking)
// =====================================================================
// Ce test est un GARDE-FOU STATIQUE + RUNTIME. Il échoue (donc casse la CI)
// dès qu'un article premium peut laisser fuiter son passage réservé dans :
//   • le HTML public,
//   • les métadonnées (SEO / OpenGraph / Twitter / JSON-LD),
//   • les extraits rendus (cartes, teasers),
//   • les sorties API publiques (slug seul, feed, hydrate, recherche, tenant).
//
// Principe : le passage au-delà du marqueur de paywall ne doit JAMAIS être
// transmis, et toute description/extrait public doit passer par les helpers
// `buildPublicExcerpt` / `buildPublicDescription` (jamais `article.content`
// brut). Toute régression fait échouer ce fichier avec un message explicite.
// =====================================================================

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ContentVisibility } from '@qoe/config';
import {
  ANONYMOUS_ENTITLEMENTS,
  buildPublicDescription,
  buildPublicExcerpt,
  sliceContentAtPaywall,
} from '../paywall';

const HERE = path.dirname(fileURLToPath(import.meta.url));

// ─── Sentinelle : texte qui ne doit JAMAIS sortir d'un article verrouillé ──
const SECRET = 'SECRET-RESERVE-AUX-ABONNES-qoe-2027';
const GATED_HTML = [
  '<h2>Introduction</h2>',
  '<p>Teaser public, offert à tous les visiteurs.</p>',
  '<!--members-only-->',
  `<p>${SECRET} : le cœur de l'enquête, réservé aux abonnés.</p>`,
].join('');

/** Remonte jusqu'à la racine du monorepo (pnpm-workspace.yaml). */
function repoRoot(): string {
  let dir = HERE;
  for (let i = 0; i < 12; i++) {
    if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('racine du monorepo introuvable depuis ' + HERE);
}

const ROOT = repoRoot();

function read(relPath: string): string {
  const abs = path.join(ROOT, relPath);
  if (!fs.existsSync(abs)) {
    throw new Error(`fichier gardé absent: ${relPath}`);
  }
  return fs.readFileSync(abs, 'utf8');
}

/** Parcourt apps/ et packages/ (hors build, tests et E2E). */
function walkSources(): string[] {
  const out: string[] = [];
  const skip = new Set(['node_modules', '.next', 'dist', '.turbo', '__tests__', 'e2e', 'coverage']);
  const visit = (dir: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || skip.has(entry.name)) continue;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(abs);
      else if (/\.tsx?$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name)) {
        out.push(path.relative(ROOT, abs));
      }
    }
  };
  for (const top of ['apps', 'packages']) visit(path.join(ROOT, top));
  return out;
}

// Extrait la fenêtre d'une fonction/méthode : de `marker` jusqu'au prochain
// `needle` (ou la fin du fichier). Fenêtre large mais bornée.
function windowFrom(source: string, marker: string, needle: string): string | null {
  const start = source.indexOf(marker);
  if (start === -1) return null;
  const end = source.indexOf(needle, start + marker.length);
  return source.slice(start, end === -1 ? source.length : end);
}

describe('🔒 Paywall — helpers zéro-fuite', () => {
  it('sliceContentAtPaywall coupe au marqueur et ne laisse jamais passer le passage réservé', () => {
    const cut = sliceContentAtPaywall(
      GATED_HTML,
      ANONYMOUS_ENTITLEMENTS,
      ContentVisibility.PAID_SUBSCRIBERS
    );
    expect(cut.isTruncated).toBe(true);
    expect(cut.accessGranted).toBe(false);
    expect(cut.content).toContain('Teaser public');
    expect(cut.content).not.toContain(SECRET);
    expect(cut.content).not.toContain('members-only');
  });

  it("buildPublicExcerpt dérive une description d'un article verrouillé sans jamais y inclure le contenu réservé", () => {
    const excerpt = buildPublicExcerpt(GATED_HTML, ContentVisibility.PAID_SUBSCRIBERS, null, 200);
    expect(excerpt).toBeTruthy();
    expect(excerpt).toContain('Teaser public');
    expect(excerpt).not.toContain(SECRET);
  });

  it('buildPublicExcerpt sur un article public conserve le contenu', () => {
    const excerpt = buildPublicExcerpt('<p>Tout public ici.</p>', ContentVisibility.PUBLIC);
    expect(excerpt).toBe('Tout public ici.');
  });

  it('buildPublicDescription retire le HTML et borne la longueur', () => {
    const desc = buildPublicDescription('<p>Bonjour <strong>le monde</strong>.</p>', 10);
    expect(desc).toBe('Bonjour le');
  });
});

describe('🔒 Métadonnées & JSON-LD publics — garde-fou statique', () => {
  // Tout fichier qui produit des métadonnées publiques À PARTIR DU CONTENU d'un
  // article doit passer par les helpers, jamais par du contenu brut.
  const usesArticleContent = /article\??\.content/;
  const safeHelpers = /buildPublicExcerpt\(|buildPublicDescription\(/;
  // Dérivations directes du contenu brut (le motif de la fuite historique :
  // `article.content ? article.content.replace(...).slice(0, 160)`).
  const rawContentDerivation =
    /article\.content\s*\.\s*(?:replace|slice|substring)\s*\(|article\.content\s*\?[\s\S]{0,40}?\.\s*(?:replace|slice|substring)\s*\(/;

  const sources = walkSources();

  it('aucune description publique n’est dérivée du contenu brut d’un article', () => {
    const violations: string[] = [];

    for (const relPath of sources) {
      const source = fs.readFileSync(path.join(ROOT, relPath), 'utf8');

      // 1. Métadonnées : generateMetadata (title/description/openGraph/twitter).
      const metadataWindow = windowFrom(source, 'generateMetadata', '\nexport ');
      if (metadataWindow && usesArticleContent.test(metadataWindow)) {
        if (!safeHelpers.test(metadataWindow)) {
          violations.push(
            `${relPath}: generateMetadata manipule le contenu d'article sans buildPublicExcerpt/buildPublicDescription`
          );
        }
        if (rawContentDerivation.test(metadataWindow)) {
          violations.push(
            `${relPath}: description dérivée de article.content brut dans generateMetadata`
          );
        }
      }

      // 2. JSON-LD structuré (buildArticleSchema).
      const jsonLdWindow = windowFrom(source, 'buildArticleSchema(', 'baseUrl');
      if (jsonLdWindow && usesArticleContent.test(jsonLdWindow)) {
        if (!safeHelpers.test(jsonLdWindow)) {
          violations.push(
            `${relPath}: JSON-LD manipule le contenu d'article sans helper zéro-fuite`
          );
        }
        if (rawContentDerivation.test(jsonLdWindow)) {
          violations.push(`${relPath}: JSON-LD dérivé de article.content brut`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('les routes article publiques gardées existent toujours (le garde-fou ne peut pas s’évaporer)', () => {
    for (const relPath of [
      'apps/tenants/src/app/tenant/[domain]/article/[slug]/page.tsx',
      'apps/tenants/src/app/tenant/[domain]/[categorySlug]/[articleSlug]/page.tsx',
      'apps/core/src/app/(reader)/article/[slug]/page.tsx',
    ]) {
      const source = read(relPath);
      expect(source, `${relPath} doit dériver du contenu tronqué`).toMatch(safeHelpers);
    }
  });
});

describe('🔒 Sorties API publiques — garde-fou backend', () => {
  it('le mode « slug seul » de GET /v1/articles/{slug} tronque le premium', () => {
    const source = read('apps/api/internal/modules/articles/service.go');
    const fn = windowFrom(source, 'func (s *Service) GetBySlugAny(', '\nfunc ');
    expect(fn, 'GetBySlugAny introuvable').toBeTruthy();
    expect(fn, 'GetBySlugAny doit appliquer SliceContentAtPaywall').toContain(
      'SliceContentAtPaywall'
    );
    expect(fn, 'GetBySlugAny ne doit plus forcer AccessGranted: true').not.toMatch(
      /AccessGranted:\s*true/
    );
  });

  it('les cartes et hydratations du feed sont tronquées au paywall', () => {
    const service = read('apps/api/internal/modules/feed/service.go');
    expect(service, 'buildFeedArticle doit tronquer le contenu').toMatch(
      /Content:\s*truncatePaywall\(/
    );
    const hydrate = read('apps/api/internal/modules/feed/hydrate.go');
    expect(hydrate, 'HydrateArticles doit tronquer le contenu').toContain('truncatePaywall(');
  });

  it('la recherche publique rédige le contenu premium des hits', () => {
    const source = read('apps/api/internal/modules/search/handler.go');
    expect(source).toContain('redactPremiumHitContents(');
    expect(source).toMatch(/if pubID == "" \{\s*redactPremiumHitContents\(hits\)/);
  });

  it('le bundle tenant by-domain tronque le contenu pour un lecteur non autorisé', () => {
    const source = read('apps/api/internal/modules/publications/service.go');
    expect(source, 'Service.Article doit tronquer le bundle').toContain(
      'articles.SliceContentAtPaywall'
    );
    expect(source, 'publishedArticles doit tronquer les extraits de cartes').toMatch(
      /a\.Content = articles\.SliceContentAtPaywall\(/
    );
  });
});
