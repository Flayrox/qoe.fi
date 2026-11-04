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
import { Badge } from '@qoe/ui/badge';
import { Button } from '@qoe/ui/button';
import { SafeAvatar } from '@qoe/ui';
import { ProfileHoverCard } from '@qoe/ui/social/ProfileHoverCard';
import { ScrollShadow, Toolbar, ToolbarGroup, ToolbarSeparator } from '@qoe/ui/toolbar';
import { ToggleButton, ToggleGroup } from '@qoe/ui/toggle';
import { DefectList, Variant } from '../specimen-frame';

type LabIdentity = {
  id: string;
  name: string;
  username: string;
  logoUrl: string | null;
  type: 'PERSONAL' | 'MEDIA';
};

/** Les assets existent déjà dans le repo : aucune URL distante, donc aucune
 *  capture qui dépend d'un service tiers. */
const PEOPLE: LabIdentity[] = [
  {
    id: 'person-ephemere',
    name: 'Éphémère Durand',
    username: 'ephemere',
    logoUrl: '/avatars/avatar-1.svg',
    type: 'PERSONAL',
  },
  {
    id: 'media-camille',
    name: 'Camille',
    username: 'camille',
    logoUrl: '/avatars/media-camille.svg',
    type: 'MEDIA',
  },
  {
    id: 'media-gazette',
    name: 'La Gazette Locale',
    username: 'gazette',
    logoUrl: null,
    type: 'MEDIA',
  },
  {
    id: 'person-noe',
    name: 'Noé Lambert',
    username: 'noe',
    logoUrl: '/avatars/avatar-2.svg',
    type: 'PERSONAL',
  },
  {
    id: 'person-ines',
    name: 'Inès Moreau',
    username: 'ines',
    logoUrl: '/avatars/avatar-3.svg',
    type: 'PERSONAL',
  },
  {
    id: 'person-awa',
    name: 'Awa Traoré',
    username: 'awa',
    logoUrl: '/avatars/introuvable.svg',
    type: 'PERSONAL',
  },
  {
    id: 'person-sam',
    name: 'Sam Rivière',
    username: 'sam',
    logoUrl: null,
    type: 'PERSONAL',
  },
];

function Identity({
  person,
  size = 40,
  showName = false,
}: {
  person: LabIdentity;
  size?: number;
  showName?: boolean;
}) {
  return (
    <ProfileHoverCard
      user={person}
      username={person.username}
      className="flex flex-col items-center gap-1.5"
    >
      <SafeAvatar
        id={person.id}
        src={person.logoUrl}
        name={person.name}
        username={person.username}
        type={person.type}
        size={size}
      />
      {showName && (
        <span className="max-w-[7.5rem] truncate type-control-xs text-muted-foreground">
          {person.name}
        </span>
      )}
    </ProfileHoverCard>
  );
}

function AvatarStack({
  people,
  max = 4,
  size = 28,
}: {
  people: LabIdentity[];
  max?: number;
  size?: number;
}) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <div className="flex items-center -space-x-2" role="group" aria-label="Auteurs">
      {shown.map((person) => (
        <SafeAvatar
          key={person.id}
          id={person.id}
          src={person.logoUrl}
          name={person.name}
          username={person.username}
          type={person.type}
          size={size}
          className="ring-2 ring-card"
        />
      ))}
      {extra > 0 && (
        <span
          className="inline-flex shrink-0 items-center justify-center rounded-full bg-muted type-control-xs font-semibold text-muted-foreground ring-2 ring-card"
          style={{ width: size, height: size }}
          aria-label={`${extra} autres auteurs`}
        >
          +{extra}
        </span>
      )}
    </div>
  );
}

