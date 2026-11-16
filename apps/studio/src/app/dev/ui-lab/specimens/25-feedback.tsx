'use client';

import { useState } from 'react';
import { Button } from '@qoe/ui/button';
import { Callout } from '@qoe/ui/callout';
import { EmptyState } from '@qoe/ui/empty-state';
import { Icon } from '@qoe/ui/icons';
import { KbdGroup } from '@qoe/ui/kbd';
import { Pagination } from '@qoe/ui/pagination';
import { Progress } from '@qoe/ui/progress';
import { Skeleton, SkeletonText } from '@qoe/ui/skeleton';
import { Spinner } from '@qoe/ui/spinner';
import { StatusDot } from '@qoe/ui/status-dot';
import { Timeline } from '@qoe/ui/timeline';
import { DefectList, Variant } from '../specimen-frame';

/**
 * Spécimen 25 — les états qu'on oublie de dessiner.
 *
 * 📖 Un produit se juge autant sur ce qu'il montre quand il n'a rien à
 *    montrer que sur son contenu. Ce spécimen couvre : le vide, le
 *    chargement, l'erreur douce, la progression et l'historique.
 */
export function FeedbackSpecimen() {
  const [page, setPage] = useState(4);

  return (
    <div className="grid gap-10">
      <Variant
        label="Retours — cinq tons, jamais la couleur seule"
        kind="candidat"
        hint="Chaque ton porte son icône : un daltonien lit la même chose qu’un voyant. `live` transforme le bloc en région annoncée, à réserver aux messages qui arrivent après l’action."
      >
        <div className="grid gap-2">
          <Callout tone="neutral" title="Brouillons privés">
            Vos brouillons ne sont visibles que par vous et les co-auteurs invités.
          </Callout>
          <Callout
            tone="info"
            title="Alt manquant sur 2 images"
            action={
              <Button size="xs" variant="ghost">
                Corriger
              </Button>
            }
          >
            Une image sans description est ignorée par les lecteurs d’écran.
          </Callout>
          <Callout tone="success" title="Article publié">
            Il est visible sur media-test.qoe.fi depuis 11:05.
          </Callout>
          <Callout tone="warning" title="Co-auteur en attente" live>
            Une attribution reste `PENDING` : aucune copie souveraine n’est créée avant son accord.
          </Callout>
          <Callout tone="danger" title="Publication impossible" live>
            Deux images sans alt bloquent la publication. Rien n’a été enregistré.
          </Callout>
        </div>
      </Variant>

      <Variant
        label="États vides — le premier écran d’un nouvel utilisateur"
        kind="candidat"
        hint="Trois variantes : `framed` dans une page, `inline` dans une carte déjà bordée, `bare` dans une colonne dense. L’icône vit dans un carré bordé, comme le reste de la géométrie."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <EmptyState
            icon={<Icon name="file-text" />}
            title="Aucun article pour l’instant"
            description="Un article commence par un titre. Vous pourrez ajouter la couverture et les co-auteurs ensuite."
            action={
              <Button size="sm" variant="solid" tone="brand">
                <Icon name="plus" /> Écrire le premier article
              </Button>
            }
            secondaryAction={
              <Button size="sm" variant="ghost">
                Voir les exemples
              </Button>
            }
          />

          <div className="rounded-panel border border-border/40 bg-background">
            <EmptyState
              variant="inline"
              icon={<Icon name="message-square" />}
              title="Aucune annotation"
              description="Sélectionnez un passage pour ouvrir une note d’auteur."
            />
          </div>

          <div className="lg:col-span-2">
            <EmptyState
              variant="bare"
              icon={<Icon name="search" />}
              title="Aucun résultat"
              description="Essayez un autre mot-clé ou retirez un filtre."
            />
          </div>
        </div>
      </Variant>

      <Variant
        label="Chargement — la place du contenu, pas un saut"
        kind="candidat"
        hint="Squelettes à la forme du contenu, libellé de chargement annoncé une fois, et progression qui affiche son pourcentage en texte. Tout s’arrête avec `prefers-reduced-motion`."
      >
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="grid gap-3 rounded-panel border border-border/40 bg-background p-4">
            <div className="flex items-center gap-3">
              <Skeleton shape="circle" className="size-9" />
              <div className="grid flex-1 gap-2">
                <Skeleton className="h-2.5 w-1/2" />
                <Skeleton className="h-2 w-1/3" />
              </div>
            </div>
            <SkeletonText lines={3} />
          </div>

          <div className="grid content-start gap-4">
            <Progress label="Téléversement de 3 images" value={68} showValue />
            <Progress label="Compression" value={100} tone="success" showValue />
            <Progress label="Analyse des fichiers" indeterminate tone="neutral" />
            <div className="flex flex-wrap items-center gap-4">
              <Spinner />
              <Spinner size="md" tone="brand" showLabel label="Synchronisation" />
              <Spinner size="lg" showLabel label="Publication" />
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-5">
          <StatusDot tone="success" label="Publié" />
          <StatusDot tone="brand" label="En revue" />
          <StatusDot tone="warning" label="Alt manquant" />
          <StatusDot tone="danger" label="Erreur" />
          <StatusDot tone="neutral" label="Brouillon" />
          <StatusDot tone="brand" label="Synchronisation" pulse />
        </div>
      </Variant>

      <Variant
        label="Pagination — la page courante ne bouge pas"
        kind="candidat"
        hint="Cliquez : l’ellipse ne masque jamais une seule page, `aria-current` suit la sélection, et les flèches se désactivent aux extrémités. Le calcul de plage est une fonction pure exportée."
      >
        <div className="grid gap-4">
          <Pagination page={page} pageCount={42} onPageChange={setPage} />
          <Pagination page={1} pageCount={5} onPageChange={() => undefined} />
          <div className="flex flex-wrap items-center gap-4">
            <span className="font-mono text-[10.5px] tabular-nums text-muted-foreground">
              page {page} / 42
            </span>
            <Pagination page={page} pageCount={42} onPageChange={setPage} siblingCount={2} />
          </div>
        </div>
      </Variant>

      <Variant
        label="Historique — les jalons d’un article"
        kind="candidat"
        hint="Une liste ordonnée, un rail continu, une heure dans `<time>`. Les événements forts remplacent le point par leur icône ; le reste garde un point de ton."
      >
        <div className="max-w-xl rounded-panel border border-border/40 bg-background p-4">
          <Timeline
            entries={[
              {
                id: 'created',
                title: 'Article créé',
                time: '10:02',
                dateTime: '2026-11-14T10:02:00Z',
                description: 'Brouillon privé dans votre espace personnel.',
              },
              {
                id: 'submitted',
                title: 'Soumis à la revue',
                time: '10:41',
                dateTime: '2026-11-14T10:41:00Z',
                tone: 'brand',
                icon: <Icon name="send" />,
                description: 'Copie souveraine provisionnée pour les co-auteurs acceptés.',
              },
              {
                id: 'published',
                title: 'Publié',
                time: '11:05',
                dateTime: '2026-11-14T11:05:00Z',
                tone: 'success',
                icon: <Icon name="circle-check" />,
                description: 'URL canonique : media-test.qoe.fi/societe/deserts.',
              },
              {
                id: 'annotation',
                title: 'Note d’auteur ajoutée',
                time: '12:18',
                dateTime: '2026-11-14T12:18:00Z',
                tone: 'warning',
                meta: (
                  <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Icon name="highlighter" size="xs" /> 3 paragraphes annotés
                  </span>
                ),
              },
            ]}
          />
        </div>
      </Variant>

      <Variant
        label="Raccourcis — la touche affichée, pas devinée"
        kind="candidat"
        hint="`Kbd` dit ce que l’appelant lui donne : il ne devine pas la plateforme. `KbdGroup` assemble la combinaison, avec le séparateur `aria-hidden` pour ne pas énoncer « plus » entre chaque touche."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex items-center justify-between rounded-panel border border-border/40 bg-background px-3 py-2">
            <span className="text-[12px] text-foreground">Enregistrer</span>
            <KbdGroup keys={['⌘', 'S']} label="Commande plus S" />
          </div>
          <div className="flex items-center justify-between rounded-panel border border-border/40 bg-background px-3 py-2">
            <span className="text-[12px] text-foreground">Rechercher</span>
            <KbdGroup keys={['Ctrl', 'K']} label="Contrôle plus K" />
          </div>
          <div className="flex items-center justify-between rounded-panel border border-border/40 bg-background px-3 py-2">
            <span className="text-[12px] text-foreground">Alinéa</span>
            <KbdGroup keys={['Alt', '⌘', 'A']} label="Option, commande et A" />
          </div>
          <div className="flex items-center justify-between rounded-panel border border-border/40 bg-background px-3 py-2">
            <span className="text-[12px] text-foreground">Fermer le panneau</span>
            <KbdGroup keys={['Échap']} />
          </div>
        </div>

        <DefectList
          items={[
            'La touche reste du contenu : elle est lue par le lecteur d’écran, contrairement à une image',
            'Le libellé de la combinaison est porté par `KbdGroup label`, pas par trois `title`',
            'Un raccourci affiché sans handler est un mensonge : la liste doit suivre le code',
          ]}
        />
      </Variant>
    </div>
  );
}
