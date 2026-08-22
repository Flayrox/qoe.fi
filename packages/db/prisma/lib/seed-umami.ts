// =====================================================================
// 📊 Seed Umami — Génération de données réalistes 30j pour dev local
// =====================================================================
// Remplace les mocks hardcodés de packages/analytics/src/server.ts et
// apps/studio/.../actions.ts par de vrais page_view / session dans la
// DB Umami self-hosté (qoefi-dev-db:5433/umami).
//
// - 30 jours, ~40-80 sessions/jour (week-end -20%, tendance +15% récente)
// - Chaque session : 1-6 pageviews, url_path corrélé aux vrais articles
//   (60% /articles/<slug>, 20% /, 10% /@<username>, 5% /notifications etc.)
// - Device/browser/country réalistes (FR 70% …), referrer google/x/direct
// - Idempotent : DELETE website_event/session du website_id avant insert
// - Déterministe via PRNG seedé (même graphe à chaque reseed) pour tests
// =====================================================================

import { PrismaClient } from '@prisma/client';
import pg from 'pg';
import { randomUUID } from 'node:crypto';

const UMAMI_WEBSITE_ID =
  process.env.UMAMI_WEBSITE_ID ||
  process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID ||
  '4dbcd1ad-556f-429e-9038-cce60fdc8493';
const UMAMI_DATABASE_URL =
  process.env.UMAMI_DATABASE_URL || 'postgresql://postgres:wPwAMQTJwB1WTBXF@localhost:5433/umami';

// PRNG déterministe (mulberry32) — même seed → même données → snapshots stables
function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(0x51a3_9c0e); // seed fixe

function pickWeighted<T>(items: Array<{ w: number; v: T }>): T {
  const total = items.reduce((s, i) => s + i.w, 0);
  let r = rand() * total;
  for (const it of items) {
    r -= it.w;
    if (r <= 0) return it.v;
  }
  return items[items.length - 1].v;
}

function randomInt(min: number, max: number) {
  return Math.floor(rand() * (max - min + 1)) + min;
}

function randomDateInDay(base: Date): Date {
  // Pic 9-12h et 19-22h (2x plus probable)
  const hourRoll = rand();
  let hour: number;
  if (hourRoll < 0.35) hour = randomInt(9, 12);
  else if (hourRoll < 0.7) hour = randomInt(19, 22);
  else hour = randomInt(0, 23);
  const d = new Date(base);
  d.setHours(hour, randomInt(0, 59), randomInt(0, 59), randomInt(0, 999));
  return d;
}

