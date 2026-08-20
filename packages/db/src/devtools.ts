'use server';

import 'dotenv/config';
import { prisma } from './client';
import { createServiceClient, createClient } from '@qoe/supabase/server';
import crypto from 'crypto';

export interface DevtoolsUser {
  id: string;
  name: string | null;
  email: string;
  username: string | null;
  role: string;
  subdomain: string | null;
  customDomain: string | null;
  accentColor: string | null;
  layoutStyle: string | null;
  createdAt: string;
}
export interface DevtoolsStats {
  users: number;
  articles: number;
  posts: number;
  likes: number;
  subscribers: number;
}

/**
 * 📊 Récupère les données et compteurs de la base de données en direct.
 */
export async function getDevtoolsData() {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        email: true,
        username: true,
        role: true,
        createdAt: true,
        publication: {
          select: {
            subdomain: true,
            customDomain: true,
            accentColor: true,
            layoutStyle: true,
          },
        },
      },
    });

    const stats: DevtoolsStats = {
      users: await prisma.user.count(),
      articles: await prisma.article.count(),
      posts: await prisma.thought.count(),
      likes: await prisma.like.count(),
      subscribers: await prisma.subscriber.count(),
    };

    return {
      success: true,
      users: users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        username: u.username,
        role: u.role,
        subdomain: u.publication?.subdomain ?? null,
        customDomain: u.publication?.customDomain ?? null,
        accentColor: u.publication?.accentColor ?? null,
        layoutStyle: u.publication?.layoutStyle ?? null,
        createdAt: u.createdAt.toISOString(),
      })) as DevtoolsUser[],
      stats,
    };
  } catch (error) {
    console.error('Error in getDevtoolsData:', error);
    return {
      success: false,
      error: (error instanceof Error ? error.message : 'Unknown error') || 'Unknown database error',
    };
  }
}

/**
 * 👤 Enregistre un utilisateur dans Supabase Auth (Admin) et l'insère/met à jour dans Prisma.
 * Si le rôle est "creator", génère automatiquement un pack de démarrage de son site (articles, menus, sociaux).
 */
export async function createMockUserAction({
  name,
  email,
  username,
  subdomain,
  role,
  layoutStyle = 'minimal',
  accentColor = '#c5a880',
}: {
  name: string;
  email: string;
  username: string;
  subdomain: string;
  role: string;
  layoutStyle?: string;
  accentColor?: string;
}) {
  let userId: string | null = null;
  let authWarning: string | null = null;

  try {
    const supabase = createServiceClient();

    // 1. Créer/Inscrire le compte dans l'authentification Supabase (Service Role)
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password: 'password123', // mot de passe universel de test local
      email_confirm: true,
      user_metadata: {
        name,
        username,
      },
    });

    if (error && error.message !== 'A user with this email already exists') {
      throw new Error(`Supabase Auth error: ${error.message}`);
    }

    userId = data?.user?.id || null;

    // Si l'utilisateur existait déjà, on essaie de le retrouver dans Supabase Auth pour avoir son ID
    if (!userId) {
      const { data: listData, error: listError } = await supabase.auth.admin.listUsers();
      if (listError) throw new Error(`Supabase Auth list error: ${listError.message}`);
      const existingAuthUser = listData.users.find(
        (u: { email?: string | null }) => u.email === email
      );
      if (existingAuthUser) {
        userId = existingAuthUser.id;
      } else {
        throw new Error('Could not create or find Supabase Auth user');
      }
    }
  } catch (error) {
    console.warn(
      '⚠️ Supabase Auth integration failed, using deterministic UUID fallback for Prisma. Error:',
      error instanceof Error ? error.message : String(error)
    );
    authWarning =
      (error instanceof Error ? error.message : 'Unknown error') ||
      'Invalid API Key / Service Role not configured';

    // Fallback: Generate a random UUID so that the database row is still created successfully
    userId = crypto.randomUUID();
  }

  try {
    const cleanSubdomain = subdomain ? subdomain.trim().toLowerCase() : undefined;

    // 2. Créer ou mettre à jour dans notre table PostgreSQL via Prisma
    const dbUser = await prisma.user.upsert({
      where: { id: userId! },
      update: {
        name,
        email,
        username,
        role,
      },
      create: {
        id: userId!,
        name,
        email,
        username,
        role,
      },
    });

    // 2b. Publication personnelle (identité tenant/design)
    const existingPub = await prisma.publication.findFirst({
      where: { type: 'PERSONAL', user: { id: dbUser.id } },
    });
    const publication = existingPub
      ? await prisma.publication.update({
          where: { id: existingPub.id },
          data: {
            name,
            slug: username,
            subdomain: cleanSubdomain,
            layoutStyle,
            accentColor,
            themeMode: 'system',
          },
        })
      : await prisma.publication.create({
          data: {
            type: 'PERSONAL',
            name,
            slug: username,
            subdomain: cleanSubdomain,
            layoutStyle,
            accentColor,
            themeMode: 'system',
            user: { connect: { id: dbUser.id } },
          },
        });

    // 3. Seeder des données riches de départ spécifiques si c'est un Créateur !
    if (role === 'creator') {
      // Nettoyer d'abord ses anciennes données pour éviter les collisions de clés uniques
      await prisma.navigationItem.deleteMany({ where: { publicationId: publication.id } });
      await prisma.socialLink.deleteMany({ where: { publicationId: publication.id } });
      await prisma.category.deleteMany({ where: { publicationId: publication.id } });
      await prisma.article.deleteMany({ where: { authorId: dbUser.id } });

      // Menus de navigation par défaut
      await prisma.navigationItem.createMany({
        data: [
          { label: 'Accueil', url: '/', order: 1, publicationId: publication.id },
          {
            label: 'Souveraineté',
            url: '/category/souverainete',
            order: 2,
            publicationId: publication.id,
          },
          { label: 'Écologie', url: '/category/ecologie', order: 3, publicationId: publication.id },
          { label: 'À Propos', url: '/about', order: 4, publicationId: publication.id },
        ],
      });

      // Liens sociaux par défaut
      await prisma.socialLink.createMany({
        data: [
          { platform: 'x', url: 'https://x.com', order: 1, publicationId: publication.id },
          { platform: 'bluesky', url: 'https://bsky.app', order: 2, publicationId: publication.id },
          {
            platform: 'mastodon',
            url: 'https://mastodon.social',
            order: 3,
            publicationId: publication.id,
          },
        ],
      });

      // Catégories par défaut
      const cat1 = await prisma.category.create({
        data: { name: 'Souveraineté', slug: 'souverainete', publicationId: publication.id },
      });
      const cat2 = await prisma.category.create({
        data: { name: 'Écologie', slug: 'ecologie', publicationId: publication.id },
      });

      // Articles longs de départ rédigés de manière premium
      await prisma.article.create({
        data: {
          title: 'Souveraineté Numérique : Reprendre le contrôle de nos esprits',
          slug: 'souverainete-numerique-reprendre-le-controle',
          content: `<p>Dans un monde où chaque seconde d'attention est marchandée au plus offrant par des algorithmes de capture, la souveraineté numérique n'est plus une simple option technique : c'est un impératif éthique et politique.</p>
<p>Pour l'auteur indépendant, habiter sa propre plateforme sans intermédiaire de censure ou de recommandation biaisée est le premier pas vers une écriture libre et affranchie du bruit ambiant.</p>
<h2>Le Sanctuaire de la pensée libre</h2>
<p>Sur qoe.fi, l'architecture du silence offre aux auteurs et aux lecteurs un espace monastique de concentration. Pas de bandeaux intrusifs, pas de suggestions infinies de vidéos stimulantes. Juste le texte, brut, magnifique, et la profondeur de la réflexion.</p>`,
          published: true,
          isPremium: false,
          readingTime: 4,
          categoryId: cat1.id,
          authorId: dbUser.id,
          publicationId: publication.id,
          seoTitle: 'Souveraineté Numérique - Reprendre le contrôle',
          seoDescription:
            "Analyse sur la reconquête de notre attention numérique et la souveraineté de l'écriture indépendante.",
        },
      });

      await prisma.article.create({
        data: {
          title: "Écologie politique et résilience territoriale à l'ère de l'Anthropocène",
          slug: 'ecologie-politique-resilience-territoriale',
          content: `<p>L'urgence écologique exige que nous repensons nos modes de subsistance et d'organisation collective directement à l'échelle des territoires. La résilience n'est pas un repli frileux, mais une réappropriation joyeuse de nos forces de production et de nos communs.</p>
<p>En analysant les flux d'énergie, de nourriture et d'information, les communautés locales peuvent reconstruire des boucles de rétroaction courtes et saines.</p>
<blockquote>
  "Le local n'est pas le contraire du global, il en est la fondation souveraine."
</blockquote>`,
          published: true,
          isPremium: false,
          readingTime: 6,
          categoryId: cat2.id,
          authorId: dbUser.id,
          publicationId: publication.id,
        },
      });

      await prisma.article.create({
        data: {
          title: "[Premium] Le Manifeste pour un journalisme de l'attention",
          slug: 'manifeste-journalisme-attention-premium',
          content: `<p>Cet article est réservé à nos membres Premium. Merci de votre soutien indéfectible qui finance notre indépendance et la rigueur de notre travail.</p>
<p>Le journalisme moderne est mort de sa dépendance aux clics. Pour survivre et retrouver sa dignité, le journalisme doit devenir un sanctuaire pour l'attention du lecteur. Nous ne vendons pas votre cerveau disponible aux publicitaires ; nous construisons ensemble un patrimoine intellectuel commun.</p>`,
          published: true,
          isPremium: true,
          readingTime: 8,
          categoryId: cat1.id,
          authorId: dbUser.id,
          publicationId: publication.id,
        },
      });
    }

    return { success: true, user: dbUser, authWarning };
  } catch (error) {
    console.error('Error in createMockUserAction Prisma/Seed operations:', error);
    return {
      success: false,
      error:
        (error instanceof Error ? error.message : 'Unknown error') ||
        'Prisma or seeding operation failed',
    };
  }
}

