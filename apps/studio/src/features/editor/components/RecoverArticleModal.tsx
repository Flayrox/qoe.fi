'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, GitFork, History, Loader2 } from 'lucide-react';
import { diffWords, type Change } from 'diff';
import { t } from '@lingui/core/macro';
import { Badge } from '@qoe/ui/badge';
import { Button } from '@qoe/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@qoe/ui/dialog';
import { Tab, TabList, Tabs } from '@qoe/ui/tabs';
import { toast } from '@qoe/ui/toast';
import { RadioGroup, RadioCard } from '@qoe/ui/radio-group';
import {
  forkArticleToPersonalAction,
  getArticleSnapshotsAction,
  type ArticleSnapshotDTO,
} from '@qoe/sdk/actions/articles';

export interface RecoverArticleProps {
  open: boolean;
  onClose: () => void;
  articleId: string;
  articleTitle: string;
  publisherName?: string | null;
  currentUserId?: string;
  currentLiveContent?: string;
}

export type RecoverArticleModalProps = RecoverArticleProps;

function htmlToReadableText(html: string): string {
  if (!html) return '';
  return html
    .replace(/<br\s*[\/]?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<blockquote[^>]*>/gi, '> ')
    .replace(/<\/blockquote>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function reasonLabel(reason: string): string {
  switch (reason) {
    case 'INITIAL':
      return t`Création initiale`;
    case 'AUTHOR_SWITCH':
      return t`Changement de rédacteur`;
    case 'SUBMITTED':
      return t`Soumission à relecture`;
    case 'PUBLISHED':
      return t`Publisher parue`;
    case 'BEFORE_REVOCATION':
      return t`Avant fin de collaboration`;
    case 'BEFORE_RESTORE':
      return t`Avant restauration`;
    default:
      return reason;
  }
}

export function RecoverArticle({
  open,
  onClose,
  articleId,
  articleTitle,
  publisherName,
  currentUserId,
  currentLiveContent,
}: RecoverArticleProps) {
  const [snapshots, setSnapshots] = useState<ArticleSnapshotDTO[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'options' | 'preview'>('options');

  const [selectionMode, setSelectionMode] = useState<'my_authored' | 'latest_live' | 'specific'>(
    'my_authored'
  );
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !articleId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    void getArticleSnapshotsAction({ articleId }).then((res) => {
      if (cancelled) return;
      setLoading(false);
      if (res.ok) {
        setSnapshots(res.data);
        const mySnap = currentUserId
          ? res.data.find((s) => s.actorId === currentUserId)
          : undefined;
        if (mySnap) {
          setSelectionMode('my_authored');
          setSelectedSnapshotId(mySnap.id);
        } else if (res.data.length > 0) {
          setSelectionMode('latest_live');
          setSelectedSnapshotId(res.data[0].id);
        }
      } else {
        setError(res.error?.message || t`Impossible de charger les versions.`);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [open, articleId, currentUserId]);

  const myAuthoredSnapshot = useMemo(() => {
    if (!snapshots || !currentUserId) return null;
    return snapshots.find((s) => s.actorId === currentUserId) ?? null;
  }, [snapshots, currentUserId]);

  const chosenSnapshot = useMemo(() => {
    if (!snapshots || snapshots.length === 0) return null;
    if (selectionMode === 'my_authored' && myAuthoredSnapshot) {
      return myAuthoredSnapshot;
    }
    if (selectionMode === 'specific' && selectedSnapshotId) {
      return snapshots.find((s) => s.id === selectedSnapshotId) ?? snapshots[0];
    }
    return snapshots[0];
  }, [snapshots, selectionMode, selectedSnapshotId, myAuthoredSnapshot]);

  const cleanChosenText = useMemo(() => {
    return htmlToReadableText(chosenSnapshot?.content || '');
  }, [chosenSnapshot]);

  const cleanLiveText = useMemo(() => {
    return htmlToReadableText(currentLiveContent || '');
  }, [currentLiveContent]);

  const diffResult = useMemo(() => {
    if (!cleanLiveText || !cleanChosenText || cleanLiveText === cleanChosenText) {
      return null;
    }
    return diffWords(cleanLiveText, cleanChosenText);
  }, [cleanLiveText, cleanChosenText]);

  const handleConfirm = async () => {
    setSubmitting(true);
    const snapIdToPass =
      selectionMode === 'my_authored' && myAuthoredSnapshot
        ? myAuthoredSnapshot.id
        : selectionMode === 'specific' && selectedSnapshotId
          ? selectedSnapshotId
          : undefined;

    const res = await forkArticleToPersonalAction({
      articleId,
      snapshotId: snapIdToPass,
    });
    setSubmitting(false);

    if (res.ok) {
      toast.success(t`Exemplaire importé avec succès dans votre espace personnel.`);
      onClose();
      window.location.href = `/articles/${res.data.id}`;
    } else {
      toast.error(res.error?.message || t`Échec de l'importation`);
    }
  };

  if (!open) return null;

  return (
    <Dialog open={open} size="lg" onOpenChange={(next) => !next && onClose()}>
      <DialogContent overlayClassName="z-[100] items-start pt-[6vh]">
        <DialogHeader className="border-b border-border/50 pb-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <GitFork className="h-5 w-5" />
            </span>
            <div>
              <DialogTitle className="text-base font-semibold">
                {t`Importer dans mon espace personnel`}
              </DialogTitle>
              <DialogDescription className="mt-1 text-xs text-muted-foreground leading-relaxed">
                {publisherName
                  ? t`Cet essai a été écrit pour ${publisherName}. Vous pouvez créer un exemplaire personnel éditable en toute indépendance.`
                  : t`Créez un exemplaire personnel éditable pour continuer à travailler en toute indépendance.`}
              </DialogDescription>
            </div>
          </div>

          <div className="mt-3">
            <Tabs
              selectedKey={activeTab}
              onSelectionChange={(val) => setActiveTab(val as 'options' | 'preview')}
            >
              <TabList>
                <Tab id="options" className="text-xs">
                  {t`Choix de la version`}
                </Tab>
                <Tab id="preview" className="text-xs">
                  {t`Aperçu du texte`}
                </Tab>
              </TabList>
            </Tabs>
          </div>
        </DialogHeader>

        <DialogBody className="max-h-[60vh] py-3">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-12 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              {t`Recherche des versions disponibles…`}
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/25 bg-destructive/10 p-3 text-xs text-destructive-text">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!loading && !error && activeTab === 'options' && (
            <div className="space-y-3">
              <RadioGroup
                value={selectionMode}
                onChange={(val) => {
                  const mode = val as 'my_authored' | 'latest_live' | 'specific';
                  setSelectionMode(mode);
                  if (mode === 'my_authored' && myAuthoredSnapshot) {
                    setSelectedSnapshotId(myAuthoredSnapshot.id);
                  } else if (mode === 'latest_live' && snapshots && snapshots.length > 0) {
                    setSelectedSnapshotId(snapshots[0].id);
                  }
                }}
              >
                {myAuthoredSnapshot && (
                  <RadioCard
                    value="my_authored"
                    title={
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-foreground">
                          {t`Votre dernière version rédigée`}
                        </span>
                        <Badge variant="outline" size="sm" className="text-[10px]">
                          {reasonLabel(myAuthoredSnapshot.reason)}
                        </Badge>
                      </div>
                    }
                    description={
                      <div>
                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                          {t`Préserve votre texte exact tel que vous l'aviez laissé (${myAuthoredSnapshot.wordCount} mots), sans modifications éditoriales tierces.`}
                        </p>
                        <time className="mt-1 block text-[10px] text-muted-foreground/80">
                          {new Date(myAuthoredSnapshot.createdAt).toLocaleString()}
                        </time>
                      </div>
                    }
                  />
                )}

                <RadioCard
                  value="latest_live"
                  title={
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-foreground">
                        {t`Dernière version publiée / collective`}
                      </span>
                      <Badge variant="soft" size="sm" className="text-[10px]">
                        {t`Actuelle`}
                      </Badge>
                    </div>
                  }
                  description={
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      {t`Repart de l'état actuel de l'article chez le média, intégrant toutes les relectures et corrections collectives.`}
                    </p>
                  }
                />
              </RadioGroup>

              {snapshots && snapshots.length > 1 && (
                <div className="pt-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectionMode('specific')}
                    className="flex w-full items-center justify-between text-xs font-medium text-primary hover:underline px-0 pb-2 h-auto"
                  >
                    <span>{t`Choisir une version spécifique dans l'historique…`}</span>
                    <History className="h-3.5 w-3.5" />
                  </Button>

                  {selectionMode === 'specific' && (
                    <div className="mt-2 space-y-2 rounded-xl border border-border/60 bg-muted/20 p-2 max-h-48 overflow-y-auto">
                      {snapshots.map((s) => (
                        <div
                          key={s.id}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              setSelectedSnapshotId(s.id);
                            }
                          }}
                          onClick={() => setSelectedSnapshotId(s.id)}
                          className={`flex cursor-pointer items-center justify-between gap-2 rounded-lg p-2 text-xs transition-colors ${
                            selectedSnapshotId === s.id
                              ? 'bg-primary/10 text-primary font-medium'
                              : 'hover:bg-muted/50 text-foreground'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="truncate">{s.title || articleTitle}</span>
                            <Badge variant="outline" size="sm" className="text-[9px]">
                              {reasonLabel(s.reason)}
                            </Badge>
                          </div>
                          <div className="shrink-0 text-right text-[10px] text-muted-foreground">
                            <div>
                              {s.wordCount} {t`mots`}
                            </div>
                            <div>{new Date(s.createdAt).toLocaleDateString()}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {!loading && !error && activeTab === 'preview' && chosenSnapshot && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2 text-xs">
                <div>
                  <span className="font-semibold text-foreground">
                    {chosenSnapshot.title || articleTitle}
                  </span>
                  <div className="text-[11px] text-muted-foreground">
                    {reasonLabel(chosenSnapshot.reason)} • {chosenSnapshot.wordCount} {t`mots`}
                    {chosenSnapshot.actorName ? ` • par ${chosenSnapshot.actorName}` : ''}
                  </div>
                </div>
                <time className="text-[10px] text-muted-foreground">
                  {new Date(chosenSnapshot.createdAt).toLocaleString()}
                </time>
              </div>

              {diffResult ? (
                <div className="rounded-lg border border-border/60 bg-muted/10 p-3 text-xs leading-relaxed max-h-72 overflow-y-auto">
                  <div className="mb-2 text-[11px] font-medium text-muted-foreground">
                    {t`Différences par rapport à la version en ligne :`}
                  </div>
                  <div className="whitespace-pre-wrap font-sans">
                    {diffResult.map((part: Change, i: number) => {
                      if (part.added) {
                        return (
                          <span
                            key={i}
                            className="bg-success/20 text-success-text px-0.5 rounded font-medium"
                          >
                            {part.value}
                          </span>
                        );
                      }
                      if (part.removed) {
                        return (
                          <span
                            key={i}
                            className="bg-destructive/20 text-destructive-text line-through px-0.5 rounded opacity-70"
                          >
                            {part.value}
                          </span>
                        );
                      }
                      return <span key={i}>{part.value}</span>;
                    })}
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-border/60 bg-muted/10 p-3 text-xs leading-relaxed max-h-72 overflow-y-auto whitespace-pre-wrap font-sans text-muted-foreground">
                  {cleanChosenText || t`(Texte vide)`}
                </div>
              )}
            </div>
          )}
        </DialogBody>

        <DialogFooter className="border-t border-border/50 pt-3">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={submitting}>
            {t`Annuler`}
          </Button>
          <Button
            variant="solid"
            tone="brand"
            size="sm"
            onClick={handleConfirm}
            disabled={submitting || loading}
          >
            {submitting ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                {t`Importation…`}
              </>
            ) : (
              <>
                <GitFork className="mr-1.5 h-3.5 w-3.5" />
                {t`Importer dans mes brouillons`}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { RecoverArticle as RecoverArticleModal };
