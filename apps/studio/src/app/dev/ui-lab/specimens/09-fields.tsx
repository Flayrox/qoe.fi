'use client';

import { AtSign, Search } from 'lucide-react';
import { FieldError } from '@qoe/ui/field-error';
import { Input, InputGroup } from '@qoe/ui/input';
import { DefectList, Variant } from '../specimen-frame';

/** Classes réelles des champs de réglages, avant migration. */
const LEGACY_INPUTS = [
  'px-3 py-2 bg-background border border-border/40 rounded-lg text-xs font-medium',
  'px-3.5 py-2.5 bg-muted/20 border border-border/40 rounded-lg text-xs font-medium',
  'px-3 py-1.5 bg-background border border-border/40 rounded text-xs font-medium',
];

export function FieldsSpecimen() {
  return (
    <div className="grid gap-10">
      <Variant
        label="Ce qui existe aujourd’hui"
        kind="actuel"
        hint="Trois champs des réglages. Trois hauteurs, trois rayons, trois paddings — pour la même fonction. Et l’erreur est un <p> sans lien avec le champ."
      >
        <div className="grid max-w-md gap-3">
          {LEGACY_INPUTS.map((className) => (
            <input
              key={className}
              type="text"
              placeholder="Nom du site web"
              className={className}
            />
          ))}
          <p className="text-[11px] text-destructive-text">Adresse invalide</p>
        </div>

        <DefectList
          items={[
            'Trois hauteurs : 32, 38 et 30 px pour le même rôle',
            'Le rayon varie (rounded-lg / rounded) et ne suit pas --radius-button',
            'L’erreur n’est reliée à aucun champ : aucun lecteur d’écran ne l’annonce',
            'L’état invalide n’existe pas : la bordure reste neutre',
          ]}
        />
      </Variant>

      <Variant
        label="Le champ — mêmes contrats que le bouton"
        kind="candidat"
        hint="Une seule densité, le même rayon, le même anneau de focus. L’erreur se déclare via `invalid` et se rattache par `aria-describedby`."
      >
        <div className="grid max-w-md gap-4">
          <div className="grid gap-1.5">
            <label htmlFor="lab-name" className="type-control-sm font-medium text-foreground">
              Nom du site web
            </label>
            <Input id="lab-name" placeholder="Ex. Carnet d’Éphémère" />
          </div>

          <div className="grid gap-1.5">
            <label htmlFor="lab-slug" className="type-control-sm font-medium text-foreground">
              Adresse
            </label>
            <Input
              id="lab-slug"
              defaultValue="carnet-ephemere"
              invalid
              aria-describedby="lab-slug-error"
            />
            <FieldError id="lab-slug-error">Cette adresse est déjà prise.</FieldError>
          </div>

          <div className="grid gap-1.5">
            <label htmlFor="lab-search" className="type-control-sm font-medium text-foreground">
              Recherche
            </label>
            <InputGroup left={<Search />} right={<kbd className="type-control-xs">⌘K</kbd>}>
              <Input id="lab-search" placeholder="Chercher un écrit…" />
            </InputGroup>
          </div>

          <div className="grid gap-1.5">
            <label htmlFor="lab-handle" className="type-control-sm font-medium text-foreground">
              Identifiant
            </label>
            <InputGroup left={<AtSign />} invalid>
              <Input id="lab-handle" defaultValue="ephe" />
            </InputGroup>
            <FieldError>Trois caractères minimum.</FieldError>
          </div>
        </div>

        <DefectList
          items={[
            'Le cadre et l’anneau de focus vivent sur le groupe : cliquer l’icône donne le focus au champ',
            '`size` veut dire la même chose ici que dans Button (la taille native du <input> est retirée)',
            'FieldError ne rend rien sans message : pas d’alerte vide annoncée',
            'Le champ dans un InputGroup perd sa bordure sans changer son appel',
          ]}
        />
      </Variant>

      <Variant
        label="Les quatre densités"
        kind="candidat"
        hint="Les mêmes 24 / 28 / 32 / 36 px que les boutons : un champ et un bouton sur la même ligne s’alignent sans réglage."
      >
        <div className="grid max-w-md gap-2">
          {(['xs', 'sm', 'md', 'lg'] as const).map((size) => (
            <div key={size} className="flex items-center gap-2">
              <span className="w-8 shrink-0 font-mono text-[10.5px] text-muted-foreground">
                {size}
              </span>
              <Input size={size} placeholder={`Densité ${size}`} aria-label={`Densité ${size}`} />
            </div>
          ))}
        </div>
      </Variant>
    </div>
  );
}
