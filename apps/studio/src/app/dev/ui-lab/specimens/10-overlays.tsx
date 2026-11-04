'use client';

import { useState } from 'react';
import { Archive, Bookmark, Copy, Pencil, Share2, Trash2 } from 'lucide-react';
import { Button } from '@qoe/ui/button';
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@qoe/ui/dialog';
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@qoe/ui/drawer';
import { Dropdown } from '@qoe/ui/dropdown';
import { Input, Textarea } from '@qoe/ui/input';
import { Select } from '@qoe/ui/select';
import { toast } from '@qoe/ui/toast';
import { Tooltip } from '@qoe/ui/tooltip';
import { DefectList, Variant } from '../specimen-frame';

/** Menu fait main, tel qu'il existe dans une dizaine d'écrans. */
function LegacyMenu() {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-lg border border-border/40 px-3 py-2 text-xs font-medium"
      >
        Actions
      </button>
      {open && (
        <div className="absolute left-0 top-full z-10 mt-1 min-w-44 rounded-lg border border-border/40 bg-popover p-1 shadow-lg">
          <button
            type="button"
            className="block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
            onClick={() => setOpen(false)}
          >
            Modifier
          </button>
          <button
            type="button"
            className="block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
            onClick={() => setOpen(false)}
          >
            Dupliquer
          </button>
        </div>
      )}
    </div>
  );
}

