'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { HotkeyHelpModal, useSurfaceHotkeys } from '@qoe/ui';

/**
 * ⌨️ Active les raccourcis de navigation du Studio (`g h`, `g a`, `c a`…)
 * déclarés dans le manifeste de surfaces. Composant sans rendu, monté une
 * seule fois par le layout créateur.
 */
export function SurfaceHotkeys() {
  const router = useRouter();
  const [helpOpen, setHelpOpen] = useState(false);

  useSurfaceHotkeys({
    scope: 'studio',
    onNavigate: (path) => router.push(path),
  });

  // « ? » ouvre l'aide : les raccourcis affichés sont ceux du manifeste.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '?' || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
      ) {
        return;
      }
      event.preventDefault();
      setHelpOpen(true);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return <HotkeyHelpModal isOpen={helpOpen} onClose={() => setHelpOpen(false)} scope="studio" />;
}
