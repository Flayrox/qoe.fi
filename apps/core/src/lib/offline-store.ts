// =====================================================================
// 📦 offline-store — packs « emportés » côté client (fiche Plus)
// =====================================================================
// Un pack = une charge utile sérialisable gardée pour une lecture SANS
// réseau (chapitres d'un EPUB aujourd'hui ; épisodes audio demain — le
// magasin ne sait rien du contenu, il ne fait que le garder).
//
// Le magasin est un module PUR au-dessus d'un `OfflineStorage` injecté :
// en vrai `localStorage`, en test une Map. Aucune dépendance au DOM dans la
// logique, donc testable sans navigateur.
//
// Doctrine : on ne fait jamais semblant d'avoir sauvegardé. Le quota plein
// est un cas RÉEL (Safari, navigation privée) : on évince le plus ancien
// pack et on réessaie UNE fois, puis on renvoie `false` — l'appelant le dit
// à l'utilisateur au lieu de lui laisser croire que son livre est emporté.
// =====================================================================

export const OFFLINE_PREFIX = 'qoe.offline.pack.';

/** Nombre de packs gardés en tout (au-delà, le plus ancien est évincé). */
export const MAX_OFFLINE_PACKS = 20;

/** Le sous-ensemble de Storage dont le magasin a besoin (injectable). */
export interface OfflineStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  readonly length: number;
  key(index: number): string | null;
}

export interface OfflinePack<T> {
  /** Version du format côté serveur (le client refuse ce qu'il ne connaît pas). */
  version: number;
  /** ISO — l'ancienneté départage les évictions. */
  savedAt: string;
  /** Type de charge (aujourd'hui « ebook » ; « podcast » plus tard). */
  kind: string;
  payload: T;
}

export interface OfflinePackInfo {
  id: string;
  kind: string;
  version: number;
  savedAt: string;
}

export function offlinePackKey(id: string): string {
  return `${OFFLINE_PREFIX}${id}`;
}

/** Les clés du magasin qui nous appartiennent (jamais celles des autres). */
function ownKeys(storage: OfflineStorage): string[] {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k && k.startsWith(OFFLINE_PREFIX)) keys.push(k);
  }
  return keys;
}

function safeRead<T>(storage: OfflineStorage, key: string): OfflinePack<T> | null {
  const raw = storage.getItem(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as OfflinePack<T>;
    if (!parsed || typeof parsed.savedAt !== 'string' || typeof parsed.version !== 'number') {
      throw new Error('pack illisible');
    }
    return parsed;
  } catch {
    // Entrée corrompue (mise à jour interrompue, bricolage manuel) : on la
    // supprime au lieu de la garder pour toujours et de replanter à chaque
    // ouverture.
    storage.removeItem(key);
    return null;
  }
}

