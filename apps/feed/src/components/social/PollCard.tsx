"use client";

import React, { useState } from "react";
import { CheckCircle2, Clock, Loader2, BarChart2 } from "lucide-react";
import { votePollAction } from "@qoe/api-client";

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
}

export function PollCard({ poll: initialPoll, onVoteSuccess }: PollCardProps) {
  const [poll, setPoll] = useState<PollData>(initialPoll);
  const [isVoting, setIsVoting] = useState(false);
  const [votingOptionId, setVotingOptionId] = useState<string | null>(null);

  const isExpired = poll.isExpired || new Date(poll.expiresAt) <= new Date();
  const hasVoted = Boolean(poll.userVotedOptionId);
  const showResults = hasVoted || isExpired;

  const handleVote = async (optionId: string) => {
    if (showResults || isVoting) return;

    setIsVoting(true);
    setVotingOptionId(optionId);

    try {
      const res = await votePollAction({ pollId: poll.id, optionId });
      if (res.ok && res.data.poll) {
        setPoll(res.data.poll);
        if (onVoteSuccess) onVoteSuccess(res.data.poll);
      }
    } catch (err) {
      console.error("Error voting on poll:", err);
    } finally {
      setIsVoting(false);
      setVotingOptionId(null);
    }
  };

  const getTimeRemainingText = () => {
    if (isExpired) return "Sondage terminé";
    const diffMs = new Date(poll.expiresAt).getTime() - Date.now();
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    if (hours >= 24) {
      const days = Math.floor(hours / 24);
      return `${days} jour${days > 1 ? "s" : ""} restant${days > 1 ? "s" : ""}`;
    }
    if (hours > 0) return `${hours} h restante${hours > 1 ? "s" : ""}`;
    const mins = Math.max(1, Math.floor(diffMs / (1000 * 60)));
    return `${mins} min restante${mins > 1 ? "s" : ""}`;
  };

  return (
    <div className="rounded-2xl border border-border/60 bg-card/50 backdrop-blur-md p-4 space-y-3 shadow-2xs font-sans my-2">
      <div className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground pb-1">
        <BarChart2 className="w-3.5 h-3.5 text-primary" />
        <span>Sondage</span>
      </div>

      <div className="space-y-2">
        {poll.options.map((option) => {
          const isSelected = poll.userVotedOptionId === option.id;

          if (showResults) {
            return (
              <div
                key={option.id}
                className="relative overflow-hidden rounded-xl border border-border/50 bg-background/60 p-3 flex items-center justify-between text-xs font-medium"
              >
                {/* Progress bar background fill */}
                <div
                  className={`absolute left-0 top-0 bottom-0 transition-all duration-500 ease-out ${
                    isSelected ? "bg-primary/25 border-r-2 border-primary" : "bg-muted/60"
                  }`}
                  style={{ width: `${option.percentage}%` }}
                />

                <div className="relative z-10 flex items-center gap-2 min-w-0 pr-2">
                  <span className={`line-clamp-1 ${isSelected ? "font-bold text-primary" : "text-foreground"}`}>
                    {option.text}
                  </span>
                  {isSelected && <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />}
                </div>

                <span className="relative z-10 font-bold text-xs text-foreground shrink-0 pl-2">
                  {option.percentage}%
                </span>
              </div>
            );
          }

          return (
            <button
              key={option.id}
              onClick={() => handleVote(option.id)}
              disabled={isVoting}
              className="w-full text-left p-3 rounded-xl border border-border/60 bg-background/80 hover:bg-primary/10 hover:border-primary/40 text-xs font-semibold text-foreground transition-all duration-150 flex items-center justify-between group active:scale-[0.99] disabled:opacity-50"
            >
              <span className="group-hover:text-primary transition-colors line-clamp-1 pr-2">
                {option.text}
              </span>
              {isVoting && votingOptionId === option.id && (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-primary shrink-0" />
              )}
            </button>
          );
        })}
      </div>

      {/* Footer info */}
      <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1">
        <span>
          {poll.totalVotes} vote{poll.totalVotes > 1 ? "s" : ""}
        </span>
        <div className="flex items-center gap-1 font-medium">
          <Clock className="w-3 h-3" />
          <span>{getTimeRemainingText()}</span>
        </div>
      </div>
    </div>
  );
}
