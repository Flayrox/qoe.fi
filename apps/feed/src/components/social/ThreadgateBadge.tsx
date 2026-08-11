"use client";

import React from "react";
import { Users, UserCheck, AtSign, Lock } from "lucide-react";

export type ReplyRestrictionType = "everyone" | "subscribers" | "following" | "mentioned";

export interface ThreadgateBadgeProps {
  restriction: ReplyRestrictionType;
  className?: string;
}

export function ThreadgateBadge({ restriction, className = "" }: ThreadgateBadgeProps) {
  if (!restriction || restriction === "everyone") {
    return null;
  }

  const getConfig = () => {
    switch (restriction) {
      case "subscribers":
        return {
          label: "Abonnés uniquement",
          description: "Seuls les abonnés à cet auteur peuvent répondre.",
          icon: Users,
        };
      case "following":
        return {
          label: "Comptes suivis",
          description: "Seules les personnes suivies par l'auteur peuvent répondre.",
          icon: UserCheck,
        };
      case "mentioned":
        return {
          label: "Personnes mentionnées",
          description: "Seules les personnes mentionnées dans ce message peuvent répondre.",
          icon: AtSign,
        };
      default:
        return {
          label: "Réponses restreintes",
          description: "Les réponses à cette publication sont restreintes.",
          icon: Lock,
        };
    }
  };

  const config = getConfig();
  const Icon = config.icon;

  return (
    <div
      title={config.description}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-primary/10 text-primary border border-primary/20 shadow-2xs ${className}`}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span>{config.label}</span>
    </div>
  );
}
