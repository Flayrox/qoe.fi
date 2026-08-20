// =====================================================================
// 🔧 Réparation : Publications personnelles manquantes
// =====================================================================
// Après un seed-large, seuls les creators avaient une publication PERSONAL,
// alors que des readers possèdent des pensées publiées. Leur profil
// /username était donc irrésolvable (404) car GetPublicationBySlugOrSubdomain
// part de la table Publication.
//
// Ce script crée une publication PERSONAL pour chaque User sans
// publication (parité prod : chaque compte signé en a une), avec un slug
// unique `carnets-{username}` et subdomain = username, puis relie le User.
//
// Usage : pnpm --filter @qoe/db tsx prisma/repair-missing-publications.ts
// =====================================================================

import { PrismaClient, PublicationType } from '@prisma/client';

const prisma = new PrismaClient();

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || `pub-${Date.now().toString(36)}`
  );
}

async function main() {
  const users = await prisma.user.findMany({
    where: { publicationId: null },
    select: {
      id: true,
      username: true,
      name: true,
      email: true,
      logoUrl: true,
      isCertified: true,
      createdAt: true,
    },
  });

  console.log(`🔍 ${users.length} utilisateurs sans publication.`);

  // Slugs existants (pour éviter toute collision).
  const existing = await prisma.publication.findMany({
    select: { slug: true, subdomain: true },
  });
  const usedSlugs = new Set<string>();
  const usedSubdomains = new Set<string>();
  for (const p of existing) {
    if (p.slug) usedSlugs.add(p.slug.toLowerCase());
    if (p.subdomain) usedSubdomains.add(p.subdomain.toLowerCase());
  }

  let created = 0;
  let skipped = 0;

  for (const u of users) {
    const baseSlug = `carnets-${slugify(u.username || u.name || u.email.split('@')[0])}`;
    let slug = baseSlug;
    let i = 1;
    while (usedSlugs.has(slug.toLowerCase())) {
      slug = `${baseSlug}-${i++}`;
    }
    usedSlugs.add(slug.toLowerCase());

    const subdomain = u.username || null;
    if (subdomain && usedSubdomains.has(subdomain.toLowerCase())) {
      console.warn(`  ⚠️  Subdomain déjà pris pour ${u.username} — publication sans subdomain.`);
    } else if (subdomain) {
      usedSubdomains.add(subdomain.toLowerCase());
    }

    try {
      const pub = await prisma.publication.create({
        data: {
          type: PublicationType.PERSONAL,
          name: u.name || u.username || 'Créateur',
          slug,
          bio: null,
          logoUrl: u.logoUrl ?? null,
          subdomain,
          customDomain: null,
          heroText: null,
          headerImageUrl: null,
          isCertified: u.isCertified,
          themeMode: 'system',
          layoutStyle: 'minimal',
          allowIndexing: true,
          allowPublicAnnotations: true,
          allowComments: true,
          createdAt: u.createdAt,
          updatedAt: new Date(),
          user: { connect: { id: u.id } },
        },
      });
      await prisma.user.update({
        where: { id: u.id },
        data: { publicationId: pub.id },
      });
      created++;
      if (created % 50 === 0) console.log(`  ✓ ${created} publications créées...`);
    } catch (err) {
      skipped++;
      console.warn(`  ❌ Échec pour ${u.username} (${u.id}): ${(err as Error).message}`);
    }
  }

  console.log(`\n✅ Terminé : ${created} publications créées, ${skipped} échec(s).`);
}

main()
  .catch((e) => {
    console.error('❌ Erreur :', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
