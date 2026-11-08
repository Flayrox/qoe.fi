'use client';

// =====================================================================
// 🎛️ EntityActionMenu — menu universel piloté par le registre d'actions
// =====================================================================
// Le MENU ne décide de rien : il demande au registre SDK les actions visibles
// pour sa surface et son contexte, puis exécute soit le callback du parent,
// soit la mutation optimiste par défaut (sourdine, blocage, signet).
// Ajouter une action au registre la rend disponible ici, sur toutes les
// surfaces, sans toucher à ce composant.
// =====================================================================

import React from 'react';
import { t } from '@lingui/core/macro';
import {
  Ban,
  Bookmark,
  Copy,
  Eye,
  EyeOff,
  Flag,
  Link2,
  MoreHorizontal,
  Pin,
  Trash2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  executeDefaultEntityMutation,
  resolveEntityActions,
  useActorShadow,
  type EntityActionContext,
  type EntityActionDescriptor,
  type EntityActionId,
  type EntitySurface,
} from '@qoe/sdk';
import { cn } from '@qoe/utils';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';

export interface EntityActionMenuCallbacks {
  onPinToggle?: (e: React.MouseEvent) => void;
  onDeleteClick?: (e: React.MouseEvent) => void;
  onReportClick?: (e: React.MouseEvent) => void;
  onHideReplyToggle?: (e: React.MouseEvent) => void;
  onShowLessClick?: (e: React.MouseEvent) => void;
  onBlockUserToggle?: (e: React.MouseEvent) => void;
  onMuteUserToggle?: (e: React.MouseEvent) => void;
  onBookmarkToggle?: (e: React.MouseEvent) => void;
}

export interface EntityActionMenuProps extends EntityActionMenuCallbacks {
  surface: EntitySurface;
  context: EntityActionContext;
  className?: string;
  triggerClassName?: string;
}

/** Actions qui possèdent un exécuteur optimiste dans le SDK. */
const HAS_DEFAULT_MUTATION: ReadonlySet<EntityActionId> = new Set<EntityActionId>([
  'toggle-mute-author',
  'toggle-block-author',
  'toggle-bookmark',
  'copy-link',
  'copy-text',
]);

function callbackFor(
  actionId: EntityActionId,
  callbacks: EntityActionMenuCallbacks
): ((e: React.MouseEvent) => void) | undefined {
  switch (actionId) {
    case 'toggle-pin':
      return callbacks.onPinToggle;
    case 'delete':
      return callbacks.onDeleteClick;
    case 'report':
      return callbacks.onReportClick;
    case 'toggle-hide-reply':
      return callbacks.onHideReplyToggle;
    case 'show-less':
      return callbacks.onShowLessClick;
    case 'toggle-block-author':
      return callbacks.onBlockUserToggle;
    case 'toggle-mute-author':
      return callbacks.onMuteUserToggle;
    case 'toggle-bookmark':
      return callbacks.onBookmarkToggle;
    default:
      return undefined;
  }
}

function labelFor(action: EntityActionDescriptor, ctx: EntityActionContext): string {
  const handle = ctx.author.username || ctx.author.subdomain || ctx.author.id.slice(0, 8);
  switch (action.id) {
    case 'copy-text':
      return t`Copier le texte`;
    case 'copy-link':
      return t`Copier le lien`;
    case 'toggle-bookmark':
      return ctx.isBookmarked ? t`Retirer des signets` : t`Ajouter aux signets`;
    case 'toggle-pin':
      return ctx.isPinned ? t`Désépingler` : t`Épingler`;
    case 'toggle-hide-reply':
      return ctx.isHiddenByAuthor ? t`Afficher cette réponse` : t`Masquer cette réponse`;
    case 'show-less':
      return t`Voir moins de contenu comme ça`;
    case 'toggle-mute-author':
      return ctx.author.isMuted ? t`Réactiver @${handle}` : t`Mettre @${handle} en sourdine`;
    case 'toggle-block-author':
      return ctx.author.isBlocked ? t`Débloquer @${handle}` : t`Bloquer @${handle}`;
    case 'report':
      return t`Signaler`;
    case 'delete':
      return t`Supprimer`;
  }
}

