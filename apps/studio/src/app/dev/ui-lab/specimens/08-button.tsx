'use client';

import Link from 'next/link';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@qoe/ui/button';
import { ButtonGroup } from '@qoe/ui/button-group';
import { DefectList, Variant } from '../specimen-frame';

/**
 * Six boutons réels, copiés tels quels depuis `apps/studio/src/features`.
 * Ils prétendent tous faire la même chose : une action discrète ou
 * destructrice. Leurs hauteurs vont de 24 à 40 px, sans que personne ne
 * l'ait décidé — c'est ce que le contrat supprime.
 */
const LEGACY_BUTTONS = [
  'p-1.5 text-destructive-text hover:bg-destructive/10 rounded-lg transition-colors cursor-pointer',
  'p-1.5 text-destructive-text hover:bg-destructive/10 rounded-lg transition-colors cursor-pointer shrink-0 ml-auto',
  'shrink-0 rounded-lg border border-destructive/30 px-2.5 py-1 font-semibold hover:bg-destructive/10 transition-colors cursor-pointer',
  'px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground rounded-lg transition-colors cursor-pointer',
  'p-2 text-muted-foreground hover:text-destructive-text hover:bg-destructive/10 rounded-lg transition-colors cursor-pointer shrink-0',
  'inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50',
];

