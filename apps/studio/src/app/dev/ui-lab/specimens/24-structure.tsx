'use client';

import { Badge } from '@qoe/ui/badge';
import { Breadcrumbs } from '@qoe/ui/breadcrumbs';
import { Button } from '@qoe/ui/button';
import { DescriptionList } from '@qoe/ui/description-list';
import { Icon } from '@qoe/ui/icons';
import { SectionHeader } from '@qoe/ui/section-header';
import { Stat } from '@qoe/ui/stat';
import { Stepper } from '@qoe/ui/stepper';
import { DefectList, Variant } from '../specimen-frame';

/**
 * Spécimen 24 — la structure d'un écran, sans écran.
 *
 * 📖 Les pièces qui répondent à « où suis-je, qu'est-ce que je regarde,
 *    où en est le parcours, combien ? ». Chacune porte une sémantique
 *    (`h2`, `nav`, `dl`, `ol`), pas seulement une apparence.
 */
export function StructureSpecimen() {
  return (
    <div className="grid gap-10">
      <Variant
        label="En-tête de section"
        kind="candidat"
        hint="Surtitre, titre, compteur, description, actions : cinq emplacements, toujours dans cet ordre. `level` décide de la balise, donc de la structure du document — pas de la taille du texte."
      >
        <div className="grid gap-7 rounded-panel border border-border/40 bg-background p-4">
          <SectionHeader
            eyebrow="Studio"
            title="Articles"
            meta="12"
            description="Brouillons, soumissions et publications. Les brouillons restent privés jusqu’à la soumission."
            actions={
              <>
                <Button size="sm" variant="outline">
                  <Icon name="filter" /> Filtrer
                </Button>
                <Button size="sm" variant="solid" tone="brand">
                  <Icon name="plus" /> Nouvel article
                </Button>
              </>
            }
            divider
          />

          <SectionHeader
            level="h3"
            title="Version personnelle"
            meta={<Badge tone="brand">Média</Badge>}
            description="La copie souveraine de cet article, visible seulement par vous."
            actions={
              <Button size="xs" variant="ghost">
                <Icon name="external-link" /> Ouvrir
              </Button>
            }
          />
        </div>

        <DefectList
          items={[
            '`level="h1"` pour une page, `h2` pour une section, `h3` pour une sous-section — jamais deux `h1`',
            'Les actions passent à la ligne sous le titre sur mobile, sans se compresser',
            'Le compteur est en chiffres tabulaires : il ne fait pas sauter l’en-tête quand il change',
          ]}
        />
      </Variant>

      <Variant
        label="Fil d’Ariane"
        kind="candidat"
        hint="Un vrai `<nav>` avec une liste ordonnée. Le dernier élément n’est pas un lien et porte `aria-current` avec la valeur `page`. `linkAs` branche `next/link` sans que le package UI dépende de Next."
      >
        <Breadcrumbs
          items={[
            { label: 'Studio', href: '/', icon: <Icon name="dashboard" /> },
            { label: 'Publications', href: '/publications' },
            { label: 'Le Désert français', href: '/publications/desert' },
            { label: 'Réglages' },
          ]}
        />

        <div className="mt-5 max-w-sm">
          <p className="mb-2 type-label text-muted-foreground">Version tronquée</p>
          <Breadcrumbs
            items={[
              { label: 'Studio', href: '/' },
              {
                label: 'Un titre de publication vraiment très long qui ne doit pas pousser la page',
                href: '/x',
              },
              { label: 'Annotations' },
            ]}
          />
        </div>
      </Variant>

      <Variant
        label="Fiche de détail"
        kind="candidat"
        hint="Des `<dl>` réels : le lecteur d’écran relie « Publié le » à sa date. Deux dispositions — lignes alignées pour un panneau, empilées pour le mobile — et jusqu’à trois colonnes."
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-panel border border-border/40 bg-background p-4">
            <p className="mb-3 type-label text-muted-foreground">Lignes</p>
            <DescriptionList
              items={[
                { term: 'Statut', value: <Badge tone="success">Publié</Badge> },
                { term: 'Publié le', value: '14 novembre 2026 à 11:05' },
                { term: 'Auteur', value: 'Éphémère', hint: 'Auteur principal' },
                { term: 'Canonical', value: 'media-test.qoe.fi/societe/deserts' },
                { term: 'Langue', value: 'Français (fr)' },
              ]}
              divided
            />
          </div>

          <div className="rounded-panel border border-border/40 bg-background p-4">
            <p className="mb-3 type-label text-muted-foreground">Colonnes empilées</p>
            <DescriptionList
              layout="stacked"
              columns={2}
              items={[
                { term: 'Lectures', value: '12 480', hint: '30 derniers jours' },
                { term: 'Temps de lecture', value: '6 min 12 s' },
                { term: 'Surlignages', value: '84' },
                { term: 'Annotations', value: '19', hint: 'dont 6 publiques' },
                { term: 'Abonnés gagnés', value: '+37' },
                { term: 'Partages', value: '121' },
              ]}
            />
          </div>
        </div>
      </Variant>

      <Variant
        label="Parcours"
        kind="candidat"
        hint="Un seul index courant, trois états calculés. L’étape passée devient une coche, l’étape courante est marquée `aria-current` avec la valeur `step`, et le rail ne dépend pas de la couleur."
      >
        <div className="grid gap-8">
          <Stepper
            current={1}
            steps={[
              { label: 'Brouillon', description: 'Écriture et médias' },
              { label: 'Relecture', description: 'Alt, sources, co-auteurs' },
              { label: 'Publication', description: 'Créneaux et visibilité' },
            ]}
          />

          <div className="max-w-md">
            <Stepper
              orientation="vertical"
              current={2}
              steps={[
                { label: 'Compte créé', description: '14 nov. 10:02' },
                { label: 'Profil complété', description: '14 nov. 10:11' },
                { label: 'Première publication', description: 'En cours — il reste le titre' },
                { label: 'Invitation d’un co-auteur' },
              ]}
            />
          </div>
        </div>
      </Variant>

      <Variant
        label="Indicateurs"
        kind="candidat"
        hint="La variation a deux propriétés séparées : la direction (la flèche) et l’intention (la couleur). Une baisse de temps de chargement est positive ; une hausse de signalements est négative. Sans cette séparation, toute flèche verte serait un contresens."
      >
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Lectures"
            value="12 480"
            emphasis
            icon={<Icon name="eye" />}
            delta={{ value: '+12,4 %', direction: 'up', intent: 'positive', period: 'vs 30 j' }}
          />
          <Stat
            label="Abonnés"
            value="1 204"
            icon={<Icon name="users" />}
            delta={{ value: '+37', direction: 'up', intent: 'positive', period: 'vs 30 j' }}
          />
          <Stat
            label="Temps de chargement"
            value="1,8 s"
            icon={<Icon name="gauge" />}
            delta={{ value: '−0,4 s', direction: 'down', intent: 'positive', period: 'vs 30 j' }}
          />
          <Stat
            label="Signalements"
            value="3"
            icon={<Icon name="flag" />}
            delta={{ value: '+2', direction: 'up', intent: 'negative', period: 'vs 30 j' }}
          />
        </div>
      </Variant>
    </div>
  );
}
