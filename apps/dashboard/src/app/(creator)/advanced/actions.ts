'use server';

import { createClient as createServerClient } from '@qoe/supabase/server';
import { prisma } from '@qoe/db/client';
import { notifications } from '@qoe/db';
import { revalidatePath } from 'next/cache';

async function getAuthenticatedUser() {
  const supabase = await createServerClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) throw new Error('Non authentifié');

  const dbUser = await prisma.user.findUnique({ where: { id: authUser.id } });
  if (!dbUser) throw new Error('Utilisateur introuvable');

  return dbUser;
}

/**
 * 🤝 Envoyer une demande de collaboration/co-rédaction sur un article
 */
export async function sendCollaborationRequestAction(articleId: string, inviteeEmail: string) {
  try {
    const inviter = await getAuthenticatedUser();

    if (!inviteeEmail || !inviteeEmail.includes('@')) {
      return { success: false, error: 'Adresse email invalide' };
    }

    const article = await prisma.article.findUnique({ where: { id: articleId } });
    if (!article) {
      return { success: false, error: 'Article non trouvé' };
    }

    if (article.authorId !== inviter.id) {
      return {
        success: false,
        error: "Seul l'auteur principal de l'article peut inviter des co-auteurs",
      };
    }

    const invitee = await prisma.user.findUnique({
      where: { email: inviteeEmail },
      include: { settings: { select: { allowCollaborationInvites: true } } },
    });
    if (!invitee) {
      return { success: false, error: 'Aucun utilisateur trouvé avec cet email' };
    }

    if (invitee.settings?.allowCollaborationInvites === false) {
      return {
        success: false,
        error: 'Ce contributeur a désactivé les invitations de collaboration.',
      };
    }

    if (invitee.id === inviter.id) {
      return {
        success: false,
        error: 'Vous ne pouvez pas vous envoyer une invitation à vous-même',
      };
    }

    const request = await prisma.collaborationRequest.upsert({
      where: {
        articleId_inviteeId: {
          articleId,
          inviteeId: invitee.id,
        },
      },
      update: {
        status: 'PENDING',
        inviterId: inviter.id,
        requestedRole: 'CO_AUTHOR',
        requestedOrder: 1,
        showOnPublicProfile: false,
        acceptedAt: null,
      },
      create: {
        articleId,
        inviterId: inviter.id,
        inviteeId: invitee.id,
        status: 'PENDING',
        requestedRole: 'CO_AUTHOR',
        requestedOrder: 1,
        showOnPublicProfile: false,
      },
    });

    await notifications.createNotification({
      recipientId: invitee.id,
      senderId: inviter.id,
      type: 'ARTICLE_CONTRIBUTOR_INVITED',
      articleId,
    });

    revalidatePath('/advanced');
    return { success: true, request };
  } catch (err: unknown) {
    console.error('[Send Collaboration Request Error]', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Échec de l'envoi de l'invitation",
    };
  }
}

/**
 * 📩 Répondre à une demande de collaboration (Accepter / Refuser + Option Profil Public)
 */
