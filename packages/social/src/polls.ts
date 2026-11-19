// =====================================================================
// 📊 polls.ts — Calcul et normalisation des sondages d'opinion
// =====================================================================

export interface RawPollOption {
  id: string;
  text: string;
  order: number;
  /** Shape historique (Prisma) : compteur pré-agrégé. */
  _count?: { votes: number };
  /** Shape de l'API Go (`posts.PollOption`) : compteur déjà calculé. */
  voteCount?: number;
  percentage?: number;
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
  /**
   * Shape de l'API Go (`posts.Poll`, « miroir de formatPollData TS ») : les
   * compteurs, les pourcentages et le statut d'expiration sont déjà calculés
   * côté serveur. Sans ces champs, on retombait à zéro vote et 0 % sur chaque
   * sondage du fil, puisque les options Go n'ont pas de `_count`.
   */
  isExpired?: boolean;
  totalVotes?: number;
  userVotedOptionId?: string | null;
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
 * Normalise un sondage, quel que soit son producteur :
 * - shape Go (`voteCount`, `totalVotes`, `percentage`, `isExpired` déjà calculés)
 *   → valeurs serveur conservées (idempotence avec `posts.Poll`),
 * - shape historique Prisma (`_count.votes` + `votes[]`) → tout est recalculé.
 */
export function formatPollData(
  rawPoll: RawPoll | null | undefined,
  currentUserId?: string | null,
  nowInput: Date | number = Date.now()
): FormattedPoll | null {
  if (!rawPoll) return null;

  const rawOptions = rawPoll.options ?? [];
  const optionVotes = (opt: RawPollOption): number =>
    typeof opt.voteCount === 'number' ? opt.voteCount : (opt._count?.votes ?? 0);

  const totalVotes =
    typeof rawPoll.totalVotes === 'number'
      ? rawPoll.totalVotes
      : rawOptions.reduce((acc: number, opt) => acc + optionVotes(opt), 0);

  const nowDate = typeof nowInput === 'number' ? new Date(nowInput) : nowInput;
  const expiresDate = new Date(rawPoll.expiresAt);
  const isExpired =
    typeof rawPoll.isExpired === 'boolean' ? rawPoll.isExpired : nowDate > expiresDate;

  const userVote =
    currentUserId && Array.isArray(rawPoll.votes)
      ? rawPoll.votes.find((v) => v.userId === currentUserId)
      : null;

  const options: FormattedPollOption[] = rawOptions.map((opt) => {
    const voteCount = optionVotes(opt);
    const percentage =
      typeof opt.percentage === 'number'
        ? opt.percentage
        : totalVotes > 0
          ? Math.round((voteCount / totalVotes) * 100)
          : 0;
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
    userVotedOptionId:
      typeof rawPoll.userVotedOptionId === 'string'
        ? rawPoll.userVotedOptionId
        : userVote
          ? userVote.optionId
          : null,
    options,
  };
}
