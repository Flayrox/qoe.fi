'use client';

import { useState, type ReactNode } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { Checkbox, type CheckboxIndicator } from '@qoe/ui/checkbox';
import { ComboBox } from '@qoe/ui/combobox';
import { Dropdown } from '@qoe/ui/dropdown';
import { Select } from '@qoe/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TablePersonCell,
  TableRow,
  TableSelectAllCell,
  TableSelectionCell,
  selectionToKeySet,
  sortRows,
  type SortDescriptorLike,
  type SortSpec,
} from '@qoe/ui/table';
import { ToggleButton, ToggleGroup } from '@qoe/ui/toggle';
import { DefectList, Variant } from '../specimen-frame';

const ARTICLES = [
  {
    id: '1',
    title: 'Le bruit des claviers',
    author: 'Éphémère Durand',
    status: 'Publié',
    views: 1420,
  },
  {
    id: '2',
    title: 'Ce que la lenteur change',
    author: 'Camille Petit',
    status: 'Brouillon',
    views: 0,
  },
  { id: '3', title: 'Une histoire des marges', author: 'Noé Lambert', status: 'Relu', views: 87 },
  {
    id: '4',
    title: 'Écrire contre l’algorithme',
    author: 'Awa Traoré',
    status: 'Publié',
    views: 3210,
  },
];

const SUBSCRIBERS = [
  {
    id: 'a',
    name: 'Camille Petit',
    email: 'camille@exemple.fr',
    role: 'Propriétaire',
    plan: 'Payant',
    since: '12 mars',
  },
  {
    id: 'b',
    name: 'Noé Lambert',
    email: 'noe@exemple.fr',
    role: 'Éditeur',
    plan: 'Essai',
    since: '14 mars',
  },
  {
    id: 'c',
    name: 'Awa Traoré',
    email: 'awa@exemple.fr',
    role: 'Contributeur',
    plan: 'Payant',
    since: '2 avril',
  },
  {
    id: 'd',
    name: 'Inès Moreau',
    email: 'ines@exemple.fr',
    role: 'Lecteur',
    plan: 'Gratuit',
    since: '28 avril',
  },
];

const COMMENTS = [
  {
    id: 'k1',
    author: 'Camille Petit',
    body: 'Le passage sur la lenteur m’a arrêté…',
    on: 'Le bruit des claviers',
    flags: 0,
  },
  {
    id: 'k2',
    author: 'Anonyme',
    body: 'Achetez mes formations, lien en bio',
    on: 'Une histoire des marges',
    flags: 3,
  },
  {
    id: 'k3',
    author: 'Noé Lambert',
    body: 'Une nuance : le brouillon n’est pas…',
    on: 'Écrire contre l’algorithme',
    flags: 0,
  },
];

type PublicationState = 'published' | 'scheduled' | 'draft';

const DRAFTS: {
  id: string;
  title: string;
  author: string;
  state: PublicationState;
  when: string;
}[] = [
  {
    id: 'd1',
    title: 'Le bruit des claviers',
    author: 'Éphémère Durand',
    state: 'scheduled',
    when: 'demain 09:00',
  },
  {
    id: 'd2',
    title: 'Ce que la lenteur change',
    author: 'Camille Petit',
    state: 'draft',
    when: '—',
  },
  { id: 'd3', title: 'Une histoire des marges', author: 'Noé Lambert', state: 'draft', when: '—' },
  {
    id: 'd4',
    title: 'Écrire contre l’algorithme',
    author: 'Awa Traoré',
    state: 'published',
    when: '12 sept.',
  },
];

const STATE_LABEL: Record<PublicationState, string> = {
  published: 'Publié',
  scheduled: 'Programmé',
  draft: 'Brouillon',
};

/* Le seul endroit du lab où la couleur porte une intention. Le vert et
   l'orange ne sont pas des accents ici : ils disent un état de publication,
   et ils lisent le jumeau texte (5,4:1), pas le fond fluo. */
const STATE_STYLE: Record<PublicationState, string> = {
  published: 'bg-success/15 text-success-text',
  scheduled: 'bg-brand-vivid/15 text-brand-vivid-strong',
  draft: 'bg-muted text-muted-foreground',
};