function iconFor(action: EntityActionDescriptor, ctx: EntityActionContext): React.ReactNode {
  const className = 'h-3.5 w-3.5';
  switch (action.iconName) {
    case 'Copy':
      return <Copy className={className} />;
    case 'Link2':
      return <Link2 className={className} />;
    case 'Bookmark':
      return <Bookmark className={className} />;
    case 'Pin':
      return <Pin className={cn(className, 'rotate-45')} />;
    case 'EyeOff':
      return ctx.isHiddenByAuthor ? (
        <Eye className={className} />
      ) : (
        <EyeOff className={className} />
      );
    case 'Eye':
      return <Eye className={className} />;
    case 'VolumeX':
      return ctx.author.isMuted ? (
        <Volume2 className={className} />
      ) : (
        <VolumeX className={className} />
      );
    case 'Volume2':
      return <Volume2 className={className} />;
    case 'Ban':
      return <Ban className={className} />;
    case 'Flag':
      return <Flag className={className} />;
    case 'Trash2':
      return <Trash2 className={className} />;
  }
}

function intentClass(intent: EntityActionDescriptor['intent']): string {
  if (intent === 'destructive') {
    return 'text-destructive-text hover:bg-destructive/10';
  }
  if (intent === 'warning') {
    return 'text-highlight hover:bg-highlight/10';
  }
  return 'text-muted-foreground hover:bg-muted hover:text-foreground';
}

async function copyToClipboard(value: string | undefined): Promise<void> {
  if (!value || typeof navigator === 'undefined' || !navigator.clipboard) return;
  try {
    await navigator.clipboard.writeText(value);
  } catch (err) {
    console.error('[EntityActionMenu] copie impossible :', err);
  }
}

export function EntityActionMenu({
  surface,
  context,
  className,
  triggerClassName,
  ...callbacks
}: EntityActionMenuProps) {
  const [open, setOpen] = React.useState(false);

  // L'auteur est abonné au Shadow Store : `muted` / `blocked` restent
  // cohérents sur TOUTES les cartes du même auteur, en temps réel.
  const shadowedAuthor = useActorShadow(context.author);
  const mergedContext: EntityActionContext = React.useMemo(
    () => ({ ...context, author: shadowedAuthor }),
    [context, shadowedAuthor]
  );

  const actions = resolveEntityActions(surface, mergedContext).filter((action) => {
    if (HAS_DEFAULT_MUTATION.has(action.id)) return true;
    return Boolean(callbackFor(action.id, callbacks));
  });

  if (actions.length === 0) return null;

  const handleAction = (action: EntityActionDescriptor, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setOpen(false);

    if (action.id === 'copy-link') {
      void copyToClipboard(mergedContext.url || mergedContext.entityId);
      return;
    }
    if (action.id === 'copy-text') {
      void copyToClipboard(mergedContext.text);
      return;
    }

    const custom = callbackFor(action.id, callbacks);
    if (custom) {
      custom(e);
      return;
    }

    void executeDefaultEntityMutation(action.id, mergedContext);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            className={cn(
              'p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer flex items-center justify-center outline-none',
              triggerClassName
            )}
            aria-label={t`Plus d'options`}
            title={t`Options`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setOpen(true);
            }}
          >
            <MoreHorizontal className="w-3.5 h-3.5" />
          </button>
        }
      />
      <PopoverContent
        align="end"
        className={cn(
          'w-56 p-1.5 space-y-0.5 bg-popover border border-border/40 rounded-xl shadow-lg z-50 font-sans',
          className
        )}
      >
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            onClick={(e) => handleAction(action, e)}
            className={cn(
              'w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors flex items-center gap-2 cursor-pointer font-medium',
              intentClass(action.intent)
            )}
          >
            {iconFor(action, mergedContext)}
            <span>{labelFor(action, mergedContext)}</span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
