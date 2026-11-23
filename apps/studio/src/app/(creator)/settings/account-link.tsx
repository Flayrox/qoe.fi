'use client';

import { buttonClasses } from '@qoe/ui/button';
import { URLS } from '@qoe/config';
import { t } from '@lingui/core/macro';

/**
 * Lien vers les paramètres du compte personnel.
 *
 * Il vit dans un composant client parce que `buttonClasses` est exporté par le
 * module client de `Button` : l'appeler depuis le composant serveur Settings
 * casse la frontière RSC. `Button asChild` ne convient pas non plus ici, car
 * l'ancre passée depuis le serveur arrive sous forme de tableau et
 * `Children.only` la refuse.
 *
 * L'origine vient de `URLS.CONSOLE` : un hôte écrit à la main envoyait le
 * studio de développement (ou toute instance auto-hébergée) vers `qoe.fi`.
 */
export function AccountLink() {
  return (
    <a
      href={`${URLS.CONSOLE}/settings`}
      className={buttonClasses({ variant: 'outline', size: 'sm' })}
    >
      {t`Gérer mon compte`}
    </a>
  );
}
