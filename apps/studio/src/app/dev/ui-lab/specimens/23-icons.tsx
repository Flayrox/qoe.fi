'use client';

import { useMemo, useState } from 'react';
import { Badge } from '@qoe/ui/badge';
import { Button } from '@qoe/ui/button';
import { IconButton } from '@qoe/ui/icon-button';
import { Input } from '@qoe/ui/input';
import { ICON_GROUPS, ICON_NAMES, Icon, type IconName } from '@qoe/ui/icons';
import { DefectList, Variant } from '../specimen-frame';

/**
 * Spécimen 23 — les icônes, enfin nommées.
 *
 * 📖 Le registre est la seule source : chaque clé est une intention, pas un
 *    dessin. Cherchez « trash » ou « publish » pour retrouver le nom à
 *    utiliser dans le JSX.
 *
 * 🎯 Toutes les tuiles viennent du même import ; aucune icône n'est
 *    dessinée ici à la main.
 */
export function IconsSpecimen() {
  const [query, setQuery] = useState('');

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return ICON_GROUPS.map((group) => ({
      ...group,
      names: (group.names as readonly IconName[]).filter((name) =>
        needle ? name.includes(needle) : true
      ),
    })).filter((group) => group.names.length > 0);
  }, [query]);

  const shown = groups.reduce((sum, group) => sum + group.names.length, 0);

  return (
    <div className="grid gap-10">
      <Variant
        label="Le registre — une intention, un nom"
        kind="candidat"
        hint="Les clés sont en kebab-case et typées : `name` n’accepte que ce qui existe. Le trait est unique (1.5), la taille vient de l’échelle xs → lg. Chercher ici évite d’importer un dessin au hasard dans un écran."
      >
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full max-w-xs">
            <Icon
              name="search"
              size="sm"
              className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              size="sm"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filtrer les icônes…"
              aria-label="Filtrer les icônes"
              className="pl-7"
            />
          </div>
          <span className="font-mono text-[10.5px] tabular-nums text-muted-foreground">
            {shown} / {ICON_NAMES.length}
          </span>
        </div>

        <div className="mt-5 grid gap-6">
          {groups.map((group) => (
            <div key={group.id}>
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 border-b border-border/40 pb-1.5">
                <p className="type-label text-muted-foreground">{group.label}</p>
                <p className="text-[11px] text-muted-foreground">{group.hint}</p>
              </div>
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-1.5">
                {group.names.map((name) => (
                  <li
                    key={name}
                    className="flex min-w-0 items-center gap-2 rounded-tag border border-border/40 bg-muted/20 px-2 py-1.5"
                  >
                    <Icon name={name} size="md" className="text-foreground" />
                    <code className="truncate font-mono text-[10.5px] text-muted-foreground">
                      {name}
                    </code>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {groups.length === 0 && (
          <p className="mt-4 text-[12px] text-muted-foreground">
            Aucune icône ne correspond à « {query} ».
          </p>
        )}

        <DefectList
          items={[
            'Le nom est typé : `<Icon name="trashhh" />` ne compile pas',
            'Une icône est décorative par défaut (`aria-hidden`) ; `label` la rend signifiante',
            'Deux dessins pour une intention sont un doublon : on en garde un et on l’écrit ici',
          ]}
        />
      </Variant>

      <Variant
        label="Quatre tailles, une épaisseur"
        kind="candidat"
        hint="12 px dans un badge, 14 px dans un bouton, 16 px dans un en-tête, 20 px dans un état vide. L’épaisseur ne change pas avec la taille : c’est la densité qui décide, pas l’écran."
      >
        <div className="flex flex-wrap items-end gap-6">
          {(['xs', 'sm', 'md', 'lg'] as const).map((size) => (
            <div key={size} className="grid justify-items-center gap-2">
              <Icon name="sparkles" size={size} className="text-foreground" />
              <span className="font-mono text-[10px] text-muted-foreground">{size}</span>
            </div>
          ))}
          <div className="grid justify-items-center gap-2">
            <Icon name="sparkles" size="lg" strokeWidth={1.25} className="text-foreground" />
            <span className="font-mono text-[10px] text-muted-foreground">1.25</span>
          </div>
          <div className="grid justify-items-center gap-2">
            <Icon name="sparkles" size="lg" strokeWidth={1.75} className="text-foreground" />
            <span className="font-mono text-[10px] text-muted-foreground">1.75</span>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <Button variant="solid" tone="brand">
            <Icon name="plus" /> Nouvel écrit
          </Button>
          <Button variant="outline">
            <Icon name="upload" /> Importer
          </Button>
          <Button variant="ghost">
            <Icon name="link" /> Copier le lien
          </Button>
          <Badge tone="success">
            <Icon name="circle-check" size="xs" /> Publié
          </Badge>
          <Badge tone="brand" dot>
            En revue
          </Badge>
        </div>
      </Variant>

      <Variant
        label="Boutons icône — carrés, nommés, infobulés"
        kind="candidat"
        hint="`IconButton` exige `label` : le nom va sur le bouton ET dans l’infobulle. Un bouton icône sans nom est invisible au lecteur d’écran ; ici, l’oubli ne compile pas."
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <IconButton label="Modifier">
            <Icon name="square-pen" />
          </IconButton>
          <IconButton label="Partager">
            <Icon name="share" />
          </IconButton>
          <IconButton label="Archiver">
            <Icon name="archive" />
          </IconButton>
          <IconButton label="Supprimer" tone="danger">
            <Icon name="trash" />
          </IconButton>
          <IconButton label="Plus d’actions">
            <Icon name="more-horizontal" />
          </IconButton>
          <IconButton label="Fermer" variant="outline" size="md">
            <Icon name="x" />
          </IconButton>
          <IconButton label="Enregistrer" variant="solid" tone="brand" size="md">
            <Icon name="save" />
          </IconButton>
        </div>

        <DefectList
          items={[
            'La forme est carrée par construction (`aspect-square`, padding horizontal nul)',
            'Le bouton reste atteignable au clavier et l’infobulle s’ouvre au focus, pas seulement au survol',
            '`tooltip={false}` existe pour les barres d’outils où le contexte suffit — le nom reste',
          ]}
        />
      </Variant>
    </div>
  );
}
