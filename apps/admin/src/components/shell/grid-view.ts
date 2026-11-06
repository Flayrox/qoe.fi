'use client';

import * as React from 'react';
import type { SortDescriptorLike } from '@qoe/ui/table';
import {
  fetchSavedViewsAction,
  saveSavedViewAction,
  deleteSavedViewAction,
} from '@/lib/admin-views-actions';

// =====================================================================
// 🧭 grid-view — l'état d'une grille vit dans l'URL, pas dans le néant
// =====================================================================
// Un opérateur qui filtre une file, puis recharge, ne doit pas tout perdre.
// Tri, facettes, colonnes masquées et densité sont donc encodés dans l'URL
// (`?sort=sla:asc&f=sla:breached&d=compact&c=domain`) : partageable, rechargeable,
// et compatible avec le bouton retour.
//
// Les vues d'équipe sont persistées en base PostgreSQL (table AdminSavedView)
// et synchronisées localement pour un démarrage instantané sans scintillement.
// =====================================================================

export interface GridViewState {
  sort: SortDescriptorLike;
  /** Valeurs actives par facette (`{ sla: ['breached'] }`). */
  facets: Record<string, string[]>;
  /** Colonnes masquées par leur id. */
  hidden: string[];
  /** Ordre explicite des colonnes (vide = ordre déclaré). */
  order: string[];
  density: 'compact' | 'normal';
}

export interface GridFacetValue<T> {
  id: string;
  label: string;
  test: (row: T) => boolean;
}

export interface GridFacetDef<T> {
  id: string;
  label: string;
  values: GridFacetValue<T>[];
}

export interface SavedView {
  id?: string;
  name: string;
  state: GridViewState;
  isShared?: boolean;
  isMine?: boolean;
}

const PARAM_SORT = 'sort';
const PARAM_FACETS = 'f';
const PARAM_HIDDEN = 'c';
const PARAM_DENSITY = 'd';
const PARAM_ORDER = 'o';

/** Filtre les lignes selon les facettes actives (ET entre groupes, OU dedans). */
export function filterRows<T>(
  rows: readonly T[],
  facets: Record<string, string[]>,
  defs: readonly GridFacetDef<T>[]
): T[] {
  const active = Object.entries(facets).filter(([, values]) => values.length > 0);
  if (active.length === 0) return [...rows];
  return rows.filter((row) =>
    active.every(([groupId, values]) => {
      const def = defs.find((candidate) => candidate.id === groupId);
      if (!def) return true;
      return values.some(
        (value) => def.values.find((item) => item.id === value)?.test(row) ?? false
      );
    })
  );
}

function encode(state: GridViewState): string {
  const params = new URLSearchParams();
  params.set(PARAM_SORT, `${state.sort.column}:${state.sort.direction}`);
  const facets = Object.entries(state.facets)
    .filter(([, values]) => values.length > 0)
    .flatMap(([group, values]) => values.map((value) => `${group}:${value}`));
  if (facets.length > 0) params.set(PARAM_FACETS, facets.join(','));
  if (state.hidden.length > 0) params.set(PARAM_HIDDEN, state.hidden.join(','));
  if (state.order.length > 0) params.set(PARAM_ORDER, state.order.join(','));
  if (state.density === 'compact') params.set(PARAM_DENSITY, 'compact');
  return params.toString();
}

function decode(search: string, fallback: SortDescriptorLike): GridViewState {
  const params = new URLSearchParams(search);
  const rawSort = params.get(PARAM_SORT);
  const [column, direction] = (rawSort ?? '').split(':');
  const facets: Record<string, string[]> = {};
  for (const pair of (params.get(PARAM_FACETS) ?? '').split(',')) {
    const [group, value] = pair.split(':');
    if (!group || !value) continue;
    facets[group] = [...(facets[group] ?? []), value];
  }
  return {
    sort:
      column && (direction === 'ascending' || direction === 'descending')
        ? { column, direction }
        : fallback,
    facets,
    hidden: (params.get(PARAM_HIDDEN) ?? '').split(',').filter(Boolean),
    order: (params.get(PARAM_ORDER) ?? '').split(',').filter(Boolean),
    density: params.get(PARAM_DENSITY) === 'compact' ? 'compact' : 'normal',
  };
}

