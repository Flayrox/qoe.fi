'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Plus } from 'lucide-react';
import { createSupportArticleAction, updateSupportArticleAction } from '@qoe/sdk/actions/admin';
import { QueueEmpty } from '@/components/queue/QueueEmpty';
import { StatusPill } from '@/components/queue/StatusPill';
import { useStaffAction } from '@/components/queue/useStaffAction';
import type { SupportArticleItem } from '@/lib/admin-data';

interface ArticlesManagerProps {
  initialItems: SupportArticleItem[];
}

const inputCls =
  'w-full text-xs px-3 py-2 rounded-xl border border-border bg-background outline-none';
const areaCls = `${inputCls} min-h-24`;

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
    <div className="space-y-6 text-foreground font-sans">
      <div>
        <button
          onClick={() => setShowNew((v) => !v)}
          className="text-xs font-bold px-4 py-2 rounded-xl bg-[#EE4B2B] text-white cursor-pointer flex items-center gap-1.5"
        >
          <Plus className="w-3 h-3" />
          Nouvel article
        </button>
        {showNew && (
          <div className="mt-3 bg-white border border-border rounded-3xl p-5 shadow-sm space-y-2">
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              placeholder="slug-kebab-case en anglais (ex. lost-account)…"
              maxLength={80}
              className={inputCls}
            />
            <div className="grid gap-2 md:grid-cols-2">
              <input
                value={titleFr}
                onChange={(e) => setTitleFr(e.target.value)}
                placeholder="Titre FR…"
                maxLength={200}
                className={inputCls}
              />
              <input
                value={titleEn}
                onChange={(e) => setTitleEn(e.target.value)}
                placeholder="Title EN…"
                maxLength={200}
                className={inputCls}
              />
              <textarea
                value={bodyFr}
                onChange={(e) => setBodyFr(e.target.value)}
                placeholder="Texte FR…"
                rows={4}
                className={areaCls}
              />
              <textarea
                value={bodyEn}
                onChange={(e) => setBodyEn(e.target.value)}
                placeholder="Body EN…"
                rows={4}
                className={areaCls}
              />
            </div>
            <button
              disabled={loadingId === 'new'}
              onClick={() => void create()}
              className="text-xs font-bold px-4 py-2 rounded-xl bg-[#EE4B2B] text-white cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
            >
              {loadingId === 'new' && <Loader2 className="w-3 h-3 animate-spin" />}
              Créer le brouillon
            </button>
          </div>
        )}
      </div>

      {items.length === 0 && !showNew ? (
        <QueueEmpty
          title="Aucun article 🎉"
          hint="Créez le premier article d'aide ci-dessus — la FAQ statique de la vitrine reste en attendant."
        />
      ) : (
        <div className="space-y-3">
          <AnimatePresence mode="popLayout">
            {items.map((item) => {
              const expanded = openId === item.id;
              const loading = loadingId === item.id;
              return (
                <motion.div
                  key={item.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="bg-white border border-border rounded-3xl p-5 shadow-sm"
                >
                  <div className="flex flex-col lg:flex-row gap-4 lg:items-start justify-between">
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusPill tone={item.published ? 'hot' : 'muted'}>
                          {item.published ? 'Publié' : 'Brouillon'}
                        </StatusPill>
                        <code className="text-[11px] text-muted-foreground font-mono">
                          {item.slug}
                        </code>
                      </div>
                      <p className="text-sm font-bold">{item.titleFr}</p>
                      <p className="text-xs text-muted-foreground">{item.titleEn}</p>
                    </div>
                    <div className="flex flex-wrap gap-2 lg:justify-end">
                      <button
                        onClick={() => openEditor(item)}
                        className="text-xs font-semibold px-3 py-1.5 rounded-full border border-border bg-white hover:bg-muted cursor-pointer"
                      >
                        {expanded ? 'Refermer' : 'Éditer'}
                      </button>
                      <button
                        disabled={loading}
                        onClick={() => void togglePublish(item)}
                        className="text-xs font-semibold px-3 py-1.5 rounded-full border border-border bg-white hover:bg-muted cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                      >
                        {loading && <Loader2 className="w-3 h-3 animate-spin" />}
                        {item.published ? 'Dépublier' : 'Publier'}
                      </button>
                    </div>
                  </div>
                  {expanded && (
                    <div className="mt-4 pt-4 border-t border-border/60 space-y-2">
                      <div className="grid gap-2 md:grid-cols-2">
                        <input
                          value={edit.titleFr}
                          onChange={(e) => setEdit({ ...edit, titleFr: e.target.value })}
                          placeholder="Titre FR…"
                          maxLength={200}
                          className={inputCls}
                        />
                        <input
                          value={edit.titleEn}
                          onChange={(e) => setEdit({ ...edit, titleEn: e.target.value })}
                          placeholder="Title EN…"
                          maxLength={200}
                          className={inputCls}
                        />
                        <textarea
                          value={edit.bodyFr}
                          onChange={(e) => setEdit({ ...edit, bodyFr: e.target.value })}
                          placeholder="Texte FR…"
                          rows={5}
                          className={areaCls}
                        />
                        <textarea
                          value={edit.bodyEn}
                          onChange={(e) => setEdit({ ...edit, bodyEn: e.target.value })}
                          placeholder="Body EN…"
                          rows={5}
                          className={areaCls}
                        />
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Champs vidés = inchangés (on ne vide jamais par omission).
                      </p>
                      <button
                        disabled={loading}
                        onClick={() => void save(item)}
                        className="text-xs font-bold px-4 py-2 rounded-xl bg-[#EE4B2B] text-white cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                      >
                        {loading && <Loader2 className="w-3 h-3 animate-spin" />}
                        Enregistrer
                      </button>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
