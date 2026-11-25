'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Pencil, Trash2, X } from 'lucide-react';
import {
  addEbookNoteAction,
  deleteEbookNoteAction,
  updateEbookNoteAction,
  type EbookNote,
} from '@qoe/sdk';
import { toast } from '@qoe/ui/toast';
import { cn } from '@qoe/utils';
import { describeEbookError } from '../ebooks-helpers';
import { Button } from '@qoe/ui/button';
import { Textarea } from '@qoe/ui/input';

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
    try {
      const res = await addEbookNoteAction({
        ebookId,
        chapter: chapterIndex,
        chapterTitle,
        excerpt,
        note: text,
      });
      if (!res.ok) {
        toast.error(describeEbookError(res.error.code ?? null, res.error.message));
        return;
      }
      onAdd(res.data);
      setExcerpt('');
      setText('');
      toast.success('Note ajoutée à ce chapitre.');
    } catch {
      // Une panne réseau ne doit pas laisser le bouton d'envoi verrouillé.
      toast.error('Note non enregistrée : réessayez.');
    } finally {
      setSaving(false);
    }
  };

  const saveEdit = async (id: string) => {
    setPendingId(id);
    try {
      const res = await updateEbookNoteAction({ ebookId, noteId: id, note: editText });
      if (!res.ok) {
        toast.error(describeEbookError(res.error.code ?? null, res.error.message));
        return;
      }
      onUpdate(res.data);
      setEditingId(null);
    } catch {
      toast.error('Modification non enregistrée : réessayez.');
    } finally {
      setPendingId(null);
    }
  };

  const remove = async (id: string) => {
    setPendingId(id);
    try {
      const res = await deleteEbookNoteAction({ ebookId, noteId: id });
      if (!res.ok) {
        toast.error(describeEbookError(res.error.code ?? null, res.error.message));
        return;
      }
      onDelete(id);
    } catch {
      toast.error('Suppression impossible pour le moment.');
    } finally {
      setPendingId(null);
    }
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
            <Button
              variant="ghost"
              shape="icon"
              size="xs"
              onClick={() => setExcerpt('')}
              className="p-0 text-muted-foreground hover:bg-transparent hover:text-foreground h-auto! [font-size:inherit]! leading-[inherit]! [font-weight:inherit]! whitespace-normal! justify-normal inline-block "
              title="Retirer le passage"
              aria-label="Retirer le passage"
            >
              <X className="w-3! h-3!" />
            </Button>
          </div>
        )}
        <Textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder={
            excerpt ? 'Votre mot sur ce passage (optionnel)…' : 'Écrire une note sur ce chapitre…'
          }
          className="w-full! text-xs! px-3 py-2 rounded-xl bg-muted/50 border border-border/50 focus:outline-none focus:ring-1 focus:ring-primary/40 resize-y leading-[16px]! h-auto! [font-weight:inherit]! whitespace-normal! justify-normal inline-block "
        />
        <div className="flex items-center justify-end gap-2">
          {(excerpt || text) && (
            <Button
              variant="ghost"
              size="xs"
              onClick={() => {
                setExcerpt('');
                setText('');
              }}
              className="p-0 text-[11px]! font-semibold! text-muted-foreground hover:bg-transparent hover:text-foreground h-auto! leading-[inherit]! whitespace-normal! justify-normal inline-block "
            >
              Annuler
            </Button>
          )}
          <Button
            variant="solid"
            tone="brand"
            size="sm"
            onClick={() => void save()}
            loading={saving}
            className="gap-1.5 rounded-xl px-3 py-1.5 text-[11px]! font-semibold! h-auto! leading-[inherit]! whitespace-normal! justify-normal "
          >
            <span>Ajouter la note</span>
          </Button>
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
                  <Textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    rows={2}
                    autoFocus
                    className="w-full! text-xs! px-2 py-1.5 rounded-lg bg-muted/50 border border-border/50 focus:outline-none focus:ring-1 focus:ring-primary/40 leading-[16px]! h-auto! [font-weight:inherit]! whitespace-normal! justify-normal inline-block "
                  />
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => setEditingId(null)}
                      className="p-0 text-[11px]! font-semibold! text-muted-foreground hover:bg-transparent hover:text-foreground h-auto! leading-[inherit]! whitespace-normal! justify-normal inline-block "
                    >
                      Annuler
                    </Button>
                    <Button
                      variant="solid"
                      tone="brand"
                      size="xs"
                      onClick={() => void saveEdit(note.id)}
                      loading={pendingId === note.id}
                      className="rounded-lg px-2.5 py-1 text-[11px]! font-semibold! h-auto! leading-[inherit]! whitespace-normal! justify-normal inline-block "
                    >
                      Enregistrer
                    </Button>
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
                  <Button
                    variant="ghost"
                    shape="icon"
                    size="xs"
                    onClick={() => {
                      setEditingId(note.id);
                      setEditText(note.note);
                    }}
                    className="p-0 text-muted-foreground hover:bg-transparent hover:text-foreground h-auto! [font-size:inherit]! leading-[inherit]! [font-weight:inherit]! whitespace-normal! justify-normal inline-block "
                    title="Modifier la note"
                    aria-label="Modifier la note"
                  >
                    <Pencil className="w-3! h-3!" />
                  </Button>
                  <Button
                    variant="ghost"
                    shape="icon"
                    size="xs"
                    onClick={() => void remove(note.id)}
                    loading={pendingId === note.id}
                    className="p-0 text-muted-foreground hover:bg-transparent hover:text-destructive-text h-auto! [font-size:inherit]! leading-[inherit]! [font-weight:inherit]! whitespace-normal! justify-normal inline-block "
                    title="Supprimer la note"
                    aria-label="Supprimer la note"
                  >
                    <Trash2 className="w-3! h-3!" />
                  </Button>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
