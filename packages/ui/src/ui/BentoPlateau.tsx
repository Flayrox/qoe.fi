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
        'w-full rounded-[36px] bg-[#EE4B2B] flex flex-col md:flex-row overflow-hidden shadow-2xl p-2 md:p-3 gap-2 md:gap-3',
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
  className?: string;
  innerClassName?: string;
}

export function BentoItem({
  children,
  inactiveContent,
  active,
  flexBasisActive = '72%',
  flexBasisInactive = '28%',
  className,
  innerClassName,
}: BentoItemProps) {
  return (
    // ⚠️ Aucune affordance de clic ici : l'item n'est pas un contrôle.
    // Il portait `onClick` + `cursor-pointer` sans rôle, sans focus et sans
    // activation clavier — promesse de clic que seul un mulot pouvait tenir,
    // et qu'aucun appelant n'utilisait (BentoPlateau n'est qu'une mise en
    // page). Un vrai besoin interactif se compose dans le contenu, avec un
    // vrai `<button>`.
    <motion.div
      layout
      transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
      style={{
        flexBasis: active ? flexBasisActive : flexBasisInactive,
        flexShrink: 0,
        flexGrow: active ? 0 : 1,
      }}
      className={cn('relative rounded-[28px] overflow-hidden min-h-[280px] md:min-h-0', className)}
    >
      {/* Active State (White background) — in-flow pour donner une hauteur
          intrinsèque à l'item (sinon, en flex-col sous `md`, le flex-basis
          en % ne se résout pas et l'item s'effondre en une fine ligne). */}
      <div
        className={cn(
          'relative h-full transition-opacity duration-400',
          active ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
      >
        <div
          className={cn(
            'w-full h-full bg-white rounded-[24px] flex flex-col overflow-hidden',
            innerClassName
          )}
        >
          {children}
        </div>
      </div>

      {/* Inactive State (Red/transparent overlay) — absolu par-dessus le
          contenu actif pour permettre le cross-fade entre états. */}
      <div
        className={cn(
          'absolute inset-0 flex flex-col justify-end p-6 md:p-8 transition-opacity duration-400',
          active ? 'opacity-0 pointer-events-none' : 'opacity-100'
        )}
      >
        {inactiveContent}
      </div>
    </motion.div>
  );
}
