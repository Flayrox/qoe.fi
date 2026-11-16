'use client';

import React, { useState } from 'react';
import { createSupportArticleAction, updateSupportArticleAction } from '@qoe/sdk/actions/admin';
import { Badge } from '@qoe/ui/badge';
import { Button } from '@qoe/ui/button';
import { EmptyState } from '@qoe/ui/empty-state';
import { Icon } from '@qoe/ui/icons';
import { Input, Textarea } from '@qoe/ui/input';
import { SectionHeader } from '@qoe/ui/section-header';
import { useStaffAction } from '@/components/queue/useStaffAction';
import type { SupportArticleItem } from '@/lib/admin-data';

interface ArticlesManagerProps {
  initialItems: SupportArticleItem[];
}

export function ArticlesManager({ initialItems }: ArticlesManagerProps) {
  const [items, setItems] = useState<SupportArticleItem[]>(initialItems);
  const { loadingId, run: staffRun } = useStaffAction<string>();
  const [openId, setOpenId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  // Brouillon de création.
  const [slug, setSlug] = useState('');
  const [titleFr, setTitleFr] = useState('');
  const [titleEn, setTitleEn] = useState('');
  const [bodyFr, setBodyFr] = useState('');
  const [bodyEn, setBodyEn] = useState('');
  // Édition (par article ouvert).
  const [edit, setEdit] = useState({ titleFr: '', titleEn: '', bodyFr: '', bodyEn: '' });

  const refresh = () => window.location.reload();

  const create = async () => {
    const res = await staffRun(
      'new',
      () =>
        createSupportArticleAction({
          slug: slug.trim(),
          titleFr: titleFr.trim(),
          titleEn: titleEn.trim(),
          bodyFr: bodyFr.trim(),
          bodyEn: bodyEn.trim(),
        }),
      { ok: 'Brouillon créé' }
    );
    if (res) {
      setShowNew(false);
      setSlug('');
      setTitleFr('');
      setTitleEn('');
      setBodyFr('');
      setBodyEn('');
      refresh();
    }
  };

  const openEditor = (item: SupportArticleItem) => {
    if (openId === item.id) {
      setOpenId(null);
      return;
    }
    setOpenId(item.id);
    setEdit({
      titleFr: item.titleFr,
      titleEn: item.titleEn,
      bodyFr: item.bodyFr,
      bodyEn: item.bodyEn,
    });
  };

  const save = async (item: SupportArticleItem) => {
    const res = await staffRun(
      item.id,
      () =>
        updateSupportArticleAction({
          articleId: item.id,
          titleFr: edit.titleFr.trim() || undefined,
          titleEn: edit.titleEn.trim() || undefined,
          bodyFr: edit.bodyFr.trim() || undefined,
          bodyEn: edit.bodyEn.trim() || undefined,
        }),
      { ok: 'Article mis à jour' }
    );
    if (res) refresh();
  };

  const togglePublish = async (item: SupportArticleItem) => {
    const res = await staffRun(
      item.id,
      () => updateSupportArticleAction({ articleId: item.id, published: !item.published }),
      { ok: item.published ? 'Dépublié' : 'Publié' }
    );
    if (res) {
      setItems((prev) =>
        prev.map((it) => (it.id === item.id ? { ...it, published: !item.published } : it))
      );
    }
  };

  return (
    <div className="space-y-6 font-sans text-foreground">
      <SectionHeader
        eyebrow="Support"
        title="Articles d’aide"
        meta={items.length}
        description="La FAQ publique de la vitrine. Un brouillon n’est visible qu’ici tant qu’il n’est pas publié."
        actions={
          <Button
            variant={showNew ? 'outline' : 'solid'}
            tone="brand"
            size="sm"
            onClick={() => setShowNew((v) => !v)}
            aria-expanded={showNew}
          >
            <Icon name={showNew ? 'x' : 'plus'} />
            {showNew ? 'Fermer' : 'Nouvel article'}
          </Button>
        }
        divider
      />

      {showNew && (
        <div className="space-y-2 rounded-panel border border-border/60 bg-card p-4">
          <Input
            size="sm"
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
            placeholder="slug-kebab-case en anglais (ex. lost-account)…"
            aria-label="Slug de l’article"
            maxLength={80}
          />
          <div className="grid gap-2 md:grid-cols-2">
            <Input
              size="sm"
              value={titleFr}
              onChange={(e) => setTitleFr(e.target.value)}
              placeholder="Titre FR…"
              aria-label="Titre français"
              maxLength={200}
            />
            <Input
              size="sm"
              value={titleEn}
              onChange={(e) => setTitleEn(e.target.value)}
              placeholder="Title EN…"
              aria-label="Titre anglais"
              maxLength={200}
            />
            <Textarea
              value={bodyFr}
              onChange={(e) => setBodyFr(e.target.value)}
              placeholder="Texte FR…"
              aria-label="Texte français"
              rows={4}
              className="min-h-24"
            />
            <Textarea
              value={bodyEn}
              onChange={(e) => setBodyEn(e.target.value)}
              placeholder="Body EN…"
              aria-label="Texte anglais"
              rows={4}
              className="min-h-24"
            />
          </div>
          <Button
            variant="solid"
            tone="brand"
            size="sm"
            loading={loadingId === 'new'}
            onClick={() => void create()}
          >
            Créer le brouillon
          </Button>
        </div>
      )}

      {items.length === 0 && !showNew ? (
        <EmptyState
          icon={<Icon name="book-open" size="lg" />}
          title="Aucun article"
          description="Créez le premier article d’aide ci-dessus — la FAQ statique de la vitrine reste en attendant."
        />
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const expanded = openId === item.id;
            const loading = loadingId === item.id;

            return (
              <div key={item.id} className="rounded-panel border border-border/60 bg-card p-4">
                <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant="soft"
                        tone={item.published ? 'success' : 'neutral'}
                        size="sm"
                        dot
                      >
                        {item.published ? 'Publié' : 'Brouillon'}
                      </Badge>
                      <code className="font-mono text-[11px] tabular-nums text-muted-foreground">
                        {item.slug}
                      </code>
                    </div>
                    <p className="text-sm font-semibold">{item.titleFr}</p>
                    <p className="text-xs text-muted-foreground">{item.titleEn}</p>
                  </div>
                  <div className="flex flex-wrap gap-2 lg:justify-end">
                    <Button variant="outline" size="sm" onClick={() => openEditor(item)}>
                      {expanded ? 'Refermer' : 'Éditer'}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      loading={loading}
                      onClick={() => void togglePublish(item)}
                    >
                      {item.published ? 'Dépublier' : 'Publier'}
                    </Button>
                  </div>
                </div>

                {expanded && (
                  <div className="mt-4 space-y-2 border-t border-border/40 pt-4">
                    <div className="grid gap-2 md:grid-cols-2">
                      <Input
                        size="sm"
                        value={edit.titleFr}
                        onChange={(e) => setEdit({ ...edit, titleFr: e.target.value })}
                        placeholder="Titre FR…"
                        aria-label="Titre français"
                        maxLength={200}
                      />
                      <Input
                        size="sm"
                        value={edit.titleEn}
                        onChange={(e) => setEdit({ ...edit, titleEn: e.target.value })}
                        placeholder="Title EN…"
                        aria-label="Titre anglais"
                        maxLength={200}
                      />
                      <Textarea
                        value={edit.bodyFr}
                        onChange={(e) => setEdit({ ...edit, bodyFr: e.target.value })}
                        placeholder="Texte FR…"
                        aria-label="Texte français"
                        rows={5}
                        className="min-h-24"
                      />
                      <Textarea
                        value={edit.bodyEn}
                        onChange={(e) => setEdit({ ...edit, bodyEn: e.target.value })}
                        placeholder="Body EN…"
                        aria-label="Texte anglais"
                        rows={5}
                        className="min-h-24"
                      />
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Champs vidés = inchangés (on ne vide jamais par omission).
                    </p>
                    <Button
                      variant="solid"
                      tone="brand"
                      size="sm"
                      loading={loading}
                      onClick={() => void save(item)}
                    >
                      Enregistrer
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
