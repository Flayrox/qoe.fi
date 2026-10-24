'use client';

import { useState } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  Link2,
  List,
  Underline,
} from 'lucide-react';
import { Accordion, AccordionItem } from '@qoe/ui/accordion';
import { Avatar, AvatarGroup } from '@qoe/ui/avatar';
import { Button } from '@qoe/ui/button';
import { ScrollShadow, Toolbar, ToolbarGroup, ToolbarSeparator } from '@qoe/ui/toolbar';
import { ToggleButton, ToggleGroup } from '@qoe/ui/toggle';
import { DefectList, Variant } from '../specimen-frame';

const PEOPLE = [
  { name: 'Éphémère Durand' },
  { name: 'Camille Petit', src: 'https://i.pravatar.cc/80?img=12' },
  { name: 'Noé Lambert' },
  { name: 'Inès Moreau' },
  { name: 'Awa Traoré' },
  { name: 'Sam Rivière' },
];

export function CompositionSpecimen() {
  const [alignment, setAlignment] = useState<Set<string>>(new Set(['left']));

  return (
    <div className="grid gap-10">
      <Variant
        label="Avatar — trois états, pas un"
        kind="candidat"
        hint="Image chargée, image cassée, pas d’image. Le repli n’est pas un carré gris : ce sont les initiales, sur une teinte dérivée du nom — la même personne garde la même couleur."
      >
        <div className="flex flex-wrap items-end gap-4">
          <Avatar name="Éphémère Durand" size="xs" />
          <Avatar name="Éphémère Durand" size="sm" />
          <Avatar name="Éphémère Durand" />
          <Avatar name="Camille Petit" src="https://i.pravatar.cc/80?img=12" size="lg" />
          <Avatar name="Lien cassé" src="https://exemple.invalid/avatar.png" size="lg" />
          <Avatar name="Éphémère Durand" size="xl" />
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-6">
          <AvatarGroup people={PEOPLE} max={4} />
          <AvatarGroup people={PEOPLE} max={2} size="sm" />
        </div>

        <DefectList
          items={[
            'Rayon rond : une personne n’est pas un carré arrondi',
            'Le compteur « +N » est doublé d’un texte lu par les lecteurs d’écran',
            'Une URL morte bascule sur les initiales, sans boucle de rechargement',
          ]}
        />
      </Variant>

      <Variant
        label="Accordéon — un titre, un panneau, un trait"
        kind="candidat"
        hint="Le titre est un vrai titre (h3) : on peut naviguer de section en section au lecteur d’écran. Le chevron suit aria-expanded, pas une classe calculée à côté."
      >
        <div className="max-w-xl">
          <Accordion defaultExpandedKeys={['1']}>
            <AccordionItem id="1" title="Comment fonctionne la publication ?">
              Un écrit se rédige, se relit, puis se publie. Les brouillons restent privés jusqu’à la
              publication, et l’adresse courte est réservée dès la création.
            </AccordionItem>
            <AccordionItem id="2" title="Qui peut modifier un article ?">
              L’auteur principal, les co-auteurs invités et les éditeurs du média — chacun selon ses
              capacités.
            </AccordionItem>
            <AccordionItem id="3" title="Que se passe-t-il à la suppression ?">
              L’écrit quitte le site public, mais les statistiques agrégées sont conservées.
            </AccordionItem>
          </Accordion>
        </div>

        <DefectList
          items={[
            'Ouverture multiple possible (allowsMultipleExpanded), une seule par défaut',
            'Le panneau n’est pas rendu quand il est fermé : rien à cacher en CSS',
            'Le trait de séparation appartient à l’item, donc le dernier n’en a pas',
          ]}
        />
      </Variant>

      <Variant
        label="Boutons d’état et barre d’outils"
        kind="candidat"
        hint="Un bouton enfoncé n’est pas un bouton coloré : c’est `aria-pressed`. Et une barre d’outils est une seule tabulation, les flèches font le reste."
      >
        <div className="flex flex-wrap items-center gap-6">
          <ToggleGroup
            aria-label="Alignement du texte"
            selectionMode="single"
            selectedKeys={alignment}
            onSelectionChange={(keys) => setAlignment(keys as Set<string>)}
          >
            <ToggleButton id="left" aria-label="Aligner à gauche">
              <AlignLeft />
            </ToggleButton>
            <ToggleButton id="center" aria-label="Centrer">
              <AlignCenter />
            </ToggleButton>
            <ToggleButton id="right" aria-label="Aligner à droite">
              <AlignRight />
            </ToggleButton>
          </ToggleGroup>

          <ToggleButton defaultSelected>Gras</ToggleButton>
          <ToggleButton size="md" tone="brand">
            Premium
          </ToggleButton>
        </div>

        <div className="mt-6 max-w-2xl">
          <Toolbar aria-label="Mise en forme">
            <ToolbarGroup>
              <Button variant="ghost" size="sm" shape="icon" aria-label="Gras">
                <Bold />
              </Button>
              <Button variant="ghost" size="sm" shape="icon" aria-label="Italique">
                <Italic />
              </Button>
              <Button variant="ghost" size="sm" shape="icon" aria-label="Souligné">
                <Underline />
              </Button>
            </ToolbarGroup>
            <ToolbarSeparator />
            <ToolbarGroup>
              <Button variant="ghost" size="sm" shape="icon" aria-label="Liste">
                <List />
              </Button>
              <Button variant="ghost" size="sm" shape="icon" aria-label="Lien">
                <Link2 />
              </Button>
            </ToolbarGroup>
          </Toolbar>
        </div>

        <DefectList
          items={[
            '`role="toolbar"` : tabulation sur la barre, puis flèches entre les boutons',
            'Le séparateur porte `role="separator"` et son orientation',
            'Un bouton d’état annonce « enfoncé », ce qu’un fond coloré ne dit jamais',
          ]}
        />
      </Variant>

      <Variant
        label="Défilement avec bords"
        kind="candidat"
        hint="Le fondu n’apparaît que du côté qui cache encore du contenu, et disparaît en butée. La liste débordante dit qu’elle continue."
      >
        <div className="max-w-sm rounded-panel border border-border bg-card p-3">
          <ScrollShadow maxHeight="11rem">
            <ul className="space-y-2">
              {Array.from({ length: 14 }, (_, index) => (
                <li key={index} className="type-control-sm text-foreground">
                  Écrit #{index + 1} — {index % 3 === 0 ? 'brouillon' : 'publié'}
                </li>
              ))}
            </ul>
          </ScrollShadow>
        </div>

        <DefectList
          items={[
            'Mesure au défilement et au redimensionnement (ResizeObserver)',
            'Les fondus ne prennent pas de place : le contenu ne saute pas',
            'Décoration pure : `aria-hidden`, aucun focus dedans',
          ]}
        />
      </Variant>
    </div>
  );
}