export function CompositionSpecimen() {
  const [alignment, setAlignment] = useState<Set<string>>(new Set(['left']));

  return (
    <div className="grid gap-10">
      <Variant
        label="Avatar — une personne est ronde, un média est carré"
        kind="candidat"
        hint="SafeAvatar porte la règle, pas chaque appelant : cercle pour une personne, carré à petits coins arrondis pour un compte média. Le repli est la silhouette (personne) ou l’emblème (média) sur une teinte dérivée du handle — la même identité garde la même couleur, même quand l’URL casse."
      >
        <div className="flex flex-wrap items-end gap-4">
          <Identity person={PEOPLE[0]} size={20} />
          <Identity person={PEOPLE[0]} size={28} />
          <Identity person={PEOPLE[0]} size={40} showName />
          <Identity person={PEOPLE[1]} size={40} showName />
          <Identity person={PEOPLE[2]} size={48} showName />
          <Identity person={PEOPLE[5]} size={48} showName />
          <Identity person={PEOPLE[6]} size={48} showName />
          <Identity person={PEOPLE[1]} size={80} showName />
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-6">
          <AvatarStack people={PEOPLE} max={4} />
          <AvatarStack people={PEOPLE} max={2} size={24} />
        </div>

        <DefectList
          items={[
            'La forme est une donnée : `data-avatar-shape` et `data-avatar-entity` la rendent lisible sans inspecter les classes',
            'Un média reste carré à toutes les tailles — le rayon ne suit pas la taille',
            'Un média sans image (ex. La Gazette) déploie l’emblème vectoriel de publication dans son carré déterministe',
            'Le compteur « +N » est doublé d’un texte lu par les lecteurs d’écran',
            'Une URL morte bascule sur le repli, sans boucle de rechargement',
          ]}
        />
      </Variant>

      <Variant
        label="Barre supérieure — l’identité tient la droite"
        kind="candidat"
        hint="Une barre réelle : la personne connectée (ronde) et le média actif (carré) restent deux natures distinctes, et chaque identité ouvre sa fiche au survol — pas un menu qui cache le profil derrière un clic."
      >
        <div
          data-specimen-top-bar
          className="flex h-14 items-center justify-between gap-3 rounded-panel border border-border/60 bg-background px-4"
        >
          <span className="text-sm font-semibold tracking-tight">qoe.fi</span>
          <div className="flex items-center gap-2">
            <ProfileHoverCard user={PEOPLE[0]} username={PEOPLE[0].username}>
              <span className="flex items-center gap-2 rounded-full border border-border/50 bg-card py-1 pr-3 pl-1">
                <SafeAvatar
                  id={PEOPLE[0].id}
                  src={PEOPLE[0].logoUrl}
                  name={PEOPLE[0].name}
                  username={PEOPLE[0].username}
                  type={PEOPLE[0].type}
                  size={24}
                />
                <span className="type-control-xs font-medium">{PEOPLE[0].name}</span>
              </span>
            </ProfileHoverCard>

            <ProfileHoverCard user={PEOPLE[1]} username={PEOPLE[1].username}>
              <SafeAvatar
                id={PEOPLE[1].id}
                src={PEOPLE[1].logoUrl}
                name={PEOPLE[1].name}
                username={PEOPLE[1].username}
                type={PEOPLE[1].type}
                size={28}
                className="border border-border/40"
              />
            </ProfileHoverCard>
          </div>
        </div>

        <DefectList
          items={[
            'Deux identités, deux formes : la personne reste ronde, le média reste carré',
            'Le survol de la barre montre la fiche complète du compte, sans quitter la page',
            'Les images viennent des assets du repo : aucune dépendance à un avatar distant',
          ]}
        />
      </Variant>

      <Variant
        label="Badge — états, natures et compteurs (@qoe/ui/badge)"
        kind="candidat"
        hint="Même matrice Tone que Button (neutral, brand, vivid, success, danger), en soft, outline ou solid. Un Badge informe ; dès qu’on clique dessus pour filtrer, on passe sur TagGroup."
      >
        <div className="grid gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="neutral">Brouillon</Badge>
            <Badge tone="brand" dot>
              En revue
            </Badge>
            <Badge tone="success" dot>
              Publié
            </Badge>
            <Badge tone="vivid" variant="outline">
              Payant
            </Badge>
            <Badge tone="danger" variant="soft">
              Signalé
            </Badge>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" tone="neutral" shape="pill" size="sm">
              Urbanisme
            </Badge>
            <Badge variant="outline" tone="brand" shape="pill" size="sm" dot>
              Enquête · 12 min
            </Badge>
            <Badge variant="solid" tone="neutral" size="xs">
              v2.4
            </Badge>
            <Badge variant="solid" tone="brand" shape="pill" size="xs">
              +12
            </Badge>
          </div>
        </div>
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
