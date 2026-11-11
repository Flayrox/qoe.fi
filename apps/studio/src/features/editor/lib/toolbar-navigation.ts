/**
 * Calcule l'index à focuser dans une barre d'outils ARIA.
 *
 * La barre ne contient qu'un seul arrêt de tabulation : les flèches
 * parcourent les boutons, `Home`/`End` vont aux extrémités. On boucle aux
 * bornes pour ne jamais perdre le focus.
 */
export function nextToolbarIndex(current: number, count: number, key: string): number | null {
  if (count <= 0) return null;

  const index = current >= 0 && current < count ? current : 0;

  switch (key) {
    case 'ArrowRight':
    case 'ArrowDown':
      return (index + 1) % count;
    case 'ArrowLeft':
    case 'ArrowUp':
      return (index - 1 + count) % count;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}
