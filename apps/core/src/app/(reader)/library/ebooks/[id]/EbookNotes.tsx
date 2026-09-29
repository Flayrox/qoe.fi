'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Pencil, Trash2, X } from 'lucide-react';
import {
  addEbookNoteAction,
  deleteEbookNoteAction,
  updateEbookNoteAction,
  type EbookNote,
} from '@qoe/sdk';
import { toast } from '@qoe/ui/toast';
import { cn } from '@qoe/utils';
import { describeEbookError } from '../ebooks-helpers';

// =====================================================================
// 📝 Notes du chapitre — un passage et/ou un mot à soi (table dédiée)
// =====================================================================
// Ce ne sont PAS les surlignages d'articles : rien n'est public, rien n'est
// voté, et une note ne sort jamais du compte. L'état vit chez le lecteur
// (le compteur du chapitre doit rester juste) ; ce composant ne fait que
// présenter et écrire.
// =====================================================================

export interface EbookNotesProps {
  ebookId: string;
  chapterIndex: number;
  chapterTitle: string;
  /** Notes du chapitre courant (déjà filtrées). */
  notes: EbookNote[];
  totalCount: number;
  onAdd: (note: EbookNote) => void;
  onUpdate: (note: EbookNote) => void;
  onDelete: (id: string) => void;
  /** Passage sélectionné dans le texte, à pré-remplir (puis consommé). */
  draftExcerpt: string | null;
  onDraftConsumed: () => void;
}

export function EbookNotes({
  ebookId,
  chapterIndex,
  chapterTitle,
  notes,
  totalCount,
  onAdd,
  onUpdate,
  onDelete,
  draftExcerpt,
  onDraftConsumed,
}: EbookNotesProps) {
  const [excerpt, setExcerpt] = useState('');
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [pendingId, setPendingId] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Un passage sélectionné dans le texte ouvre le composeur déjà rempli.
  useEffect(() => {
    if (draftExcerpt === null) return;
    setExcerpt(draftExcerpt);
    setText('');
    onDraftConsumed();
    const t = setTimeout(() => textareaRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [draftExcerpt, onDraftConsumed]);

  const save = async () => {
    if (saving) return;
    if (!excerpt.trim() && !text.trim()) {
      toast.error('Sélectionnez un passage ou écrivez quelques mots.');
      return;
    }
    setSaving(true);
    const res = await addEbookNoteAction({
      ebookId,
      chapter: chapterIndex,
      chapterTitle,
      excerpt,
      note: text,
    });
    setSaving(false);
    if (!res.ok) {
      toast.error(describeEbookError(res.error.code ?? null, res.error.message));
      return;
    }
    onAdd(res.data);
    setExcerpt('');
    setText('');
    toast.success('Note ajoutée à ce chapitre.');
  };

  const saveEdit = async (id: string) => {
    setPendingId(id);
    const res = await updateEbookNoteAction({ ebookId, noteId: id, note: editText });
    setPendingId(null);
    if (!res.ok) {
      toast.error(describeEbookError(res.error.code ?? null, res.error.message));
      return;
    }
    onUpdate(res.data);
    setEditingId(null);
  };

  const remove = async (id: string) => {
    setPendingId(id);
    const res = await deleteEbookNoteAction({ ebookId, noteId: id });
    setPendingId(null);
    if (!res.ok) {
      toast.error(describeEbookError(res.error.code ?? null, res.error.message));
      return;
    }
    onDelete(id);
  };

  return (
    <div className="rounded-2xl border border-border/50 bg-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold">
          Mes notes sur ce chapitre
          <span className="text-muted-foreground font-normal">
            {' '}
            ({notes.length}
            {totalCount > notes.length ? ` sur ${totalCount} dans le livre` : ''})
          </span>
        </p>
      </div>

      {/* ─── Composeur : passage (lecture seule) + mot à soi ─── */}
      <div className="space-y-2">
        {excerpt && (
          <div className="flex items-start gap-2 rounded-xl bg-muted/40 border border-border/40 px-3 py-2">
            <p className="text-[11px] italic text-muted-foreground line-clamp-3 flex-1">
              « {excerpt} »
            </p>
            <button
              type="button"
              onClick={() => setExcerpt('')}
              className="text-muted-foreground hover:text-foreground cursor-pointer"
              title="Retirer le passage"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder={
            excerpt ? 'Votre mot sur ce passage (optionnel)…' : 'Écrire une note sur ce chapitre…'
          }
          className="w-full text-xs px-3 py-2 rounded-xl bg-muted/50 border border-border/50 focus:outline-none focus:ring-1 focus:ring-primary/40 resize-y"
        />
        <div className="flex items-center justify-end gap-2">
          {(excerpt || text) && (
            <button
              type="button"
              onClick={() => {
                setExcerpt('');
                setText('');
              }}
              className="text-[11px] font-semibold text-muted-foreground hover:text-foreground cursor-pointer"
            >
              Annuler
            </button>
          )}
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-xl bg-primary text-primary-foreground hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-60"
          >
            {saving && <Loader2 className="w-3 h-3 animate-spin" />}
            <span>Ajouter la note</span>
          </button>
        </div>
      </div>

      {/* ─── Notes du chapitre ─── */}
      {notes.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">
          Aucune note sur ce chapitre. Sélectionnez un passage dans le texte, ou écrivez directement
          ci-dessus.
        </p>
      ) : (
        <ul className="space-y-2">
          {notes.map((note) => (
            <li key={note.id} className="rounded-xl border border-border/40 px-3 py-2 space-y-1.5">
              {note.excerpt && (
                <p className="text-[11px] italic text-muted-foreground">« {note.excerpt} »</p>
              )}
              {editingId === note.id ? (
                <div className="space-y-1.5">
                  <textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    rows={2}
                    autoFocus
                    className="w-full text-xs px-2 py-1.5 rounded-lg bg-muted/50 border border-border/50 focus:outline-none focus:ring-1 focus:ring-primary/40"
                  />
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="text-[11px] font-semibold text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      Annuler
                    </button>
                    <button
                      type="button"
                      onClick={() => void saveEdit(note.id)}
                      disabled={pendingId === note.id}
                      className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-primary text-primary-foreground cursor-pointer disabled:opacity-60"
                    >
                      Enregistrer
                    </button>
                  </div>
                </div>
              ) : (
                <p
                  className={cn(
                    'text-xs whitespace-pre-wrap',
                    !note.note && 'text-muted-foreground'
                  )}
                >
                  {note.note || 'Passage gardé sans commentaire.'}
                </p>
              )}
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">
                  {new Date(note.createdAt).toLocaleDateString('fr-FR', {
                    day: 'numeric',
                    month: 'short',
                  })}
                </span>
                <span className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(note.id);
                      setEditText(note.note);
                    }}
                    className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                    title="Modifier la note"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove(note.id)}
                    disabled={pendingId === note.id}
                    className="text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                    title="Supprimer la note"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
