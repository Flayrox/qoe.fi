'use client';

// =====================================================================
// 🎛️ REGISTRE DÉCLARATIF D'ACTIONS D'ENTITÉS
// =====================================================================
// Une action déclarée UNE fois devient disponible sur toutes les surfaces
// (menu de pensée, menu d'article, barre d'engagement, menu de profil,
// Cmd+K) avec le Shadow Store déjà câblé. Les surfaces ne codent plus en dur
// leurs boutons : elles demandent `resolveEntityActions(surface, contexte)`.
//
// ⚠️ Fichier client pur — JAMAIS 'use server' : les fonctions synchrones y
// sont autorisées, contrairement aux modules Server Actions.
// =====================================================================

import type { PostCapabilities, ArticleCapabilities } from './types';
import { updateActorShadow, updateArticleShadow, withShadowMutation } from './shadow';
import {
  toggleBlockUserAction,
  toggleBookmarkArticleHomeAction,
  toggleMuteUserAction,
} from './actions/feed';

/** Surfaces qui consomment le registre. */
export type EntitySurface =
  | 'thought-card-menu'
  | 'article-card-menu'
  | 'article-engagement-bar'
  | 'profile-menu'
  | 'cmdk-context';

/** Auteur minimal partagé par toutes les entités (état relationnel inclus). */
export interface EntityAuthorTarget {
  id: string;
  username?: string | null;
  subdomain?: string | null;
  name?: string | null;
  isFollowed?: boolean;
  isMuted?: boolean;
  isBlocked?: boolean;
}

/** Contexte d'une entité au moment du rendu du menu. */
export interface EntityActionContext {
  entityType: 'thought' | 'article' | 'actor';
  entityId: string;
  url?: string;
  text?: string;
  isPinned?: boolean;
  isBookmarked?: boolean;
  isHiddenByAuthor?: boolean;
  author: EntityAuthorTarget;
  viewerId?: string | null;
  capabilities?: Partial<PostCapabilities & ArticleCapabilities>;
}

export type EntityActionIntent = 'default' | 'destructive' | 'warning';

export type EntityActionId =
  | 'copy-text'
  | 'copy-link'
  | 'toggle-bookmark'
  | 'toggle-pin'
  | 'toggle-hide-reply'
  | 'show-less'
  | 'toggle-mute-author'
  | 'toggle-block-author'
  | 'report'
  | 'delete';

export interface EntityActionDescriptor {
  id: EntityActionId;
  surfaces: EntitySurface[];
  intent: EntityActionIntent;
  iconName:
    | 'Copy'
    | 'Link2'
    | 'Bookmark'
    | 'Pin'
    | 'EyeOff'
    | 'Eye'
    | 'VolumeX'
    | 'Volume2'
    | 'Ban'
    | 'Flag'
    | 'Trash2';
  requiresAuth: boolean;
  isVisible: (ctx: EntityActionContext) => boolean;
}

const isOtherAuthor = (ctx: EntityActionContext) =>
  Boolean(ctx.viewerId) && ctx.viewerId !== ctx.author.id;

const isSelf = (ctx: EntityActionContext) =>
  Boolean(ctx.viewerId) && ctx.viewerId === ctx.author.id;

/**
 * Liste canonique des actions. L'ordre est celui d'affichage : actions
 * positives d'abord, auteur ensuite, destructif en dernier.
 */
export const ENTITY_ACTIONS: readonly EntityActionDescriptor[] = [
  {
    id: 'copy-text',
    surfaces: ['thought-card-menu', 'cmdk-context'],
    intent: 'default',
    iconName: 'Copy',
    requiresAuth: false,
    isVisible: (ctx) => Boolean(ctx.text),
  },
  {
    id: 'copy-link',
    surfaces: [
      'thought-card-menu',
      'article-card-menu',
      'article-engagement-bar',
      'profile-menu',
      'cmdk-context',
    ],
    intent: 'default',
    iconName: 'Link2',
    requiresAuth: false,
    isVisible: (ctx) => Boolean(ctx.url || ctx.entityId),
  },
  {
    id: 'toggle-bookmark',
    surfaces: ['article-card-menu', 'cmdk-context'],
    intent: 'default',
    iconName: 'Bookmark',
    requiresAuth: true,
    isVisible: (ctx) => ctx.entityType === 'article',
  },
  {
    id: 'toggle-pin',
    surfaces: ['thought-card-menu', 'cmdk-context'],
    intent: 'default',
    iconName: 'Pin',
    requiresAuth: true,
    isVisible: (ctx) => ctx.capabilities?.canPin ?? (isSelf(ctx) && ctx.entityType === 'thought'),
  },
  {
    id: 'toggle-hide-reply',
    surfaces: ['thought-card-menu'],
    intent: 'default',
    iconName: 'EyeOff',
    requiresAuth: true,
    isVisible: (ctx) => Boolean(ctx.capabilities?.canHideReply),
  },
  {
    id: 'show-less',
    surfaces: ['thought-card-menu', 'article-card-menu'],
    intent: 'default',
    iconName: 'EyeOff',
    requiresAuth: false,
    isVisible: (ctx) => ctx.viewerId !== ctx.author.id,
  },
  {
    id: 'toggle-mute-author',
    surfaces: ['thought-card-menu', 'article-card-menu', 'profile-menu', 'cmdk-context'],
    intent: 'default',
    iconName: 'VolumeX',
    requiresAuth: true,
    isVisible: (ctx) => ctx.capabilities?.canMuteAuthor ?? isOtherAuthor(ctx),
  },
  {
    id: 'toggle-block-author',
    surfaces: ['thought-card-menu', 'article-card-menu', 'profile-menu', 'cmdk-context'],
    intent: 'destructive',
    iconName: 'Ban',
    requiresAuth: true,
    isVisible: (ctx) => ctx.capabilities?.canBlockAuthor ?? isOtherAuthor(ctx),
  },
  {
    id: 'report',
    surfaces: ['thought-card-menu', 'article-card-menu', 'profile-menu'],
    intent: 'warning',
    iconName: 'Flag',
    requiresAuth: true,
    isVisible: (ctx) => ctx.capabilities?.canReport ?? !isSelf(ctx),
  },
  {
    id: 'delete',
    surfaces: ['thought-card-menu'],
    intent: 'destructive',
    iconName: 'Trash2',
    requiresAuth: true,
    isVisible: (ctx) =>
      ctx.capabilities?.canDelete ?? (isSelf(ctx) && ctx.entityType === 'thought'),
  },
];

