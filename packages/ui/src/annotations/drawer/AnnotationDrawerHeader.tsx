'use client';

import { ChevronLeft, ChevronRight, X } from 'lucide-react';

import { Button } from '../../primitives/button/button';
import { t } from '@lingui/core/macro';

/**
 * En-tête fixe du tiroir.
 *
 * ⚠️ Les trois contrôles (précédent, compteur, suivant) et la fermeture
 * sont toujours rendus, même sur un seul passage. Les flèches désactivées
 * gardent leur place : changer de nature ou de passage ne déplace jamais
 * ce que le curseur trouve sous lui.
 */
export function AnnotationDrawerHeader({
  label,
  index,
  total,
  onPrev,
  onNext,
  onClose,
}: {
  label: string;
  index: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
}) {
  const count = Math.max(total, 1);

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border/40 px-4">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span aria-hidden className="qoe-annotation-dot size-1.5 shrink-0 rounded-full" />
        <h2
          id="annotation-drawer-title"
          className="truncate type-control-md font-medium text-foreground"
        >
          {label}
        </h2>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <div
          className="flex items-center"
          role="group"
          aria-label={t`Parcourir les annotations de l’article`}
        >
          <Button
            size="xs"
            shape="icon"
            variant="ghost"
            onClick={onPrev}
            disabled={index === 0}
            aria-label={t`Annotation précédente`}
            title={t`Annotation précédente (Flèche gauche)`}
            className="text-muted-foreground"
          >
            <ChevronLeft />
          </Button>
          <span
            aria-live="polite"
            className="w-16 shrink-0 text-center type-control-xs tabular-nums text-muted-foreground"
          >
            {index + 1} / {count}
          </span>
          <Button
            size="xs"
            shape="icon"
            variant="ghost"
            onClick={onNext}
            disabled={index >= count - 1}
            aria-label={t`Annotation suivante`}
            title={t`Annotation suivante (Flèche droite)`}
            className="text-muted-foreground"
          >
            <ChevronRight />
          </Button>
        </div>

        <span aria-hidden className="mx-1 h-4 w-px bg-border/60" />

        <Button
          size="xs"
          shape="icon"
          variant="ghost"
          onClick={onClose}
          aria-label={t`Fermer l’annotation`}
          title={t`Fermer (Échap)`}
          className="text-muted-foreground hover:text-foreground"
        >
          <X />
        </Button>
      </div>
    </header>
  );
}
