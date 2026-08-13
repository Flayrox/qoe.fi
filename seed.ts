import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const userId = '12345678-1234-1234-1234-123456789012';

  // 0. Ensure user exists to satisfy foreign key constraints
  await prisma.user.upsert({
    where: { id: userId },
    update: {},
    create: {
      id: userId,
      email: 'admin@qoe.fi',
      name: 'Super Admin',
      role: 'superadmin',
    },
  });

  // 1. Create Navigation
  await prisma.navigationItem.createMany({
    data: [
      { label: 'Accueil', url: '/', order: 1, userId },
      { label: 'Politique', url: '/category/politique', order: 2, userId },
      { label: 'Écologie', url: '/category/ecologie', order: 3, userId },
      { label: 'Notre Équipe', url: '/about', order: 4, userId },
    ],
    skipDuplicates: true,
  });

  // 2. Create Socials
  await prisma.socialLink.createMany({
    data: [
      { platform: 'x', url: 'https://twitter.com/mediamilitant', order: 1, userId },
      {
        platform: 'bluesky',
        url: 'https://bsky.app/profile/mediamilitant.bsky.social',
        order: 2,
        userId,
      },
      { platform: 'youtube', url: 'https://youtube.com/mediamilitant', order: 3, userId },
      { platform: 'mastodon', url: 'https://mastodon.social/@mediamilitant', order: 4, userId },
    ],
    skipDuplicates: true,
  });

  // 3. Create Categories
  const cat = await prisma.category.upsert({
    where: { slug_userId: { slug: 'politique', userId } },
    update: {},
    create: {
      name: 'Politique',
      slug: 'politique',
      userId,
    },
  });

  await prisma.category.upsert({
    where: { slug_userId: { slug: 'international', userId } },
    update: {},
    create: {
      name: 'International',
      slug: 'international',
      parentId: cat.id,
      userId,
    },
  });

  // 4. Create default SystemConfigs for Landing Page
  const defaultConfigs = [
    {
      key: 'hero_pitch_read',
      value: 'Une lecture monastique, libérée du bruit.',
      description: "Texte d'introduction pour le mode lecture (Je veux lire)",
    },
    {
      key: 'hero_pitch_publish',
      value: 'Devenez le souverain de votre propre média.',
      description: "Texte d'introduction pour le mode publication (Je veux publier)",
    },
    {
      key: 'creators_title',
      value: 'Ils écrivent sur qoe.fi',
      description: 'Titre de la section des créateurs de confiance',
    },
    {
      key: 'creators_tagline',
      value: 'Des voix libres et indépendantes',
      description: 'Tagline de la section des créateurs de confiance',
    },
    {
      key: 'format_title',
      value: 'Cinq Formats de Récits',
      description: 'Titre de la section de prévisualisation des formats',
    },
    {
      key: 'format_tagline',
      value: 'Au-delà du simple mur de texte',
      description: 'Tagline de la section de prévisualisation des formats',
    },
    {
      key: 'featured_title',
      value: 'Écrits Majeurs',
      description: 'Titre de la section des publications phares',
    },
    {
      key: 'featured_tagline',
      value: 'Sélection Écologique et Politique',
      description: 'Tagline de la section des publications phares',
    },
    {
      key: 'comparison_title',
      value: 'Souveraineté ou Intermédiation ?',
      description: 'Titre du tableau comparatif avec Substack',
    },
    {
      key: 'comparison_tagline',
      value: "Pourquoi qoe.fi redéfinit l'édition indépendante",
      description: 'Tagline du tableau comparatif avec Substack',
    },
    {
      key: 'preview_title',
      value: "L'architecture du silence",
      description: "Titre de l'aperçu du produit (ProductPreview)",
    },
    {
      key: 'preview_content',
      value:
        "Dans un monde saturé de stimuli, la lecture souveraine n'est pas un acte de consommation, mais une forme de résistance. C'est ici, dans ce Sanctuaire Elfique, que l'esprit retrouve sa trajectoire originelle, loin des algorithmes de capture de l'attention.",
      description: "Texte principal de l'aperçu du produit (ProductPreview)",
    },
    {
      key: 'cta_title',
      value: 'Prêt à habiter votre esprit ?',
      description: "Titre de l'appel à l'action final (CTA)",
    },
    {
      key: 'cta_description',
      value:
        'Rejoignez un réseau où la qualité prime sur la quantité, et où votre attention est le bien le plus précieux.',
      description: "Description de l'appel à l'action final (CTA)",
    },
    {
      key: 'feature_wallet_desc',
      value:
        'Un portefeuille virtuel intégré permettant de soutenir vos auteurs préférés via WalletTransaction sans intermédiaire.',
      description: 'Description de la fonctionnalité de micro-portefeuille dans la grille Bento',
    },
    {
      key: 'feature_vector_desc',
      value:
        'Grâce à pgvector, notre IA brise votre bulle idéologique en injectant des perspectives radicalement différentes.',
      description: 'Description de la fonctionnalité de sérendipité IA dans la grille Bento',
    },
    {
      key: 'feature_monastic_desc',
      value:
        'Un carnet personnel numérique où vos Highlights deviennent la matière première de votre propre pensée.',
      description: 'Description de la fonctionnalité de carnet personnel dans la grille Bento',
    },
    {
      key: 'feature_sovereign_desc',
      value: 'Aucun algorithme caché. Vous contrôlez chaque octet de votre expérience de lecture.',
      description: 'Description de la souveraineté dans la grille Bento',
    },
  ];

  for (const cfg of defaultConfigs) {
    await prisma.systemConfig.upsert({
      where: { key: cfg.key },
      update: {},
      create: cfg,
    });
  }

  console.log('Seed reussi pour les données dynamiques');
}

main()
  .catch((e) => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
