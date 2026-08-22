// =====================================================================
// 📊 Seed ReadingSessions — Historique 14j perso réaliste pour DB test
// =====================================================================
// Remplit ReadingSession (dwell, scroll, source) pour que /history et
// ActivitySparkline soient pleins sans lire manuellement.
// - 14j, 3-8 lectures / user (feed 45% / subdomain 35% / direct 20%)
// - dwell 15-420s, scroll 15-100%, status dérivé (BOUNCE/SKIM/PARTIAL/COMPLETE)
// - ensure chaque article a ≥5 lectures (pour stats plein par auteur)
// - déterministe via mulberry32 (même seed → même graphe)
// =====================================================================

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(0x8f3b_2a1c);

function randomInt(min: number, max: number) {
  return Math.floor(rand() * (max - min + 1)) + min;
}

function pickWeighted<T>(items: Array<{ w: number; v: T }>): T {
  const total = items.reduce((s, i) => s + i.w, 0);
  let r = rand() * total;
  for (const it of items) {
    r -= it.w;
    if (r <= 0) return it.v;
  }
  return items[items.length - 1].v;
}

function readingStatus(dwell: number, scroll: number, readingTimeMinutes: number): string {
  const expected = readingTimeMinutes * 60;
  const minTime = expected * 0.35;
  if (dwell < 10 && scroll < 25) return 'BOUNCE';
  if (scroll >= 80 && dwell < minTime) return 'SKIM';
  if (scroll >= 85 && dwell >= minTime) return 'READ_COMPLETE';
  if (scroll >= 25) return 'READ_PARTIAL';
  return 'BOUNCE';
}

