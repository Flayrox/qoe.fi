'use client';

import * as React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CircleCheckIcon,
  InfoIcon,
  TriangleAlertIcon,
  OctagonXIcon,
  SparklesIcon,
  XIcon,
} from 'lucide-react';

import { cn } from '@qoe/utils';

// =====================================================================
// 🔔 Toast — notifications qoe.fi (inspiration bento)
// =====================================================================
// Remplace la stack shadcn/sonner : mêmes appels (toast.success/error/…),
// rendu 100 % custom, empilé en bas à droite. Rendre <Toaster /> une seule
// fois dans le layout racine de chaque app, puis appeler toast.* partout :
//   import { toast, Toaster } from '@qoe/ui/toast';
// =====================================================================

type ToastVariant = 'success' | 'error' | 'info' | 'warning' | 'message';

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastOptions {
  description?: string;
  duration?: number;
  action?: ToastAction;
}

interface ToastItem {
  id: number;
  variant: ToastVariant;
  title: string;
  description?: string;
  action?: ToastAction;
  duration: number;
}

// --- Store global minimal (pub/sub, sans contexte) ---------------------
type Listener = (toasts: ToastItem[]) => void;

let items: ToastItem[] = [];
const listeners = new Set<Listener>();
let nextId = 1;

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emit() {
  for (const listener of listeners) listener(items);
}

function push(variant: ToastVariant, title: string, options: ToastOptions = {}) {
  const id = nextId++;
  const toast: ToastItem = {
    id,
    variant,
    title,
    description: options.description,
    action: options.action,
    duration: options.duration ?? (variant === 'error' ? 6000 : 4000),
  };
  items = [...items, toast];
  emit();
  return id;
}

function dismiss(id?: number) {
  items = id ? items.filter((t) => t.id !== id) : [];
  emit();
}

/**
 * API compatible sonner pour les appels existants :
 *   toast.success('Fait') / toast.error(msg, { description }) / …
 */
const toast = Object.assign(
  (title: string, options?: ToastOptions) => push('message', title, options),
  {
    message: (title: string, options?: ToastOptions) => push('message', title, options),
    success: (title: string, options?: ToastOptions) => push('success', title, options),
    error: (title: string, options?: ToastOptions) => push('error', title, options),
    info: (title: string, options?: ToastOptions) => push('info', title, options),
    warning: (title: string, options?: ToastOptions) => push('warning', title, options),
    dismiss,
  }
);

export { toast, dismiss as toastDismiss };
export type { ToastItem, ToastOptions, ToastVariant };

// --- Rendu --------------------------------------------------------------
const variantMeta: Record<
  ToastVariant,
  { icon: React.ComponentType<{ className?: string }>; chip: string; bar: string }
> = {
  success: {
    icon: CircleCheckIcon,
    chip: 'bg-success/15 text-success',
    bar: 'bg-success/70',
  },
  error: {
    icon: OctagonXIcon,
    chip: 'bg-destructive/15 text-destructive',
    bar: 'bg-destructive/70',
  },
  info: {
    icon: InfoIcon,
    chip: 'bg-neural-blue/15 text-neural-blue',
    bar: 'bg-neural-blue/70',
  },
  warning: {
    icon: TriangleAlertIcon,
    chip: 'bg-neural-amber/15 text-neural-amber',
    bar: 'bg-neural-amber/70',
  },
  message: {
    icon: SparklesIcon,
    chip: 'bg-primary/15 text-primary',
    bar: 'bg-primary/70',
  },
};

function ToastCard({ toast }: { toast: ToastItem }) {
  const meta = variantMeta[toast.variant];
  const Icon = meta.icon;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 28, scale: 0.96 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 28, scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
      role={toast.variant === 'error' ? 'alert' : 'status'}
      className={cn(
        'pointer-events-auto relative flex items-start gap-3 overflow-hidden rounded-2xl border border-border bg-popover/90 p-3 pr-9 shadow-lg shadow-black/5 backdrop-blur-md',
        'dark:bg-popover/80'
      )}
    >
      {/* Cellule icône (bento) */}
      <div className={cn('mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg', meta.chip)}>
        <Icon className="size-4" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-snug text-popover-foreground">{toast.title}</p>
        {toast.description ? (
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            {toast.description}
          </p>
        ) : null}
        {toast.action ? (
          <button
            type="button"
            onClick={toast.action.onClick}
            className="mt-1.5 text-xs font-semibold text-primary underline-offset-2 hover:underline"
          >
            {toast.action.label}
          </button>
        ) : null}
      </div>

      <button
        type="button"
        onClick={() => dismiss(toast.id)}
        aria-label="Fermer la notification"
        className="absolute right-2 top-2 grid size-6 place-items-center rounded-md text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
      >
        <XIcon className="size-3.5" />
      </button>

      {/* Barre de progression (détail bento) */}
      <motion.span
        className={cn('absolute inset-x-0 bottom-0 h-0.5 origin-left', meta.bar)}
        initial={{ scaleX: 1 }}
        animate={{ scaleX: 0 }}
        transition={{ duration: toast.duration / 1000, ease: 'linear' }}
      />
    </motion.div>
  );
}

interface ToasterProps {
  position?: 'bottom-right' | 'top-right';
}

function Toaster({ position = 'bottom-right' }: ToasterProps) {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);
  const timeouts = React.useRef(new Map<number, ReturnType<typeof setTimeout>>());

  React.useEffect(() => {
    const unsubscribe = subscribe((next) => {
      setToasts(next);

      // Planifie l'auto-fermeture des nouvelles notifications.
      for (const t of next) {
        if (!timeouts.current.has(t.id)) {
          const timer = setTimeout(() => dismiss(t.id), t.duration);
          timeouts.current.set(t.id, timer);
        }
      }

      // Nettoie les timers des notifications parties.
      const live = new Set(next.map((t) => t.id));
      for (const [id, timer] of timeouts.current) {
        if (!live.has(id)) {
          clearTimeout(timer);
          timeouts.current.delete(id);
        }
      }
    });

    return () => {
      unsubscribe();
      for (const timer of timeouts.current.values()) clearTimeout(timer);
      timeouts.current.clear();
    };
  }, []);

  return (
    <div
      className={cn(
        'pointer-events-none fixed z-[100] flex w-[min(92vw,380px)] flex-col gap-2.5',
        position === 'bottom-right' ? 'bottom-4 right-4' : 'right-4 top-4'
      )}
    >
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <ToastCard key={t.id} toast={t} />
        ))}
      </AnimatePresence>
    </div>
  );
}

export { Toaster };