export function useGridView(resource: string, initialSort: SortDescriptorLike) {
  const storageKey = `qoe.admin.views.${resource}`;
  const [state, setState] = React.useState<GridViewState>({
    sort: initialSort,
    facets: {},
    hidden: [],
    order: [],
    density: 'normal',
  });
  const [views, setViews] = React.useState<SavedView[]>([]);
  const hydrated = React.useRef(false);
  // `initialSort` est souvent un objet littéral recréé à chaque rendu : le
  // figer évite de relancer l'effet d'hydratation en boucle.
  const initialRef = React.useRef(initialSort);

  // Lecture initiale : URL d'abord, défaut ensuite. Les vues locales sont
  // immédiatement disponibles, puis synchronisées avec la base (Lot B3).
  React.useEffect(() => {
    setState(decode(window.location.search, initialRef.current));
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored) setViews(JSON.parse(stored) as SavedView[]);
    } catch {
      // Stockage refusé : on continue sans vues locales.
    }
    hydrated.current = true;

    // Synchronisation asynchrone avec la table AdminSavedView
    void (async () => {
      try {
        const serverViews = await fetchSavedViewsAction(resource);
        if (serverViews && serverViews.length > 0) {
          setViews((current) => {
            const serverNames = new Set(serverViews.map((v) => v.name));
            // Conserve les vues locales qui ne sont pas encore sur le serveur
            const localOnly = current.filter((v) => !serverNames.has(v.name));
            const merged: SavedView[] = [
              ...serverViews.map((sv) => ({
                id: sv.id,
                name: sv.name,
                state: sv.state,
                isShared: sv.isShared,
                isMine: sv.isMine,
              })),
              ...localOnly,
            ];
            try {
              window.localStorage.setItem(storageKey, JSON.stringify(merged));
            } catch {
              // ignore
            }
            return merged;
          });
        }
      } catch {
        // Mode hors ligne ou base inaccessible
      }
    })();

    const onPopState = () => setState(decode(window.location.search, initialRef.current));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [storageKey, resource]);

  React.useEffect(() => {
    if (!hydrated.current) return;
    const query = encode(state);
    const url = `${window.location.pathname}${query ? `?${query}` : ''}`;
    window.history.replaceState(null, '', url);
  }, [state]);

  const update = React.useCallback((patch: Partial<GridViewState>) => {
    setState((current) => ({ ...current, ...patch }));
  }, []);

  const toggleFacet = React.useCallback((groupId: string, value: string) => {
    setState((current) => {
      const values = current.facets[groupId] ?? [];
      const next = values.includes(value)
        ? values.filter((item) => item !== value)
        : [...values, value];
      return {
        ...current,
        facets: { ...current.facets, [groupId]: next },
      };
    });
  }, []);

  const toggleColumn = React.useCallback((columnId: string) => {
    setState((current) => ({
      ...current,
      hidden: current.hidden.includes(columnId)
        ? current.hidden.filter((id) => id !== columnId)
        : [...current.hidden, columnId],
    }));
  }, []);

  const moveColumn = React.useCallback((id: string, delta: number, all: readonly string[]) => {
    setState((current) => {
      const base = [
        ...current.order.filter((column) => all.includes(column)),
        ...all.filter((column) => !current.order.includes(column)),
      ];
      const from = base.indexOf(id);
      if (from === -1) return current;
      const to = Math.max(0, Math.min(base.length - 1, from + delta));
      if (to === from) return current;
      base.splice(from, 1);
      base.splice(to, 0, id);
      return { ...current, order: base };
    });
  }, []);

  const reset = React.useCallback(() => {
    setState({ sort: initialRef.current, facets: {}, hidden: [], order: [], density: 'normal' });
  }, []);

  const persist = (next: SavedView[]) => {
    setViews(next);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // Rien à faire : la vue reste utilisable pour la session.
    }
  };

  const saveView = React.useCallback(
    (name: string, isShared = false) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const optimistic: SavedView = { name: trimmed, state, isShared, isMine: true };
      const nextViews = [...views.filter((view) => view.name !== trimmed), optimistic];
      persist(nextViews);

      void (async () => {
        try {
          const res = await saveSavedViewAction(resource, { name: trimmed, isShared, state });
          if (res) {
            setViews((current) =>
              current.map((v) =>
                v.name === trimmed ? { ...v, id: res.id, isShared: res.isShared, isMine: true } : v
              )
            );
          }
        } catch {
          // Conserve la version locale en cas d'erreur réseau
        }
      })();
    },
    [views, state, resource, storageKey]
  );

  const applyView = React.useCallback(
    (name: string) => {
      const view = views.find((candidate) => candidate.name === name);
      if (view) setState(view.state);
    },
    [views]
  );

  const removeView = React.useCallback(
    (name: string) => {
      const view = views.find((candidate) => candidate.name === name);
      persist(views.filter((candidate) => candidate.name !== name));
      if (view?.id) {
        void deleteSavedViewAction(resource, view.id);
      }
    },
    [views, resource, storageKey]
  );

  return {
    state,
    views,
    update,
    toggleFacet,
    toggleColumn,
    moveColumn,
    reset,
    saveView,
    applyView,
    removeView,
  };
}
