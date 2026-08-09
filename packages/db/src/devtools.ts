"use server";

import { prisma } from "./client";
import { createServiceClient, createClient } from "@qoe/supabase/server";
import crypto from "crypto";

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
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        email: true,
        username: true,
        role: true,
        subdomain: true,
        customDomain: true,
        accentColor: true,
        layoutStyle: true,
        createdAt: true,
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
        ...u,
        createdAt: u.createdAt.toISOString(),
      })) as DevtoolsUser[],
      stats,
    };
  } catch (error: any) {
    console.error("Error in getDevtoolsData:", error);
    return { success: false, error: error?.message || "Unknown database error" };
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
  layoutStyle = "minimal",
  accentColor = "#c5a880",
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
      password: "password123", // mot de passe universel de test local
      email_confirm: true,
      user_metadata: {
        name,
        username,
      },
    });

    if (error && error.message !== "A user with this email already exists") {
      throw new Error(`Supabase Auth error: ${error.message}`);
    }

    userId = data?.user?.id || null;

    // Si l'utilisateur existait déjà, on essaie de le retrouver dans Supabase Auth pour avoir son ID
    if (!userId) {
      const { data: listData, error: listError } = await supabase.auth.admin.listUsers();
      if (listError) throw new Error(`Supabase Auth list error: ${listError.message}`);
      const existingAuthUser = listData.users.find((u: any) => u.email === email);
      if (existingAuthUser) {
        userId = existingAuthUser.id;
      } else {
        throw new Error("Could not create or find Supabase Auth user");
      }
    }
  } catch (error: any) {
    console.warn("⚠️ Supabase Auth integration failed, using deterministic UUID fallback for Prisma. Error:", error?.message || error);
    authWarning = error?.message || "Invalid API Key / Service Role not configured";
    
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
        subdomain: cleanSubdomain,
        layoutStyle,
        accentColor,
        themeMode: "system",
      },
      create: {
        id: userId!,
        name,
        email,
        username,
        role,
        subdomain: cleanSubdomain,
        layoutStyle,
        accentColor,
        themeMode: "system",
      },
    });

    // 3. Seeder des données riches de départ spécifiques si c'est un Créateur !
    if (role === "creator") {
      // Nettoyer d'abord ses anciennes données pour éviter les collisions de clés uniques
      await prisma.navigationItem.deleteMany({ where: { userId: dbUser.id } });
      await prisma.socialLink.deleteMany({ where: { userId: dbUser.id } });
      await prisma.category.deleteMany({ where: { userId: dbUser.id } });
      await prisma.article.deleteMany({ where: { authorId: dbUser.id } });

      // Menus de navigation par défaut
      await prisma.navigationItem.createMany({
        data: [
          { label: "Accueil", url: "/", order: 1, userId: dbUser.id },
          { label: "Souveraineté", url: "/category/souverainete", order: 2, userId: dbUser.id },
          { label: "Écologie", url: "/category/ecologie", order: 3, userId: dbUser.id },
          { label: "À Propos", url: "/about", order: 4, userId: dbUser.id },
        ],
      });

      // Liens sociaux par défaut
      await prisma.socialLink.createMany({
        data: [
          { platform: "x", url: "https://x.com", order: 1, userId: dbUser.id },
          { platform: "bluesky", url: "https://bsky.app", order: 2, userId: dbUser.id },
          { platform: "mastodon", url: "https://mastodon.social", order: 3, userId: dbUser.id },
        ],
      });

      // Catégories par défaut
      const cat1 = await prisma.category.create({
        data: { name: "Souveraineté", slug: "souverainete", userId: dbUser.id },
      });
      const cat2 = await prisma.category.create({
        data: { name: "Écologie", slug: "ecologie", userId: dbUser.id },
      });

      // Articles longs de départ rédigés de manière premium
      await prisma.article.create({
        data: {
          title: "Souveraineté Numérique : Reprendre le contrôle de nos esprits",
          slug: "souverainete-numerique-reprendre-le-controle",
          content: `<p>Dans un monde où chaque seconde d'attention est marchandée au plus offrant par des algorithmes de capture, la souveraineté numérique n'est plus une simple option technique : c'est un impératif éthique et politique.</p>
<p>Pour l'auteur indépendant, habiter sa propre plateforme sans intermédiaire de censure ou de recommandation biaisée est le premier pas vers une écriture libre et affranchie du bruit ambiant.</p>
<h2>Le Sanctuaire de la pensée libre</h2>
<p>Sur qoe.fi, l'architecture du silence offre aux auteurs et aux lecteurs un espace monastique de concentration. Pas de bandeaux intrusifs, pas de suggestions infinies de vidéos stimulantes. Juste le texte, brut, magnifique, et la profondeur de la réflexion.</p>`,
          published: true,
          isPremium: false,
          readingTime: 4,
          categoryId: cat1.id,
          authorId: dbUser.id,
          seoTitle: "Souveraineté Numérique - Reprendre le contrôle",
          seoDescription: "Analyse sur la reconquête de notre attention numérique et la souveraineté de l'écriture indépendante.",
        },
      });

      await prisma.article.create({
        data: {
          title: "Écologie politique et résilience territoriale à l'ère de l'Anthropocène",
          slug: "ecologie-politique-resilience-territoriale",
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
        },
      });

      await prisma.article.create({
        data: {
          title: "[Premium] Le Manifeste pour un journalisme de l'attention",
          slug: "manifeste-journalisme-attention-premium",
          content: `<p>Cet article est réservé à nos membres Premium. Merci de votre soutien indéfectible qui finance notre indépendance et la rigueur de notre travail.</p>
<p>Le journalisme moderne est mort de sa dépendance aux clics. Pour survivre et retrouver sa dignité, le journalisme doit devenir un sanctuaire pour l'attention du lecteur. Nous ne vendons pas votre cerveau disponible aux publicitaires ; nous construisons ensemble un patrimoine intellectuel commun.</p>`,
          published: true,
          isPremium: true,
          readingTime: 8,
          categoryId: cat1.id,
          authorId: dbUser.id,
        },
      });
    }

    return { success: true, user: dbUser, authWarning };
  } catch (error: any) {
    console.error("Error in createMockUserAction Prisma/Seed operations:", error);
    return { success: false, error: error?.message || "Prisma or seeding operation failed" };
  }
}