export function ButtonSpecimen() {
  return (
    <div className="grid gap-10">
      <Variant
        label="Ce qui existe aujourd’hui"
        kind="actuel"
        hint="Six boutons copiés depuis les écrans du Studio. Tous des <button> bruts, tous arrondis différemment en pratique, avec des hauteurs de 24 à 40 px selon le padding et la taille de texte choisis localement."
      >
        <div className="flex flex-wrap items-center gap-2">
          {LEGACY_BUTTONS.map((className) => (
            <button key={className} type="button" className={className}>
              Actions
            </button>
          ))}
        </div>

        <DefectList
          items={[
            'Aucune de ces six variantes ne partage sa hauteur : 24, 26, 28, 30, 32, 40 px',
            'Le focus clavier n’est pas visible sur la majorité (pas de ring)',
            'type="button" est absent : dans un formulaire, ce sont des submits',
            'Changer le rayon demande de modifier 142 fichiers',
          ]}
        />
      </Variant>

      <Variant
        label="Deux oranges, deux rouges, deux verts"
        kind="candidat"
        hint="`brand` (vermillon) est la maison ; `vivid` est le même orange poussé d’un cran, pour une action qu’on veut voir. `danger` et `success` sont fluorescents : le fond monte en luminance, donc c’est le texte qui s’inverse (5,4:1 sur le rouge, 11,8:1 sur le vert). En texte seul — une étiquette, un compteur — on passe par `--destructive-text` et `--success-text`, qui restent à 5,8:1 et 5,4:1 sur blanc."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex items-center gap-3">
            <Button variant="solid" tone="brand">
              Marque
            </Button>
            <span className="font-mono text-[10.5px] text-muted-foreground">--primary</span>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="solid" tone="vivid">
              Vif
            </Button>
            <span className="font-mono text-[10.5px] text-muted-foreground">--brand-vivid</span>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="solid" tone="danger">
              Danger
            </Button>
            <span className="font-mono text-[10.5px] text-muted-foreground">--destructive</span>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="solid" tone="success">
              Succès
            </Button>
            <span className="font-mono text-[10.5px] text-muted-foreground">--success</span>
          </div>
        </div>
      </Variant>

      <Variant
        label="La primitive — variantes et tons"
        kind="candidat"
        hint="Une seule implémentation. La hauteur vient de --control-h-*, le rayon de --radius-button, chaque couleur d’un token sémantique. Aucune valeur en dur."
      >
        <div className="grid gap-4">
          {(['solid', 'soft', 'outline', 'ghost'] as const).map((variant) => (
            <div key={variant} className="flex flex-wrap items-center gap-2">
              <span className="w-16 shrink-0 font-mono text-[10.5px] text-muted-foreground">
                {variant}
              </span>
              {(['neutral', 'brand', 'vivid', 'danger', 'success'] as const).map((tone) => (
                <Button key={tone} variant={variant} tone={tone}>
                  {tone}
                </Button>
              ))}
              <Button variant={variant} tone="neutral" disabled>
                désactivé
              </Button>
            </div>
          ))}
        </div>

        <DefectList
          items={[
            '`type="button"` par défaut : plus de submit accidentel',
            'Anneau de focus identique sur les 20 combinaisons, visible au clavier seulement',
            '`vivid` : le second orange de la marque, texte presque noir dessus (7,6:1)',
            'L’état désactivé est identique partout (opacité 50 %, aucun événement)',
          ]}
        />
      </Variant>

      <Variant
        label="La densité est une échelle, pas un choix local"
        kind="candidat"
        hint="Quatre pas seulement : 24, 28, 32 et 36 px, lus depuis --control-h-*. Changer une valeur du thème change les quatre — et tous les composants qui les utilisent."
      >
        <div className="flex flex-wrap items-end gap-3">
          {(['xs', 'sm', 'md', 'lg'] as const).map((size) => (
            <div key={size} className="grid gap-1.5">
              <Button size={size} variant="outline">
                Taille {size}
              </Button>
              <span className="text-center font-mono text-[10px] text-muted-foreground">
                {size === 'xs' ? '24' : size === 'sm' ? '28' : size === 'md' ? '32' : '36'} px
              </span>
            </div>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <Button variant="solid" tone="brand">
            <Plus /> Nouveau
          </Button>
          <Button variant="outline" tone="danger">
            <Trash2 /> Supprimer
          </Button>
          <Button variant="ghost" disabled>
            Indisponible
          </Button>
        </div>

        <div className="mt-4 max-w-md">
          <Button block variant="solid">
            Action pleine largeur
          </Button>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-4">
          <ButtonGroup attached aria-label="Alignement du texte">
            <Button variant="outline" size="sm">
              Gauche
            </Button>
            <Button variant="outline" size="sm">
              Centre
            </Button>
            <Button variant="outline" size="sm">
              Droite
            </Button>
          </ButtonGroup>

          <ButtonGroup aria-label="Actions de la carte">
            <Button size="sm" variant="soft">
              Annuler
            </Button>
            <Button size="sm" variant="solid" tone="brand">
              Enregistrer
            </Button>
          </ButtonGroup>
        </div>

        <DefectList
          items={[
            'Les icônes suivent la densité : <Button><Plus />Texte</Button> sans prop `icon`',
            'ButtonGroup colle les rayons et fusionne les bordures en `attached`',
            'className reste fusionné : la disposition (ml-auto, w-full) est permise, l’identité non',
          ]}
        />
      </Variant>

      <Variant
        label="États — en cours, désactivé, lien"
        kind="candidat"
        hint="`loading` n’est pas une décoration : le bouton devient non activable, annonce `aria-busy` et remplace son icône de tête par un spinner, sans changer sa largeur. `asChild` donne la même peau à un `next/link` — plus de faux bouton qui perd la navigation client."
      >
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="solid" tone="brand" loading>
            Enregistrement…
          </Button>
          <Button variant="outline" loading>
            Chargement
          </Button>
          <Button asChild variant="solid" tone="neutral">
            <Link href="/dev/ui-lab">Ouvrir le lab</Link>
          </Button>
        </div>

        <DefectList
          items={[
            'Le libellé reste en place : la largeur ne saute pas au clic',
            '`loading` désactive réellement le bouton, pas seulement le spinner',
            '`asChild` clone l’enfant et lui applique buttonClasses, sans `type` invalide sur un lien',
          ]}
        />
      </Variant>
    </div>
  );
}
