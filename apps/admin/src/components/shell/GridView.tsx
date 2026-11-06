'use client';

import * as React from 'react';
import { ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';
import { Button } from '@qoe/ui/button';
import { Select } from '@qoe/ui/select';
import type { GridFacetDef, GridViewState, SavedView } from './grid-view';

// =====================================================================
// 🎛️ GridViewToolbar — facettes, colonnes, densité, vues
// =====================================================================
// Tout tient sur une ligne de 28 px au-dessus de la grille : les facettes en
// chips, un choix de colonnes, deux densités et une vue nommée. Aucun panneau
// latéral, aucune modale : filtrer ne doit pas coûter un clic de plus que
// regarder.
// =====================================================================

export interface GridViewToolbarProps<T> {
  state: GridViewState;
  onChange: (patch: Partial<GridViewState>) => void;
  onToggleFacet: (groupId: string, value: string) => void;
  onToggleColumn: (columnId: string) => void;
  /** Réordonner une colonne (`-1` monte, `1` descend). */
  onMoveColumn?: (columnId: string, delta: number) => void;
  onReset: () => void;
  facets: readonly GridFacetDef<T>[];
  columns: readonly { id: string; label: string }[];
  views: readonly SavedView[];
  onSaveView: (name: string) => void;
  onApplyView: (name: string) => void;
  onRemoveView: (name: string) => void;
  /** Nombre de lignes visibles, affiché à droite. */
  count?: number;
}

export function GridViewToolbar<T>({
  state,
  onChange,
  onToggleFacet,
  onToggleColumn,
  onMoveColumn,
  onReset,
  facets,
  columns,
  views,
  onSaveView,
  onApplyView,
  onRemoveView,
  count,
}: GridViewToolbarProps<T>) {
  const [currentView, setCurrentView] = React.useState('');

  const save = () => {
    const name = window.prompt('Nom de la vue (filtres, tri, colonnes, densité) :');
    if (!name) return;
    onSaveView(name);
    setCurrentView(name);
  };

  const hasFilters =
    Object.values(state.facets).some((values) => values.length > 0) ||
    state.hidden.length > 0 ||
    state.density === 'compact';

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1" data-grid-facets="">
      {facets.map((group) => (
        <div key={group.id} className="flex items-center gap-1">
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {group.label}
          </span>
          {group.values.map((value) => {
            const active = (state.facets[group.id] ?? []).includes(value.id);
            return (
              <Button
                key={value.id}
                type="button"
                size="xs"
                variant={active ? 'solid' : 'ghost'}
                tone={active ? 'brand' : 'neutral'}
                aria-pressed={active}
                onClick={() => onToggleFacet(group.id, value.id)}
                className="h-6 px-1.5 text-[11px] font-normal"
                data-facet-button=""
              >
                {value.label}
              </Button>
            );
          })}
        </div>
      ))}

      <div className="ml-auto flex items-center gap-1">
        {typeof count === 'number' && (
          <span className="text-[11px] tabular-nums text-muted-foreground">{count} lignes</span>
        )}

        <details className="relative">
          <summary className="cursor-pointer list-none rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground [&::-webkit-details-marker]:hidden">
            Colonnes
          </summary>
          <div className="absolute right-0 z-30 mt-1 w-52 rounded-md border border-border bg-popover p-1 text-[12px] shadow-lg">
            {columns.map((column) => {
              const hidden = state.hidden.includes(column.id);
              return (
                <div key={column.id} className="flex items-center gap-0.5">
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    onClick={() => onToggleColumn(column.id)}
                    className={`h-6 min-w-0 flex-1 justify-start px-2 font-normal ${
                      hidden ? 'text-muted-foreground line-through' : 'text-foreground'
                    }`}
                  >
                    {column.label}
                  </Button>
                  {onMoveColumn && (
                    <>
                      <Button
                        type="button"
                        size="xs"
                        variant="ghost"
                        aria-label={`Monter ${column.label}`}
                        onClick={() => onMoveColumn(column.id, -1)}
                        className="h-6 w-5 shrink-0 px-0 text-muted-foreground"
                      >
                        <ChevronUp className="size-3" aria-hidden />
                      </Button>
                      <Button
                        type="button"
                        size="xs"
                        variant="ghost"
                        aria-label={`Descendre ${column.label}`}
                        onClick={() => onMoveColumn(column.id, 1)}
                        className="h-6 w-5 shrink-0 px-0 text-muted-foreground"
                      >
                        <ChevronDown className="size-3" aria-hidden />
                      </Button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </details>

        <Button
          type="button"
          size="xs"
          variant="ghost"
          onClick={() => onChange({ density: state.density === 'compact' ? 'normal' : 'compact' })}
          className="h-6 px-1.5 text-[11px] font-normal text-muted-foreground"
          title="Basculer la densité des lignes"
        >
          Densité : {state.density === 'compact' ? 'compacte' : 'normale'}
        </Button>

        <div className="flex items-center gap-1" data-grid-views="">
          {views.length > 0 && (
            <Select
              label="Vue enregistrée"
              hideLabel
              size="xs"
              value={currentView || undefined}
              placeholder="Vue…"
              options={[
                { id: '', label: 'Vue…' },
                ...views.map((view) => ({ id: view.name, label: view.name })),
              ]}
              onValueChange={(value) => {
                setCurrentView(value);
                if (value) onApplyView(value);
              }}
              className="w-32"
            />
          )}

          <Button
            type="button"
            size="xs"
            variant="ghost"
            onClick={save}
            className="h-6 px-1.5 text-[11px] font-normal text-muted-foreground"
          >
            Enregistrer la vue
          </Button>

          {currentView && views.some((view) => view.name === currentView) && (
            <Button
              type="button"
              size="xs"
              variant="ghost"
              onClick={() => {
                onRemoveView(currentView);
                setCurrentView('');
              }}
              className="h-6 px-1.5 text-[11px] font-normal text-muted-foreground"
            >
              Supprimer
            </Button>
          )}
        </div>

        {hasFilters && (
          <Button
            type="button"
            size="xs"
            variant="ghost"
            onClick={onReset}
            aria-label="Réinitialiser filtres, colonnes et densité"
            className="h-6 px-1 text-muted-foreground"
          >
            <RotateCcw className="size-3" aria-hidden />
          </Button>
        )}
      </div>
    </div>
  );
}