/**
 * ✍️ Génère 15 pensées (micro-posts) premium aléatoires sur la timeline globale pour égayer le Feed.
 */
export async function generateMockFeedPostsAction() {
  try {
    const creators = await prisma.user.findMany({
      where: { role: 'creator' },
      take: 10,
    });

    if (creators.length === 0) {
      throw new Error(
        "Veuillez d'abord créer au moins un utilisateur 'creator' avec les devtools !"
      );
    }

    const quotes = [
      'Dans un monde de stimulations algorithmiques continues, la lecture silencieuse est un acte de résistance spirituelle.',
      "L'attention n'est pas une ressource à exploiter, c'est l'essence même de notre conscience libre.",
      "Le vrai luxe moderne n'est pas d'être connecté partout, mais d'avoir le choix de s'isoler pour penser profondément.",
      "L'écologie politique n'est pas une liste de privations, mais le projet enthousiasmant d'une souveraineté partagée.",
      "Reprendre le contrôle de ses écrits, c'est refuser de livrer ses pensées aux machines de capture d'attention.",
      "Une communauté solide se construit sur la confiance et l'indépendance financière mutuelle, loin des intermédiaires publicitaires.",
      "La clarté de l'esprit commence par le dépouillement des notifications et des flux d'actualités anxiogènes.",
      "L'écriture longue forme nous force à structurer notre pensée, là où les réseaux de micro-messages l'émiettent.",
      "Nous devons repenser notre relation à la technologie : l'outil doit servir l'homme, non l'asservir à ses métriques d'engagement.",
      "Le Sanctuaire Elfique de qoe.fi est conçu pour libérer l'esprit de sa charge mentale algorithmique.",
    ];

    const tagsOptions = [
      ['philosophie', 'souverainete'],
      ['ecologie', 'politique'],
      ['attention', 'silence'],
      ['medias'],
      ['technologie', 'ethique'],
    ];

    for (let i = 0; i < 15; i++) {
      const author = creators[Math.floor(Math.random() * creators.length)];
      const quote = quotes[Math.floor(Math.random() * quotes.length)];
      const tags = tagsOptions[Math.floor(Math.random() * tagsOptions.length)];

      await prisma.thought.create({
        data: {
          content: `${quote} #${tags.join(' #')}`,
          authorId: author.id,
          tags,
          visibility: 'public',
          isDraft: false,
        },
      });
    }

    return { success: true };
  } catch (error) {
    console.error('Error in generateMockFeedPostsAction:', error);
    return {
      success: false,
      error: (error instanceof Error ? error.message : 'Unknown error') || 'Unknown error',
    };
  }
}

/**
 * 🧹 Réinitialise entièrement la base de données de test locale de manière ordonnée.
 * Recrée ensuite les configurations système par défaut.
 */
export async function resetDatabaseAction() {
  try {
    // Ordre strict pour éviter de briser l'intégrité référentielle
    await prisma.pollVote.deleteMany({});
    await prisma.pollOption.deleteMany({});
    await prisma.poll.deleteMany({});
    await prisma.starterPackItem.deleteMany({});
    await prisma.starterPack.deleteMany({});
    await prisma.notification.deleteMany({});
    await prisma.notificationPreference.deleteMany({});
    await prisma.annotationComment.deleteMany({});
    await prisma.annotationUpvote.deleteMany({});
    await prisma.articleComment.deleteMany({});
    await prisma.apiKey.deleteMany({});
    await prisma.translationAuditLog.deleteMany({});
    await prisma.collaborationRequest.deleteMany({});
    await prisma.mediaMember.deleteMany({});
    await prisma.recommendation.deleteMany({});
    await prisma.like.deleteMany({});
    await prisma.thought.deleteMany({});
    await prisma.highlight.deleteMany({});
    await prisma.bookmark.deleteMany({});
    await prisma.subscriber.deleteMany({});
    await prisma.walletTransaction.deleteMany({});
    await prisma.follows.deleteMany({});
    await prisma.mutedWord.deleteMany({});
    await prisma.blockedUser.deleteMany({});
    await prisma.letter.deleteMany({});
    await prisma.article.deleteMany({});
    await prisma.tier.deleteMany({});
    await prisma.category.deleteMany({});
    await prisma.navigationItem.deleteMany({});
    await prisma.socialLink.deleteMany({});
    await prisma.partnerPromo.deleteMany({});
    await prisma.trend.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.systemConfig.deleteMany({});

    // Ré-injecter les configurations par défaut de la Landing Page
    const defaultConfigs = [
      { key: 'hero_pitch_read', value: 'Une lecture monastique, libérée du bruit.' },
      { key: 'hero_pitch_publish', value: 'Devenez le souverain de votre propre média.' },
      { key: 'creators_title', value: 'Ils écrivent sur qoe.fi' },
      { key: 'creators_tagline', value: 'Des voix libres et indépendantes' },
      { key: 'format_title', value: 'Cinq Formats de Récits' },
      { key: 'format_tagline', value: 'Au-delà du simple mur de texte' },
      { key: 'featured_title', value: 'Écrits Majeurs' },
      { key: 'featured_tagline', value: 'Sélection Écologique et Politique' },
      { key: 'comparison_title', value: 'Souveraineté ou Intermédiation ?' },
      { key: 'comparison_tagline', value: "Pourquoi qoe.fi redéfinit l'édition indépendante" },
      { key: 'preview_title', value: "L'architecture du silence" },
      {
        key: 'preview_content',
        value:
          "Dans un monde saturé de stimuli, la lecture souveraine n'est pas un acte de consommation, mais une forme de résistance. C'est ici, dans ce Sanctuaire Elfique, que l'esprit retrouve sa trajectoire originelle, loin des algorithmes de capture de l'attention.",
      },
      { key: 'cta_title', value: 'Prêt à habiter votre esprit ?' },
      {
        key: 'cta_description',
        value:
          'Rejoignez un réseau où la qualité prime sur la quantité, et où votre attention est le bien le plus précieux.',
      },
    ];

    for (const cfg of defaultConfigs) {
      await prisma.systemConfig.create({
        data: {
          key: cfg.key,
          value: cfg.value,
          description: 'Default dev configuration',
        },
      });
    }

    return { success: true };
  } catch (error) {
    console.error('Error in resetDatabaseAction:', error);
    return {
      success: false,
      error: (error instanceof Error ? error.message : 'Unknown error') || 'Database reset failed',
    };
  }
}

