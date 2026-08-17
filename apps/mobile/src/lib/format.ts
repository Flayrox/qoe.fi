// =====================================================================
// 🔢 format.ts — Formatage des nombres et dates (port Bluesky)
// =====================================================================
// - formatCount : 1234 → « 1,2 k » (notation compacte, trunc)
//   (port de .reference/bluesky/src/view/com/util/numeric/format.ts)
// - niceDate : date absolue longue localisée
//   (port de .reference/bluesky/src/lib/strings/time.ts)
// - useTimeAgo : « 5m », « 2h », « 3j », « Janv. 5 » (port du hook
//   #/lib/hooks/useTimeAgo.ts, ramené ici en pur util)
// =====================================================================

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Notation compacte localisée (1.2k, 3.4M…) — tronquée, pas arrondie. */
export function formatCount(num: number): string {
  if (num < 1000) return String(num);
  const units = [
    { value: 1e9, symbol: 'Md' },
    { value: 1e6, symbol: 'M' },
    { value: 1e3, symbol: 'k' },
  ];
  for (const unit of units) {
    if (num >= unit.value) {
      const truncated = Math.trunc((num / unit.value) * 10) / 10;
      // Supprime le « .0 » superflu : 1.0k → 1k.
      const str = truncated.toFixed(1).replace(/\.0$/, '');
      return `${str} ${unit.symbol}`;
    }
  }
  return String(num);
}

const MONTHS_FR = [
  'janv.',
  'févr.',
  'mars',
  'avr.',
  'mai',
  'juin',
  'juil.',
  'août',
  'sept.',
  'oct.',
  'nov.',
  'déc.',
];

/** Date absolue longue, ex. « 17 août 2026 à 14:32 ». */
export function niceDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const day = date.getDate();
  const month = MONTHS_FR[date.getMonth()] ?? '';
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${day} ${month} ${year} à ${hours}:${minutes}`;
}

/** Date courte absolue, ex. « 17 août 2026 ». */
export function niceDateShort(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const day = date.getDate();
  const month = MONTHS_FR[date.getMonth()] ?? '';
  const year = date.getFullYear();
  return `${day} ${month} ${year}`;
}

/**
 * Temps relatif « à la Bluesky » : < 1m → « Maintenant », < 1h → « 5m »,
 * < 1j → « 2h », sinon date courte. `now` injectable pour les tests.
 */
export function timeAgo(iso: string, now: number = Date.now()): string {
  const timestamp = new Date(iso).getTime();
  if (Number.isNaN(timestamp)) return iso;
  const diff = now - timestamp;

  if (diff < MINUTE) return 'Maintenant';
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h`;
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)}j`;
  return niceDateShort(iso);
}
