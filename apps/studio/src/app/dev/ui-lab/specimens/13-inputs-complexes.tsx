'use client';

import { useState } from 'react';
import { Autocomplete } from '@qoe/ui/autocomplete';
import { ComboBox } from '@qoe/ui/combobox';
import { ColorArea, ColorField, ColorPicker } from '@qoe/ui/color';
import { Table, TableBody, TableCell, TableColumn, TableHeader, TableRow } from '@qoe/ui/table';
import { DefectList, Variant } from '../specimen-frame';

const TAGS = [
  { id: 'essai', label: 'Essai', description: 'texte long, argumenté' },
  { id: 'entretien', label: 'Entretien', description: 'format questions-réponses' },
  { id: 'chronique', label: 'Chronique', description: 'rendez-vous régulier' },
  { id: 'reportage', label: 'Reportage', description: 'enquête de terrain' },
  { id: 'ephémère', label: 'Éphémère', description: 'note courte, sans suite' },
  { id: 'recension', label: 'Recension', description: 'compte rendu de lecture' },
];

const AUTHORS = ['Éphémère Durand', 'Camille Petit', 'Noé Lambert', 'Inès Moreau', 'Awa Traoré'];

const ARTICLES = [
  {
    id: '1',
    title: 'Le bruit des claviers',
    status: 'Publié',
    views: 1420,
    author: 'Éphémère Durand',
  },
  {
    id: '2',
    title: 'Ce que la lenteur change',
    status: 'Brouillon',
    views: 0,
    author: 'Camille Petit',
  },
  { id: '3', title: 'Une histoire des marges', status: 'Relu', views: 87, author: 'Noé Lambert' },
  {
    id: '4',
    title: 'Écrire contre l’algorithme',
    status: 'Publié',
    views: 3210,
    author: 'Awa Traoré',
  },
];

export function InputsComplexSpecimen() {
  const [tag, setTag] = useState<string | null>('essai');
  const [author, setAuthor] = useState('');
  const [color, setColor] = useState('#c2410c');
  const [sort, setSort] = useState<'ascending' | 'descending'>('descending');

  const rows = [...ARTICLES].sort((a, b) =>
    sort === 'ascending' ? a.views - b.views : b.views - a.views
  );

  return (
    <div className="grid gap-10">
      <Variant
        label="ComboBox — filtrer, sans tenir compte des accents"
        kind="candidat"
        hint="« eph » doit trouver « Éphémère », « re » doit trouver « Reportage » et « Recension ». Le filtre, c’est nous : la normalisation NFD est une décision produit."
      >
        <div className="grid max-w-md gap-4">
          <ComboBox
            label="Format de l’écrit"
            options={TAGS}
            value={tag}
            onValueChange={setTag}
            emptyMessage="Aucun format ne correspond"
          />
          <ComboBox
            label="Rechercher un écrit"
            options={TAGS.map((item) => ({ ...item, label: item.label }))}
            defaultInputValue="re"
            size="sm"
          />
          <ComboBox
            label="Champ invalide"
            options={TAGS}
            placeholder="Aucun format choisi"
            invalid
            errorMessage="Choisissez un format avant de publier."
          />
        </div>

        <DefectList
          items={[
            'Accents ignorés à la recherche (`eph` → Éphémère)',
            'Liste vide annoncée par un message, pas un panneau blanc',
            '`aria-invalid` et message relié par `aria-describedby`',
          ]}
        />
      </Variant>

      <Variant
        label="Autocomplete — proposer, jamais contraindre"
        kind="candidat"
        hint="La valeur tapée reste valable : les suggestions servent à éviter les doublons d’orthographe, pas à fermer la porte."
      >
        <div className="max-w-md">
          <Autocomplete
            label="Auteur"
            options={AUTHORS.map((name) => ({ id: name, label: name }))}
            value={author}
            onValueChange={setAuthor}
            placeholder="Nom, ou un nouveau"
            emptyMessage="Aucun auteur connu — la saisie sera conservée"
          />
        </div>

        <DefectList
          items={[
            'Valeur libre : une personne non listée reste sélectionnable',
            'Croix de réinitialisation seulement quand il y a une valeur',
            'Même rendu que le ComboBox : un seul code à maintenir',
          ]}
        />
      </Variant>

      <Variant
        label="Table — tri annoncé, navigation au clavier"
        kind="candidat"
        hint="L’en-tête trié porte `aria-sort` ; la flèche n’est que la conséquence. Et le tri reste piloté par l’écran, pas par un état interne au tableau."
      >
        <Table
          aria-label="Écrits"
          sortDescriptor={{ column: 'views', direction: sort }}
          onSortChange={(descriptor) =>
            setSort(descriptor.direction === 'ascending' ? 'ascending' : 'descending')
          }
        >
          <TableHeader>
            <TableColumn id="title" isRowHeader>
              Écrit
            </TableColumn>
            <TableColumn id="author">Auteur</TableColumn>
            <TableColumn id="status">État</TableColumn>
            <TableColumn id="views" allowsSorting>
              Vues
            </TableColumn>
          </TableHeader>
          <TableBody items={rows} emptyState="Aucun écrit">
            {(article) => (
              <TableRow id={article.id}>
                <TableCell>{article.title}</TableCell>
                <TableCell className="text-muted-foreground">{article.author}</TableCell>
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

        <DefectList
          items={[
            '`aria-sort` sur la colonne, flèche en décoration',
            'Cellules navigables aux flèches, ligne et colonne annoncées',
            'Vide : un message dans le corps, pas une table de zéro ligne',
          ]}
        />
      </Variant>

      <Variant
        label="Couleur — dégradé, teinte, hexadécimal"
        kind="candidat"
        hint="Trois gestes pour une seule valeur. Le damier sous la pastille n’est pas décoratif : il rend la transparence visible."
      >
        <div className="grid max-w-sm gap-4">
          <ColorArea label="Couleur de la couverture" value={color} onValueChange={setColor} />
          <ColorField label="Code hexadécimal" value={color} onValueChange={setColor} />
          <ColorPicker
            label="Accent de la publication"
            value={color}
            onValueChange={setColor}
            presets={['#c2410c', '#0f766e', '#1d4ed8', '#7e22ce', '#0f172a']}
          />
        </div>

        <DefectList
          items={[
            'Valeur unique : les trois contrôles restent synchronisés',
            'Dégradé calculé par react-aria selon les canaux pilotés',
            'Le déclencheur dit la couleur en clair, pas seulement un carré',
          ]}
        />
      </Variant>
    </div>
  );
}