export function OverlaysSpecimen() {
  return (
    <div className="grid gap-10">
      <Variant
        label="Ce qui existe aujourd’hui"
        kind="actuel"
        hint="Un menu maison : pas de rôle ARIA, pas de flèches, pas d’Échap, pas de retour du focus. Ouvert par un booléen, refermé seulement en cliquant un item."
      >
        <LegacyMenu />

        <DefectList
          items={[
            'Aucun `role="menu"` : le lecteur d’écran annonce des boutons en vrac',
            'Les flèches, Échap et le clic extérieur ne sont pas gérés',
            'Le focus reste dans la page derrière le menu ouvert',
            'Chaque écran réimplémente son propre `useState(isOpen)` (18 fichiers)',
          ]}
        />
      </Variant>

      <Variant
        label="Dropdown & Tooltip — menus d’actions et contrôles muets"
        kind="candidat"
        hint="react-aria fournit l’ouverture, les flèches, Échap et le retour du focus. Pour les boutons icône seule, Tooltip remplace l’attribut natif `title` (lent et invisible au clavier) sans ajouter de nœud DOM."
      >
        <div className="flex flex-wrap items-center gap-3">
          <Dropdown
            label="Actions"
            ariaLabel="Actions sur l’article"
            items={[
              {
                id: 'edit',
                label: 'Modifier',
                icon: <Pencil />,
                shortcut: 'E',
                onAction: () => {},
              },
              { id: 'duplicate', label: 'Dupliquer', icon: <Copy />, onAction: () => {} },
              { id: 'archive', label: 'Archiver', disabled: true, onAction: () => {} },
              {
                id: 'delete',
                label: 'Supprimer',
                icon: <Trash2 />,
                tone: 'danger',
                onAction: () => {},
              },
            ]}
          />

          <Dropdown
            label="Trier"
            ariaLabel="Trier la liste"
            variant="ghost"
            items={[
              { id: 'recent', label: 'Plus récents', onAction: () => {} },
              { id: 'popular', label: 'Plus lus', onAction: () => {} },
            ]}
          />

          <div className="ml-2 flex items-center gap-1 border-l border-border/50 pl-3">
            <Tooltip content="Mettre en signet (S)">
              <Button variant="ghost" size="sm" shape="icon" aria-label="Mettre en signet">
                <Bookmark />
              </Button>
            </Tooltip>
            <Tooltip content="Copier le lien canonique">
              <Button variant="ghost" size="sm" shape="icon" aria-label="Partager">
                <Share2 />
              </Button>
            </Tooltip>
            <Tooltip content="Archiver le brouillon">
              <Button variant="ghost" size="sm" shape="icon" aria-label="Archiver">
                <Archive />
              </Button>
            </Tooltip>
          </div>
        </div>

        <DefectList
          items={[
            'Le menu est nommé par son déclencheur (`aria-labelledby`) : pas de nom inventé à côté',
            'Tooltip s’ouvre au survol COMME au focus clavier et relie l’icône par `aria-describedby`',
            'Les items désactivés restent lisibles mais non activables (`aria-disabled`)',
          ]}
        />
      </Variant>

      <Variant
        label="Select — la liste du contrat"
        kind="candidat"
        hint="Même peau que les champs, options descriptibles, groupes pour les catégories, et un `<select>` natif masqué à l’intérieur : le formulaire continue de recevoir un `name`."
      >
        <div className="grid max-w-sm gap-4">
          <Select
            label="Langue de l’interface"
            value="fr"
            onValueChange={() => {}}
            options={[
              { id: 'fr', label: 'Français', description: 'France, Belgique, Suisse' },
              { id: 'en', label: 'English' },
              { id: 'de', label: 'Deutsch', disabled: true },
            ]}
          />

          <Select
            label="Rubrique"
            placeholder="Choisir une rubrique…"
            onValueChange={() => {}}
            options={[{ id: 'all', label: 'Toutes les rubriques' }]}
            groups={[
              {
                label: 'Technologie',
                options: [
                  { id: 'tech-ai', label: 'Intelligence artificielle' },
                  { id: 'tech-web', label: 'Web' },
                ],
              },
              {
                label: 'Société',
                options: [{ id: 'soc-ville', label: 'Ville' }],
              },
            ]}
          />

          <Select
            label="Adresse (invalide)"
            invalid
            defaultValue="prise"
            onValueChange={() => {}}
            options={[{ id: 'prise', label: 'carnet-ephemere' }]}
          />
        </div>
      </Variant>

      <Variant
        label="Dialog & AlertDialog — modale centrée (@qoe/ui/dialog)"
        kind="candidat"
        hint="Symétrique à Drawer : voile sémantique (bg-foreground/25, zéro noir en dur), piège du focus et restitution au déclencheur. En `role='alertdialog'`, le clic extérieur est bloqué pour exiger un choix explicite."
      >
        <div className="flex flex-wrap items-center gap-3">
          <Dialog size="md">
            <DialogTrigger>Inviter un co-auteur</DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Inviter un co-auteur</DialogTitle>
                <DialogDescription>
                  La personne recevra une demande de signature et pourra relire le brouillon avant
                  publication.
                </DialogDescription>
              </DialogHeader>
              <DialogBody className="grid gap-3 py-1">
                <Input
                  aria-label="Adresse ou handle"
                  placeholder="@camille ou adresse@domaine.fr"
                />
                <Textarea
                  aria-label="Note d’accompagnement"
                  rows={2}
                  placeholder="Un mot sur l’angle ou l’échéance (optionnel)…"
                />
              </DialogBody>
              <DialogFooter>
                <DialogClose>Annuler</DialogClose>
                <DialogClose
                  variant="solid"
                  tone="brand"
                  onClick={() => toast.success('Invitation envoyée')}
                >
                  Envoyer l’invitation
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog size="sm">
            <DialogTrigger variant="soft" tone="danger">
              Dépublier l’article…
            </DialogTrigger>
            <DialogContent role="alertdialog" showCloseButton={false}>
              <DialogHeader className="pr-0">
                <DialogTitle>Dépublier cet article ?</DialogTitle>
                <DialogDescription>
                  Les liens existants afficheront une notice d’indisponibilité, mais les citations
                  d’annotations déjà partagées resteront lisibles.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose variant="outline">Conserver en ligne</DialogClose>
                <DialogClose
                  variant="solid"
                  tone="danger"
                  onClick={() => toast.info('Article repassé en brouillon')}
                >
                  Dépublier
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </Variant>

      <Variant
        label="Drawer — panneau latéral"
        kind="candidat"
        hint="Même mécanique que la modale (react-aria), mais ancrée au bord. À comparer avec `Sheet`, qu’il remplace progressivement."
      >
        <div className="flex flex-wrap items-center gap-3">
          <Drawer width="md">
            <DrawerTrigger>Ouvrir le panneau</DrawerTrigger>
            <DrawerContent>
              <DrawerHeader>
                <DrawerTitle>Réglages de la publication</DrawerTitle>
                <DrawerDescription>
                  Ces changements s’appliquent immédiatement, sans republier.
                </DrawerDescription>
              </DrawerHeader>
              <DrawerBody>
                <div className="grid gap-3">
                  <Input aria-label="Nom de la publication" placeholder="Nom de la publication" />
                  <Input aria-label="Adresse courte" placeholder="adresse-courte" />
                </div>
              </DrawerBody>
              <DrawerFooter>
                <Button variant="ghost" size="sm">
                  Annuler
                </Button>
                <Button variant="solid" tone="brand" size="sm">
                  Enregistrer
                </Button>
              </DrawerFooter>
            </DrawerContent>
          </Drawer>

          <Drawer side="left" width="sm">
            <DrawerTrigger>Panneau de gauche</DrawerTrigger>
            <DrawerContent aria-label="Navigation">
              <DrawerBody>Le côté change, le comportement non.</DrawerBody>
            </DrawerContent>
          </Drawer>
        </div>

        <DefectList
          items={[
            'L’arrière-plan devient inerte : tabulation et lecture n’y entrent plus',
            'Échap et clic sur le fond ferment, sauf si `isDismissable={false}`',
            'Le focus revient au déclencheur, ce que les `Sheet` ne font pas toutes',
          ]}
        />
      </Variant>

      <Variant
        label="Toast — notification"
        kind="candidat"
        hint="L’état vit dans une `ToastQueue` react-aria : l’annonce vocale est faite une fois par notification, pas à chaque re-render."
      >
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => toast.success('Article enregistré')}>
            Succès
          </Button>
          <Button
            size="sm"
            onClick={() =>
              toast.error('Échec de l’envoi', {
                description: 'La connexion a été interrompue. Réessayez dans un instant.',
              })
            }
          >
            Erreur avec description
          </Button>
          <Button
            size="sm"
            onClick={() =>
              toast.success('Brouillon supprimé', {
                action: { label: 'Annuler', onClick: () => toast.info('Suppression annulée') },
              })
            }
          >
            Avec action
          </Button>
        </div>

        <DefectList
          items={[
            'La file est bornée à 4 notifications visibles : une boucle ne couvre pas l’écran',
            'Le bouton de fermeture est atteignable au clavier et nommé',
            'Une erreur reste 8 s, une confirmation 5 s',
          ]}
        />
      </Variant>
    </div>
  );
}
