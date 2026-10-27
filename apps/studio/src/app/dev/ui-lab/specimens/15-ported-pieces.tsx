'use client';

import { useState } from 'react';
import { ArrowUpRight, Download, Plus } from 'lucide-react';
import { AnnotationMark, type AnnotationVariant } from '@qoe/ui/annotation-mark';
import { BevelButton } from '@qoe/ui/bevel-button';
import { CopyButton } from '@qoe/ui/copy-button';
import { HoldToDeleteButton } from '@qoe/ui/hold-to-delete';
import { SaveButton } from '@qoe/ui/save-button';
import { DefectList, Variant } from '../specimen-frame';

const ANNOTATION_VARIANTS: { value: AnnotationVariant; label: string }[] = [
  { value: 'underline', label: 'souligné' },
  { value: 'wavy', label: 'vague' },
  { value: 'highlight', label: 'surligné' },
  { value: 'circle', label: 'cerclé' },
  { value: 'box', label: 'encadré' },
];

const SENTENCE = 'Un écrivain ne devrait publier que ce qu’il relirait deux fois.';

export function PortedPiecesSpecimen() {
  const [saved, setSaved] = useState(false);

  return (
    <div className="grid gap-10">
      <Variant
        label="Annotation — le trait qui dit « regarde ici »"
        kind="candidat"
        hint="Porté de la famille « annotated-text » d’opensourceui. Le caractère ne vient pas d’un dégradé mais d’un filtre SVG (turbulence + déplacement) : la ligne ondule comme un stylo. Le trait est `aria-hidden`, le texte reste seul annoncé."
      >
        <div className="grid gap-3">
          <p className="max-w-2xl text-[15px] leading-[1.9] text-foreground">
            {ANNOTATION_VARIANTS.map((item) => (
              <span key={item.value} className="mr-2">
                <AnnotationMark variant={item.value}>{item.label}</AnnotationMark>
              </span>
            ))}
            — et la phrase entière :
          </p>
          <p className="max-w-xl text-[15px] leading-[1.9] text-foreground">
            {SENTENCE.split(' ').map((word, index) => (
              <span key={`${word}-${index}`} className="mr-1.5">
                {index === 2 || index === 5 ? (
                  <AnnotationMark variant={index === 2 ? 'underline' : 'highlight'}>
                    {word}
                  </AnnotationMark>
                ) : (
                  word
                )}
              </span>
            ))}
          </p>
          <div className="flex flex-wrap items-center gap-4">
            {(['neutral', 'brand', 'vivid', 'danger', 'success'] as const).map((tone) => (
              <AnnotationMark key={tone} variant="wavy" tone={tone}>
                {tone}
              </AnnotationMark>
            ))}
          </div>
        </div>

        <DefectList
          items={[
            'Une marque ne se coupe pas en fin de ligne : on découpe en plusieurs marques, sinon le trait couvre le bloc',
            'Le filtre est unique par instance (`useId`) : deux marques ne partagent jamais le même déplacement',
            'Le trait ne porte aucune information : il est `aria-hidden`',
          ]}
        />
      </Variant>

      <Variant
        label="Bouton biseau — la touche qu’on sent"
        kind="candidat"
        hint="Porté de « three-d-button ». La recette d’ombres est reprise telle quelle (trois extérieures, deux intérieures, inversion au clic) ; les gris codés en dur sont remplacés par les tokens, sinon le bouton jure dès qu’on change de ton."
      >
        <div className="grid gap-4">
          <div className="flex flex-wrap items-center gap-2.5">
            <BevelButton>Publier</BevelButton>
            <BevelButton tone="brand">Marque</BevelButton>
            <BevelButton tone="vivid">
              <Plus className="size-3.5" strokeWidth={2} />
              Nouvel écrit
            </BevelButton>
            <BevelButton tone="danger">Supprimer</BevelButton>
            <BevelButton variant="soft">
              <Download className="size-3.5" strokeWidth={1.75} />
              Exporter
            </BevelButton>
            <BevelButton variant="soft" iconOnly aria-label="Ouvrir">
              <ArrowUpRight className="size-3.5" strokeWidth={1.75} />
            </BevelButton>
          </div>

          <div className="flex flex-wrap items-end gap-2.5">
            <BevelButton size="xs">xs</BevelButton>
            <BevelButton size="sm">sm</BevelButton>
            <BevelButton size="md">md</BevelButton>
            <BevelButton size="lg">lg</BevelButton>
            <BevelButton variant="soft" size="xs">
              soft xs
            </BevelButton>
            <BevelButton variant="soft" size="lg">
              soft lg
            </BevelButton>
          </div>
        </div>

        <DefectList
          items={[
            'La transition porte sur `box-shadow` et `transform`, jamais sur `all` — sinon le libellé anime aussi',
            'Biseau clair plafonné : en thème sombre, un liseré blanc trop fort éclaire le bouton de l’intérieur',
            '`active:translate-y-px` : le contrôle s’enfonce réellement, ce n’est pas qu’une ombre',
          ]}
        />
      </Variant>

      <Variant
        label="Maintien destructif et bascules — les gestes du quotidien"
        kind="candidat"
        hint="Trois pièces qui remplacent des dialogues ou des boutons muets : tenir pour supprimer, copier en se confirmant soi-même, enregistrer avec un état qui se voit."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2 rounded-lg border border-border/40 bg-muted/20 px-4 py-4">
            <p className="text-[10.5px] font-medium tracking-wider text-muted-foreground uppercase">
              Maintien
            </p>
            <HoldToDeleteButton
              label="Supprimer le brouillon"
              doneLabel="Brouillon supprimé"
              holdMs={1100}
            />
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Relâcher avant la fin annule. Espace ou Entrée maintenu : même compte à rebours, sans
              souris.
            </p>
          </div>

          <div className="grid content-start gap-3 rounded-lg border border-border/40 bg-muted/20 px-4 py-4">
            <p className="text-[10.5px] font-medium tracking-wider text-muted-foreground uppercase">
              Copier / enregistrer
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <CopyButton value="https://qoe.fi/mon-ecrit" />
              <SaveButton saved={saved} onSavedChange={setSaved} />
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {saved ? 'Enregistré — signet plein, libellé changé.' : 'Pas encore enregistré.'}
            </p>
          </div>
        </div>

        <DefectList
          items={[
            'Le maintien annonce son résultat dans une zone `aria-live` : sans elle, l’action serait muette',
            'Copier ne change pas de largeur : les deux libellés occupent la même cellule de grille',
            'Enregistrer expose `aria-pressed`, il reste contrôlable de l’extérieur',
          ]}
        />
      </Variant>
    </div>
  );
}
