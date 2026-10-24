'use client';

import { useState } from 'react';
import { cn } from '@qoe/utils';
import { DefectList, Variant } from '../specimen-frame';

export function SwitchSpecimen() {
  const [actual, setActual] = useState(true);
  const [candidate, setCandidate] = useState(true);
  const [disabled] = useState(false);

  return (
    <div className="grid gap-10">
      <Variant
        label="Interrupteur actuel"
        kind="actuel"
        hint="Pattern réel des réglages du Studio : bouton + span translate-x, bg-primary quand actif, pouce bg-white en dur."
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
        label="Candidat accessible"
        kind="candidat"
        hint="role=switch, aria-checked, focus-visible, pouce en bg-background et anneau d’état. Le libellé est associé au contrôle par aria-labelledby."
      >
        <div className="grid max-w-md gap-5">
          <SwitchRow
            id="candidate-switch"
            label="Recommandations dans la barre latérale"
            description="Affiche des suggestions de lecture à côté de vos articles."
            checked={candidate}
            onChange={setCandidate}
          />
          <SwitchRow
            id="candidate-switch-disabled"
            label="Notifications par e-mail"
            description="Désactivé : la publication n’a pas d’adresse d’expédition vérifiée."
            checked={disabled}
            onChange={() => {}}
            disabled
          />
        </div>
      </Variant>
    </div>
  );
}

function SwitchRow({
  id,
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-6', disabled && 'opacity-50')}>
      <div className="min-w-0">
        <p id={`${id}-label`} className="text-[13px] font-medium text-foreground">
          {label}
        </p>
        <p id={`${id}-description`} className="text-[11.5px] leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        id={id}
        aria-checked={checked}
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-description`}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-transparent transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-not-allowed',
          checked ? 'bg-foreground' : 'bg-muted-foreground/30'
        )}
      >
        <span
          className={cn(
            'pointer-events-none block size-4 rounded-full bg-background shadow-xs transition-transform duration-200 ease-out',
            checked ? 'translate-x-4' : 'translate-x-0.5'
          )}
        />
      </button>
    </div>
  );
}
