import * as React from 'react';
import { cn } from '@qoe/utils';
import { DENSITY } from './tokens';

// =====================================================================
// 📋 AdminTable — le tableau de la console
// =====================================================================
// Une seule forme pour toutes les surfaces de données : en-tête discret,
// lignes de 40 px, aucun arrondi décoratif. Les colonnes restent aux écrans.
// =====================================================================

export function AdminTable({
  children,
  className,
  minWidth,
}: {
  children: React.ReactNode;
  className?: string;
  /** Largeur minimale avant défilement horizontal (ex. « 720px »). */
  minWidth?: string;
}) {
  return (
    <div className={cn(DENSITY.panel, 'overflow-x-auto')}>
      <table
        className={cn('w-full border-collapse text-left text-[13px]', className)}
        style={minWidth ? { minWidth } : undefined}
      >
        {children}
      </table>
    </div>
  );
}

export function AdminTHead({ children }: { children: React.ReactNode }) {
  return <thead className="bg-muted/40 text-left">{children}</thead>;
}

export function AdminTBody({ children }: { children: React.ReactNode }) {
  return <tbody>{children}</tbody>;
}

export function AdminTh({
  children,
  className,
  scope = 'col',
}: {
  children?: React.ReactNode;
  className?: string;
  scope?: 'col' | 'row';
}) {
  return (
    <th scope={scope} className={cn(DENSITY.tableHead, 'font-medium', className)}>
      {children}
    </th>
  );
}

export function AdminTr({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <tr className={cn('border-t border-border/60 hover:bg-muted/30', DENSITY.row, className)}>
      {children}
    </tr>
  );
}

export function AdminTd({
  children,
  className,
  colSpan,
  title,
}: {
  children?: React.ReactNode;
  className?: string;
  colSpan?: number;
  title?: string;
}) {
  return (
    <td colSpan={colSpan} title={title} className={cn(DENSITY.tableCell, className)}>
      {children}
    </td>
  );
}

/** Ligne pleine largeur pour un état vide — une phrase, pas une illustration. */
export function AdminEmptyRow({
  colSpan,
  children,
}: {
  colSpan: number;
  children: React.ReactNode;
}) {
  return (
    <tr className="border-t border-border/60">
      <td colSpan={colSpan} className="px-3 py-6 text-[13px] text-muted-foreground">
        {children}
      </td>
    </tr>
  );
}