export async function respondToCollaborationRequestAction(
  requestId: string,
  accept: boolean,
  showOnPublicProfile: boolean = true
) {
  try {
    const user = await getAuthenticatedUser();

    const request = await prisma.collaborationRequest.findUnique({
      where: { id: requestId },
      include: { article: true },
    });

    if (!request) {
      return { success: false, error: 'Demande introuvable' };
    }

    if (request.inviteeId !== user.id) {
      return { success: false, error: "Vous n'êtes pas le destinataire de cette invitation" };
    }
    if (request.status !== 'PENDING') {
      return { success: false, error: 'Cette invitation a déjà été traitée.' };
    }

    const nextStatus = accept ? 'ACCEPTED' : 'DECLINED';

    await prisma.collaborationRequest.update({
      where: { id: requestId },
      data: {
        status: nextStatus,
        showOnPublicProfile: accept ? showOnPublicProfile : false,
        acceptedAt: accept ? new Date() : null,
      },
    });

    await prisma.article.update({
      where: { id: request.articleId },
      data: {
        coAuthors: accept ? { connect: { id: user.id } } : { disconnect: { id: user.id } },
      },
    });

    if (accept) {
      await prisma.articleAttribution.upsert({
        where: { articleId_userId: { articleId: request.articleId, userId: user.id } },
        update: {
          role: request.requestedRole,
          order: request.requestedOrder,
          isVisible: showOnPublicProfile,
          consentStatus: 'ACCEPTED',
          consentUpdatedAt: new Date(),
        },
        create: {
          articleId: request.articleId,
          userId: user.id,
          role: request.requestedRole,
          order: request.requestedOrder,
          isVisible: showOnPublicProfile,
          consentStatus: 'ACCEPTED',
          consentUpdatedAt: new Date(),
        },
      });
    } else {
      await prisma.articleAttribution.updateMany({
        where: { articleId: request.articleId, userId: user.id },
        data: {
          consentStatus: 'DECLINED',
          isVisible: false,
          consentUpdatedAt: new Date(),
        },
      });
    }

    await notifications.createNotification({
      recipientId: request.inviterId,
      senderId: user.id,
      type: accept ? 'ARTICLE_CONTRIBUTOR_ACCEPTED' : 'ARTICLE_CONTRIBUTOR_DECLINED',
      articleId: request.articleId,
    });

    revalidatePath('/advanced');
    revalidatePath(`/articles/${request.articleId}`);
    return { success: true };
  } catch (err: unknown) {
    console.error('[Respond Collaboration Error]', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Échec de la réponse à l'invitation",
    };
  }
}

/**
 * ✉️ Invitation structurée depuis l'éditeur d'article.
 * Un contributeur externe n'est jamais ajouté à la byline avant son consentement.
 */
export async function sendArticleContributorInvitationAction(data: {
  articleId: string;
  inviteeId: string;
  role?: string;
  order?: number;
  showOnPublicProfile?: boolean;
}) {
  try {
    const inviter = await getAuthenticatedUser();
    const article = await prisma.article.findUnique({
      where: { id: data.articleId },
      include: { publication: { include: { media: { include: { members: true } } } } },
    });
    if (!article) return { success: false, error: 'Article non trouvé' };

    const isOwner = article.authorId === inviter.id;
    const isMediaMember = article.publication.media?.members.some(
      (member) => member.userId === inviter.id && member.status === 'active'
    );
    if (!isOwner && !isMediaMember) {
      return { success: false, error: "Vous n'êtes pas autorisé à attribuer cet article." };
    }

    const invitee = await prisma.user.findUnique({
      where: { id: data.inviteeId },
      select: {
        id: true,
        isSuspended: true,
        isShadowbanned: true,
        settings: { select: { allowCollaborationInvites: true } },
      },
    });
    if (!invitee || invitee.isSuspended || invitee.isShadowbanned) {
      return { success: false, error: 'Ce contributeur est indisponible.' };
    }
    if (invitee.settings?.allowCollaborationInvites === false) {
      return {
        success: false,
        error: 'Ce contributeur a désactivé les invitations de collaboration.',
      };
    }
    if (invitee.id === article.authorId) {
      return { success: false, error: "L'auteur principal n'a pas besoin d'une invitation." };
    }

    const request = await prisma.collaborationRequest.upsert({
      where: {
        articleId_inviteeId: {
          articleId: data.articleId,
          inviteeId: data.inviteeId,
        },
      },
      update: {
        inviterId: inviter.id,
        status: 'PENDING',
        requestedRole: data.role || 'CO_AUTHOR',
        requestedOrder: data.order ?? 1,
        showOnPublicProfile: false,
        acceptedAt: null,
      },
      create: {
        articleId: data.articleId,
        inviterId: inviter.id,
        inviteeId: data.inviteeId,
        status: 'PENDING',
        requestedRole: data.role || 'CO_AUTHOR',
        requestedOrder: data.order ?? 1,
        showOnPublicProfile: false,
      },
    });

    await notifications.createNotification({
      recipientId: data.inviteeId,
      senderId: inviter.id,
      type: 'ARTICLE_CONTRIBUTOR_INVITED',
      articleId: data.articleId,
    });

    revalidatePath('/advanced');
    revalidatePath(`/articles/${data.articleId}`);
    return { success: true, request };
  } catch (err: unknown) {
    console.error('[Send Article Contributor Invitation Error]', err);
    return { success: false, error: err instanceof Error ? err.message : "Échec de l'invitation" };
  }
}