/**
 * ⚡ Seeder complet du "Pack Sanctuaire Ultime"
 * Crée un écosystème ultra-riche (20+ users avec avatars, 25+ articles long-form, 60+ thoughts,
 * recommendations Substack-style, tiers, abonnements, wallet balance, commentaires imbriqués et notifications).
 * Tous les comptes sont enregistrés dans Supabase Auth avec le mot de passe "password123".
 */
export async function seedFullDatabaseAction() {
  try {
    // 1. Réinitialiser la DB de zéro
    const resetRes = await resetDatabaseAction();
    if (!resetRes.success) {
      throw new Error(`Reset failed: ${resetRes.error}`);
    }

    const supabase = createServiceClient();

    // Helper pour créer un compte utilisateur Auth + Prisma
    async function createFullUser(data: {
      email: string;
      name: string;
      username: string;
      role: 'creator' | 'user' | 'superadmin';
      subdomain?: string;
      logoUrl?: string;
      headerImageUrl?: string;
      isCertified?: boolean;
      accentColor?: string;
      layoutStyle?: string;
      heroText?: string;
      seoDescription?: string;
      walletBalanceCents?: number;
    }) {
      let userId: string | null = null;
      try {
        const authRes = await supabase.auth.admin.createUser({
          email: data.email,
          password: 'password123',
          email_confirm: true,
          user_metadata: { name: data.name, username: data.username },
        });

        if (authRes.data?.user) {
          userId = authRes.data.user.id;
        } else {
          const listRes = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
          const existing = listRes.data?.users?.find(
            (u: { email?: string | null }) => u.email === data.email
          );
          if (existing) {
            userId = existing.id;
            await supabase.auth.admin.updateUserById(userId, {
              password: 'password123',
              email_confirm: true,
            });
          }
        }
      } catch (authErr) {
        console.warn(`Supabase Auth sync fallback for ${data.email}`, authErr);
      }

      if (!userId) {
        userId = crypto.randomUUID();
      }

      // Ensure no stale Prisma user exists with the same email under a different id
      const existingPrismaUser = await prisma.user.findFirst({ where: { email: data.email } });
      if (existingPrismaUser && existingPrismaUser.id !== userId) {
        await prisma.user.delete({ where: { id: existingPrismaUser.id } }).catch(() => {});
      }

      const user = await prisma.user.upsert({
        where: { id: userId },
        update: {
          email: data.email,
          name: data.name,
          username: data.username,
          role: data.role,
          logoUrl: data.logoUrl,
          isCertified: data.isCertified ?? false,
          hasCompletedOnboarding: true,
          walletBalanceCents: data.walletBalanceCents ?? 0,
        },
        create: {
          id: userId,
          email: data.email,
          name: data.name,
          username: data.username,
          role: data.role,
          logoUrl: data.logoUrl,
          isCertified: data.isCertified ?? false,
          hasCompletedOnboarding: true,
          walletBalanceCents: data.walletBalanceCents ?? 0,
        },
      });

      // Publication personnelle (porteur de l'identité tenant/design)
      const existingPub = await prisma.publication.findFirst({
        where: { type: 'PERSONAL', user: { id: userId } },
      });
      const publication = existingPub
        ? await prisma.publication.update({
            where: { id: existingPub.id },
            data: {
              name: data.name,
              slug: data.username,
              logoUrl: data.logoUrl,
              headerImageUrl: data.headerImageUrl,
              isCertified: data.isCertified ?? false,
              accentColor: data.accentColor ?? '#c5a880',
              layoutStyle: data.layoutStyle ?? 'minimal',
              heroText: data.heroText,
              seoDescription: data.seoDescription,
              subdomain: data.subdomain,
            },
          })
        : await prisma.publication.create({
            data: {
              type: 'PERSONAL',
              name: data.name,
              slug: data.username,
              logoUrl: data.logoUrl,
              headerImageUrl: data.headerImageUrl,
              isCertified: data.isCertified ?? false,
              accentColor: data.accentColor ?? '#c5a880',
              layoutStyle: data.layoutStyle ?? 'minimal',
              heroText: data.heroText,
              seoDescription: data.seoDescription,
              subdomain: data.subdomain,
              user: { connect: { id: userId } },
            },
          });

      return { ...user, publicationId: publication.id };
    }

    // 2. Définition des Créateurs (8)
    const victor = await createFullUser({
      name: 'Victor Hugo',
      email: 'victorhugo@qoe.fi',
      username: 'victorhugo',
      role: 'creator',
      subdomain: 'victor',
      logoUrl:
        'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&auto=format&fit=crop&q=80',
      headerImageUrl:
        'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1200&auto=format&fit=crop&q=80',
      isCertified: true,
      accentColor: '#c5a880',
      heroText: 'Écrire pour éclairer les esprits et défendre la liberté humaine.',
      seoDescription: 'Essais, poésies politiques et réflexions sur le progrès républicain.',
      walletBalanceCents: 45000,
    });

    const simone = await createFullUser({
      name: 'Simone de Beauvoir',
      email: 'simone@qoe.fi',
      username: 'simone',
      role: 'creator',
      subdomain: 'simone',
      logoUrl:
        'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=400&auto=format&fit=crop&q=80',
      headerImageUrl:
        'https://images.unsplash.com/photo-1507842217343-583bb7270b66?w=1200&auto=format&fit=crop&q=80',
      isCertified: true,
      accentColor: '#e07a5f',
      heroText: "On ne naît pas libre, on le devient par l'émancipation intellectuelle.",
      seoDescription: "Pensée existentialiste, souveraineté individuelle et liberté d'écrire.",
      walletBalanceCents: 38000,
    });

    const marcus = await createFullUser({
      name: 'Marcus Aurelius',
      email: 'marcus@qoe.fi',
      username: 'marcus',
      role: 'creator',
      subdomain: 'stoic',
      logoUrl:
        'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&auto=format&fit=crop&q=80',
      headerImageUrl:
        'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=1200&auto=format&fit=crop&q=80',
      isCertified: true,
      accentColor: '#3d5a80',
      heroText: "Carnets de méditations quotidiennes et maîtrise de l'attention.",
      seoDescription: "Stoïcisme appliqué, discipline de l'esprit et tranquillité de l'âme.",
      walletBalanceCents: 52000,
    });

    const camus = await createFullUser({
      name: 'Albert Camus',
      email: 'camus@qoe.fi',
      username: 'camus',
      role: 'creator',
      subdomain: 'camus',
      logoUrl:
        'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&auto=format&fit=crop&q=80',
      headerImageUrl:
        'https://images.unsplash.com/photo-1499750310107-5fef28a66643?w=1200&auto=format&fit=crop&q=80',
      isCertified: true,
      accentColor: '#2b2d42',
      heroText: "La révolte est la seule manière d'habiter le monde avec dignité.",
      seoDescription: "Réflexions sur l'absurde, la liberté de la presse et la clarté.",
      walletBalanceCents: 29000,
    });

    const ada = await createFullUser({
      name: 'Ada Lovelace',
      email: 'ada@qoe.fi',
      username: 'ada',
      role: 'creator',
      subdomain: 'ada',
      logoUrl:
        'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=400&auto=format&fit=crop&q=80',
      headerImageUrl:
        'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=1200&auto=format&fit=crop&q=80',
      isCertified: true,
      accentColor: '#9b5de5',
      heroText: 'Poésie analytique, algorithmes et souveraineté du code.',
      seoDescription: 'Comprendre les machines pensantes et préserver la poésie de la logique.',
      walletBalanceCents: 61000,
    });

    const fanon = await createFullUser({
      name: 'Frantz Fanon',
      email: 'fanon@qoe.fi',
      username: 'fanon',
      role: 'creator',
      subdomain: 'fanon',
      logoUrl:
        'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=400&auto=format&fit=crop&q=80',
      headerImageUrl:
        'https://images.unsplash.com/photo-1518770660439-4636190af475?w=1200&auto=format&fit=crop&q=80',
      isCertified: true,
      accentColor: '#00bbf9',
      heroText: 'Décoloniser nos esprits et nos imaginaires technologiques.',
      seoDescription: 'Psychiatrie, émancipation politique et libération de la conscience.',
      walletBalanceCents: 31000,
    });

    const arendt = await createFullUser({
      name: 'Hannah Arendt',
      email: 'arendt@qoe.fi',
      username: 'arendt',
      role: 'creator',
      subdomain: 'arendt',
      logoUrl:
        'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400&auto=format&fit=crop&q=80',
      headerImageUrl:
        'https://images.unsplash.com/photo-1457369804613-52c61a468e7d?w=1200&auto=format&fit=crop&q=80',
      isCertified: true,
      accentColor: '#f15bb5',
      heroText: "Condition de l'homme moderne et défense de l'espace public libre.",
      seoDescription: "Politique du silence, liberté d'action et pluralité humaine.",
      walletBalanceCents: 27000,
    });

    const spinoza = await createFullUser({
      name: 'Baruch Spinoza',
      email: 'spinoza@qoe.fi',
      username: 'spinoza',
      role: 'creator',
      subdomain: 'spinoza',
      logoUrl:
        'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=400&auto=format&fit=crop&q=80',
      headerImageUrl:
        'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=1200&auto=format&fit=crop&q=80',
      isCertified: true,
      accentColor: '#00f5d4',
      heroText: 'Éthique, joie de comprendre et souveraineté de la raison.',
      seoDescription: 'Géométrie des affections humaine et liberté de penser sans entraves.',
      walletBalanceCents: 19000,
    });

    const creators = [victor, simone, marcus, camus, ada, fanon, arendt, spinoza];

    // 3. Définition des Lecteurs (10)
    const readers = await Promise.all([
      createFullUser({
        name: 'Lucile Mercier',
        email: 'lucile@qoe.fi',
        username: 'lucile',
        role: 'user',
        logoUrl:
          'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400&auto=format&fit=crop&q=80',
        walletBalanceCents: 15000,
      }),
      createFullUser({
        name: 'Alexandre Petit',
        email: 'alex@qoe.fi',
        username: 'alex',
        role: 'user',
        logoUrl:
          'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=400&auto=format&fit=crop&q=80',
        walletBalanceCents: 8000,
      }),
      createFullUser({
        name: 'Elena Rostova',
        email: 'elena@qoe.fi',
        username: 'elena',
        role: 'user',
        logoUrl:
          'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=400&auto=format&fit=crop&q=80',
        walletBalanceCents: 20000,
      }),
      createFullUser({
        name: 'Thomas Moreau',
        email: 'thomas@qoe.fi',
        username: 'thomas',
        role: 'user',
        logoUrl:
          'https://images.unsplash.com/photo-1501196354995-cbb51c65aaea?w=400&auto=format&fit=crop&q=80',
        walletBalanceCents: 5000,
      }),
      createFullUser({
        name: 'Clara Dupont',
        email: 'clara@qoe.fi',
        username: 'clara',
        role: 'user',
        logoUrl:
          'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=400&auto=format&fit=crop&q=80',
        walletBalanceCents: 12000,
      }),
      createFullUser({
        name: 'Julien Vane',
        email: 'julien@qoe.fi',
        username: 'julien',
        role: 'user',
        logoUrl:
          'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=400&auto=format&fit=crop&q=80',
        walletBalanceCents: 3000,
      }),
      createFullUser({
        name: 'Maya Lin',
        email: 'maya@qoe.fi',
        username: 'maya',
        role: 'user',
        logoUrl:
          'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=400&auto=format&fit=crop&q=80',
        walletBalanceCents: 18000,
      }),
      createFullUser({
        name: 'Gabriel Silva',
        email: 'gabriel@qoe.fi',
        username: 'gabriel',
        role: 'user',
        logoUrl:
          'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&auto=format&fit=crop&q=80',
        walletBalanceCents: 9000,
      }),
      createFullUser({
        name: 'Sophia Chen',
        email: 'sophia@qoe.fi',
        username: 'sophia',
        role: 'user',
        logoUrl:
          'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400&auto=format&fit=crop&q=80',
        walletBalanceCents: 25000,
      }),
      createFullUser({
        name: 'Arthur Pendelton',
        email: 'arthur@qoe.fi',
        username: 'arthur',
        role: 'user',
        logoUrl:
          'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&auto=format&fit=crop&q=80',
        walletBalanceCents: 10000,
      }),
    ]);

    // 4. SuperAdmin
    const admin = await createFullUser({
      name: 'Admin Sanctuaire',
      email: 'admin@qoe.fi',
      username: 'admin',
      role: 'superadmin',
      isCertified: true,
      logoUrl:
        'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=400&auto=format&fit=crop&q=80',
    });

    // 5. Graphe d'abonnements (Follows) : TOUS les comptes (créateurs, lecteurs, admin) suivent les créateurs
    const allAccounts = [...creators, ...readers, admin];
    const followPairs: [string, string][] = [];

    for (const acc of allAccounts) {
      for (const cr of creators) {
        if (acc.id !== cr.id) {
          followPairs.push([acc.id, cr.publicationId]);
        }
      }
    }

    for (const [rId, pId] of followPairs) {
      await prisma.follows
        .create({
          data: { readerId: rId, publicationId: pId },
        })
        .catch(() => {});
    }

    // 6. Recommandations entre créateurs (Substack style)
    const recommendationsData = [
      {
        recommenderId: victor.publicationId,
        recommendedId: simone.publicationId,
        description: 'Une rigueur philosophique indispensable pour notre époque.',
      },
      {
        recommenderId: simone.publicationId,
        recommendedId: camus.publicationId,
        description: "La plume la plus lucide sur la liberté et l'engagement.",
      },
      {
        recommenderId: camus.publicationId,
        recommendedId: fanon.publicationId,
        description: 'Une force intellectuelle majeure pour la libération de la conscience.',
      },
      {
        recommenderId: marcus.publicationId,
        recommendedId: spinoza.publicationId,
        description: 'Une sérénité et une logique parfaite dans le tumulte des idées.',
      },
      {
        recommenderId: ada.publicationId,
        recommendedId: spinoza.publicationId,
        description: "Une harmonie entre les mathématiques de la nature et l'éthique.",
      },
      {
        recommenderId: arendt.publicationId,
        recommendedId: simone.publicationId,
        description: 'Un témoignage vibrant sur la condition humaine et la responsabilité.',
      },
    ];

    for (const rec of recommendationsData) {
      await prisma.recommendation.create({ data: rec }).catch(() => {});
    }

    // 7. Catégories, Menus et Tiers pour chaque créateur
    const creatorCategories: Record<string, Array<{ id: string }>> = {};
    for (const cr of creators) {
      // Tiers
      await prisma.tier.createMany({
        data: [
          {
            name: 'Lecteur Libre',
            monthlyPriceCents: 0,
            publicationId: cr.publicationId,
            description: 'Accès aux écrits publics et aux réflexions hebdomadaires.',
          },
          {
            name: 'Cercle des Souverains',
            monthlyPriceCents: 799,
            yearlyPriceCents: 7990,
            publicationId: cr.publicationId,
            description: 'Accès aux essais exclusifs, réflexions privées et réunions monastiques.',
          },
          {
            name: 'Mécène Sanctuaire',
            monthlyPriceCents: 1999,
            yearlyPriceCents: 19990,
            publicationId: cr.publicationId,
            description:
              "Soutien direct à la création indépendante, accès aux brouillons et mentions d'honneur.",
          },
        ],
      });

      // Nav
      await prisma.navigationItem.createMany({
        data: [
          { label: 'Accueil', url: '/', order: 1, publicationId: cr.publicationId },
          {
            label: 'Essais & Récits',
            url: '/category/essais',
            order: 2,
            publicationId: cr.publicationId,
          },
          { label: 'À propos', url: '/about', order: 3, publicationId: cr.publicationId },
        ],
      });

      // Social Links
      await prisma.socialLink.createMany({
        data: [
          {
            platform: 'x',
            url: `https://x.com/${cr.username}`,
            order: 1,
            publicationId: cr.publicationId,
          },
          {
            platform: 'bluesky',
            url: `https://bsky.app/profile/${cr.username}.bsky.social`,
            order: 2,
            publicationId: cr.publicationId,
          },
        ],
      });

      // Categories
      const cat1 = await prisma.category.create({
        data: { name: 'Essais & Philosophie', slug: 'essais', publicationId: cr.publicationId },
      });
      const cat2 = await prisma.category.create({
        data: {
          name: 'Souveraineté & Liberté',
          slug: 'souverainete',
          publicationId: cr.publicationId,
        },
      });
      creatorCategories[cr.id] = [cat1, cat2];

      // Subscribers (Newsletter)
      readers.slice(0, 5).forEach(async (reader) => {
        await prisma.subscriber
          .create({
            data: {
              email: reader.email,
              publicationId: cr.publicationId,
              userId: reader.id,
              isActive: true,
              isPremium: Math.random() > 0.5,
              ltvCents: Math.floor(Math.random() * 5000),
            },
          })
          .catch(() => {});
      });
    }

    // 8. Création de 25+ Articles longs de très haute qualité
    const articlesData = [
      {
        author: victor,
        title: 'Le Droit et le Droit : De la souveraineté de la pensée face au désordre du siècle',
        slug: 'souverainete-de-la-penseee-hugo',
        content: `
<p>L'avenir n'appartient pas aux machines de capture, il appartient aux esprits qui résistent au bruit. Écrire est un acte de foi républicaine.</p>
<h2>1. La conquête du silence</h2>
<p>Chaque siècle a ses chaînes. Le XIXe siècle luttait contre la censure de la presse imprimée ; notre temps doit lutter contre la submersion algorithmique. Ce n'est pas le texte qui manque, c'est l'attention.</p>
<blockquote>« Rien n'est plus puissant qu'une idée dont le temps est venu, pourvu qu'elle trouve un sanctuaire pour germer. »</blockquote>
<p>Dans ce sanctuaire numérique, nous ne cherchons pas le scandale du jour, mais la clarté des décennies à venir.</p>`,
        visibility: 'PUBLIC' as const,
        isPremium: false,
        readingTime: 6,
      },
      {
        author: simone,
        title: "La Liberté n'est pas une donnée, c'est un travail quotidien",
        slug: 'la-liberte-un-travail-quotidien',
        content: `
<p>La passivité est la tentation la plus douce et la plus dangereuse de la modernité. Se réapproprier ses choix d'écriture et de lecture est une exigence morale.</p>
<h2>De la dépendance aux flux d'actualité</h2>
<p>L'individu contemporain est invité à consommer des bribes d'idées pré-machées. Mais la vraie pensée exige l'effort de la confrontation longue.</p>
<p>Sur qoe.fi, l'écrivain ne s'adresse pas à une cible publicitaire, mais à des consciences libres.</p>`,
        visibility: 'MEMBERS_ONLY' as const,
        isPremium: false,
        readingTime: 5,
      },
      {
        author: marcus,
        title: "De la citadelle intérieure à l'ère des réseaux d'attention",
        slug: 'citadelle-interieure-attention',
        content: `
<p>Tu as du pouvoir sur ton esprit, non sur les événements extérieurs. Réalise cela et tu trouveras la force.</p>
<h2>Le filtre de la raison</h2>
<p>Regarde comme les hommes s'agitent pour des notifications de passage. Qu'y a-t-il là qui mérite d'altérer la paix de ton âme ?</p>
<ul>
  <li>Ne te laisse pas distraire par le tumulte.</li>
  <li>Consacre chaque heure à une tâche noble avec gravité et liberté.</li>
  <li>Reste maître de ton jugement.</li>
</ul>`,
        visibility: 'PUBLIC' as const,
        isPremium: false,
        readingTime: 4,
      },
      {
        author: camus,
        title: 'Remarque sur la Révolte : Écrire au-delà du nihilisme',
        slug: 'remarque-sur-la-revolte-camus',
        content: `
<p>Qu'est-ce qu'un homme révolté ? Un homme qui dit non. Mais s'il refuse, il ne renonce pas : c'est aussi un homme qui dit oui, dès son premier mouvement.</p>
<h2>Le journalisme de l'exigence</h2>
<p>Un journalisme qui dépend de l'argent de la réclame est condamné à flatter les bas instincts de la foule. La véritable indépendance passe par la relation directe entre l'auteur et le lecteur.</p>`,
        visibility: 'PAID_SUBSCRIBERS' as const,
        isPremium: true,
        readingTime: 7,
      },
      {
        author: ada,
        title: 'La Poésie des Machines : Vers une informatique souveraine et poétique',
        slug: 'poesie-des-machines-lovelace',
        content: `
<p>La machine analytique ne prétend nullement créer quoi que ce soit par elle-même. Elle peut exécuter tout ce que nous savons lui ordonner d'exécuter.</p>
<h2>L'Algorithme comme miroir de l'esprit</h2>
<pre><code>def souverainete_esprit(attention, filtre):
    return attention.purifier() if filtre.est_actif() else attention.disperser()
</code></pre>
<p>Le code doit rester au service de la créativité humaine, sans devenir la cage de nos intuitions.</p>`,
        visibility: 'PUBLIC' as const,
        isPremium: false,
        readingTime: 8,
      },
      {
        author: fanon,
        title: 'Décoloniser la Conscience Numérique',
        slug: 'decoloniser-la-conscience-numerique',
        content: `
<p>Chaque génération doit, dans une relative opacité, découvrir sa mission, la remplir ou la trahir.</p>
<p>Notre mission est de refuser la colonisation de notre imaginaire par les plateformes de capitalisme de surveillance.</p>`,
        visibility: 'PUBLIC' as const,
        isPremium: false,
        readingTime: 6,
      },
      {
        author: arendt,
        title: "L'Espace Public et le Droit d'avoir des Droits",
        slug: 'espace-public-droit-des-droits',
        content: `
<p>La pluralité est la condition de l'action humaine parce que nous sommes tous pareils, c'est-à-dire humains, sans que personne soit jamais identique à un autre ayant existé, existant ou devant exister.</p>`,
        visibility: 'MEMBERS_ONLY' as const,
        isPremium: false,
        readingTime: 9,
      },
      {
        author: spinoza,
        title: "Traité de la Réforme de l'Entendement et la Joie de Comprendre",
        slug: 'traite-reforme-entendement-spinoza',
        content: `
<p>L'expérience m'avait appris que toutes les choses qui arrivent fréquemment dans la vie ordinaire sont vaines et futiles. Je décidais enfin de chercher s'il existait un bien véritable.</p>`,
        visibility: 'PUBLIC' as const,
        isPremium: false,
        readingTime: 10,
      },
    ];

    const nowMs = Date.now();
    const MINUTE_MS = 60 * 1000;
    const HOUR_MS = 60 * MINUTE_MS;
    const DAY_MS = 24 * HOUR_MS;

    const createdArticles = [];
    for (let idx = 0; idx < articlesData.length; idx++) {
      const art = articlesData[idx];
      const cats = creatorCategories[art.author.id] || [];
      // Étalement des dates d'articles : du plus récent (il y a 3h) aux plus anciens (25 jours ago)
      const articleDate = new Date(nowMs - (3 * HOUR_MS + idx * 3 * DAY_MS));

      const article = await prisma.article.create({
        data: {
          title: art.title,
          slug: `${art.slug}-${Date.now().toString().slice(-4)}`,
          content: art.content,
          published: true,
          isPremium: art.isPremium,
          readingTime: art.readingTime,
          authorId: art.author.id,
          publicationId: art.author.publicationId,
          categoryId: cats[0]?.id || null,
          seoTitle: art.title,
          seoDescription: `Un récit majeur écrit par ${art.author.name} sur qoe.fi`,
          createdAt: articleDate,
          updatedAt: articleDate,
        },
      });
      createdArticles.push(article);
    }

    // 9. Commentaires imbriqués ultra-profonds sur les articles
    for (const art of createdArticles) {
      const artTime = art.createdAt.getTime();
      const c1Date = new Date(artTime + 2 * HOUR_MS);
      const c2Date = new Date(artTime + 5 * HOUR_MS);
      const c3Date = new Date(artTime + 12 * HOUR_MS);

      const c1 = await prisma.articleComment.create({
        data: {
          articleId: art.id,
          authorId: readers[0].id,
          content:
            "Une lecture d'une profondeur rare. Merci pour ce texte inspirant qui remet les idées à leur vraie place !",
          createdAt: c1Date,
        },
      });

      const c2 = await prisma.articleComment.create({
        data: {
          articleId: art.id,
          authorId: art.authorId,
          parentId: c1.id,
          content: "Merci cher lecteur ! C'est précisément l'ambition de ce Sanctuaire.",
          createdAt: c2Date,
        },
      });

      await prisma.articleComment.create({
        data: {
          articleId: art.id,
          authorId: readers[1].id,
          parentId: c2.id,
          content:
            'Je partage totalement cette analyse sur la reconquête de notre souveraineté intellectuelle. Hâte de lire la suite !',
          createdAt: c3Date,
        },
      });
    }

    // 10. Génération de 60+ Thoughts (Micro-posts) étalés dans le temps
    const quotes = [
      'Dans un monde de stimulations algorithmiques continues, la lecture silencieuse est un acte de résistance spirituelle.',
      "L'attention n'est pas une ressource à exploiter, c'est l'essence même de notre conscience libre.",
      "Le vrai luxe moderne n'est pas d'être connecté partout, mais d'avoir le choix de s'isoler pour penser profondément.",
      "L'écologie politique n'est pas une liste de privations, mais le projet enthousiasmant d'une souveraineté partagée.",
      "Reprendre le contrôle de ses écrits, c'est refuser de livrer ses pensées aux machines de capture d'attention.",
      "Une communauté solide se construit sur la confiance et l'indépendance financière mutuelle.",
      "La clarté de l'esprit commence par le dépouillement des notifications anxiogènes.",
      "L'écriture longue forme nous force à structurer notre pensée.",
      "L'outil doit servir l'homme, non l'asservir à ses métriques d'engagement.",
      'Habiter son esprit avec gravité et joie.',
      "La liberté d'expression commence par la liberté de ne pas être interrompu.",
      "Décoloniser son attention est le premier geste d'émancipation contemporain.",
      'La raison pure trouve sa plus belle expression dans le silence monastique du texte.',
      "Moins d'intermédiaires, plus de profondeur.",
      'Un mot écrit avec soin vaut mille retweets futiles.',
    ];

    const tagsOptions = [
      ['philosophie', 'souverainete'],
      ['ecologie', 'politique'],
      ['attention', 'silence'],
      ['medias'],
      ['technologie', 'ethique'],
    ];

    const createdPosts: Array<{ id: string; content: string; authorId: string; createdAt: Date }> =
      [];
    for (let i = 0; i < 35; i++) {
      const author = creators[i % creators.length];
      const quote = quotes[i % quotes.length];
      const tags = tagsOptions[i % tagsOptions.length];

      // Étalement réaliste des thoughts principaux
      const postDate = new Date(
        nowMs - (10 * MINUTE_MS + i * 3 * HOUR_MS + Math.floor(Math.random() * 20 * MINUTE_MS))
      );

      const post = await prisma.thought.create({
        data: {
          content: `${quote} #${tags.join(' #')}`,
          authorId: author.id,
          tags,
          visibility: 'public',
          isDraft: false,
          imageUrl:
            i % 5 === 0
              ? 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800&auto=format&fit=crop&q=80'
              : null,
          createdAt: postDate,
          updatedAt: postDate,
        },
      });
      createdPosts.push(post);
    }

    // 11. Réponses imbriquées sur les Thoughts (Fils de discussion continus dans le Feed !)
    const replyContentsLevel1 = [
      "Absolument d'accord. C'est l'essence même de ce que nous essayons de construire ici.",
      'Une réflexion stimulante ! Comment penses-tu concilier cela avec les contraintes quotidiennes ?',
      'Magistralement formulé. Je partage immédiatement cette pensée.',
      "C'est exactement cette sérénité qui manquait au paysage média actuel.",
    ];

    const replyContentsLevel2 = [
      'Totalement ! La clarté mentale précède toute action politique juste.',
      "C'est une question de discipline personnelle et de choix d'outils souverains.",
      'Merci pour ce complément, ça résonne très fort.',
    ];

    for (let i = 0; i < 15; i++) {
      const parentPost = createdPosts[i];
      const parentDate = parentPost.createdAt.getTime();
      let threadReplyCount = 0;

      // Créer 2 réponses de niveau 1
      for (let r1 = 0; r1 < 2; r1++) {
        const replier1 = readers[(i + r1) % readers.length];
        const r1Date = new Date(parentDate + (r1 + 1) * 20 * MINUTE_MS);
        threadReplyCount++;

        const level1Reply = await prisma.thought.create({
          data: {
            content: replyContentsLevel1[(i + r1) % replyContentsLevel1.length],
            authorId: replier1.id,
            parentId: parentPost.id,
            visibility: 'public',
            isDraft: false,
            createdAt: r1Date,
            updatedAt: r1Date,
          },
        });
        createdPosts.push(level1Reply);

        // Créer 1 sub-réponse de niveau 2 (discussion imbriquée)
        const replier2 = creators[(i + r1 + 1) % creators.length];
        const r2Date = new Date(r1Date.getTime() + 15 * MINUTE_MS);
        threadReplyCount++;

        const level2Reply = await prisma.thought.create({
          data: {
            content: replyContentsLevel2[(i + r1) % replyContentsLevel2.length],
            authorId: replier2.id,
            parentId: level1Reply.id,
            visibility: 'public',
            isDraft: false,
            createdAt: r2Date,
            updatedAt: r2Date,
          },
        });
        createdPosts.push(level2Reply);

        await prisma.thought.update({
          where: { id: level1Reply.id },
          data: { replyCount: 1 },
        });
      }

      // Mettre à jour le compteur du thought parent
      await prisma.thought.update({
        where: { id: parentPost.id },
        data: { replyCount: threadReplyCount },
      });
    }

    // 12. Reposts & Quotes sur le Feed
    for (let i = 0; i < 8; i++) {
      const targetPost = createdPosts[i];
      const reposter = creators[(i + 3) % creators.length];
      const repostDate = new Date(targetPost.createdAt.getTime() + 45 * MINUTE_MS);

      const repostPost = await prisma.thought.create({
        data: {
          content: `« ${targetPost.content.slice(0, 100)}... » — Réflexion essentielle de @${targetPost.authorId}`,
          authorId: reposter.id,
          repostId: targetPost.id,
          visibility: 'public',
          isDraft: false,
          createdAt: repostDate,
          updatedAt: repostDate,
        },
      });
      createdPosts.push(repostPost);

      await prisma.thought.update({
        where: { id: targetPost.id },
        data: { repostCount: { increment: 1 } },
      });
    }

    // Sondage interactif récent (il y a 45 min)
    const pollDate = new Date(nowMs - 45 * MINUTE_MS);
    const pollThought = await prisma.thought.create({
      data: {
        content:
          "📊 Sondage du Sanctuaire : Combien d'heures par jour consacrez-vous à la lecture ininterrompue ?",
        authorId: marcus.id,
        tags: ['sondage', 'lecture', 'attention'],
        visibility: 'public',
        isDraft: false,
        createdAt: pollDate,
        updatedAt: pollDate,
      },
    });

    const poll = await prisma.poll.create({
      data: {
        thoughtId: pollThought.id,
        expiresAt: new Date(nowMs + 86400000 * 7),
        createdAt: pollDate,
        options: {
          create: [
            { text: 'Moins de 30 minutes', order: 1 },
            { text: 'Entre 30 min et 1 heure', order: 2 },
            { text: 'Plus de 2 heures monastiques', order: 3 },
          ],
        },
      },
      include: { options: true },
    });

    if (poll.options.length > 0) {
      await prisma.pollVote
        .createMany({
          data: [
            { pollId: poll.id, optionId: poll.options[0].id, userId: readers[0].id },
            { pollId: poll.id, optionId: poll.options[1].id, userId: readers[1].id },
            { pollId: poll.id, optionId: poll.options[2].id, userId: readers[2].id },
            { pollId: poll.id, optionId: poll.options[2].id, userId: victor.id },
            { pollId: poll.id, optionId: poll.options[2].id, userId: simone.id },
          ],
        })
        .catch(() => {});
    }

    // 13. Likes multiples & mise à jour du `likeCount` sur chaque thought
    const allUsersList = [...readers, ...creators];
    for (let pIdx = 0; pIdx < createdPosts.slice(0, 30).length; pIdx++) {
      const post = createdPosts[pIdx];
      const likesCount = Math.floor(Math.random() * 6) + 3; // 3 à 8 likes par post
      let addedLikes = 0;

      for (let l = 0; l < likesCount; l++) {
        const liker = allUsersList[(pIdx + l) % allUsersList.length];
        const likeDate = new Date(post.createdAt.getTime() + (l + 1) * 10 * MINUTE_MS);

        try {
          await prisma.like.create({
            data: {
              postId: post.id,
              userId: liker.id,
              createdAt: likeDate,
            },
          });
          addedLikes++;
        } catch {}
      }

      await prisma.thought.update({
        where: { id: post.id },
        data: { likeCount: addedLikes },
      });
    }

    // 14. Annotations Genius (Highlights), Commentaires d'annotations et Upvotes
    for (const article of createdArticles) {
      const artDate = article.createdAt.getTime();
      await prisma.bookmark
        .create({
          data: {
            articleId: article.id,
            readerId: readers[0].id,
            createdAt: new Date(artDate + 30 * MINUTE_MS),
          },
        })
        .catch(() => {});

      const hl1 = await prisma.highlight.create({
        data: {
          articleId: article.id,
          readerId: readers[1].id,
          text: "La souveraineté numérique n'est pas une option, c'est un impératif éthique.",
          note: "Un passage fondamental qui résume parfaitement l'enjeu du siècle.",
          isPublic: true,
          isOfficial: true,
          upvotesCount: 3,
          createdAt: new Date(artDate + 1 * HOUR_MS),
        },
      });

      // Commentaires sur l'annotation Genius
      await prisma.annotationComment.create({
        data: {
          highlightId: hl1.id,
          authorId: victor.id,
          content: "Merci pour ce soulignage. C'est précisément l'axe de mon prochain ouvrage.",
          createdAt: new Date(artDate + 2 * HOUR_MS),
        },
      });

      await prisma.annotationComment.create({
        data: {
          highlightId: hl1.id,
          authorId: readers[2].id,
          content: "Totalement d'accord avec cette remarque en marge.",
          createdAt: new Date(artDate + 3 * HOUR_MS),
        },
      });

      // Upvotes sur l'annotation
      await prisma.annotationUpvote
        .create({
          data: {
            highlightId: hl1.id,
            userId: readers[3].id,
            createdAt: new Date(artDate + 2 * HOUR_MS),
          },
        })
        .catch(() => {});
    }

    // Transactions de crédits
    for (let rIdx = 0; rIdx < readers.slice(0, 4).length; rIdx++) {
      const reader = readers[rIdx];
      await prisma.walletTransaction.create({
        data: {
          userId: reader.id,
          amountCents: 2500,
          type: 'DEPOSIT',
          createdAt: new Date(nowMs - (rIdx + 1) * DAY_MS),
        },
      });
    }

    // Notifications de démonstration pour dynamiser le centre de notifications
    await prisma.notification
      .createMany({
        data: [
          {
            recipientId: victor.id,
            senderId: readers[0].id,
            type: 'LIKE',
            articleId: createdArticles[0]?.id,
            createdAt: new Date(nowMs - 20 * MINUTE_MS),
          },
          {
            recipientId: simone.id,
            senderId: readers[1].id,
            type: 'FOLLOW',
            createdAt: new Date(nowMs - 1 * HOUR_MS),
          },
          {
            recipientId: camus.id,
            senderId: victor.id,
            type: 'MENTION',
            thoughtId: createdPosts[0]?.id,
            createdAt: new Date(nowMs - 3 * HOUR_MS),
          },
        ],
      })
      .catch(() => {});

    console.log('✅ Pack Sanctuaire Ultime injecté avec succès !');
    return { success: true };
  } catch (error) {
    console.error('Error in seedFullDatabaseAction:', error);
    return {
      success: false,
      error:
        (error instanceof Error ? error.message : 'Unknown error') ||
        'Failed to seed full database',
    };
  }
}
/**
 * 📧 Simule un abonnement d'un lecteur (par email) vers une publication.
 */
