import React from 'react';
import { cn } from '@qoe/utils';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  variant?: 'default' | 'glass' | 'accent' | 'cursor';
}

export const Card = ({ children, className, variant = 'default' }: CardProps) => {
  const variants = {
    default: 'bg-card border border-border shadow-sm',
    glass: 'bg-background/60 backdrop-blur-xl border border-border/50 shadow-lg',
    accent: 'bg-primary text-primary-foreground border-none shadow-xl',
    cursor:
      'relative overflow-hidden bg-card border border-border/30 hover:border-primary/30 hover:shadow-[0_0_20px_rgba(0,0,0,0.05)] dark:hover:shadow-[0_0_20px_rgba(255,255,255,0.03)] transition-all duration-500',
  };

  return (
    <div
      className={cn('p-8 rounded-2xl transition-all duration-300', variants[variant], className)}
    >
      {children}
    </div>
  );
};
