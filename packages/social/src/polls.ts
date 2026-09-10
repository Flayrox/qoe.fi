// =====================================================================
// 📊 polls.ts — Calcul et normalisation des sondages d'opinion
// =====================================================================

export interface RawPollOption {
  id: string;
  text: string;
  order: number;
  _count?: { votes: number };
}

export interface RawPollVote {
  optionId: string;
  userId: string;
}

export interface RawPoll {
  id: string;
  thoughtId: string;
  expiresAt: Date | string;
  options?: RawPollOption[];
  votes?: RawPollVote[];
}

export interface FormattedPollOption {
  id: string;
  text: string;
  order: number;
  voteCount: number;
  percentage: number;
}

export interface FormattedPoll {
  id: string;
  thoughtId: string;
  expiresAt: Date | string;
  isExpired: boolean;
  totalVotes: number;
  userVotedOptionId: string | null;
  options: FormattedPollOption[];
}

/**
 * Normalise les données brutes d'un sondage (calcul total, pourcentages, statut d'expiration et vote utilisateur).
 */
export function formatPollData(
  rawPoll: RawPoll | null | undefined,
  currentUserId?: string | null,
  nowInput: Date | number = Date.now()
): FormattedPoll | null {
  if (!rawPoll) return null;

  const totalVotes = rawPoll.options
    ? rawPoll.options.reduce((acc: number, opt) => acc + (opt._count?.votes || 0), 0)
    : 0;

  const nowDate = typeof nowInput === 'number' ? new Date(nowInput) : nowInput;
  const expiresDate = new Date(rawPoll.expiresAt);
  const isExpired = nowDate > expiresDate;

  const userVote =
    currentUserId && Array.isArray(rawPoll.votes)
      ? rawPoll.votes.find((v) => v.userId === currentUserId)
      : null;

  const options: FormattedPollOption[] = (rawPoll.options || []).map((opt) => {
    const voteCount = opt._count?.votes ?? 0;
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
    id: rawPoll.id,
    thoughtId: rawPoll.thoughtId,
    expiresAt: rawPoll.expiresAt,
    isExpired,
    totalVotes,
    userVotedOptionId: userVote ? userVote.optionId : null,
    options,
  };
}