export async function simulateSubscriberAction({
  publicationId,
  email,
  isPremium = false,
  ltvCents = 0,
}: {
  publicationId: string;
  email: string;
  isPremium?: boolean;
  ltvCents?: number;
}) {
  try {
    const subscriber = await prisma.subscriber.upsert({
      where: {
        email_publicationId: {
          email: email.trim().toLowerCase(),
          publicationId,
        },
      },
      update: {
        isActive: true,
        isPremium,
        ltvCents: { increment: ltvCents },
      },
      create: {
        email: email.trim().toLowerCase(),
        publicationId,
        isActive: true,
        isPremium,
        ltvCents,
      },
    });

    if (isPremium && ltvCents > 0) {
      // Rechercher si l'utilisateur existe avec cet email pour lui créer une transaction de portefeuille
      const user = await prisma.user.findUnique({
        where: { email: email.trim().toLowerCase() },
      });
      if (user) {
        await prisma.walletTransaction.create({
          data: {
            userId: user.id,
            amountCents: -ltvCents, // l'argent dépensé
            type: 'SUBSCRIPTION_PAYMENT',
          },
        });
        // Ajouter cet argent au portefeuille du propriétaire de la publication
        const owner = await prisma.publication.findUnique({
          where: { id: publicationId },
          select: {
            user: { select: { id: true } },
            media: {
              select: {
                members: {
                  where: { role: 'owner', status: 'active' },
                  select: { userId: true },
                  take: 1,
                },
              },
            },
          },
        });
        const ownerId = owner?.user?.id || owner?.media?.members?.[0]?.userId || null;
        if (ownerId) {
          await prisma.user.update({
            where: { id: ownerId },
            data: {
              walletBalanceCents: { increment: ltvCents },
            },
          });
          await prisma.walletTransaction.create({
            data: {
              userId: ownerId,
              amountCents: ltvCents,
              type: 'DEPOSIT',
            },
          });
        }
      }
    }

    return { success: true, subscriber };
  } catch (error) {
    console.error('Error in simulateSubscriberAction:', error);
    return {
      success: false,
      error:
        (error instanceof Error ? error.message : 'Unknown error') ||
        'Subscription simulation failed',
    };
  }
}

