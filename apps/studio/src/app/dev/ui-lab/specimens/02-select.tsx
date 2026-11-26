'use client';

import { useState } from 'react';
import { Select } from '@qoe/ui/select';
import { Variant } from '../specimen-frame';

const ROLE_GROUPS = [
  {
    label: 'Équipe éditoriale',
    options: [
      { id: 'editor', label: 'Éditeur' },
      { id: 'writer', label: 'Auteur·rice' },
      { id: 'admin', label: 'Administrateur·rice' },
    ],
  },
  {
    label: 'Audience',
    options: [{ id: 'reader', label: 'Lecteur·rice' }],
  },
];

const VISIBILITY_OPTIONS = [
  { id: 'public', label: 'Public' },
  { id: 'unlisted', label: 'Non répertorié' },
  { id: 'private', label: 'Privé' },
];

export function SelectSpecimen() {
  const [role, setRole] = useState<string>('editor');
  const [visibility, setVisibility] = useState<string>('public');

  return (
    <div className="grid gap-10">
      <Variant
        label="Primitive @qoe/ui/select (react-aria)"
        kind="actuel"
        hint="Rendu réel de @qoe/ui/select utilisé partout dans les apps : accessible, avec groupes ARIA et tailles homogènes."
      >
        <div className="flex flex-wrap items-start gap-6">
          <div className="w-52">
            <Select
              label="Rôle"
              options={[]}
              groups={ROLE_GROUPS}
              value={role}
              onValueChange={setRole}
              placeholder="Choisir un rôle"
            />
          </div>

          <div className="w-44">
            <Select
              label="Visibilité (compact)"
              size="sm"
              options={VISIBILITY_OPTIONS}
              value={visibility}
              onValueChange={setVisibility}
            />
          </div>

          <div className="w-44">
            <Select label="Désactivé" disabled options={VISIBILITY_OPTIONS} value="private" />
          </div>
        </div>
      </Variant>
    </div>
  );
}