/**
 * ✍️ Génère 15 pensées (micro-posts) premium aléatoires sur la timeline globale pour égayer le Feed.
 */
export async function generateMockFeedPostsAction() {
  try {
    const creators = await prisma.user.findMany({
      where: { role: "creator" },
      take: 10,
    });

    if (creators.length === 0) {
      throw new Error("Veuillez d'abord créer au moins un utilisateur 'creator' avec les devtools !");
    }

    const quotes = [
      "Dans un monde de stimulations algorithmiques continues, la lecture silencieuse est un acte de résistance spirituelle.",
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

    const tagsOptions = [["philosophie", "souverainete"], ["ecologie", "politique"], ["attention", "silence"], ["medias"], ["technologie", "ethique"]];

    for (let i = 0; i < 15; i++) {
      const author = creators[Math.floor(Math.random() * creators.length)];
      const quote = quotes[Math.floor(Math.random() * quotes.length)];
      const tags = tagsOptions[Math.floor(Math.random() * tagsOptions.length)];

      await prisma.thought.create({
        data: {
          content: `${quote} #${tags.join(" #")}`,
          authorId: author.id,
          tags,
          visibility: "public",
          isDraft: false,
        },
      });
    }

    return { success: true };
  } catch (error: any) {
    console.error("Error in generateMockFeedPostsAction:", error);
    return { success: false, error: error?.message || "Unknown error" };
  }
}

/**
 * 🧹 Réinitialise entièrement la base de données de test locale de manière ordonnée.
 * Recrée ensuite les configurations système par défaut.
 */
export async function resetDatabaseAction() {
  try {
    // Ordre strict pour éviter de briser l'intégrité référentielle
    await prisma.like.deleteMany({});
    await prisma.thought.deleteMany({});
    await prisma.navigationItem.deleteMany({});
    await prisma.socialLink.deleteMany({});
    await prisma.highlight.deleteMany({});
    await prisma.bookmark.deleteMany({});
    await prisma.subscriber.deleteMany({});
    await prisma.walletTransaction.deleteMany({});
    await prisma.follows.deleteMany({});
    await prisma.mutedWord.deleteMany({});
    await prisma.blockedUser.deleteMany({});
    await prisma.letter.deleteMany({});
    await prisma.article.deleteMany({});
    await prisma.category.deleteMany({});
    await prisma.systemConfig.deleteMany({});
    await prisma.partnerPromo.deleteMany({});
    await prisma.trend.deleteMany({});
    await prisma.user.deleteMany({});

    // Ré-injecter les configurations par défaut de la Landing Page
    const defaultConfigs = [
      { key: "hero_pitch_read", value: "Une lecture monastique, libérée du bruit." },
      { key: "hero_pitch_publish", value: "Devenez le souverain de votre propre média." },
      { key: "creators_title", value: "Ils écrivent sur qoe.fi" },
      { key: "creators_tagline", value: "Des voix libres et indépendantes" },
      { key: "format_title", value: "Cinq Formats de Récits" },
      { key: "format_tagline", value: "Au-delà du simple mur de texte" },
      { key: "featured_title", value: "Écrits Majeurs" },
      { key: "featured_tagline", value: "Sélection Écologique et Politique" },
      { key: "comparison_title", value: "Souveraineté ou Intermédiation ?" },
      { key: "comparison_tagline", value: "Pourquoi qoe.fi redéfinit l'édition indépendante" },
      { key: "preview_title", value: "L'architecture du silence" },
      {
        key: "preview_content",
        value: "Dans un monde saturé de stimuli, la lecture souveraine n'est pas un acte de consommation, mais une forme de résistance. C'est ici, dans ce Sanctuaire Elfique, que l'esprit retrouve sa trajectoire originelle, loin des algorithmes de capture de l'attention.",
      },
      { key: "cta_title", value: "Prêt à habiter votre esprit ?" },
      {
        key: "cta_description",
        value: "Rejoignez un réseau où la qualité prime sur la quantité, et où votre attention est le bien le plus précieux.",
      },
    ];

    for (const cfg of defaultConfigs) {
      await prisma.systemConfig.create({
        data: {
          key: cfg.key,
          value: cfg.value,
          description: "Default dev configuration",
        },
      });
    }

    return { success: true };
  } catch (error: any) {
    console.error("Error in resetDatabaseAction:", error);
    return { success: false, error: error?.message || "Database reset failed" };
  }
}

/**
 * 📧 Simule un abonnement d'un lecteur (par email) vers un créateur.
 */
export async function simulateSubscriberAction({
  creatorId,
  email,
  isPremium = false,
  ltvCents = 0,
}: {
  creatorId: string;
  email: string;
  isPremium?: boolean;
  ltvCents?: number;
}) {
  try {
    const subscriber = await prisma.subscriber.upsert({
      where: {
        email_creatorId: {
          email: email.trim().toLowerCase(),
          creatorId,
        },
      },
      update: {
        isActive: true,
        isPremium,
        ltvCents: { increment: ltvCents },
      },
      create: {
        email: email.trim().toLowerCase(),
        creatorId,
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
            type: "SUBSCRIPTION_PAYMENT",
          },
        });
        // Ajouter cet argent au portefeuille du créateur
        await prisma.user.update({
          where: { id: creatorId },
          data: {
            walletBalanceCents: { increment: ltvCents },
          },
        });
        await prisma.walletTransaction.create({
          data: {
            userId: creatorId,
            amountCents: ltvCents,
            type: "DEPOSIT",
          },
        });
      }
    }

    return { success: true, subscriber };
  } catch (error: any) {
    console.error("Error in simulateSubscriberAction:", error);
    return { success: false, error: error?.message || "Subscription simulation failed" };
  }
}

