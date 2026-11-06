'use client';

import { buttonClasses } from '@qoe/ui/button';

/**
 * Lien vers les paramètres du compte personnel.
 *
 * Il vit dans un composant client parce que `buttonClasses` est exporté par le
 * module client de `Button` : l'appeler depuis le composant serveur Settings
 * casse la frontière RSC. `Button asChild` ne convient pas non plus ici, car
 * l'ancre passée depuis le serveur arrive sous forme de tableau et
 * `Children.only` la refuse.
 */
export function AccountLink() {
  return (
    <a href="https://qoe.fi/settings" className={buttonClasses({ variant: 'outline', size: 'sm' })}>
      Gérer mon compte
    </a>
  );
}
