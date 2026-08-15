import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const userId = '12345678-1234-1234-1234-123456789012';
  const publicationId = 'pub_12345678123412341234123456789012';

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

  // 0b. Publication personnelle (identité tenant)
  await prisma.publication.upsert({
    where: { id: publicationId },
    update: {
      name: 'Super Admin',
      slug: 'admin',
      subdomain: 'admin',
      user: { connect: { id: userId } },
    },
    create: {
      id: publicationId,
      type: 'PERSONAL',
      name: 'Super Admin',
      slug: 'admin',
      subdomain: 'admin',
      user: { connect: { id: userId } },
    },
  });

  await prisma.user.update({
    where: { id: userId },
    data: { publicationId },
  });

  // Publication certifiée → les articles seedés apparaissent aussi dans
  // Discover et les suggestions de créateurs (feed).
  await prisma.publication.update({
    where: { id: publicationId },
    data: { isCertified: true },
  });

  // 0d. Média complet (parcours média : publication MEDIA + membres + article)
  // ── Le feed Discover (Explorer) montre les publications certifiées ; un
  //    média certifié avec son équipe et son article est requis par l'e2e.
  const mediaUsers = [
    {
      id: '20000000-0000-0000-0000-000000000001',
      email: 'directrice@media-clair.fr',
      name: 'Camille Roux',
      username: 'camilleroux',
      role: 'creator',
    },
    {
      id: '20000000-0000-0000-0000-000000000002',
      email: 'redac-chef@media-clair.fr',
      name: 'Yann Delcourt',
      username: 'yanndelcourt',
      role: 'creator',
    },
    {
      id: '20000000-0000-0000-0000-000000000003',
      email: 'journaliste@media-clair.fr',
      name: 'Salomé Petit',
      username: 'salomepetit',
      role: 'creator',
    },
    {
      id: '20000000-0000-0000-0000-000000000004',
      email: 'lectrice@media-clair.fr',
      name: 'Inès Bernard',
      username: 'inesbernard',
      role: 'user',
    },
  ];

  for (const mu of mediaUsers) {
    await prisma.user.upsert({
      where: { id: mu.id },
      update: { email: mu.email, name: mu.name, role: mu.role },
      create: mu,
    });
  }

  const mediaPublicationId = 'pub_media_00000000000000000001';
  await prisma.publication.upsert({
    where: { id: mediaPublicationId },
    update: {
      type: 'MEDIA',
      name: 'Le Média Clair',
      slug: 'media-clair',
      subdomain: 'media-clair',
      bio: 'Un média local indépendant, financé par ses lecteurs.',
      isCertified: true,
    },
    create: {
      id: mediaPublicationId,
      type: 'MEDIA',
      name: 'Le Média Clair',
      slug: 'media-clair',
      subdomain: 'media-clair',
      bio: 'Un média local indépendant, financé par ses lecteurs.',
      isCertified: true,
    },
  });

  await prisma.media.upsert({
    where: { publicationId: mediaPublicationId },
    update: {},
    create: {
      id: 'media_00000000000000000001',
      publicationId: mediaPublicationId,
    },
  });

  const mediaMembers = [
    { userId: mediaUsers[0].id, role: 'owner', permissions: ['manage_members', 'publish_any'] },
    { userId: mediaUsers[1].id, role: 'editor', permissions: ['publish_any'] },
    { userId: mediaUsers[2].id, role: 'writer', permissions: [] },
    { userId: mediaUsers[3].id, role: 'viewer', permissions: [] },
  ];

  for (const m of mediaMembers) {
    await prisma.mediaMember.upsert({
      where: { mediaId_userId: { mediaId: 'media_00000000000000000001', userId: m.userId } },
      update: { role: m.role, permissions: m.permissions, status: 'active' },
      create: {
        mediaId: 'media_00000000000000000001',
        userId: m.userId,
        role: m.role,
        permissions: m.permissions,
        status: 'active',
      },
    });
  }

  await prisma.article.upsert({
    where: {
      publicationId_slug: { publicationId: mediaPublicationId, slug: 'enquete-locale-pouvoir' },
    },
    update: { title: 'Enquête : qui détient vraiment le pouvoir local ?', published: true },
    create: {
      title: 'Enquête : qui détient vraiment le pouvoir local ?',
      slug: 'enquete-locale-pouvoir',
      content:
        "<p>Six mois d'investigation sur les réseaux d'influence de notre région.</p><p>Un travail collectif de la rédaction, publié avec le soutien de nos abonnés.</p>",
      published: true,
      status: 'PUBLISHED',
      visibility: 'PUBLIC',
      readingTime: 7,
      authorId: mediaUsers[2].id,
      publicationId: mediaPublicationId,
    },
  });

  // 0e. Article Premium (paywall) — requis par l'e2e parcours lecture :
  //     le drawer coupe au marqueur et affiche le volet « réservé aux membres ».
  await prisma.article.upsert({
    where: { publicationId_slug: { publicationId, slug: 'essai-premium-souverainete' } },
    update: { title: "L'économie de l'attention, dix ans après", published: true },
    create: {
      title: "L'économie de l'attention, dix ans après",
      slug: 'essai-premium-souverainete',
      content:
        "<p>Premier paragraphe offert : le temps de lecture est une denrée rare.</p><p>Deuxième paragraphe offert : la plupart des plateformes en vivent.</p><!--paywall--><p>Ce passage est réservé aux abonnés premium de cette publication.</p><p>La suite de l'analyse est exclusive.</p>",
      published: true,
      status: 'PUBLISHED',
      visibility: 'PAID_SUBSCRIBERS',
      isPremium: true,
      readingTime: 9,
      authorId: userId,
      publicationId,
    },
  });

  // 0c. Articles démo (apparaissent dans le feed /home — requis par l'e2e)
  const demoArticles = [
    {
      title: 'La souveraineté des médias indépendants',
      slug: 'souverainete-medias-independants',
      content:
        "<p>Dans un monde saturé de plateformes, posséder son propre espace de publication n'est plus un luxe : c'est une condition de survie éditoriale.</p><p>Cet article explore ce que signifie réellement être souverain sur son audience, son contenu et ses revenus.</p>",
      isEditorPick: true,
    },
    {
      title: 'Pourquoi le temps long gagne toujours',
      slug: 'pourquoi-temps-long-gagne',
      content:
        "<p>L'économie de l'attention récompense le bruit. L'histoire, elle, récompense la constance.</p><p>Les médias qui écrivent pour durer finissent toujours par gagner la confiance de leur lectorat.</p>",
    },
    {
      title: "L'architecture du silence numérique",
      slug: 'architecture-du-silence-numerique',
      content:
        "<p>Le silence n'est pas l'absence de contenu : c'est une architecture de lecture.</p><p>qoe.fi est construit autour de cette idée : moins d'interruptions, plus de sens.</p>",
    },
  ];

  for (const art of demoArticles) {
    await prisma.article.upsert({
      where: { publicationId_slug: { publicationId, slug: art.slug } },
      update: {
        title: art.title,
        content: art.content,
        published: true,
        status: 'PUBLISHED',
        visibility: 'PUBLIC',
        isEditorPick: art.isEditorPick ?? false,
      },
      create: {
        title: art.title,
        slug: art.slug,
        content: art.content,
        published: true,
        status: 'PUBLISHED',
        visibility: 'PUBLIC',
        isEditorPick: art.isEditorPick ?? false,
        readingTime: 4,
        authorId: userId,
        publicationId,
      },
    });
  }

  // 1. Create Navigation
  await prisma.navigationItem.createMany({
    data: [
      { label: 'Accueil', url: '/', order: 1, publicationId },
      { label: 'Politique', url: '/category/politique', order: 2, publicationId },
      { label: 'Écologie', url: '/category/ecologie', order: 3, publicationId },
      { label: 'Notre Équipe', url: '/about', order: 4, publicationId },
    ],
    skipDuplicates: true,
  });

  // 2. Create Socials
  await prisma.socialLink.createMany({
    data: [
      { platform: 'x', url: 'https://twitter.com/mediamilitant', order: 1, publicationId },
      {
        platform: 'bluesky',
        url: 'https://bsky.app/profile/mediamilitant.bsky.social',
        order: 2,
        publicationId,
      },
      { platform: 'youtube', url: 'https://youtube.com/mediamilitant', order: 3, publicationId },
      {
        platform: 'mastodon',
        url: 'https://mastodon.social/@mediamilitant',
        order: 4,
        publicationId,
      },
    ],
    skipDuplicates: true,
  });

  // 3. Create Categories
  const cat = await prisma.category.upsert({
    where: { slug_publicationId: { slug: 'politique', publicationId } },
    update: {},
    create: {
      name: 'Politique',
      slug: 'politique',
      publicationId,
    },
  });

  await prisma.category.upsert({
    where: { slug_publicationId: { slug: 'international', publicationId } },
    update: {},
    create: {
      name: 'International',
      slug: 'international',
      parentId: cat.id,
      publicationId,
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
