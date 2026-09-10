// =====================================================================
// 🧵 threads.ts — Arbre de discussion hiérarchique et aplatissement
// =====================================================================

export type ThreadNode<T> = T & {
  replies: ThreadNode<T>[];
  depth: number;
};

export interface BaseThreadItem {
  id: string;
  parentId?: string | null;
}

/**
 * Construit un arbre hiérarchique de réponses à partir d'une liste plate de pensées.
 */
export function buildThreadTree<T extends BaseThreadItem>(
  items: T[],
  rootId?: string | null
): ThreadNode<T>[] {
  if (!Array.isArray(items) || items.length === 0) {
    return [];
  }

  const nodesMap = new Map<string, ThreadNode<T>>();

  // Initialisation de chaque nœud avec une liste vide de réponses et profondeur 0
  for (const item of items) {
    nodesMap.set(item.id, {
      ...item,
      replies: [],
      depth: 0,
    });
  }

  const rootNodes: ThreadNode<T>[] = [];

  for (const item of items) {
    const node = nodesMap.get(item.id);
    if (!node) continue;

    const parentId = item.parentId;

    if (!parentId || (rootId && parentId === rootId)) {
      // Élément de premier niveau
      rootNodes.push(node);
    } else {
      const parentNode = nodesMap.get(parentId);
      if (parentNode) {
        parentNode.replies.push(node);
      } else {
        // Parent orphelin (non présent dans la tranche) : traité au premier niveau
        rootNodes.push(node);
      }
    }
  }

  // Calcul récursif de la profondeur
  function assignDepth(node: ThreadNode<T>, currentDepth: number) {
    node.depth = currentDepth;
    for (const reply of node.replies) {
      assignDepth(reply, currentDepth + 1);
    }
  }

  for (const root of rootNodes) {
    assignDepth(root, 0);
  }

  return rootNodes;
}

/**
 * Aplatit un arbre hiérarchique de réponses en liste linéaire ordonnée en profondeur (Depth-First).
 */
export function flattenThread<T extends { id: string; replies?: T[] }>(tree: T[]): T[] {
  const result: T[] = [];

  function traverse(nodes: T[]) {
    for (const node of nodes) {
      result.push(node);
      if (Array.isArray(node.replies) && node.replies.length > 0) {
        traverse(node.replies);
      }
    }
  }

  traverse(tree);
  return result;
}

/**
 * Retrouve la chaîne des ancêtres ordonnée (du plus ancien au parent direct) pour un post donné.
 */
export function findThreadAncestors<T extends BaseThreadItem>(items: T[], targetId: string): T[] {
  const byId = new Map<string, T>(items.map((i) => [i.id, i]));
  const ancestors: T[] = [];
  const visited = new Set<string>();

  let current = byId.get(targetId);
  while (current && current.parentId) {
    if (visited.has(current.parentId)) {
      // Détection de boucle
      break;
    }
    visited.add(current.parentId);
    const parent = byId.get(current.parentId);
    if (!parent) break;
    ancestors.unshift(parent);
    current = parent;
  }

  return ancestors;
}

/**
 * Compte récursivement tous les descendants (réponses et sous-réponses) d'un nœud.
 */
export function countThreadDescendants(node: { replies?: unknown[] }): number {
  if (!Array.isArray(node.replies) || node.replies.length === 0) {
    return 0;
  }
  let count = node.replies.length;
  for (const child of node.replies) {
    if (child && typeof child === 'object' && 'replies' in child) {
      count += countThreadDescendants(child as { replies?: unknown[] });
    }
  }
  return count;
}
