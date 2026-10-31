// =====================================================================
// 🔀 table/sort — trier selon ce que la colonne CONTIENT
// =====================================================================
// 📖 Un `<` sur deux chaînes classe « 10 » avant « 9 », « Émile » après
//    « Zoé » (parce que É est comparé en UTF-16), et « 0 » avant « — ».
//    Trois erreurs qu'on ne voit pas sur un jeu de données à deux lignes.
//
// 🎯 Une colonne déclare donc sa NATURE (texte, nombre, date, rang) et le
//    comparateur s'y adapte :
//      - texte : `Intl.Collator` en français, insensible à la casse et aux
//        accents, avec `numeric` pour « écrit 2 » < « écrit 10 » ;
//      - nombre : valeurs numériques, y compris « 1 420 » saisi en texte ;
//      - date : horodatage ;
//      - rang : un ordre métier explicite (`['propriétaire', 'éditeur',
//        'lecteur']`) — un rôle ne se classe pas par ordre alphabétique.
//
// ⚠️ Les valeurs vides ne sont jamais « les plus petites » : elles
//    descendent en fin de liste dans les deux sens de tri. Sinon trier par
//    date décroissante met les lignes sans date devant les plus récentes.
// =====================================================================

import type { Key } from 'react-aria-components';

export type SortDirection = 'ascending' | 'descending';
export type SortKind = 'text' | 'number' | 'date' | 'rank';

/** Ce qu'une cellule peut valoir pour le tri. */
export type SortCell = string | number | Date | bigint | null | undefined;

export interface ColumnSort<T> {
  /** Valeur de tri d'une ligne (pas forcément ce qui est affiché). */
  value: (row: T) => SortCell;
  /** Nature de la valeur. Défaut `text`. */
  kind?: SortKind;
  /** Pour `kind: 'rank'` : ordre du plus haut au plus bas. */
  rank?: readonly string[];
  /** Locale du tri texte. Défaut `fr`. */
  locale?: string;
}

/** Spécification d'une table : une entrée par colonne triable. */
export type SortSpec<T> = Record<string, ColumnSort<T>>;

export interface SortDescriptorLike {
  column: Key;
  direction: SortDirection;
}

const collators = new Map<string, Intl.Collator>();

/**
 * Collateur partagé, créé à la demande.
 *
 * `sensitivity: 'base'` ignore casse ET accents (É = E), ce qui est le
 * classement attendu en français. `numeric` évite « 10 » < « 9 ».
 */
function collator(locale: string): Intl.Collator {
  let instance = collators.get(locale);
  if (!instance) {
    instance = new Intl.Collator(locale, { sensitivity: 'base', numeric: true });
    collators.set(locale, instance);
  }
  return instance;
}

/** Une valeur absente : `null`, `undefined`, chaîne vide, `NaN`, date invalide. */
function isEmpty(value: SortCell): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (typeof value === 'number') return Number.isNaN(value);
  if (value instanceof Date) return Number.isNaN(value.getTime());
  return false;
}

/** Convertit une valeur en nombre, en tolérant « 1 420 » et « 1 420,5 ». */
function toNumber(value: SortCell): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  if (value instanceof Date) return value.getTime();
  const cleaned = String(value)
    .replace(/[\s\u00a0\u202f]/g, '')
    .replace(',', '.')
    .replace(/[^\d.+-]/g, '');
  const parsed = Number.parseFloat(cleaned);
  return Number.isNaN(parsed) ? Number.NaN : parsed;
}

function toTime(value: SortCell): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number' || typeof value === 'bigint') return Number(value);
  const parsed = Date.parse(String(value));
  return Number.isNaN(parsed) ? Number.NaN : parsed;
}

/**
 * Compare deux cellules selon la nature déclarée.
 * Les valeurs vides sont signalées à part par `compareCell` (voir plus bas)
 * pour que le tri puisse les placer en fin de liste quel que soit le sens.
 */
export function compareCell<T>(a: SortCell, b: SortCell, column: ColumnSort<T>): number {
  const { kind = 'text', rank = [], locale = 'fr' } = column;

  switch (kind) {
    case 'number': {
      const na = toNumber(a);
      const nb = toNumber(b);
      if (Number.isNaN(na) && Number.isNaN(nb)) return 0;
      if (Number.isNaN(na)) return 1;
      if (Number.isNaN(nb)) return -1;
      return na - nb;
    }
    case 'date': {
      const ta = toTime(a);
      const tb = toTime(b);
      if (Number.isNaN(ta) && Number.isNaN(tb)) return 0;
      if (Number.isNaN(ta)) return 1;
      if (Number.isNaN(tb)) return -1;
      return ta - tb;
    }
    case 'rank': {
      const normalized = (value: SortCell) => String(value).trim().toLocaleLowerCase(locale);
      const ra = rank.findIndex((entry) => normalized(entry) === normalized(a));
      const rb = rank.findIndex((entry) => normalized(entry) === normalized(b));
      // Un rang inconnu n'est ni en tête ni à la fin par hasard : il tombe
      // après ceux qu'on sait classer, et les deux inconnus se départagent
      // par ordre alphabétique plutôt que par l'ordre d'arrivée.
      if (ra === -1 && rb === -1) return collator(locale).compare(String(a), String(b));
      if (ra === -1) return 1;
      if (rb === -1) return -1;
      return ra - rb;
    }
    default:
      return collator(locale).compare(String(a), String(b));
  }
}

/**
 * Trie une copie des lignes selon un descripteur et une spécification.
 *
 * La fonction est pure : l'ordre reçu n'est pas modifié. À valeurs égales,
 * l'ordre d'origine est conservé (tri stable), pour qu'un changement de
 * colonne ne réorganise pas les ex æquo.
 */
export function sortRows<T>(
  rows: readonly T[],
  descriptor: SortDescriptorLike | null | undefined,
  spec: SortSpec<T>
): T[] {
  if (!descriptor) return [...rows];
  const column = spec[String(descriptor.column)];
  if (!column) return [...rows];

  const direction = descriptor.direction === 'descending' ? -1 : 1;

  return rows
    .map((row, index) => ({ row, index, value: column.value(row) }))
    .sort((a, b) => {
      const aEmpty = isEmpty(a.value);
      const bEmpty = isEmpty(b.value);
      // Les vides restent en fin de liste dans les DEUX sens : ce n'est pas
      // une valeur « très petite », c'est une absence de valeur.
      if (aEmpty || bEmpty) {
        if (aEmpty && bEmpty) return a.index - b.index;
        return aEmpty ? 1 : -1;
      }
      const result = compareCell(a.value, b.value, column);
      if (result !== 0) return result * direction;
      return a.index - b.index;
    })
    .map((entry) => entry.row);
}
