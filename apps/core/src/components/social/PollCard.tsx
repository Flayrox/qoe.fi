'use client';

import React, { useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { votePollAction } from '@qoe/api-client';
import { cn } from '@qoe/utils';

export interface PollOption {
  id: string;
  text: string;
  order: number;
  voteCount: number;
  percentage: number;
}

export interface PollData {
  id: string;
  thoughtId: string;
  expiresAt: string | Date;
  isExpired: boolean;
  totalVotes: number;
  userVotedOptionId?: string | null;
  options: PollOption[];
}

export interface PollCardProps {
  poll: PollData;
  onVoteSuccess?: (updatedPoll: PollData) => void;
  className?: string;
}

export function PollCard({ poll: initialPoll, onVoteSuccess, className }: PollCardProps) {
  const [poll, setPoll] = useState<PollData>(initialPoll);
  const [isVoting, setIsVoting] = useState(false);
  const [votingOptionId, setVotingOptionId] = useState<string | null>(null);
  const [, setNow] = useState(Date.now());

  React.useEffect(() => {
    setPoll(initialPoll);
  }, [initialPoll]);

  React.useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  const isExpired = poll.isExpired || new Date(poll.expiresAt).getTime() <= Date.now();
  const hasVoted = Boolean(poll.userVotedOptionId);
  const showResults = hasVoted || isExpired;

  const handleVote = async (optionId: string) => {
    if (showResults || isVoting) return;

    setIsVoting(true);
    setVotingOptionId(optionId);

    const prevPoll = { ...poll };
    const newTotalVotes = poll.totalVotes + 1;
    const updatedOptions = poll.options.map((opt) => {
      const isThisOpt = opt.id === optionId;
      const newVotes = opt.voteCount + (isThisOpt ? 1 : 0);
      const percentage = Math.round((newVotes / newTotalVotes) * 100);
      return {
        ...opt,
        voteCount: newVotes,
        percentage,
      };
    });

    const optimisticPoll: PollData = {
      ...poll,
      totalVotes: newTotalVotes,
      userVotedOptionId: optionId,
      options: updatedOptions,
    };

    setPoll(optimisticPoll);

    try {
      const res = await votePollAction({ thoughtId: poll.thoughtId, optionId });
      if (res.ok && res.data?.poll) {
        setPoll(res.data.poll);
        if (onVoteSuccess) onVoteSuccess(res.data.poll);
      } else {
        setPoll(prevPoll);
      }
    } catch (err) {
      console.error('Error voting on poll:', err);
      setPoll(prevPoll);
    } finally {
      setIsVoting(false);
      setVotingOptionId(null);
    }
  };

  const getTimeRemainingText = () => {
    if (isExpired) return 'Sondage terminé';
    const diffMs = new Date(poll.expiresAt).getTime() - Date.now();
    if (diffMs <= 0) return 'Sondage terminé';

    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    if (hours >= 24) {
      const days = Math.floor(hours / 24);
      return `${days}j restant${days > 1 ? 's' : ''}`;
    }
    if (hours > 0) return `${hours}h restante${hours > 1 ? 's' : ''}`;
    const mins = Math.max(1, Math.floor(diffMs / (1000 * 60)));
    return `${mins} min restante${mins > 1 ? 's' : ''}`;
  };

  return (
    <div
      role="radiogroup"
      aria-label="Sondage interactif"
      className={cn(
        'rounded-2xl border border-border/40 bg-card/30 p-3 space-y-2 font-sans my-2.5 transition-colors',
        className
      )}
    >
      {/* Options List */}
      <div className="space-y-1.5">
        {poll.options.map((option) => {
          const isSelected = poll.userVotedOptionId === option.id;

          if (showResults) {
            return (
              <div
                key={option.id}
                role="radio"
                aria-checked={isSelected}
                aria-label={`${option.text}, ${option.percentage}% des votes`}
                className="relative overflow-hidden rounded-xl border border-border/30 bg-muted/20 p-2.5 flex items-center justify-between text-xs transition-all"
              >
                {/* Smooth Neutral Progress bar fill — Apple minimal */}
                <div
                  className={cn(
                    'absolute left-0 top-0 bottom-0 transition-all duration-700 ease-out rounded-xl',
                    isSelected
                      ? 'bg-foreground/15 border-r border-foreground/30'
                      : 'bg-foreground/5'
                  )}
                  style={{ width: `${Math.max(option.percentage, 2)}%` }}
                />

                <div className="relative z-10 flex items-center gap-2 min-w-0 pr-2">
                  <span
                    className={cn(
                      'truncate text-xs',
                      isSelected
                        ? 'font-semibold text-foreground'
                        : 'text-foreground/80 font-normal'
                    )}
                  >
                    {option.text}
                  </span>
                  {isSelected && (
                    <span className="flex items-center justify-center w-3.5 h-3.5 rounded-full bg-foreground text-background shrink-0">
                      <Check className="w-2.5 h-2.5 stroke-[3]" />
                    </span>
                  )}
                </div>

                <span className="relative z-10 font-mono text-[11px] text-muted-foreground font-medium shrink-0 pl-2">
                  {option.percentage}%
                </span>
              </div>
            );
          }

          return (
            <button
              key={option.id}
              role="radio"
              aria-checked={false}
              aria-label={`Voter pour ${option.text}`}
              onClick={() => handleVote(option.id)}
              disabled={isVoting}
              className="w-full text-left p-2.5 rounded-xl border border-border/40 bg-background/60 hover:bg-muted/30 hover:border-foreground/20 text-xs font-medium text-foreground transition-all duration-150 flex items-center justify-between group active:scale-[0.99] disabled:opacity-50 cursor-pointer"
            >
              <span className="truncate pr-2 font-normal group-hover:font-medium transition-all">
                {option.text}
              </span>
              {isVoting && votingOptionId === option.id && (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground shrink-0" />
              )}
            </button>
          );
        })}
      </div>

      {/* Minimal Footer Info */}
      <div className="flex items-center justify-between text-[11px] text-muted-foreground/70 font-normal pt-0.5 px-0.5">
        <span>
          {poll.totalVotes} vote{poll.totalVotes > 1 ? 's' : ''} · {getTimeRemainingText()}
        </span>
        {hasVoted && (
          <span className="text-foreground/70 font-medium text-[10px]">Vote enregistré</span>
        )}
      </div>
    </div>
  );
}
