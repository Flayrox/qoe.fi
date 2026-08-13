'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@qoe/utils';

interface BentoPlateauProps {
  children: React.ReactNode;
  className?: string;
}

export function BentoPlateau({ children, className }: BentoPlateauProps) {
  return (
    <div
      className={cn(
        'w-full rounded-3xl bg-[#EE4B2B] flex flex-col md:flex-row overflow-hidden p-2 md:p-3 gap-2 md:gap-3 shadow-2xl text-white',
        className
      )}
    >
      {children}
    </div>
  );
}

interface BentoItemProps {
  children: React.ReactNode;
  inactiveContent?: React.ReactNode;
  active: boolean;
  flexBasisActive?: string;
  flexBasisInactive?: string;
  onMouseEnter?: () => void;
  onClick?: () => void;
  className?: string;
  innerClassName?: string;
}

export function BentoItem({
  children,
  inactiveContent,
  active,
  flexBasisActive = '72%',
  flexBasisInactive = '28%',
  onMouseEnter,
  onClick,
  className,
  innerClassName,
}: BentoItemProps) {
  return (
    <motion.div
      layout
      onMouseEnter={onMouseEnter}
      onClick={onClick}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      style={{
        flexBasis: active ? flexBasisActive : flexBasisInactive,
        flexShrink: 0,
        flexGrow: active ? 0 : 1,
      }}
      className={cn(
        'relative rounded-2xl overflow-hidden transition-all duration-200',
        active ? 'bg-white text-foreground shadow-md' : 'bg-[#EE4B2B] text-white',
        className
      )}
    >
      {/* Active State */}
      <div
        className={cn(
          'absolute inset-0 transition-opacity duration-300',
          active ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
      >
        <div
          className={cn(
            'w-full h-full rounded-2xl flex flex-col overflow-hidden text-foreground bg-card',
            innerClassName
          )}
        >
          {children}
        </div>
      </div>

      {/* Inactive State */}
      <div
        className={cn(
          'absolute inset-0 flex flex-col justify-end p-6 md:p-8 transition-opacity duration-300 text-white',
          active ? 'opacity-0 pointer-events-none' : 'opacity-100'
        )}
      >
        {inactiveContent}
      </div>
    </motion.div>
  );
}
