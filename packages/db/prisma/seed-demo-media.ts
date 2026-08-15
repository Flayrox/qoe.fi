// =====================================================================
// 🧪 seed-demo-media.ts — Démo : Média + article publié pour le feed
// =====================================================================
// 📖 Crée (idempotent, upsert par slug) :
//    1. Un Média : Publication type MEDIA + Media + membre owner
//    2. Un Article publié rattaché à la publication du Média
//    → visible dans le feed « Recommandé » (et « Découvrir » si certifié)
//
// 🚀 Usage (depuis la racine du monorepo) :
//    pnpm exec tsx --env-file=.env packages/db/prisma/seed-demo-media.ts
//
// 🗑️ Nettoyage (supprime article + media + publication) :
//    DELETE FROM "Article" WHERE slug = 'premier-article-media-demo';
//    DELETE FROM "Media"    WHERE "publicationId" = (SELECT id FROM "Publication" WHERE slug = 'media-demo');
//    DELETE FROM "Publication" WHERE slug = 'media-demo';
// =====================================================================

import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

// Réutilise le compte démo du seed principal (FK satisfaite), upsert par email unique
const DEMO_USER_EMAIL = 'admin@qoe.fi';

const MEDIA_SLUG = 'media-demo';
const ARTICLE_SLUG = 'premier-article-media-demo';

async function main() {
  // 0. Ensure l'utilisateur démo existe (contrainte FK authorId)
  const demoUser = await prisma.user.upsert({
    where: { email: DEMO_USER_EMAIL },
    update: {},
    create: {
      id: randomUUID(),
      email: DEMO_USER_EMAIL,
      name: 'Super Admin',
      role: 'superadmin',
    },
  });
  const DEMO_USER_ID = demoUser.id;

  // 1. Publication du Média (type MEDIA) — idempotent par slug
  const publication = await prisma.publication.upsert({
    where: { slug: MEDIA_SLUG },
    update: {},
    create: {
      type: 'MEDIA',
      name: 'La Rédaction Démo',
      slug: MEDIA_SLUG,
      subdomain: MEDIA_SLUG,
      bio: 'Un média de démonstration pour tester le rendu des articles média sur le feed.',
      logoUrl: 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=200&q=80',
      heroText: 'Le journal pilote de qoe.fi — écrit par des humains, lu sans bruit.',
      accentColor: '#EE4B2B',
      isCertified: true, // → visible aussi dans l'onglet « Découvrir »
    },
  });

  // 2. Entité Media + membre owner (convention dashboard)
  const media = await prisma.media.upsert({
    where: { publicationId: publication.id },
    update: {},
    create: {
      publicationId: publication.id,
      members: {
        create: {
          userId: DEMO_USER_ID,
          role: 'owner',
          status: 'active',
        },
      },
    },
  });

  // 3. Catégorie du média (facultatif, affichée en pied de carte)
  const category = await prisma.category.upsert({
    where: { slug_publicationId: { slug: 'depeches', publicationId: publication.id } },
    update: {},
    create: {
      name: 'Dépêches',
      slug: 'depeches',
      publicationId: publication.id,
    },
  });

  // 4. Article publié sous la publication du Média
  const article = await prisma.article.upsert({
    where: { publicationId_slug: { publicationId: publication.id, slug: ARTICLE_SLUG } },
    update: {},
    create: {
      title:
        "Une rédaction pilote s'installe sur qoe.fi — premier article d'un média de démonstration",
      slug: ARTICLE_SLUG,
      content: `
<p>Ceci est un <strong>article de démonstration</strong> publié par un Média créé directement en base de données, pour vérifier le rendu d'une publication <em>MEDIA</em> sur le feed.</p>
<p>La carte du feed affiche le logo carré du média, son nom, la mention « Par {auteur} », ainsi que la catégorie et le temps de lecture en pied de carte.</p>
<blockquote>« La souveraineté éditoriale commence par la maîtrise de son propre fil. »</blockquote>
<p>Cet article est volontairement marqué <em>isEditorPick</em> pour apparaître en tête du flux « Recommandé » et dans le widget « À la une ».</p>
`,
      published: true,
      status: 'PUBLISHED',
      isEditorPick: true, // booste le tri du feed « Recommandé » + widget « À la une »
      readingTime: 4,
      semanticTags: ['demo', 'media', 'qoe'],
      publicationId: publication.id,
      authorId: DEMO_USER_ID,
      categoryId: category.id,
    },
  });

  console.log('✅ Média de démonstration prêt !');
  console.log('───────────────────────────────────────────────');
  console.log(`📰 Média      : ${publication.name} (@${publication.slug})`);
  console.log(`   Media ID   : ${media.id}`);
  console.log(`   Publication: ${publication.id}`);
  console.log(`📄 Article    : "${article.title}"`);
  console.log(`   Article ID : ${article.id}`);
  console.log(`   Slug       : ${article.slug}`);
  console.log('───────────────────────────────────────────────');
  console.log('👉 Recharge localhost:3010 → onglet « Recommandé » (ou « Découvrir »).');
  console.log('🗑️ Nettoyage : voir l’en-tête du script (3 DELETE).');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