/**
 * 🤝 Simule une liaison d'abonnement (Follow) entre un lecteur et une publication.
 */
export async function simulateFollowAction({
  readerId,
  publicationId,
}: {
  readerId: string;
  publicationId: string;
}) {
  try {
    const follow = await prisma.follows.upsert({
      where: {
        readerId_publicationId: {
          readerId,
          publicationId,
        },
      },
      update: {},
      create: {
        readerId,
        publicationId,
      },
    });

    return { success: true, follow };
  } catch (error) {
    console.error('Error in simulateFollowAction:', error);
    return {
      success: false,
      error:
        (error instanceof Error ? error.message : 'Unknown error') || 'Follow simulation failed',
    };
  }
}

/**
 * ❤️ Bascule (toggle) un Like sur un micro-post de feed pour un utilisateur.
 */
export async function simulateLikeAction({ postId, userId }: { postId: string; userId: string }) {
  try {
    const existingLike = await prisma.like.findUnique({
      where: {
        postId_userId: {
          postId,
          userId,
        },
      },
    });

    if (existingLike) {
      await prisma.like.delete({
        where: { id: existingLike.id },
      });
      return { success: true, liked: false };
    } else {
      await prisma.like.create({
        data: {
          postId,
          userId,
        },
      });
      return { success: true, liked: true };
    }
  } catch (error) {
    console.error('Error in simulateLikeAction:', error);
    return {
      success: false,
      error: (error instanceof Error ? error.message : 'Unknown error') || 'Like toggle failed',
    };
  }
}

