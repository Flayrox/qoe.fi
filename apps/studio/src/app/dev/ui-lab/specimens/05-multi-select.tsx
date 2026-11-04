'use client';

import { useState } from 'react';
import { Button } from '@qoe/ui/button';
import { Tag, TagGroup, TagList } from '@qoe/ui/tag-group';
import { Variant } from '../specimen-frame';

const TAGS = [
  { id: 'climat', label: 'Climat', count: 18 },
  { id: 'enquete', label: 'Enquête', count: 42 },
  { id: 'essai', label: 'Essai', count: 27 },
  { id: 'entretien', label: 'Entretien', count: 14 },
  { id: 'data', label: 'Données', count: 9 },
  { id: 'photo', label: 'Photo', count: 31 },
];

const INITIAL_ARTICLE_TAGS = [
  { id: 'urbanisme', label: 'Urbanisme' },
  { id: 'mobilite', label: 'Mobilité douce' },
  { id: 'europe', label: 'Europe' },
];

export function MultiSelectSpecimen() {
  const [selected, setSelected] = useState<Set<string>>(new Set(['enquete', 'data']));
  const [single, setSingle] = useState<Set<string>>(new Set(['essai']));
  const [editableTags, setEditableTags] = useState(INITIAL_ARTICLE_TAGS);

  return (
    <div className="grid gap-10">
      <Variant
        label="TagGroup — filtres cumulables (@qoe/ui/tag-group)"
        kind="candidat"
        hint="Choix multiple sur react-aria : rayon du contrat (rounded-control, jamais pilule), sélection portée par la surface (bg-foreground text-background) et navigation complète aux flèches."
      >
        <div className="grid gap-3">
          <TagGroup
            aria-label="Filtrer par format"
            selectionMode="multiple"
            selectedKeys={selected}
            onSelectionChange={(keys) => {
              if (keys === 'all') {
                setSelected(new Set(TAGS.map((t) => t.id)));
              } else {
                setSelected(new Set(Array.from(keys, String)));
              }
            }}
          >
            <TagList>
              {TAGS.map((tag) => (
                <Tag key={tag.id} id={tag.id} count={tag.count}>
                  {tag.label}
                </Tag>
              ))}
            </TagList>
          </TagGroup>

          <div className="flex items-center gap-2 type-control-xs text-muted-foreground">
            <span>
              {selected.size} sélectionné{selected.size > 1 ? 's' : ''} sur {TAGS.length}
            </span>
            {selected.size > 0 && (
              <Button variant="ghost" size="xs" onClick={() => setSelected(new Set())}>
                Tout effacer
              </Button>
            )}
          </div>
        </div>
      </Variant>

      <Variant
        label="TagGroup — choix exclusif & étiquettes supprimables"
        kind="candidat"
        hint="Même primitive : selectionMode='single' creuse la surface pour distinguer l’exclusivité d’un cumul, et onRemove active la suppression au clic ou au clavier (Retour arrière / Suppr)."
      >
        <div className="grid max-w-xl gap-6">
          <TagGroup
            label="Format principal"
            selectionMode="single"
            selectedKeys={single}
            onSelectionChange={(keys) => {
              if (keys !== 'all') setSingle(new Set(Array.from(keys, String)));
            }}
          >
            <TagList>
              {TAGS.slice(0, 4).map((tag) => (
                <Tag key={tag.id} id={tag.id}>
                  {tag.label}
                </Tag>
              ))}
            </TagList>
          </TagGroup>

          <div className="grid gap-2">
            <TagGroup
              label="Étiquettes de l’article (Suppr au clavier ou ×)"
              selectionMode="none"
              onRemove={(keys) =>
                setEditableTags((prev) => prev.filter((item) => !keys.has(item.id)))
              }
            >
              <TagList
                renderEmptyState={() => (
                  <span className="type-control-xs text-muted-foreground">
                    Aucune étiquette associée.
                  </span>
                )}
              >
                {editableTags.map((tag) => (
                  <Tag key={tag.id} id={tag.id}>
                    {tag.label}
                  </Tag>
                ))}
              </TagList>
            </TagGroup>
            {editableTags.length < INITIAL_ARTICLE_TAGS.length && (
              <div>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => setEditableTags(INITIAL_ARTICLE_TAGS)}
                >
                  Réinitialiser les étiquettes
                </Button>
              </div>
            )}
          </div>
        </div>
      </Variant>
    </div>
  );
}
