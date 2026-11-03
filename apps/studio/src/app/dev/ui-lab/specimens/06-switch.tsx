'use client';

import { useState } from 'react';
import { cn } from '@qoe/utils';
import { Switch } from '@qoe/ui/switch';
import { DefectList, Variant } from '../specimen-frame';

export function SwitchSpecimen() {
  const [actual, setActual] = useState(true);
  const [candidate, setCandidate] = useState(true);
  const [compact, setCompact] = useState(false);

  return (
    <div className="grid gap-10">
      <Variant
        label="Interrupteur actuel (Pattern legacy)"
        kind="actuel"
        hint="Pattern historique des réglages : bouton + span translate-x, bg-primary quand actif, pouce bg-white en dur sans sémantique ni accessibilité."
      >
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-foreground">
              Recommandations dans la barre latérale
            </p>
            <p className="text-[11.5px] text-muted-foreground">
              Affiche des suggestions de lecture à côté de vos articles.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setActual((v) => !v)}
            className={cn(
              'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none',
              actual ? 'bg-primary' : 'bg-muted'
            )}
          >
            <span
              className={cn(
                'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out',
                actual ? 'translate-x-4' : 'translate-x-0'
              )}
            />
          </button>
        </div>
        <DefectList
          items={[
            'Pas de role="switch" ni d’aria-checked : un lecteur d’écran annonce un simple bouton',
            'Le pouce est en bg-white en dur → il reste blanc sur les thèmes où primary est clair',
            'Aucun focus-visible : la tabulation ne laisse aucune trace',
            'État désactivé non prévu (ni style, ni pointer-events)',
          ]}
        />
      </Variant>

      <Variant
        label="Composant Switch de production (@qoe/ui/switch)"
        kind="candidat"
        hint="Bâti sur react-aria-components. Clavier complet (Espace/Entrée), focus-visible ring, hauteurs normalisées sm/md, tokens sémantiques et gestion fluide des labels/descriptions."
      >
        <div className="grid max-w-md gap-6">
          <Switch
            isSelected={candidate}
            onChange={setCandidate}
            label="Recommandations dans la barre latérale"
            description="Affiche des suggestions de lecture à côté de vos articles."
          />
          <Switch
            size="sm"
            isSelected={compact}
            onChange={setCompact}
            label="Mode compact (Taille sm)"
            description="Réduit la hauteur de l’interrupteur pour les barres d’outils denses."
          />
          <Switch
            isDisabled
            isSelected={false}
            label="Notifications par e-mail (Désactivé)"
            description="La publication n’a pas encore d’adresse d’expédition vérifiée."
          />
        </div>
      </Variant>
    </div>
  );
}