export async function seedUmami(prismaApp: PrismaClient) {
  const umamiPool = new pg.Pool({ connectionString: UMAMI_DATABASE_URL });
  const websiteId = UMAMI_WEBSITE_ID;
  try {
    // Vérifie que le website existe
    const { rows: wRows } = await umamiPool.query(
      'SELECT website_id FROM website WHERE website_id = $1',
      [websiteId]
    );
    if (wRows.length === 0) {
      console.warn(
        `  ⚠️ Umami website ${websiteId} introuvable — seed annulé. Vérifie SELECT * FROM website;`
      );
      return;
    }
    console.log(
      `\n📊 [Umami] Seed réaliste 30j pour website ${websiteId} (${wRows[0].website_id})...`
    );

    // Collecte des vrais slugs / usernames pour url_path réalistes
    const articles = await prismaApp.article.findMany({
      where: { published: true },
      select: { slug: true, title: true },
    });
    const users = await prismaApp.user.findMany({
      select: { username: true },
      take: 100,
    });
    const articleSlugs = articles.map((a) => `/articles/${a.slug}`);
    const profilePaths = users.map((u) => `/@${u.username}`);
    // Fallback si DB vide
    if (articleSlugs.length === 0) articleSlugs.push('/articles/demo-article');

    // Purge idempotente : 30 derniers jours pour ce website
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000);
    console.log(`  🧹 Purge events/sessions depuis ${thirtyDaysAgo.toISOString().slice(0, 10)}...`);
    await umamiPool.query('DELETE FROM website_event WHERE website_id = $1 AND created_at >= $2', [
      websiteId,
      thirtyDaysAgo,
    ]);
    await umamiPool.query('DELETE FROM session WHERE website_id = $1 AND created_at >= $2', [
      websiteId,
      thirtyDaysAgo,
    ]);

    const browsers = [
      { w: 55, v: 'Chrome' },
      { w: 25, v: 'Safari' },
      { w: 12, v: 'Firefox' },
      { w: 8, v: 'Edge' },
    ];
    const devices = [
      { w: 60, v: 'desktop' },
      { w: 35, v: 'mobile' },
      { w: 5, v: 'tablet' },
    ];
    const osMap: Record<string, string[]> = {
      Chrome: ['Windows', 'macOS', 'Linux'],
      Safari: ['macOS', 'iOS'],
      Firefox: ['Windows', 'Linux', 'macOS'],
      Edge: ['Windows'],
    };
    const countries = [
      { w: 70, v: 'FR' },
      { w: 10, v: 'US' },
      { w: 8, v: 'BE' },
      { w: 7, v: 'CA' },
      { w: 5, v: 'CH' },
    ];
    const referrers = [
      { w: 30, v: 'direct' },
      { w: 25, v: 'google' },
      { w: 15, v: 'x.com' },
      { w: 10, v: 'substack.com' },
      { w: 10, v: 'qoe.fi' },
      { w: 10, v: 'qoe.fi' }, // double pour test feed/subdomain split
    ];
    const urlDist = [
      { w: 60, v: 'article' },
      { w: 20, v: 'home' },
      { w: 10, v: 'profile' },
      { w: 5, v: 'notifications' },
      { w: 5, v: 'other' },
    ];

    let totalSessions = 0;
    let totalEvents = 0;

    // Prépare insertions en batches
    const sessionRows: Array<{
      session_id: string;
      website_id: string;
      browser: string;
      os: string;
      device: string;
      country: string;
      created_at: Date;
    }> = [];
    const eventRows: Array<{
      event_id: string;
      website_id: string;
      session_id: string;
      visit_id: string;
      created_at: Date;
      url_path: string;
      referrer_domain: string;
      page_title: string;
      hostname: string;
      event_type: number;
    }> = [];

    for (let dayOffset = 30; dayOffset >= 0; dayOffset--) {
      const day = new Date();
      day.setHours(0, 0, 0, 0);
      day.setDate(day.getDate() - dayOffset);

      const isWeekend = day.getDay() === 0 || day.getDay() === 6;
      const recencyBoost = dayOffset < 7 ? 1.15 : 1.0; // +15% dernière semaine
      const baseSessions = randomInt(60, 90); // densifié top du top (was 40-70)
      const weekendFactor = isWeekend ? 0.8 : 1.0;
      const sessionsToday = Math.max(
        20,
        Math.round(baseSessions * weekendFactor * recencyBoost * (0.9 + rand() * 0.2))
      );

      for (let s = 0; s < sessionsToday; s++) {
        const sessionId = randomUUID();
        const visitId = randomUUID();
        const browser = pickWeighted(browsers);
        const device = pickWeighted(devices);
        const country = pickWeighted(countries);
        const osCandidates = osMap[browser] || ['Windows'];
        const os = osCandidates[randomInt(0, osCandidates.length - 1)];
        const sessionCreatedAt = randomDateInDay(day);

        sessionRows.push({
          session_id: sessionId,
          website_id: websiteId,
          browser,
          os,
          device,
          country,
          created_at: sessionCreatedAt,
        });

        // 2-7 pageviews par session, corrélés horairement (+ quelques secondes/minutes) — densifié
        const pageviews = randomInt(2, 7);
        // Biais : sessions direct ont moins de pages, google a plus
        let referral = pickWeighted(referrers);
        for (let p = 0; p < pageviews; p++) {
          const kind = pickWeighted(urlDist);
          let urlPath: string;
          if (kind === 'article') urlPath = articleSlugs[randomInt(0, articleSlugs.length - 1)];
          else if (kind === 'home') urlPath = rand() < 0.7 ? '/' : '/home';
          else if (kind === 'profile')
            urlPath = profilePaths[randomInt(0, profilePaths.length - 1)];
          else if (kind === 'notifications') urlPath = '/notifications';
          else urlPath = `/explore`;

          // léger jitter horaire intra-session (30s à 8min)
          const eventAt = new Date(sessionCreatedAt.getTime() + p * randomInt(30000, 480000));

          const pageTitleMap: Record<string, string> = {
            article: articles[randomInt(0, articles.length - 1)]?.title || 'Article',
            home: 'Qoe.fi — Lire',
            profile: 'Profil créateur',
            notifications: 'Notifications',
            other: 'Explorer',
          };

          eventRows.push({
            event_id: randomUUID(),
            website_id: websiteId,
            session_id: sessionId,
            visit_id: visitId,
            created_at: eventAt,
            url_path: urlPath,
            referrer_domain: referral === 'direct' ? '' : referral,
            page_title: pageTitleMap[kind] || 'Qoe.fi',
            hostname: 'localhost',
            event_type: 1,
          });

          // Après la première page, le referrer devient interne (localhost) pour simuler navigation interne
          if (p === 0) referral = 'qoe.fi'; // pages suivantes internes
        }
        totalSessions++;
        totalEvents += pageviews;
      }
    }

    console.log(`  📦 Génération : ${totalSessions} sessions, ${totalEvents} pageviews...`);

    // Insertion session : boucle individuelle pour clarté (pas de perf critique : ~1500 rows)
    for (const r of sessionRows) {
      await umamiPool.query(
        `INSERT INTO session (session_id, website_id, browser, os, device, country, created_at, language, screen)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING`,
        [
          r.session_id,
          r.website_id,
          r.browser,
          r.os,
          r.device,
          r.country,
          r.created_at,
          'fr-FR',
          '1920x1080',
        ]
      );
    }
    console.log(`  ✓ ${sessionRows.length} sessions insérées`);

    for (const e of eventRows) {
      await umamiPool.query(
        `INSERT INTO website_event (event_id, website_id, session_id, visit_id, created_at, url_path, referrer_domain, page_title, hostname, event_type)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT DO NOTHING`,
        [
          e.event_id,
          e.website_id,
          e.session_id,
          e.visit_id,
          e.created_at,
          e.url_path,
          e.referrer_domain,
          e.page_title,
          e.hostname,
          e.event_type,
        ]
      );
    }
    console.log(`  ✓ ${eventRows.length} website_events insérés`);

    // Vérif
    const { rows: check } = await umamiPool.query(
      `SELECT count(*) as sessions, (SELECT count(*) FROM website_event WHERE website_id=$1) as events FROM session WHERE website_id=$1`,
      [websiteId]
    );
    console.log(`  ✅ Umami seed terminé :`, check[0]);
  } finally {
    await umamiPool.end();
  }
}

// CLI direct : `pnpm --filter @qoe/db exec tsx lib/seed-umami.ts`
if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  const prisma = new PrismaClient();
  seedUmami(prisma)
    .catch((e) => {
      console.error('❌ seedUmami failed', e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