/* Le tri ne se devine pas : chaque colonne DÉCLARE ce qu'elle contient.
   « Publié » se classe avant « Relu » (ordre éditorial), jamais après
   « Brouillon » par ordre alphabétique, et « 1 420 » est un nombre. */
const ARTICLE_SORT: SortSpec<(typeof ARTICLES)[number]> = {
  title: { kind: 'text', value: (row) => row.title },
  author: { kind: 'text', value: (row) => row.author },
  status: { kind: 'rank', rank: ['Publié', 'Relu', 'Brouillon'], value: (row) => row.status },
  views: { kind: 'number', value: (row) => row.views },
};

const SUBSCRIBER_SORT: SortSpec<(typeof SUBSCRIBERS)[number]> = {
  person: { kind: 'text', value: (row) => row.name },
  role: {
    kind: 'rank',
    rank: ['Propriétaire', 'Éditeur', 'Contributeur', 'Lecteur'],
    value: (row) => row.role,
  },
  plan: { kind: 'rank', rank: ['Payant', 'Essai', 'Gratuit'], value: (row) => row.plan },
  since: { kind: 'text', value: (row) => row.since },
};

const DRAFT_SORT: SortSpec<(typeof DRAFTS)[number]> = {
  title: { kind: 'text', value: (row) => row.title },
  author: { kind: 'text', value: (row) => row.author },
  state: { kind: 'rank', rank: ['published', 'scheduled', 'draft'], value: (row) => row.state },
  when: { kind: 'text', value: (row) => row.when },
};

const COMMENT_SORT: SortSpec<(typeof COMMENTS)[number]> = {
  author: { kind: 'text', value: (row) => row.author },
  body: { kind: 'text', value: (row) => row.body },
  flags: { kind: 'number', value: (row) => row.flags },
};

const INDICATORS: CheckboxIndicator[] = ['check', 'dot', 'none'];
const SIZES = ['xs', 'sm', 'md', 'lg'] as const;
const TONES = ['neutral', 'brand', 'vivid', 'danger', 'success'] as const;

const INDICATOR_LABEL: Record<CheckboxIndicator, string> = {
  check: 'coche',
  dot: 'point',
  none: 'plein',
};

const INDICATOR_HINT: Record<CheckboxIndicator, string> = {
  check: 'La coche, sans ambiguïté dans une liste.',
  dot: 'Plus calme, et lisible même sur une case de 14 px.',
  none: 'Rien : la couleur de la case est l’état. L’indéterminé garde son trait.',
};

