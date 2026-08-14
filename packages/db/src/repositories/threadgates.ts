// =====================================================================
// 🛡️ Threadgates & Moderation Repository — Contrôle de Réponses
// =====================================================================

import { prisma } from '../client';
import { getOrCreatePersonalPublication } from './publications';

export type ReplyRestrictionType = 'everyone' | 'subscribers' | 'following' | 'mentioned';

export interface CanReplyResult {
  canReply: boolean;
  reason?: string;
  restriction: ReplyRestrictionType;
}

/**
 * 🔒 Vérifie si un utilisateur a le droit de répondre à un Thought selon la restriction Threadgate.
 */
export async function canUserReplyToThought(
  thoughtId: string,
  replyingUserId: string
): Promise<CanReplyResult> {
  const thought = await prisma.thought.findUnique({
    where: { id: thoughtId },
    select: {
      authorId: true,
      replyRestriction: true,
      content: true,
      author: { select: { username: true } },
    },
  });

  if (!thought) {
    return { canReply: false, reason: 'Pensée introuvable.', restriction: 'everyone' };
  }

  const restriction = (thought.replyRestriction as ReplyRestrictionType) || 'everyone';

  // L'auteur peut toujours répondre à ses propres pensées
  if (replyingUserId === thought.authorId) {
    return { canReply: true, restriction };
  }

  if (restriction === 'everyone') {
    return { canReply: true, restriction };
  }

  if (restriction === 'subscribers') {
    // Vérification de l'abonnement (clé par publication de l'auteur)
    const authorPublication = await getOrCreatePersonalPublication(thought.authorId);
    const sub = await prisma.subscriber.findFirst({
      where: {
        publicationId: authorPublication.id,
        userId: replyingUserId,
        isActive: true,
      },
    });
    if (sub) {
      return { canReply: true, restriction };
    }
    return {
      canReply: false,
      reason: "Seuls les abonnés de l'auteur peuvent répondre à ce message.",
      restriction,
    };
  }

  if (restriction === 'following') {
    // L'auteur du message doit suivre la publication de l'utilisateur qui tente de répondre
    const replyingPublication = await getOrCreatePersonalPublication(replyingUserId);
    const follow = await prisma.follows.findUnique({
      where: {
        readerId_publicationId: {
          readerId: thought.authorId,
          publicationId: replyingPublication.id,
        },
      },
    });
    if (follow) {
      return { canReply: true, restriction };
    }
    return {
      canReply: false,
      reason: "Seuls les comptes suivis par l'auteur peuvent répondre.",
      restriction,
    };
  }

  if (restriction === 'mentioned') {
    // L'utilisateur doit être mentionné dans le contenu du Thought
    const replyingUser = await prisma.user.findUnique({
      where: { id: replyingUserId },
      select: { username: true },
    });
    if (replyingUser?.username) {
      const escapedUsername = replyingUser.username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const mentionRegex = new RegExp(`@${escapedUsername}\\b`, 'i');
      if (mentionRegex.test(thought.content)) {
        return { canReply: true, restriction };
      }
    }
    return {
      canReply: false,
      reason: 'Seules les personnes mentionnées peuvent répondre.',
      restriction,
    };
  }

  return { canReply: true, restriction: 'everyone' };
}

/**
 * 🙈 Masque ou démasque une réponse (par l'auteur du Thought parent).
 */
export async function toggleHideReplyByAuthor(replyId: string, authorId: string) {
  const reply = await prisma.thought.findUnique({
    where: { id: replyId },
    select: {
      id: true,
      isHiddenByAuthor: true,
      parent: {
        select: {
          authorId: true,
        },
      },
    },
  });

  if (!reply) {
    throw new Error('Réponse introuvable.');
  }

  // Seul l'auteur de la pensée parente a la permission de masquer une réponse
  if (!reply.parent || reply.parent.authorId !== authorId) {
    throw new Error("Seul l'auteur de la publication originale peut masquer cette réponse.");
  }

  const updated = await prisma.thought.update({
    where: { id: replyId },
    data: { isHiddenByAuthor: !reply.isHiddenByAuthor },
    select: { id: true, isHiddenByAuthor: true },
  });

  return updated;
}
