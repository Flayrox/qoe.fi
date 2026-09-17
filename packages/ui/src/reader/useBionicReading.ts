'use client';

import { useEffect } from 'react';
import { formatBionicHtml } from './bionic';

/**
 * Hook to apply Bionic Reading non-destructively to a DOM container.
 * Caches the original HTML and cleanly restores it upon deactivation.
 */
export function useBionicReading(containerSelector: string, isEnabled: boolean) {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const container = document.querySelector(containerSelector);
    if (!container) return;

    let original = container.getAttribute('data-original-html');
    if (!original) {
      original = container.innerHTML;
      container.setAttribute('data-original-html', original);
    }

    if (isEnabled) {
      container.innerHTML = formatBionicHtml(original);
    } else {
      if (container.innerHTML !== original) {
        container.innerHTML = original;
      }
    }
  }, [containerSelector, isEnabled]);
}