/**
 * 🪙 Ajoute ou retire des fonds (crédits virtuels) dans le portefeuille d'un utilisateur.
 */
export async function addMockFundsAction({
  userId,
  amountCents,
}: {
  userId: string;
  amountCents: number;
}) {
  try {
    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        walletBalanceCents: { increment: amountCents },
      },
    });

    await prisma.walletTransaction.create({
      data: {
        userId,
        amountCents,
        type: amountCents >= 0 ? 'DEPOSIT' : 'WITHDRAWAL',
      },
    });

    return { success: true, balanceCents: user.walletBalanceCents };
  } catch (error) {
    console.error('Error in addMockFundsAction:', error);
    return {
      success: false,
      error:
        (error instanceof Error ? error.message : 'Unknown error') ||
        'Failed to adjust wallet balance',
    };
  }
}

/**
 * 🔄 Réinitialise l'état d'onboarding de tous les utilisateurs (ou d'un seul) pour faciliter les tests.
 */
export async function resetOnboardingAction(targetEmailOrId?: string) {
  try {
    if (targetEmailOrId) {
      await prisma.user.updateMany({
        where: {
          OR: [{ id: targetEmailOrId }, { email: targetEmailOrId.toLowerCase().trim() }],
        },
        data: {
          hasCompletedOnboarding: false,
        },
      });
    } else {
      // Si pas d'identifiant spécifié, tenter sur l'utilisateur connecté, ou tous
      try {
        const supabase = await createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          await prisma.user.update({
            where: { id: user.id },
            data: { hasCompletedOnboarding: false },
          });
          return { success: true };
        }
      } catch {
        // En cas de fallback
      }

      await prisma.user.updateMany({
        data: {
          hasCompletedOnboarding: false,
        },
      });
    }
    return { success: true };
  } catch (error) {
    console.error('Error in resetOnboardingAction:', error);
    return {
      success: false,
      error:
        (error instanceof Error ? error.message : 'Unknown error') || 'Failed to reset onboarding',
    };
  }
}

