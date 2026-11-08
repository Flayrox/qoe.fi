'use client';

// =====================================================================
// ⌨️ useSurfaceHotkeys — navigation clavier pilotée par le manifeste
// =====================================================================
// Les hotkeys déclarées dans `PLATFORM_SURFACES` (`g h`, `g a`, `c a`…) sont
// résolues ici : séquence à préfixe (`g` puis `h`) ou touche simple (`/`).
// Aucune touche n'est interceptée dans un champ de saisie, avec un modificateur
// ou pendant une répétition. Le hook ne connaît pas le routeur : la surface
// appelante fournit `onNavigate`, ce qui le garde testable sans Next.
// =====================================================================

import { useEffect, useRef } from 'react';
import { getHotkeySurfaces, type AppSurfaceScope, type SurfaceDescriptor } from '@qoe/config';

/** Délai maximal entre le préfixe et la touche finale (ms). */
const SEQUENCE_TIMEOUT = 1500;

export interface UseSurfaceHotkeysOptions {
  scope: AppSurfaceScope;
  /** Appelé avec le chemin de la surface et son identifiant. */
  onNavigate: (path: string, surfaceId: string) => void;
  /** Désactive l'écoute (ex. modale ouverte). */
  enabled?: boolean;
}

function isEditableTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) return false;
  if (element.isContentEditable) return true;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName);
}

export function useSurfaceHotkeys({
  scope,
  onNavigate,
  enabled = true,
}: UseSurfaceHotkeysOptions): void {
  const pendingPrefix = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Le callback peut changer à chaque rendu (closure du routeur) sans réinstaller
  // l'écouteur, qui ne dépend que du scope.
  const navigateRef = useRef(onNavigate);
  useEffect(() => {
    navigateRef.current = onNavigate;
  }, [onNavigate]);

  useEffect(() => {
    if (!enabled) return;

    const singles = new Map<string, SurfaceDescriptor>();
    const sequences = new Map<string, SurfaceDescriptor>();
    const prefixes = new Set<string>();

    for (const surface of getHotkeySurfaces(scope)) {
      if (!surface.hotkey) continue;
      const parts = surface.hotkey.trim().split(/\s+/);
      if (parts.length === 1) {
        singles.set(parts[0], surface);
      } else {
        sequences.set(parts.join(' '), surface);
        prefixes.add(parts[0]);
      }
    }

    const clearPending = () => {
      pendingPrefix.current = null;
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
      if (isEditableTarget(event.target)) return;

      // `,` et `/` sont des touches simples : on normalise la casse des lettres.
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;

      if (pendingPrefix.current) {
        const combination = `${pendingPrefix.current} ${key}`;
        const surface = sequences.get(combination);
        clearPending();
        if (surface) {
          event.preventDefault();
          navigateRef.current(surface.path, surface.id);
        }
        return;
      }

      if (prefixes.has(key)) {
        pendingPrefix.current = key;
        timer.current = setTimeout(clearPending, SEQUENCE_TIMEOUT);
        return;
      }

      const surface = singles.get(key);
      if (surface) {
        event.preventDefault();
        navigateRef.current(surface.path, surface.id);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      clearPending();
    };
  }, [scope, enabled]);
}
