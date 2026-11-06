'use client';

import * as React from 'react';
import { MoreHorizontal } from 'lucide-react';
import { Button } from '@qoe/ui/button';
import { cn } from '@qoe/utils';

// =====================================================================
// 🖱️ RowActions — le clic droit qui sert à quelque chose
// =====================================================================
// Un opérateur ne remonte pas à la souris jusqu'à une colonne « … » pour
// assigner un dossier : il clique droit là où il regarde. La même liste
// d'actions alimente les deux affordances (menu de ligne et menu contextuel),
// donc les deux ne peuvent pas diverger.
//
// Pas d'overlay plein écran : un `pointerdown` hors du menu le referme, ce qui
// laisse le reste de la page vivant (un overlay fait main piège le focus, le
// scroll et Échap).
// =====================================================================

export interface RowActionItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  /** Raccourci affiché à droite (purement informatif). */
  shortcut?: string;
  tone?: 'default' | 'danger';
  disabled?: boolean;
  onSelect: () => void;
}

const MENU_WIDTH = 216;
const ITEM_HEIGHT = 28;

function clamp(point: { x: number; y: number }, count: number): { x: number; y: number } {
  if (typeof window === 'undefined') return point;
  const height = count * ITEM_HEIGHT + 10;
  return {
    x: Math.max(8, Math.min(point.x, window.innerWidth - MENU_WIDTH - 8)),
    y: Math.max(8, Math.min(point.y, window.innerHeight - height - 8)),
  };
}

function ActionList({
  items,
  label,
  point,
  onClose,
}: {
  items: RowActionItem[];
  label: string;
  point: { x: number; y: number };
  onClose: () => void;
}) {
  const menuRef = React.useRef<HTMLDivElement>(null);
  const position = clamp(point, items.length);

  React.useEffect(() => {
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not([disabled])')?.focus();
  }, []);

  React.useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    const onScroll = () => onClose();
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [onClose]);

  const move = (direction: 1 | -1) => {
    const nodes = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])') ??
        []
    );
    if (nodes.length === 0) return;
    const index = nodes.indexOf(document.activeElement as HTMLButtonElement);
    nodes[(index + direction + nodes.length) % nodes.length]?.focus();
  };

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={label}
      style={{ left: position.x, top: position.y, width: MENU_WIDTH }}
      onKeyDown={(event) => {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          move(1);
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          move(-1);
        }
      }}
      className="fixed z-50 rounded-md border border-border bg-popover p-1 shadow-lg"
    >
      {items.map((item) => (
        <Button
          key={item.id}
          type="button"
          role="menuitem"
          variant="ghost"
          size="xs"
          disabled={item.disabled}
          onClick={() => {
            onClose();
            item.onSelect();
          }}
          className={cn(
            'h-7 w-full justify-start gap-2 px-2 font-normal',
            item.tone === 'danger' ? 'text-destructive-text' : 'text-foreground'
          )}
        >
          {item.icon && (
            <span className="shrink-0 text-muted-foreground" aria-hidden>
              {item.icon}
            </span>
          )}
          <span className="flex-1 truncate text-left">{item.label}</span>
          {item.shortcut && (
            <span className="shrink-0 text-[10px] text-muted-foreground">{item.shortcut}</span>
          )}
        </Button>
      ))}
    </div>
  );
}

/** Menu contextuel, ouvert à des coordonnées données (clic droit). */
export function RowActionsSurface({
  items,
  label,
  point,
  onClose,
}: {
  items: RowActionItem[];
  label: string;
  point: { x: number; y: number };
  onClose: () => void;
}) {
  if (items.length === 0) return null;
  return <ActionList items={items} label={label} point={point} onClose={onClose} />;
}

/** Déclencheur de ligne : le même menu, ancré au bouton « … ». */
export function RowActions({ items, label }: { items: RowActionItem[]; label: string }) {
  const [point, setPoint] = React.useState<{ x: number; y: number } | null>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const close = React.useCallback(() => setPoint(null), []);

  if (items.length === 0) return null;

  return (
    <>
      <Button
        ref={triggerRef}
        type="button"
        variant="ghost"
        size="xs"
        shape="icon"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={point !== null}
        onClick={() => {
          const rect = triggerRef.current?.getBoundingClientRect();
          if (!rect) return;
          setPoint({ x: rect.right - MENU_WIDTH, y: rect.bottom + 4 });
        }}
        className="text-muted-foreground"
      >
        <MoreHorizontal className="size-3.5" aria-hidden strokeWidth={1.75} />
      </Button>
      {point && <ActionList items={items} label={label} point={point} onClose={close} />}
    </>
  );
}
