'use client';

import { useEffect, useState } from 'react';

interface ReadingProgressBarProps {
  containerId?: string;
  className?: string;
}

export function ReadingProgressBar({ containerId, className = '' }: ReadingProgressBarProps) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    function measure() {
      if (containerId) {
        const container = document.getElementById(containerId);
        if (container) {
          const maxScroll = container.scrollHeight - container.clientHeight;
          const pct = maxScroll > 0 ? (container.scrollTop / maxScroll) * 100 : 0;
          setProgress(Math.min(100, Math.max(0, pct)));
          return;
        }
      }

      // Default to window scroll
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      const pct = maxScroll > 0 ? (scrollTop / maxScroll) * 100 : 0;
      setProgress(Math.min(100, Math.max(0, pct)));
    }

    // ⚠️ Mesure immédiate : la barre ne se remplissait qu'au PREMIER
    // défilement. Arriver au milieu d'un article (retour depuis un lien,
    // rechargement, ancre) affichait donc 0 % tant qu'on n'avait pas touché
    // la molette.
    measure();

    // ⚠️ Écoute en phase de CAPTURE, et conteneur résolu à chaque
    // événement : le corps de l'article est presque toujours monté APRÈS le
    // shell (il vient d'une requête), et un défilement d'élément ne
    // bouillonne pas. S'accrocher une fois pour toutes au conteneur présent
    // au montage laissait la barre collée à la fenêtre — donc à 0 %.
    document.addEventListener('scroll', measure, { capture: true, passive: true });
    window.addEventListener('scroll', measure, { passive: true });
    return () => {
      document.removeEventListener('scroll', measure, { capture: true });
      window.removeEventListener('scroll', measure);
    };
  }, [containerId]);

  return (
    <div
      className={`fixed top-0 left-0 right-0 z-50 h-[2.5px] bg-transparent pointer-events-none ${className}`}
    >
      <div
        className="h-full transition-all duration-150 ease-out"
        style={{
          width: `${progress}%`,
          backgroundColor: 'var(--tenant-accent, hsl(var(--primary)))',
        }}
      />
    </div>
  );
}
