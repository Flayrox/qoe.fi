// =====================================================================
// 📊 Polls Repository — Sondages Interactifs (2 à 4 choix)
// =====================================================================

import { prisma } from "../client";

export interface CreatePollInput {
  thoughtId: string;
  options: string[];
  durationHours?: number; // Défaut 24h
}

export interface VotePollInput {
  pollId: string;
  optionId: string;
  userId: string;
}

/**
 * 📊 Crée un sondage associé à un Thought.
 */
export async function createPollForThought(input: CreatePollInput) {
  const { thoughtId, options, durationHours = 24 } = input;

  const validOptions = options.map((opt) => opt.trim()).filter(Boolean);
  if (validOptions.length < 2 || validOptions.length > 4) {
    throw new Error("Un sondage doit contenir entre 2 et 4 options.");
  }

  const expiresAt = new Date(Date.now() + durationHours * 60 * 60 * 1000);

  return prisma.poll.create({
    data: {
      thoughtId,
      expiresAt,
      options: {
        create: validOptions.map((text, index) => ({
          text,
          order: index,
        })),
      },
    },
    include: {
      options: { orderBy: { order: "asc" } },
    },
  });
}

/**
 * 🔎 Récupère un sondage avec ses résultats calculés et le vote de l'utilisateur.
 */
export async function getPollByThoughtId(thoughtId: string, userId?: string) {
  const poll = await prisma.poll.findUnique({
    where: { thoughtId },
    include: {
      options: {
        orderBy: { order: "asc" },
        include: {
          _count: { select: { votes: true } },
        },
      },
      votes: userId ? { where: { userId }, select: { optionId: true } } : false,
    },
  });

  if (!poll) return null;

  const totalVotes = poll.options.reduce((acc, opt) => acc + opt._count.votes, 0);
  const isExpired = new Date() > poll.expiresAt;
  const userVotedOptionId = userId && poll.votes && poll.votes.length > 0 ? poll.votes[0].optionId : null;

  const formattedOptions = poll.options.map((opt) => {
    const voteCount = opt._count.votes;
    const percentage = totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0;
    return {
      id: opt.id,
      text: opt.text,
      order: opt.order,
      voteCount,
      percentage,
    };
  });

  return {
    id: poll.id,
    thoughtId: poll.thoughtId,
    expiresAt: poll.expiresAt,
    isExpired,
    totalVotes,
    userVotedOptionId,
    options: formattedOptions,
  };
}

/**
 * ⚡ Enregistre un vote de manière idempotente.
 */
export async function votePoll(input: VotePollInput) {
  const { pollId, optionId, userId } = input;

  const poll = await prisma.poll.findUnique({
    where: { id: pollId },
    select: { expiresAt: true, thoughtId: true },
  });

  if (!poll) {
    throw new Error("Sondage introuvable.");
  }

  if (new Date() > poll.expiresAt) {
    throw new Error("Ce sondage est expiré.");
  }

  try {
    await prisma.pollVote.create({
      data: {
        pollId,
        optionId,
        userId,
      },
    });
  } catch (error: any) {
    // Si l'utilisateur a déjà voté (P2002 constraint failure)
    if (error?.code === "P2002") {
      throw new Error("Vous avez déjà voté dans ce sondage.");
    }
    throw error;
  }

  return getPollByThoughtId(poll.thoughtId, userId);
}