/** Retire une attribution publique à la demande du propriétaire de l'article. */
export async function removeArticleContributorAction(articleId: string, contributorId: string) {
  try {
    const actor = await getAuthenticatedUser();
    const article = await prisma.article.findUnique({
      where: { id: articleId },
      include: { publication: { include: { media: { include: { members: true } } } } },
    });
    if (!article) return { success: false, error: 'Article non trouvé' };
    const allowed =
      article.authorId === actor.id ||
      Boolean(
        article.publication.media?.members.some(
          (member) => member.userId === actor.id && member.status === 'active'
        )
      );
    if (!allowed) return { success: false, error: 'Action non autorisée' };
    if (contributorId === article.authorId) {
      return { success: false, error: "L'auteur principal ne peut pas être retiré." };
    }

    await prisma.articleAttribution.updateMany({
      where: { articleId, userId: contributorId },
      data: { consentStatus: 'REVOKED', isVisible: false, consentUpdatedAt: new Date() },
    });
    await prisma.article.update({
      where: { id: articleId },
      data: { coAuthors: { disconnect: { id: contributorId } } },
    });
    await prisma.collaborationRequest.updateMany({
      where: { articleId, inviteeId: contributorId },
      data: { status: 'REVOKED', showOnPublicProfile: false },
    });
    await notifications.createNotification({
      recipientId: contributorId,
      senderId: actor.id,
      type: 'ARTICLE_CONTRIBUTOR_REMOVED',
      articleId,
    });
    revalidatePath(`/articles/${articleId}`);
    return { success: true };
  } catch (err: unknown) {
    console.error('[Remove Article Contributor Error]', err);
    return { success: false, error: err instanceof Error ? err.message : 'Échec du retrait' };
  }
}

/** Permet au contributeur de retirer lui-même son consentement. */
export async function withdrawArticleContributorConsentAction(articleId: string) {
  try {
    const contributor = await getAuthenticatedUser();
    const article = await prisma.article.findUnique({ where: { id: articleId } });
    if (!article) return { success: false, error: 'Article non trouvé' };
    if (article.authorId === contributor.id) {
      return { success: false, error: "L'auteur principal ne peut pas retirer son attribution." };
    }

    await prisma.articleAttribution.updateMany({
      where: { articleId, userId: contributor.id },
      data: { consentStatus: 'WITHDRAWN', isVisible: false, consentUpdatedAt: new Date() },
    });
    await prisma.article.update({
      where: { id: articleId },
      data: { coAuthors: { disconnect: { id: contributor.id } } },
    });
    await prisma.collaborationRequest.updateMany({
      where: { articleId, inviteeId: contributor.id },
      data: { status: 'REVOKED', showOnPublicProfile: false },
    });
    await notifications.createNotification({
      recipientId: article.authorId,
      senderId: contributor.id,
      type: 'ARTICLE_CONTRIBUTOR_DECLINED',
      articleId,
    });
    return { success: true };
  } catch (err: unknown) {
    console.error('[Withdraw Article Contributor Consent Error]', err);
    return { success: false, error: err instanceof Error ? err.message : 'Échec du retrait' };
  }
}

/**
 * 📥 Récupérer les demandes de collaboration reçues et envoyées
 */
export async function getCollaborationRequestsAction() {
  try {
    const user = await getAuthenticatedUser();

    const received = await prisma.collaborationRequest.findMany({
      where: { inviteeId: user.id },
      include: {
        article: {
          select: { id: true, title: true, slug: true },
        },
        inviter: {
          select: { id: true, name: true, email: true, username: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const sent = await prisma.collaborationRequest.findMany({
      where: { inviterId: user.id },
      include: {
        article: {
          select: { id: true, title: true, slug: true },
        },
        invitee: {
          select: { id: true, name: true, email: true, username: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return { success: true, received, sent };
  } catch (err: unknown) {
    console.error('[Get Collaboration Requests Error]', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Échec de la récupération',
      received: [],
      sent: [],
    };
  }
}