export function SelectionTablesSpecimen() {
  const [articleKeys, setArticleKeys] = useState<Set<string>>(new Set(['2']));
  const [subscriberKeys, setSubscriberKeys] = useState<Set<string>>(new Set());
  const [commentKeys, setCommentKeys] = useState<Set<string>>(new Set(['k2']));
  const [draftKeys, setDraftKeys] = useState<Set<string>>(new Set());
  // Un descripteur par table : trier les abonnés par rôle ne doit pas
  // réordonner la liste des écrits.
  const [articleSort, setArticleSort] = useState<SortDescriptorLike>({
    column: 'views',
    direction: 'descending',
  });
  const [subscriberSort, setSubscriberSort] = useState<SortDescriptorLike>({
    column: 'role',
    direction: 'ascending',
  });
  const [draftSort, setDraftSort] = useState<SortDescriptorLike>({
    column: 'state',
    direction: 'ascending',
  });
  const [commentSort, setCommentSort] = useState<SortDescriptorLike>({
    column: 'flags',
    direction: 'descending',
  });

  // Réglages du spécimen : ils pilotent la case d'aperçu ET la colonne de
  // sélection des tables plus bas, ce qui est le point — une variante qu'on
  // ne peut pas essayer sur un cas réel n'est pas une option, c'est une image.
  const [indicator, setIndicator] = useState<CheckboxIndicator>('check');
  const [size, setSize] = useState<(typeof SIZES)[number]>('md');
  const [tone, setTone] = useState<(typeof TONES)[number]>('neutral');
  const [checks, setChecks] = useState<Set<string>>(new Set());
  const [checked, setChecked] = useState(true);

  const sortedArticles = sortRows(ARTICLES, articleSort, ARTICLE_SORT);
  const sortedSubscribers = sortRows(SUBSCRIBERS, subscriberSort, SUBSCRIBER_SORT);
  const sortedDrafts = sortRows(DRAFTS, draftSort, DRAFT_SORT);
  const sortedComments = sortRows(COMMENTS, commentSort, COMMENT_SORT);

  return (
    <div className="grid gap-10">
      <Variant
        label="Checkbox — marque, densité, ton, état"
        kind="candidat"
        hint="Rien n’est figé dans le composant : chaque contrôle ci-dessous est une prop réelle, et l’aperçu à droite est le même code que les tables en dessous. Les trois états restent annoncés (`aria-checked` vaut « mixed » sur l’indéterminé) quelle que soit la marque."
      >
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-start">
          <SettingsPanel
            indicator={indicator}
            onIndicator={setIndicator}
            size={size}
            onSize={setSize}
            tone={tone}
            onTone={setTone}
            flags={checks}
            onFlags={setChecks}
          />

          <div className="grid gap-4 rounded-lg border border-border/40 bg-muted/20 px-4 py-4">
            <Checkbox
              indicator={indicator}
              size={size}
              tone={tone}
              isSelected={checked}
              onChange={setChecked}
              isIndeterminate={checks.has('mixed')}
              invalid={checks.has('invalid')}
              isDisabled={checks.has('disabled')}
              label="Recevoir un courriel à chaque nouvel abonné"
              description={`indicator="${indicator}" · size="${size}" · tone="${tone}"`}
            />

            <div className="grid gap-2 border-t border-border/40 pt-3">
              <p className="text-[10.5px] font-medium tracking-wider text-muted-foreground uppercase">
                Les trois marques
              </p>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                {INDICATORS.map((value) => (
                  <Checkbox
                    key={value}
                    indicator={value}
                    size={size}
                    tone={tone}
                    defaultSelected
                    label={INDICATOR_LABEL[value]}
                  />
                ))}
                <Checkbox
                  indicator="none"
                  size={size}
                  tone={tone}
                  isIndeterminate
                  label="partiel"
                />
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                {INDICATOR_HINT[indicator]}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <div className="grid gap-3">
            <Checkbox label="Coché" defaultSelected />
            <Checkbox label="Décoché" />
            <Checkbox label="Indéterminé" isIndeterminate />
            <Checkbox label="Désactivé" isDisabled defaultSelected />
            <Checkbox label="Invalide" invalid />
          </div>
          <div className="grid gap-3">
            <Checkbox
              label="Avec description"
              description="Recevoir un courriel à chaque nouvel abonné."
              defaultSelected
            />
            <Checkbox label="Ton vif" tone="vivid" defaultSelected />
            <Checkbox label="Ton marque" tone="brand" isIndeterminate />
            <Checkbox label="Ton danger" tone="danger" defaultSelected />
            <Checkbox label="Ton succès" tone="success" defaultSelected />
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-4">
          {SIZES.map((value) => (
            <Checkbox key={value} size={value} label={`Taille ${value}`} defaultSelected />
          ))}
        </div>

        <DefectList
          items={[
            '`aria-checked` à trois valeurs, barre d’espace et focus gérés par react-aria',
            'La case est un contrôle de 14 à 20 px, la cible reste la ligne entière',
            'Indéterminé = un trait, pas une coche grisée : lisible même flou',
            'La marque ne change que le glyphe, jamais le nom annoncé',
          ]}
        />
      </Variant>

      <Variant
        label="Menus compacts — la densité va jusqu’à la liste"
        kind="candidat"
        hint="Un `size` qui ne change que le déclencheur ment : la liste s’ouvre à la même hauteur. Les options suivent maintenant la même échelle (24 / 28 / 32 / 36 px)."
      >
        <div className="flex flex-wrap items-end gap-3">
          <Dropdown
            ariaLabel="Actions de la ligne"
            size="xs"
            label="xs"
            items={[
              { id: 'edit', label: 'Modifier', onAction: () => {} },
              { id: 'archive', label: 'Archiver', onAction: () => {} },
            ]}
          />
          <Dropdown
            ariaLabel="Actions de la ligne"
            size="sm"
            label="sm"
            items={[
              { id: 'edit', label: 'Modifier', onAction: () => {} },
              { id: 'archive', label: 'Archiver', onAction: () => {} },
            ]}
          />
          <div className="w-36">
            <Select
              label="Catégorie"
              hideLabel
              size="sm"
              placeholder="Catégorie"
              options={[
                { id: 'climat', label: 'Climat' },
                { id: 'essai', label: 'Essai' },
              ]}
            />
          </div>
          <div className="w-44">
            <ComboBox
              label="Étiquette"
              hideLabel
              size="sm"
              placeholder="Étiquette"
              options={[
                { id: 'climat', label: 'Climat' },
                { id: 'essai', label: 'Essai' },
              ]}
            />
          </div>
        </div>

        <DefectList
          items={[
            'Trigger et options partagent `MENU_SIZES` : une seule échelle',
            'Le menu xs descend à 24 px, la hauteur d’une puce de liste dense',
            'Les icônes et raccourcis suivent la densité sans réglage local',
          ]}
        />
      </Variant>

      <Variant
        label="Table des écrits — sélection multiple"
        kind="candidat"
        hint="Tous les en-têtes trient, chacun selon ce que la colonne CONTIENT : les vues se comparent comme des nombres (« 1 420 » après « 999 »), les auteurs par alphabet français (accents et casse ignorés), et l’état dans l’ordre éditorial Publié → Relu → Brouillon, jamais par ordre alphabétique. La case d’en-tête coche tout et passe à `mixed` quand une partie seulement est sélectionnée ; la sélection survit au tri."
      >
        <Table
          aria-label="Écrits"
          selectionMode="multiple"
          selectedKeys={articleKeys}
          onSelectionChange={(keys) =>
            setArticleKeys(
              selectionToKeySet(
                keys,
                sortedArticles.map((article) => article.id)
              )
            )
          }
          sortDescriptor={articleSort}
          onSortChange={setArticleSort}
        >
          <TableHeader>
            <TableSelectAllCell indicator={indicator} />
            <TableColumn id="title" isRowHeader allowsSorting>
              Écrit
            </TableColumn>
            <TableColumn id="author" allowsSorting>
              Auteur
            </TableColumn>
            <TableColumn id="status" allowsSorting>
              État
            </TableColumn>
            <TableColumn id="views" allowsSorting>
              Vues
            </TableColumn>
          </TableHeader>
          <TableBody items={sortedArticles}>
            {(article) => (
              <TableRow id={article.id}>
                <TableSelectionCell rowId={article.id} indicator={indicator} />
                <TableCell>{article.title}</TableCell>
                <TableCell>
                  <TablePersonCell name={article.author} meta="Auteur principal" />
                </TableCell>
                <TableCell>
                  <span className="rounded-chip bg-muted px-1.5 py-0.5 type-control-xs">
                    {article.status}
                  </span>
                </TableCell>
                <TableCell className="tabular-nums">
                  {article.views.toLocaleString('fr-FR')}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        <p className="mt-3 type-control-xs text-muted-foreground">
          {articleKeys.size} ligne{articleKeys.size > 1 ? 's' : ''} sélectionnée
          {articleKeys.size > 1 ? 's' : ''} sur {ARTICLES.length}
        </p>
      </Variant>

      <Variant
        label="Abonnés — sélection unique, marque « point »"
        kind="candidat"
        hint="Même table, densité `sm`, et la marque « point » sur la colonne de sélection : elle se lit comme un choix unique sans qu’on ait besoin d’une primitive radio parallèle. Le rôle se trie par hiérarchie (Propriétaire → Éditeur → Contributeur → Lecteur) et l’offre par valeur (Payant → Essai → Gratuit), pas par ordre alphabétique."
      >
        <Table
          aria-label="Abonnés"
          size="sm"
          selectionMode="single"
          selectedKeys={subscriberKeys}
          onSelectionChange={(keys) =>
            setSubscriberKeys(
              selectionToKeySet(
                keys,
                sortedSubscribers.map((subscriber) => subscriber.id)
              )
            )
          }
          sortDescriptor={subscriberSort}
          onSortChange={setSubscriberSort}
        >
          <TableHeader>
            <TableSelectAllCell />
            <TableColumn id="person" isRowHeader allowsSorting>
              Personne
            </TableColumn>
            <TableColumn id="role" allowsSorting>
              Rôle
            </TableColumn>
            <TableColumn id="plan" allowsSorting>
              Offre
            </TableColumn>
            <TableColumn id="since" allowsSorting>
              Abonné depuis
            </TableColumn>
          </TableHeader>
          <TableBody items={sortedSubscribers} emptyState="Aucun abonné">
            {(subscriber) => (
              <TableRow id={subscriber.id}>
                <TableSelectionCell rowId={subscriber.id} indicator="dot" />
                <TableCell>
                  <TablePersonCell name={subscriber.name} meta={subscriber.email} />
                </TableCell>
                <TableCell className="text-muted-foreground">{subscriber.role}</TableCell>
                <TableCell>
                  <span className="rounded-chip bg-muted px-1.5 py-0.5 type-control-xs">
                    {subscriber.plan}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground">{subscriber.since}</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Variant>

      <Variant
        label="Brouillons — état de publication et actions de ligne"
        kind="candidat"
        hint="La table qu’un écran d’écriture utilise tous les jours : la personne, l’état de publication (le seul endroit où la couleur porte une intention), et les actions rangées dans un menu de 24 px pour ne pas manger la ligne."
      >
        <Table
          aria-label="Brouillons et publications"
          selectionMode="multiple"
          selectedKeys={draftKeys}
          onSelectionChange={(keys) =>
            setDraftKeys(
              selectionToKeySet(
                keys,
                sortedDrafts.map((draft) => draft.id)
              )
            )
          }
          sortDescriptor={draftSort}
          onSortChange={setDraftSort}
        >
          <TableHeader>
            <TableSelectAllCell indicator={indicator} />
            <TableColumn id="title" isRowHeader allowsSorting>
              Écrit
            </TableColumn>
            <TableColumn id="author" allowsSorting>
              Auteur
            </TableColumn>
            <TableColumn id="state" allowsSorting>
              Publication
            </TableColumn>
            <TableColumn id="when" allowsSorting>
              Quand
            </TableColumn>
            <TableColumn id="actions">
              <span className="sr-only">Actions</span>
            </TableColumn>
          </TableHeader>
          <TableBody items={sortedDrafts} emptyState="Aucun brouillon">
            {(draft) => (
              <TableRow id={draft.id}>
                <TableSelectionCell rowId={draft.id} indicator={indicator} />
                <TableCell className="font-medium">{draft.title}</TableCell>
                <TableCell>
                  <TablePersonCell name={draft.author} />
                </TableCell>
                <TableCell>
                  <span
                    className={`rounded-chip px-1.5 py-0.5 type-control-xs ${STATE_STYLE[draft.state]}`}
                  >
                    {STATE_LABEL[draft.state]}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground tabular-nums">{draft.when}</TableCell>
                <TableCell className="text-right">
                  <Dropdown
                    ariaLabel={`Actions pour « ${draft.title} »`}
                    size="xs"
                    variant="ghost"
                    chevron={false}
                    label={<MoreHorizontal className="size-3.5" strokeWidth={1.5} />}
                    align="end"
                    items={[
                      { id: 'open', label: 'Ouvrir', onAction: () => {} },
                      { id: 'schedule', label: 'Programmer', onAction: () => {} },
                      { id: 'delete', label: 'Supprimer', tone: 'danger', onAction: () => {} },
                    ]}
                  />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        <p className="mt-3 type-control-xs text-muted-foreground">
          {draftKeys.size === 0
            ? 'Aucune ligne sélectionnée.'
            : `${draftKeys.size} écrit${draftKeys.size > 1 ? 's' : ''} sélectionné${draftKeys.size > 1 ? 's' : ''} — de quoi alimenter une barre d’actions groupées.`}
        </p>
      </Variant>

      <Variant
        label="Modération — densité compacte, drapeaux"
        kind="candidat"
        hint="Le seul tableau où la couleur porte une intention : un commentaire signalé se repère avant d’être lu. Le reste reste neutre, sinon plus rien ne ressort."
      >
        <Table
          aria-label="Commentaires à modérer"
          size="xs"
          selectionMode="multiple"
          selectedKeys={commentKeys}
          onSelectionChange={(keys) =>
            setCommentKeys(
              selectionToKeySet(
                keys,
                sortedComments.map((comment) => comment.id)
              )
            )
          }
          sortDescriptor={commentSort}
          onSortChange={setCommentSort}
        >
          <TableHeader>
            <TableSelectAllCell />
            <TableColumn id="author" isRowHeader allowsSorting>
              Auteur
            </TableColumn>
            <TableColumn id="body" allowsSorting>
              Commentaire
            </TableColumn>
            <TableColumn id="flags" allowsSorting>
              Signalements
            </TableColumn>
          </TableHeader>
          <TableBody items={sortedComments} emptyState="Rien à modérer">
            {(comment) => (
              <TableRow id={comment.id}>
                <TableSelectionCell rowId={comment.id} />
                <TableCell>
                  <TablePersonCell name={comment.author} meta={comment.on} />
                </TableCell>
                <TableCell className="w-full max-w-0">
                  <span className="block truncate text-muted-foreground">{comment.body}</span>
                </TableCell>
                <TableCell>
                  {comment.flags > 0 ? (
                    <span className="font-medium text-destructive-text">
                      {comment.flags} signalement{comment.flags > 1 ? 's' : ''}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Variant>
    </div>
  );
}

/* ---------------------------------------------------------------------
   Réglages du composant
   --------------------------------------------------------------------- */

function SettingsPanel({
  indicator,
  onIndicator,
  size,
  onSize,
  tone,
  onTone,
  flags,
  onFlags,
}: {
  indicator: CheckboxIndicator;
  onIndicator: (value: CheckboxIndicator) => void;
  size: (typeof SIZES)[number];
  onSize: (value: (typeof SIZES)[number]) => void;
  tone: (typeof TONES)[number];
  onTone: (value: (typeof TONES)[number]) => void;
  flags: Set<string>;
  onFlags: (value: Set<string>) => void;
}) {
  return (
    <div className="grid gap-3 rounded-lg border border-border/40 bg-muted/20 px-3 py-3">
      <p className="text-[10.5px] font-medium tracking-wider text-muted-foreground uppercase">
        Réglages du composant
      </p>

      <Row label="Marque">
        <ToggleGroup
          aria-label="Marque de la case"
          selectionMode="single"
          disallowEmptySelection
          selectedKeys={[indicator]}
          onSelectionChange={(keys) => {
            const [next] = Array.from(keys);
            if (next) onIndicator(next as CheckboxIndicator);
          }}
          className="bg-card"
        >
          {INDICATORS.map((value) => (
            <ToggleButton key={value} id={value} size="xs">
              {INDICATOR_LABEL[value]}
            </ToggleButton>
          ))}
        </ToggleGroup>
      </Row>

      <Row label="Densité">
        <ToggleGroup
          aria-label="Densité de la case"
          selectionMode="single"
          disallowEmptySelection
          selectedKeys={[size]}
          onSelectionChange={(keys) => {
            const [next] = Array.from(keys);
            if (next) onSize(next as (typeof SIZES)[number]);
          }}
          className="bg-card"
        >
          {SIZES.map((value) => (
            <ToggleButton key={value} id={value} size="xs">
              {value}
            </ToggleButton>
          ))}
        </ToggleGroup>
      </Row>

      <Row label="Ton">
        <ToggleGroup
          aria-label="Ton de la case cochée"
          selectionMode="single"
          disallowEmptySelection
          selectedKeys={[tone]}
          onSelectionChange={(keys) => {
            const [next] = Array.from(keys);
            if (next) onTone(next as (typeof TONES)[number]);
          }}
          className="bg-card"
        >
          {TONES.map((value) => (
            <ToggleButton key={value} id={value} size="xs">
              {value}
            </ToggleButton>
          ))}
        </ToggleGroup>
      </Row>

      <Row label="État">
        <ToggleGroup
          aria-label="États de la case"
          selectionMode="multiple"
          selectedKeys={flags}
          onSelectionChange={(keys) => onFlags(new Set(Array.from(keys, String)))}
          className="bg-card"
        >
          <ToggleButton id="mixed" size="xs">
            indéterminé
          </ToggleButton>
          <ToggleButton id="invalid" size="xs">
            invalide
          </ToggleButton>
          <ToggleButton id="disabled" size="xs">
            désactivé
          </ToggleButton>
        </ToggleGroup>
      </Row>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <span className="w-14 shrink-0 text-[11px] text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}
