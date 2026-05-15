import React from "react";
import { cn } from "@/lib/utils";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  variant?: "default" | "glass" | "accent" | "cursor";
}

export const Card = ({ children, className, variant = "default" }: CardProps) => {
  const variants = {
    default: "bg-surface-container-lowest border border-surface-container-highest shadow-sm",
    glass: "bg-white/60 backdrop-blur-xl border border-white/50 shadow-lg",
    accent: "bg-primary text-white border-none shadow-xl",
    cursor: "cursor-card",
  };

  return (
    <div className={cn("p-8 rounded-2xl transition-all duration-300", variants[variant], className)}>
      {children}
    </div>
  );
};