export async function seedReadingSessions() {
  console.log('\n📖 [ReadingSessions] Seed historique 14j perso (feed/subdomain/direct)...');

  const since = new Date(Date.now() - 14 * 24 * 3600 * 1000);

  // Purge idempotent 14j
  const del = await prisma.readingSession.deleteMany({ where: { createdAt: { gte: since } } });
  console.log(`  🧹 Purge ${del.count} sessions existantes (14j)`);

  const [users, articles] = await Promise.all([
    prisma.user.findMany({ select: { id: true } }),
    prisma.article.findMany({
      where: { published: true },
      select: { id: true, readingTime: true },
    }),
  ]);

  if (articles.length === 0) {
    console.warn('  ⚠️ Aucun article publié — seed annulé');
    return;
  }

  const articleMap = new Map(articles.map((a) => [a.id, a.readingTime || 5]));
  const sources = [
    { w: 45, v: 'feed' },
    { w: 35, v: 'subdomain' },
    { w: 12, v: 'public_profile' },
    { w: 8, v: 'direct' },
  ] as const;

  const sessions: Array<{
    articleId: string;
    userId: string;
    source: string;
    status: string;
    scrollDepth: number;
    dwellSeconds: number;
    readingTimeMinutes: number;
    createdAt: Date;
  }> = [];

  // 1. Garantir chaque article a ≥5 lectures (pour stats plein par auteur)
  for (const art of articles) {
    const needed = randomInt(5, 10);
    for (let i = 0; i < needed; i++) {
      const user = users[randomInt(0, users.length - 1)];
      const rt = articleMap.get(art.id) || 5;
      // dwell réaliste : BOUNCE 5-15s, SKIM 20-80s, PARTIAL 60-250s, COMPLETE 150-500s
      const roll = rand();
      let dwell: number, scroll: number;
      if (roll < 0.12) {
        dwell = randomInt(5, 15);
        scroll = randomInt(5, 24);
      } else if (roll < 0.28) {
        dwell = randomInt(20, 80);
        scroll = randomInt(80, 100);
      } else if (roll < 0.65) {
        dwell = randomInt(60, 250);
        scroll = randomInt(30, 84);
      } else {
        dwell = randomInt(150, 500);
        scroll = randomInt(85, 100);
      }
      const status = readingStatus(dwell, scroll, rt);
      const source = pickWeighted([...sources]);
      const daysAgo = randomInt(0, 13);
      const createdAt = new Date(Date.now() - daysAgo * 86400000 - randomInt(0, 86400000));
      // Pic horaire 9-12 / 19-22 comme Umami
      const hourRoll = rand();
      let hour: number;
      if (hourRoll < 0.35) hour = randomInt(9, 12);
      else if (hourRoll < 0.7) hour = randomInt(19, 22);
      else hour = randomInt(0, 23);
      createdAt.setHours(hour, randomInt(0, 59), randomInt(0, 59), 0);

      sessions.push({
        articleId: art.id,
        userId: user.id,
        source,
        status,
        scrollDepth: scroll,
        dwellSeconds: dwell,
        readingTimeMinutes: rt,
        createdAt,
      });
    }
  }

  // 2. Assurer chaque user a 3-8 lectures (historique perso)
  const perUserCounts = new Map<string, number>();
  for (const s of sessions) perUserCounts.set(s.userId, (perUserCounts.get(s.userId) || 0) + 1);
  for (const u of users) {
    const have = perUserCounts.get(u.id) || 0;
    const need = Math.max(0, randomInt(3, 8) - have);
    for (let i = 0; i < need; i++) {
      const art = articles[randomInt(0, articles.length - 1)];
      const rt = articleMap.get(art.id) || 5;
      const roll = rand();
      let dwell: number, scroll: number;
      if (roll < 0.12) {
        dwell = randomInt(5, 15);
        scroll = randomInt(5, 24);
      } else if (roll < 0.28) {
        dwell = randomInt(20, 80);
        scroll = randomInt(80, 100);
      } else if (roll < 0.65) {
        dwell = randomInt(60, 250);
        scroll = randomInt(30, 84);
      } else {
        dwell = randomInt(150, 500);
        scroll = randomInt(85, 100);
      }
      const status = readingStatus(dwell, scroll, rt);
      const source = pickWeighted([...sources]);
      const daysAgo = randomInt(0, 13);
      const createdAt = new Date(Date.now() - daysAgo * 86400000 - randomInt(0, 86400000));
      const hourRoll = rand();
      let hour: number;
      if (hourRoll < 0.35) hour = randomInt(9, 12);
      else if (hourRoll < 0.7) hour = randomInt(19, 22);
      else hour = randomInt(0, 23);
      createdAt.setHours(hour, randomInt(0, 59), randomInt(0, 59), 0);

      sessions.push({
        articleId: art.id,
        userId: u.id,
        source,
        status,
        scrollDepth: scroll,
        dwellSeconds: dwell,
        readingTimeMinutes: rt,
        createdAt,
      });
    }
  }

  console.log(
    `  📦 Génération : ${sessions.length} sessions (articles ${articles.length} ×5-10 + users ${users.length} ×3-8)`
  );

  // Insert par batches 200 (prisma createMany)
  let inserted = 0;
  for (let i = 0; i < sessions.length; i += 200) {
    const chunk = sessions.slice(i, i + 200);
    const res = await prisma.readingSession.createMany({ data: chunk, skipDuplicates: true });
    inserted += res.count;
    if ((i + 200) % 1000 === 0 || i + 200 >= sessions.length) {
      console.log(
        `  ├─ ✓ ${Math.min(i + 200, sessions.length)}/${sessions.length} sessions insérées`
      );
    }
  }

  const { _avg, _count } = await prisma.readingSession.aggregate({
    _avg: { dwellSeconds: true, scrollDepth: true },
    _count: { _all: true },
  });

  const bySource = await prisma.readingSession.groupBy({
    by: ['source'],
    _count: { _all: true },
  });

  const byStatus = await prisma.readingSession.groupBy({
    by: ['status'],
    _count: { _all: true },
  });

  console.log(`  ✅ Seed terminé : ${inserted}/${sessions.length} insérées`);
  console.log(
    `     Moyenne dwell ${Math.round(_avg.dwellSeconds || 0)}s, scroll ${Math.round(_avg.scrollDepth || 0)}%`
  );
  console.log(`     Sources:`, bySource.map((s) => `${s.source}:${s._count._all}`).join(' '));
  console.log(`     Status:`, byStatus.map((s) => `${s.status}:${s._count._all}`).join(' '));
  console.log(`     Total DB: ${_count._all}`);
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  seedReadingSessions()
    .catch((e) => {
      console.error('❌ seedReadingSessions failed', e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
