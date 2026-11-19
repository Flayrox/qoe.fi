// =====================================================================
// 💾 Brouillons de fil locaux — lecture défensive
// =====================================================================
// `localStorage` n'est pas une source de confiance : une entrée écrite par
// une version antérieure (ou abîmée) ne doit pas pouvoir casser le rendu du
// compositeur. On valide donc chaque nœud et on rend `null` si la forme est
// inexploitable — l'appelant prévient l'utilisateur au lieu de planter.
// =====================================================================

export const LOCAL_THREAD_DRAFT_KEY = 'qoe_multi_thought_drafts';

export interface StoredThreadImage {
  id: string;
  url: string;
  altText?: string;
}

export interface StoredThreadNode {
  id: string;
  text: string;
  images: StoredThreadImage[];
  isTriggerWarning: boolean;
  triggerWarning: string;
  showPollEditor: boolean;
  pollOptions: string[];
  pollDurationHours: number;
}

const asString = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback;

function readNode(entry: unknown, index: number): StoredThreadNode | null {
  if (!entry || typeof entry !== 'object') return null;
  const node = entry as Record<string, unknown>;

  // `images` est toujours un tableau dans le schéma : une autre forme signifie
  // un brouillon d'une version antérieure. On refuse le nœud entier plutôt que
  // de restaurer un fil amputé de ses images sans le dire.
  if (node.images !== undefined && !Array.isArray(node.images)) return null;
  const images: StoredThreadImage[] = [];
  for (const raw of node.images ?? []) {
    if (!raw || typeof raw !== 'object') return null;
    const image = raw as Record<string, unknown>;
    if (typeof image.url !== 'string' || image.url.length === 0) return null;
    images.push({
      id: typeof image.id === 'string' && image.id ? image.id : image.url,
      url: image.url,
      altText: typeof image.altText === 'string' ? image.altText : undefined,
    });
  }

  const pollOptions = Array.isArray(node.pollOptions)
    ? node.pollOptions.filter((option): option is string => typeof option === 'string')
    : [];

  return {
    id: typeof node.id === 'string' && node.id ? node.id : `stored-node-${index}`,
    text: asString(node.text),
    images,
    isTriggerWarning: node.isTriggerWarning === true,
    triggerWarning: asString(node.triggerWarning),
    showPollEditor: node.showPollEditor === true,
    pollOptions: pollOptions.length >= 2 ? pollOptions : ['', ''],
    pollDurationHours:
      typeof node.pollDurationHours === 'number' && Number.isFinite(node.pollDurationHours)
        ? node.pollDurationHours
        : 24,
  };
}

/**
 * Relit un brouillon de fil stocké localement. `null` = illisible : l'appelant
 * affiche l'erreur, il ne restaure jamais un état partiel.
 */
export function parseStoredThreadNodes(raw: string | null): StoredThreadNode[] | null {
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length === 0) return null;

  const nodes: StoredThreadNode[] = [];
  for (const [index, entry] of parsed.entries()) {
    const node = readNode(entry, index);
    if (!node) return null;
    nodes.push(node);
  }
  return nodes;
}
