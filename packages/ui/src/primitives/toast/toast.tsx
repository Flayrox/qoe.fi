'use client';

import {
  CircleCheckIcon,
  InfoIcon,
  OctagonXIcon,
  SparklesIcon,
  TriangleAlertIcon,
  XIcon,
} from 'lucide-react';
import {
  Button as AriaButton,
  Text,
  UNSTABLE_Toast as Toast,
  UNSTABLE_ToastContent as ToastContent,
  UNSTABLE_ToastQueue as ToastQueue,
  UNSTABLE_ToastRegion as ToastRegion,
} from 'react-aria-components';

import { cn } from '@qoe/utils';

// =====================================================================
// 🔔 Toast — notification non bloquante, sur react-aria
// =====================================================================
// 📖 react-aria fournit la partie qu'on réimplémentait mal : région live
//    (`aria-live`), annonce vocale une fois par notification (pas une par
//    re-render), file d'attente bornée, et fermeture au clavier.
//
// 🎯 Ce qui reste ici : le dessin (cellule d'icône, densité, tons) et le
//    vocabulaire produit (5 variantes).
//
// ⚠️ Attention : `ToastQueue` est un objet d'état, pas un hook. La file vit
//    au niveau du module, comme l'ancien store — un seul `<Toaster />` par
//    app, plusieurs `toast.*()` depuis n'importe où.
// =====================================================================

export type ToastVariant = 'success' | 'error' | 'info' | 'warning' | 'message';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastContent {
  variant: ToastVariant;
  title: string;
  description?: string;
  action?: ToastAction;
}

/** File partagée. `maxVisibleToasts` évite de couvrir l'écran en cas de boucle. */
export const toastQueue = new ToastQueue<ToastContent>({ maxVisibleToasts: 4 });

const VARIANT_META: Record<
  ToastVariant,
  {
    icon: typeof InfoIcon;
    /** Cellule d'icône : fond teinté, texte de la même famille. */
    chip: string;
    /** Liseré gauche : le seul marqueur qui reste lisible en niveaux de gris. */
    rail: string;
  }
> = {
  success: {
    icon: CircleCheckIcon,
    chip: 'bg-success/15 text-success-text',
    rail: 'before:bg-success/70',
  },
  error: {
    icon: OctagonXIcon,
    chip: 'bg-destructive/15 text-destructive-text',
    rail: 'before:bg-destructive/70',
  },
  info: {
    icon: InfoIcon,
    chip: 'bg-neural-blue/15 text-neural-blue',
    rail: 'before:bg-neural-blue/70',
  },
  warning: {
    icon: TriangleAlertIcon,
    chip: 'bg-neural-amber/15 text-neural-amber',
    rail: 'before:bg-neural-amber/70',
  },
  message: { icon: SparklesIcon, chip: 'bg-primary/15 text-primary', rail: 'before:bg-primary/70' },
};

export interface ToasterProps {
  position?: 'bottom-right' | 'top-right';
}

export function Toaster({ position = 'bottom-right' }: ToasterProps) {
  return (
    <ToastRegion
      queue={toastQueue}
      aria-label="Notifications"
      className={cn(
        'pointer-events-none fixed z-[100] flex w-[min(92vw,380px)] flex-col-reverse gap-2.5',
        position === 'bottom-right' ? 'bottom-4 right-4' : 'top-4 right-4 flex-col'
      )}
    >
      {({ toast }) => {
        const { variant, title, description, action } = toast.content;
        const { icon: Icon, chip, rail } = VARIANT_META[variant];

        return (
          <Toast
            toast={toast}
            className={cn(
              'pointer-events-auto relative flex items-start gap-3 overflow-hidden rounded-panel border border-border bg-popover/95 p-3 pr-9 shadow-lg backdrop-blur-md',
              // Entrée : `starting:` s'applique au premier rendu, sans JS.
              'transition duration-200 ease-out starting:translate-x-4 starting:opacity-0',
              'before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:content-[""]',
              rail
            )}
          >
            <ToastContent className="flex min-w-0 flex-1 items-start gap-3">
              <span
                aria-hidden
                className={cn(
                  'mt-0.5 grid size-7 shrink-0 place-items-center rounded-control',
                  chip
                )}
              >
                <Icon className="size-4" strokeWidth={1.75} />
              </span>

              <span className="min-w-0 flex-1">
                <Text
                  slot="title"
                  className="block truncate type-control-md font-medium text-popover-foreground"
                >
                  {title}
                </Text>
                {description && (
                  <Text
                    slot="description"
                    className="mt-0.5 block type-control-sm leading-relaxed text-muted-foreground"
                  >
                    {description}
                  </Text>
                )}
                {action && (
                  <AriaButton
                    onPress={() => {
                      action.onClick();
                      toastQueue.close(toast.key);
                    }}
                    className="mt-1.5 rounded-control type-control-xs font-semibold text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                  >
                    {action.label}
                  </AriaButton>
                )}
              </span>
            </ToastContent>

            <AriaButton
              slot="close"
              aria-label="Fermer la notification"
              className="absolute right-2 top-2 grid size-6 place-items-center rounded-control text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              <XIcon className="size-3.5" strokeWidth={2} />
            </AriaButton>
          </Toast>
        );
      }}
    </ToastRegion>
  );
}