/**
 * 🤝 Simule une liaison d'abonnement (Follow) entre deux utilisateurs.
 */
export async function simulateFollowAction({
  readerId,
  creatorId,
}: {
  readerId: string;
  creatorId: string;
}) {
  try {
    if (readerId === creatorId) {
      throw new Error("Un utilisateur ne peut pas s'abonner (follow) à lui-même !");
    }

    const follow = await prisma.follows.upsert({
      where: {
        readerId_creatorId: {
          readerId,
          creatorId,
        },
      },
      update: {},
      create: {
        readerId,
        creatorId,
      },
    });

    return { success: true, follow };
  } catch (error: any) {
    console.error("Error in simulateFollowAction:", error);
    return { success: false, error: error?.message || "Follow simulation failed" };
  }
}

/**
 * ❤️ Bascule (toggle) un Like sur un micro-post de feed pour un utilisateur.
 */
export async function simulateLikeAction({
  postId,
  userId,
}: {
  postId: string;
  userId: string;
}) {
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
  } catch (error: any) {
    console.error("Error in simulateLikeAction:", error);
    return { success: false, error: error?.message || "Like toggle failed" };
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
        type: amountCents >= 0 ? "DEPOSIT" : "WITHDRAWAL",
      },
    });

    return { success: true, balanceCents: user.walletBalanceCents };
  } catch (error: any) {
    console.error("Error in addMockFundsAction:", error);
    return { success: false, error: error?.message || "Failed to adjust wallet balance" };
  }
}

/**
 * 🔄 Réinitialise l'état d'onboarding de tous les utilisateurs (ou d'un seul) pour faciliter les tests.
 */
export async function resetOnboardingAction() {
  try {
    await prisma.user.updateMany({
      data: {
        hasCompletedOnboarding: false,
      },
    });
    return { success: true };
  } catch (error: any) {
    console.error("Error in resetOnboardingAction:", error);
    return { success: false, error: error?.message || "Failed to reset onboarding" };
  }
}

export async function impersonateLoginAction(email: string) {
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return { success: false, error: "Utilisateur introuvable dans PostgreSQL" };
    }

    const supabase = await createClient();

    // 1. Tenter la connexion Supabase avec le mot de passe universel dev
    let signInResult = await supabase.auth.signInWithPassword({
      email,
      password: "password123",
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
            password: "password123",
            email_confirm: true,
          });
        } else {
          await adminSupabase.auth.admin.createUser({
            email,
            password: "password123",
            email_confirm: true,
            user_metadata: { name: user.name, username: user.username },
          });
        }

        // Réessayer la connexion
        signInResult = await supabase.auth.signInWithPassword({
          email,
          password: "password123",
        });
      } catch (adminErr: any) {
        console.error("Admin user sync error in impersonateLoginAction:", adminErr);
      }
    }

    if (signInResult.error) {
      return { success: false, error: signInResult.error.message };
    }

    return { success: true, user };
  } catch (error: any) {
    return { success: false, error: error?.message || "Impersonation error" };
  }
}

export async function logoutAction() {
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error?.message || "Logout error" };
  }
}