/**
 * Sélectionne les actions visibles d'une surface pour un contexte donné.
 * Fonction pure : même contexte → même résultat, testable sans DOM.
 */
export function resolveEntityActions(
  surface: EntitySurface,
  ctx: EntityActionContext
): EntityActionDescriptor[] {
  return ENTITY_ACTIONS.filter((action) => {
    if (!action.surfaces.includes(surface)) return false;
    if (action.requiresAuth && !ctx.viewerId) return false;
    return action.isVisible(ctx);
  });
}

/**
 * Exécute l'action par défaut (sans override fourni par le parent) avec mise à
 * jour optimiste et rollback automatique via le Shadow Store.
 *
 * Les actions qui exigent un contexte métier local (suppression, signalement,
 * épinglage, masquage de réponse, « voir moins ») n'ont pas de défaut : c'est
 * le composant appelant qui fournit son handler.
 */
export async function executeDefaultEntityMutation(
  actionId: EntityActionId,
  ctx: EntityActionContext
): Promise<void> {
  switch (actionId) {
    case 'toggle-mute-author': {
      const previous = Boolean(ctx.author.isMuted);
      const next = !previous;
      await withShadowMutation({
        lockKey: `actor:${ctx.author.id}:mute`,
        optimisticUpdate: () => updateActorShadow(ctx.author.id, { muted: next }),
        rollback: () => updateActorShadow(ctx.author.id, { muted: previous }),
        mutation: async () => {
          const res = await toggleMuteUserAction(ctx.author.id);
          if (!res?.ok) {
            throw new Error(res?.error?.message || 'Échec de la mise en sourdine');
          }
          const muted = Boolean(res.data?.muted);
          updateActorShadow(ctx.author.id, { muted });
          return muted;
        },
      });
      return;
    }

    case 'toggle-block-author': {
      const previous = Boolean(ctx.author.isBlocked);
      const next = !previous;
      await withShadowMutation({
        lockKey: `actor:${ctx.author.id}:block`,
        optimisticUpdate: () => updateActorShadow(ctx.author.id, { blocked: next }),
        rollback: () => updateActorShadow(ctx.author.id, { blocked: previous }),
        mutation: async () => {
          const res = await toggleBlockUserAction(ctx.author.id);
          if (!res?.ok) {
            throw new Error(res?.error?.message || 'Échec du blocage');
          }
          const blocked = Boolean(res.data?.blocked);
          updateActorShadow(ctx.author.id, { blocked });
          return blocked;
        },
      });
      return;
    }

    case 'toggle-bookmark': {
      if (ctx.entityType !== 'article') return;
      const previous = Boolean(ctx.isBookmarked);
      const next = !previous;
      await withShadowMutation({
        lockKey: `article:${ctx.entityId}:bookmark`,
        optimisticUpdate: () => updateArticleShadow(ctx.entityId, { bookmarked: next }),
        rollback: () => updateArticleShadow(ctx.entityId, { bookmarked: previous }),
        mutation: async () => {
          const res = await toggleBookmarkArticleHomeAction(ctx.entityId);
          if (!res?.ok) {
            throw new Error(res?.error?.message || 'Échec du signet');
          }
          const bookmarked = Boolean(res.data?.bookmarked);
          updateArticleShadow(ctx.entityId, { bookmarked });
          return bookmarked;
        },
      });
      return;
    }

    default:
      // Aucun défaut : l'action doit être portée par un callback de surface.
      return;
  }
}
