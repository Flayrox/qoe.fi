'use client';

// =====================================================================
// 🎛️ SettingsExplorer — Explorateur cockpit du catalogue des réglages (C2)
// =====================================================================
// Index dense et actionnable des leviers d'administration :
// - Navigation et recherche instantanée au clavier (j/k/x/Entrée/?)
// - Facettes par catégorie, portée, preuve et permission personnelle
// - Tiroir de détail 480 px avec rayon d'impact et deep-link vers l'écran
// =====================================================================

import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ExternalLink, Check } from 'lucide-react';
import { Button } from '@qoe/ui/button';
import {
  Drawer,
  DrawerBody,
  DrawerClose,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@qoe/ui/drawer';
import { CopyableId } from '@/components/shell/CopyableId';
import { DataGrid, type GridColumn } from '@/components/shell/DataGrid';
import { GridViewToolbar } from '@/components/shell/GridView';
import {
  filterRows,
  useGridView,
  type GridFacetDef,
  type GridViewState,
} from '@/components/shell/grid-view';
import type { RowActionItem } from '@/components/shell/RowMenu';
import {
  SETTINGS_CATALOG,
  SETTINGS_CATEGORIES,
  SETTINGS_CATEGORY_LABELS,
  type SettingsLever,
} from '@/lib/admin-settings-catalog';

interface SettingsExplorerProps {
  heldCapabilities: string[];
}

export function SettingsExplorer({ heldCapabilities }: SettingsExplorerProps) {
  const router = useRouter();
  const heldSet = useMemo(() => new Set(heldCapabilities), [heldCapabilities]);
  const [preview, setPreview] = useState<SettingsLever | null>(null);

  const grid = useGridView('admin.settings.catalog', {
    column: 'lever',
    direction: 'ascending',
  });

  const columns: GridColumn<SettingsLever>[] = [
    {
      id: 'lever',
      header: 'Levier',
      width: 240,
      sort: { kind: 'text', value: (l) => l.label },
      cell: (l) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-foreground text-[11px]" title={l.label}>
            {l.label}
          </span>
          <span className="tabular-nums text-[10px] text-muted-foreground truncate">{l.id}</span>
        </div>
      ),
    },
    {
      id: 'effect',
      header: 'Effet',
      sort: { kind: 'text', value: (l) => l.effect },
      cell: (l) => (
        <span className="truncate text-[11px] text-muted-foreground" title={l.effect}>
          {l.effect}
        </span>
      ),
    },
    {
      id: 'category',
      header: 'Catégorie',
      width: 130,
      sort: { kind: 'text', value: (l) => SETTINGS_CATEGORY_LABELS[l.category] },
      cell: (l) => (
        <span className="truncate text-[11px] text-muted-foreground">
          {SETTINGS_CATEGORY_LABELS[l.category]}
        </span>
      ),
    },
    {
      id: 'scope',
      header: 'Portée',
      width: 96,
      sort: { kind: 'text', value: (l) => l.scope },
      cell: (l) => <span className="capitalize text-[10px] text-muted-foreground">{l.scope}</span>,
    },
    {
      id: 'capability',
      header: 'Capacité requise',
      width: 190,
      sort: { kind: 'text', value: (l) => l.capability },
      cell: (l) => {
        const allowed = heldSet.has(l.capability);
        return (
          <span
            className={`tabular-nums text-[10px] ${
              allowed ? 'text-foreground font-medium' : 'text-muted-foreground/50'
            }`}
          >
            {l.capability}
          </span>
        );
      },
    },
    {
      id: 'guard',
      header: 'Preuve',
      width: 140,
      sort: { kind: 'text', value: (l) => l.guard },
      cell: (l) => <span className="truncate text-[10px] text-muted-foreground">{l.guard}</span>,
    },
    {
      id: 'action',
      header: 'Accès',
      width: 90,
      sort: {
        kind: 'text',
        value: (l) => (heldSet.has(l.capability) ? 'a_editable' : 'b_readonly'),
      },
      cell: (l) => {
        const allowed = heldSet.has(l.capability);
        return allowed ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary">
            <Check className="size-2.5" />
            Modifiable
          </span>
        ) : (
          <span className="text-[10px] text-muted-foreground/50">Lecture seule</span>
        );
      },
    },
  ];

  const facetDefs: GridFacetDef<SettingsLever>[] = [
    {
      id: 'access',
      label: 'Mes droits',
      values: [
        {
          id: 'editable',
          label: 'Modifiables par moi',
          test: (l) => heldSet.has(l.capability),
        },
        {
          id: 'readonly',
          label: 'Lecture seule pour moi',
          test: (l) => !heldSet.has(l.capability),
        },
      ],
    },
    {
      id: 'category',
      label: 'Catégorie',
      values: SETTINGS_CATEGORIES.map((cat) => ({
        id: cat,
        label: SETTINGS_CATEGORY_LABELS[cat],
        test: (l) => l.category === cat,
      })),
    },
    {
      id: 'scope',
      label: 'Portée',
      values: [
        { id: 'global', label: 'Globale', test: (l) => l.scope === 'global' },
        { id: 'tenant', label: 'Tenant', test: (l) => l.scope === 'tenant' },
        { id: 'utilisateur', label: 'Utilisateur', test: (l) => l.scope === 'utilisateur' },
      ],
    },
  ];

  const visible = filterRows(SETTINGS_CATALOG, grid.state.facets, facetDefs);

  const rowMenu = (lever: SettingsLever): RowActionItem[] => {
    const allowed = heldSet.has(lever.capability);
    return [
      {
        id: 'detail',
        label: 'Aperçu du levier',
        shortcut: 'Entrée',
        onSelect: () => setPreview(lever),
      },
      ...(allowed
        ? [
            {
              id: 'open-screen',
              label: 'Ouvrir l’écran dédié',
              onSelect: () => router.push(lever.href),
            },
          ]
        : []),
      {
        id: 'copy-id',
        label: 'Copier l’ID du levier',
        onSelect: () => void navigator.clipboard.writeText(lever.id),
      },
      {
        id: 'copy-capability',
        label: 'Copier la capacité requise',
        onSelect: () => void navigator.clipboard.writeText(lever.capability),
      },
    ];
  };

  return (
    <div className="space-y-2">
      <GridViewToolbar
        state={grid.state}
        onChange={grid.update}
        onToggleFacet={grid.toggleFacet}
        onToggleColumn={grid.toggleColumn}
        onMoveColumn={(id, delta) =>
          grid.moveColumn(
            id,
            delta,
            columns.map((column) => column.id)
          )
        }
        onReset={grid.reset}
        facets={facetDefs}
        columns={columns.map((column) => ({ id: column.id, label: column.header as string }))}
        views={grid.views}
        onSaveView={grid.saveView}
        onApplyView={grid.applyView}
        onRemoveView={grid.removeView}
        count={visible.length}
      />

      <DataGrid
        ariaLabel="Catalogue des leviers de configuration"
        rows={visible}
        columns={columns}
        initialSort={{ column: 'lever', direction: 'ascending' }}
        sort={grid.state.sort}
        onSortChange={(sort) => grid.update({ sort } as Partial<GridViewState>)}
        hiddenColumns={grid.state.hidden}
        density={grid.state.density}
        columnOrder={grid.state.order}
        emptyState="Aucun levier ne correspond aux filtres appliqués."
        onRowOpen={(row) => setPreview(row)}
        rowMenu={rowMenu}
      />

      <Drawer
        open={preview !== null}
        onOpenChange={(open) => {
          if (!open) setPreview(null);
        }}
        width="md"
      >
        {preview && (
          <DrawerContent aria-label="Aperçu du levier">
            <DrawerHeader>
              <DrawerTitle>Levier : {preview.label}</DrawerTitle>
            </DrawerHeader>

            <DrawerBody className="space-y-4">
              <dl className="grid grid-cols-[104px_1fr] gap-x-2 gap-y-1.5 text-[12px]">
                <dt className="text-muted-foreground">Identifiant</dt>
                <dd>
                  <CopyableId id={preview.id} />
                </dd>
                <dt className="text-muted-foreground">Catégorie</dt>
                <dd className="font-medium text-foreground">
                  {SETTINGS_CATEGORY_LABELS[preview.category]}
                </dd>
                <dt className="text-muted-foreground">Portée</dt>
                <dd className="capitalize font-medium">{preview.scope}</dd>
                <dt className="text-muted-foreground">Capacité requise</dt>
                <dd className="tabular-nums font-semibold text-foreground">{preview.capability}</dd>
                <dt className="text-muted-foreground">Preuve exigée</dt>
                <dd>{preview.guard}</dd>
                <dt className="text-muted-foreground">Votre statut</dt>
                <dd>
                  {heldSet.has(preview.capability) ? (
                    <span className="inline-flex rounded-full border border-success/30 bg-success/10 px-1.5 py-0 text-[10px] font-semibold text-success-text">
                      Capacité détenue (modifiable)
                    </span>
                  ) : (
                    <span className="inline-flex rounded-full border border-border bg-muted/40 px-1.5 py-0 text-[10px] text-muted-foreground">
                      Lecture seule (capacité manquante)
                    </span>
                  )}
                </dd>
              </dl>

              <div className="space-y-1 border-t border-border/60 pt-3">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                  Description & effet du levier
                </span>
                <div className="rounded border border-border bg-muted/30 p-2.5 text-[12px] leading-relaxed select-text">
                  {preview.effect}
                </div>
              </div>

              <div className="rounded border border-border/80 bg-background p-3 space-y-2">
                <span className="text-[11px] font-semibold text-foreground uppercase tracking-wide">
                  Écran de gestion dédié
                </span>
                <p className="text-[11px] text-muted-foreground leading-normal">
                  Ce réglage est administré depuis l’écran{' '}
                  <code className="text-foreground font-semibold">{preview.href}</code>.
                </p>
                <div className="pt-1">
                  <Button
                    type="button"
                    size="xs"
                    variant="solid"
                    tone="brand"
                    onClick={() => router.push(preview.href)}
                  >
                    <ExternalLink className="size-3.5" />
                    Ouvrir l’écran de configuration
                  </Button>
                </div>
              </div>
            </DrawerBody>

            <DrawerFooter>
              <div className="flex w-full items-center justify-end">
                <DrawerClose>
                  <Button type="button" size="xs" variant="ghost">
                    Fermer
                  </Button>
                </DrawerClose>
              </div>
            </DrawerFooter>
          </DrawerContent>
        )}
      </Drawer>
    </div>
  );
}