/** Tous les packs gardés, du plus récent au plus ancien. */
export function listOfflinePacks(storage: OfflineStorage): OfflinePackInfo[] {
  const infos: OfflinePackInfo[] = [];
  for (const key of ownKeys(storage)) {
    const pack = safeRead<unknown>(storage, key);
    if (!pack) continue;
    infos.push({
      id: key.slice(OFFLINE_PREFIX.length),
      kind: pack.kind,
      version: pack.version,
      savedAt: pack.savedAt,
    });
  }
  return infos.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export function readOfflinePack<T>(storage: OfflineStorage, id: string): OfflinePack<T> | null {
  return safeRead<T>(storage, offlinePackKey(id));
}

export function hasOfflinePack(storage: OfflineStorage, id: string): boolean {
  return readOfflinePack(storage, id) !== null;
}

export function removeOfflinePack(storage: OfflineStorage, id: string): void {
  storage.removeItem(offlinePackKey(id));
}

/** Vide nos packs (jamais ceux des autres modules). */
export function purgeOfflinePacks(storage: OfflineStorage): void {
  for (const key of ownKeys(storage)) storage.removeItem(key);
}

/** Retire le plus ancien pack (l'horloge des évictions). */
function evictOldest(storage: OfflineStorage): boolean {
  const [oldest] = listOfflinePacks(storage).reverse();
  if (!oldest) return false;
  removeOfflinePack(storage, oldest.id);
  return true;
}

/**
 * Écrit un pack. Renvoie `false` si le stockage refuse ENCORE après avoir
 * évincé le plus ancien : l'appelant doit le dire, pas le cacher.
 */
export function saveOfflinePack<T>(
  storage: OfflineStorage,
  id: string,
  pack: { version: number; kind: string; payload: T },
  now: Date = new Date()
): boolean {
  const entry: OfflinePack<T> = {
    version: pack.version,
    kind: pack.kind,
    savedAt: now.toISOString(),
    payload: pack.payload,
  };
  const key = offlinePackKey(id);
  const write = () => storage.setItem(key, JSON.stringify(entry));

  try {
    // Limite douce côté application : on évince AVANT d'atteindre le quota
    // du navigateur (un refus de quota est plus brutal qu'une éviction
    // choisie).
    while (listOfflinePacks(storage).filter((p) => p.id !== id).length >= MAX_OFFLINE_PACKS) {
      if (!evictOldest(storage)) break;
    }
    write();
    return true;
  } catch {
    // Quota plein (ou navigation privée) : une seule seconde chance.
    if (!evictOldest(storage)) return false;
    try {
      write();
      return true;
    } catch {
      return false;
    }
  }
}

/** `localStorage` du navigateur, ou `null` (SSR, navigation privée stricte). */
export function browserOfflineStorage(): OfflineStorage | null {
  if (typeof window === 'undefined') return null;
  try {
    const probe = `${OFFLINE_PREFIX}__probe`;
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}

// =====================================================================
// 🚀 Moteur IndexedDB Asynchrone Haute Capacité (Licorne 2027)
// =====================================================================
// Débloque la limite des 5MB de localStorage : permet de stocker des dizaines
// de livres illustrés et épisodes audio en IndexedDB sans bloquer l'UI.
// =====================================================================

const IDB_NAME = 'qoefi_offline_db';
const IDB_VERSION = 1;
const IDB_STORE = 'packs';

interface IDBPackRecord<T> {
  id: string;
  version: number;
  kind: string;
  savedAt: string;
  payload: T;
}

export function openIDB(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const req = window.indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          const store = db.createObjectStore(IDB_STORE, { keyPath: 'id' });
          store.createIndex('savedAt', 'savedAt', { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Lit un pack de façon asynchrone (IndexedDB en priorité, repli localStorage).
 */
export async function readOfflinePackAsync<T>(id: string): Promise<OfflinePack<T> | null> {
  const db = await openIDB();
  if (db) {
    const item = await new Promise<IDBPackRecord<T> | null>((resolve) => {
      try {
        const tx = db.transaction(IDB_STORE, 'readonly');
        const store = tx.objectStore(IDB_STORE);
        const req = store.get(id);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
    if (item) {
      return {
        version: item.version,
        kind: item.kind,
        savedAt: item.savedAt,
        payload: item.payload,
      };
    }
  }

  // Repli sur le stockage synchrone (ex: packs legacy dans localStorage)
  const local = browserOfflineStorage();
  if (local) {
    return readOfflinePack<T>(local, id);
  }
  return null;
}

/**
 * Vérifie l'existence d'un pack de façon asynchrone.
 */
export async function hasOfflinePackAsync(id: string): Promise<boolean> {
  const pack = await readOfflinePackAsync(id);
  return pack !== null;
}

/**
 * Enregistre un pack de façon asynchrone (IndexedDB pour capacité illimitée sans blocage UI,
 * repli localStorage si IDB indisponible).
 */
export async function saveOfflinePackAsync<T>(
  id: string,
  pack: { version: number; kind: string; payload: T },
  now: Date = new Date()
): Promise<boolean> {
  const db = await openIDB();
  if (db) {
    try {
      const record: IDBPackRecord<T> = {
        id,
        version: pack.version,
        kind: pack.kind,
        savedAt: now.toISOString(),
        payload: pack.payload,
      };

      const success = await new Promise<boolean>((resolve) => {
        try {
          const tx = db.transaction(IDB_STORE, 'readwrite');
          const store = tx.objectStore(IDB_STORE);
          const putReq = store.put(record);
          putReq.onsuccess = () => resolve(true);
          putReq.onerror = () => resolve(false);
        } catch {
          resolve(false);
        }
      });

      if (success) {
        // Nettoie aussi l'éventuelle ancienne copie dans localStorage pour libérer les 5MB
        const local = browserOfflineStorage();
        if (local) removeOfflinePack(local, id);
        return true;
      }
    } catch {
      // Continue vers le fallback localStorage
    }
  }

  // Repli localStorage
  const local = browserOfflineStorage();
  if (local) {
    return saveOfflinePack(local, id, pack, now);
  }
  return false;
}

/**
 * Supprime un pack d'IndexedDB et de localStorage.
 */
export async function removeOfflinePackAsync(id: string): Promise<void> {
  const db = await openIDB();
  if (db) {
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        const store = tx.objectStore(IDB_STORE);
        const delReq = store.delete(id);
        delReq.onsuccess = () => resolve();
        delReq.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }
  const local = browserOfflineStorage();
  if (local) {
    removeOfflinePack(local, id);
  }
}

/**
 * Liste l'ensemble des packs hors-ligne disponibles.
 */
export async function listOfflinePacksAsync(): Promise<OfflinePackInfo[]> {
  const db = await openIDB();
  const results: OfflinePackInfo[] = [];
  const seenIds = new Set<string>();

  if (db) {
    const idbItems = await new Promise<IDBPackRecord<unknown>[]>((resolve) => {
      try {
        const tx = db.transaction(IDB_STORE, 'readonly');
        const store = tx.objectStore(IDB_STORE);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    });

    for (const item of idbItems) {
      seenIds.add(item.id);
      results.push({
        id: item.id,
        kind: item.kind,
        version: item.version,
        savedAt: item.savedAt,
      });
    }
  }

  // Fusion avec localStorage pour les éléments non encore migrés
  const local = browserOfflineStorage();
  if (local) {
    for (const info of listOfflinePacks(local)) {
      if (!seenIds.has(info.id)) {
        seenIds.add(info.id);
        results.push(info);
      }
    }
  }

  return results.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}