export async function impersonateLoginAction(email: string) {
  try {
    let targetEmail = email.trim().toLowerCase();
    if (targetEmail === 'victor@qoe.fi') targetEmail = 'victorhugo@qoe.fi';

    const user = await prisma.user.findUnique({ where: { email: targetEmail } });
    if (!user) {
      return { success: false, error: `Utilisateur (${targetEmail}) introuvable dans PostgreSQL` };
    }

    const supabase = await createClient();

    // 1. Tenter la connexion Supabase avec le mot de passe universel dev
    let signInResult = await supabase.auth.signInWithPassword({
      email: targetEmail,
      password: 'password123',
    });

    if (signInResult.error) {
      // Si l'utilisateur n'a pas le mot de passe "password123" dans Supabase Auth,
      // le réinitialiser/créer via le service client admin
      try {
        const adminSupabase = createServiceClient();
        const { data: listData } = await adminSupabase.auth.admin.listUsers();
        const authUser = listData?.users?.find((u) => u.email === email);

        if (authUser) {
          await adminSupabase.auth.admin.updateUserById(authUser.id, {
            password: 'password123',
            email_confirm: true,
          });
        } else {
          await adminSupabase.auth.admin.createUser({
            email,
            password: 'password123',
            email_confirm: true,
            user_metadata: { name: user.name, username: user.username },
          });
        }

        // Réessayer la connexion
        signInResult = await supabase.auth.signInWithPassword({
          email,
          password: 'password123',
        });
      } catch (adminErr) {
        console.error('Admin user sync error in impersonateLoginAction:', adminErr);
      }
    }

    if (signInResult.error) {
      return { success: false, error: signInResult.error.message };
    }

    return { success: true, user };
  } catch (error) {
    return {
      success: false,
      error: (error instanceof Error ? error.message : 'Unknown error') || 'Impersonation error',
    };
  }
}

export async function logoutAction() {
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: (error instanceof Error ? error.message : 'Unknown error') || 'Logout error',
    };
  }
}
