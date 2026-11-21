'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, Loader2 } from 'lucide-react';
import { t } from '@lingui/core/macro';
import { Input } from '@qoe/ui/input';
import { toast } from '@qoe/ui/toast';
import { ImageEditorDialog } from '@qoe/ui/ui/ImageEditorDialog';
import type { QuotedArticleData } from '@qoe/ui/social';
import type { ThoughtData } from '@/components/social/ThoughtCard';

import { parseImageUrls } from './composer-upload';
import { LOCAL_THREAD_DRAFT_KEY, parseStoredThreadNodes } from './composer-drafts';
import { CHAR_LIMIT, calculateCharacters, isThreadPublishable } from './composer/composer-text';
import { buildThoughtsPayload, toComposedPost } from './composer/composer-submit';
import { useThoughtTypeahead } from './composer/useThoughtTypeahead';
import { useComposerImages } from './composer/useComposerImages';
import { ReplyContextHeader } from './composer/ReplyContextHeader';
import { ThreadNodesList } from './composer/ThreadNodesList';
import { ImageAttachmentsGrid } from './composer/ImageAttachmentsGrid';
import { PollEditorPanel } from './composer/PollEditorPanel';
import { ComposerToolbar } from './composer/ComposerToolbar';
import { DraftsSheet } from './composer/DraftsSheet';
import { ImageCropOverlay } from './composer/ImageCropOverlay';
import {
  THOUGHT_IMAGE_PRESETS,
  createEmptyThreadNode,
  generateComposerUuid,
  type ThreadNode,
  type ThoughtComposerProps,
  type ThoughtDraft,
} from './composer/types';

export type { DbUser, ComposedPost, ThreadNode } from './composer/types';

export function ThoughtComposer({
  dbUser,
  tagsList,
  quotedThought: initialQuotedThought = null,
  replyToThought: initialReplyToThought = null,
  quotedArticle: initialQuotedArticle = null,
  quotedExcerpt: initialQuotedExcerpt = null,
  parentId = null,
  initialText = '',
  placeholder,
  onPostCreated,
  onLoginRequired,
}: ThoughtComposerProps) {
  const [quotedThought, setQuotedThought] = useState<ThoughtData | null>(initialQuotedThought);
  const [replyToThought, setReplyToThought] = useState<ThoughtData | null>(initialReplyToThought);
  const [quotedArticle, setQuotedArticle] = useState<QuotedArticleData | null>(
    initialQuotedArticle
  );
  const [quotedExcerpt, setQuotedExcerpt] = useState<string | null>(initialQuotedExcerpt);

  const [isComposerExpanded, setIsComposerExpanded] = useState<boolean>(false);
  const [postText, setPostText] = useState<string>('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitProgress, setSubmitProgress] = useState<string | null>(null);

  const [loadedDraftId, setLoadedDraftId] = useState<string | null>(null);
  const [isDraftsOpen, setIsDraftsOpen] = useState(false);
  const [drafts, setDrafts] = useState<ThoughtDraft[]>([]);
  const [loadingDrafts, setLoadingDrafts] = useState(false);

  const [showVisibilityDropdown, setShowVisibilityDropdown] = useState<boolean>(false);
  const [showReplyRestrictionDropdown, setShowReplyRestrictionDropdown] = useState<boolean>(false);
  const [showScheduleDropdown, setShowScheduleDropdown] = useState<boolean>(false);
  const [showWarningDropdown, setShowWarningDropdown] = useState<boolean>(false);
  const [showDraftPopover, setShowDraftPopover] = useState<boolean>(false);
  const [overflowStyle, setOverflowStyle] = useState<'hidden' | 'visible'>('hidden');

  const [visibility, setVisibility] = useState<string>('public');
  const [replyRestriction, setReplyRestriction] = useState<string>('everyone');
  const [isScheduled, setIsScheduled] = useState<boolean>(false);
  const [scheduledDate, setScheduledDate] = useState<Date | undefined>(undefined);
  const [isTriggerWarning, setIsTriggerWarning] = useState<boolean>(false);
  const [triggerWarning, setTriggerWarning] = useState<string>('');
  const [isDraft, setIsDraft] = useState<boolean>(false);

  const [showPollEditor, setShowPollEditor] = useState<boolean>(false);
  const [pollOptions, setPollOptions] = useState<string[]>(['', '']);
  const [pollDurationHours, setPollDurationHours] = useState<number>(24);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [threadNodes, setThreadNodes] = useState<ThreadNode[]>([]);
  const [activeNodeIndex, setActiveNodeIndex] = useState<number>(0);
  const isSwitchingRef = useRef<boolean>(false);

  const {
    images,
    setImages,
    replaceInputRef,
    croppingImage,
    setCroppingImage,
    pendingImport,
    handleImportApply,
    cancelPendingImport,
    handlePostImageUpload,
    handlePaste,
    handleReplaceImage,
    moveImage,
    updateImageAlt,
    removeImage,
    applyCroppedImage,
    startReplaceImage,
  } = useComposerImages(() => setSubmitError(null));

  const snapshotActiveNode = (node: ThreadNode): ThreadNode => ({
    id: node.id,
    text: postText,
    images,
    isTriggerWarning,
    triggerWarning,
    showPollEditor,
    pollOptions,
    pollDurationHours,
  });

  const applyNodeToBuffers = (node: ThreadNode) => {
    isSwitchingRef.current = true;
    setPostText(node.text);
    setImages(node.images);
    setIsTriggerWarning(node.isTriggerWarning);
    setTriggerWarning(node.triggerWarning);
    setShowPollEditor(node.showPollEditor);
    setPollOptions(node.pollOptions);
    setPollDurationHours(node.pollDurationHours);
    setTimeout(() => {
      isSwitchingRef.current = false;
    }, 50);
  };

  useEffect(() => {
    setQuotedThought(initialQuotedThought);
    setReplyToThought(initialReplyToThought);
    setQuotedArticle(initialQuotedArticle);
    setQuotedExcerpt(initialQuotedExcerpt);
    if (initialText) {
      setPostText(initialText);
      setIsComposerExpanded(true);
    }
    if (initialReplyToThought || initialQuotedThought || initialQuotedArticle) {
      setIsComposerExpanded(true);
    }

    setThreadNodes((prev) => {
      if (prev.length > 0 && (prev[0].text !== '' || prev.length > 1)) return prev;
      return [createEmptyThreadNode(initialText || '')];
    });
    setActiveNodeIndex(0);
  }, [
    initialQuotedThought,
    initialReplyToThought,
    initialQuotedArticle,
    initialQuotedExcerpt,
    initialText,
  ]);

  // Synchronise le buffer actif vers threadNodes en continu.
  useEffect(() => {
    if (isSwitchingRef.current) return;
    setThreadNodes((prev) => {
      if (prev.length === 0 || !prev[activeNodeIndex]) return prev;
      const copy = [...prev];
      copy[activeNodeIndex] = {
        ...copy[activeNodeIndex],
        text: postText,
        images,
        isTriggerWarning,
        triggerWarning,
        showPollEditor,
        pollOptions,
        pollDurationHours,
      };
      return copy;
    });
  }, [
    postText,
    images,
    isTriggerWarning,
    triggerWarning,
    showPollEditor,
    pollOptions,
    pollDurationHours,
    activeNodeIndex,
  ]);

  // Sauvegarde automatique des brouillons locaux de fils.
  useEffect(() => {
    if (threadNodes.length <= 1 && !postText.trim() && images.length === 0) {
      return;
    }
    const timer = setTimeout(() => {
      const finalNodes = [...threadNodes];
      if (finalNodes[activeNodeIndex]) {
        finalNodes[activeNodeIndex] = {
          id: threadNodes[activeNodeIndex].id,
          text: postText,
          images,
          isTriggerWarning,
          triggerWarning,
          showPollEditor,
          pollOptions,
          pollDurationHours,
        };
      }
      localStorage.setItem(LOCAL_THREAD_DRAFT_KEY, JSON.stringify(finalNodes));
    }, 1000);

    return () => clearTimeout(timer);
  }, [
    postText,
    images,
    isTriggerWarning,
    triggerWarning,
    showPollEditor,
    pollOptions,
    pollDurationHours,
    activeNodeIndex,
    threadNodes,
  ]);

  const {
    mentionSuggestions,
    mentionSelectedIndex,
    checkMentionTrigger,
    insertMention,
    clearMention,
    moveSelection,
  } = useThoughtTypeahead({
    tagsList,
    postText,
    onInsertText: (newText, newCursor) => {
      setPostText(newText);
      localStorage.setItem('qoe_thought_draft', newText);
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(newCursor, newCursor);
        }
      }, 10);
    },
  });

  // Charge le brouillon local au montage si l'utilisateur est connecté.
  useEffect(() => {
    if (!dbUser) return;
    const saved =
      localStorage.getItem('qoe_thought_draft') || localStorage.getItem('qoe_micro_post_draft');
    if (saved) {
      setPostText(saved);
      setIsComposerExpanded(true);
    }
  }, [dbUser]);

  // Ajuste automatiquement la hauteur du champ de saisie.
  useEffect(() => {
    if (textareaRef.current && isComposerExpanded) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [postText, isComposerExpanded]);

  const loadDrafts = useCallback(async () => {
    setLoadingDrafts(true);
    try {
      const { getUserDraftsAction } = await import('@qoe/sdk/actions/feed');
      const res = await getUserDraftsAction();
      setDrafts(res.ok && res.data?.drafts ? res.data.drafts : []);
    } catch (err) {
      console.error(err);
      toast.error(t`Erreur lors de la récupération des brouillons.`);
    } finally {
      setLoadingDrafts(false);
    }
  }, []);

  useEffect(() => {
    if (isDraftsOpen) {
      void loadDrafts();
    }
  }, [isDraftsOpen, loadDrafts]);

  const addThreadNode = () => {
    const currentNodes = [...threadNodes];
    if (currentNodes[activeNodeIndex]) {
      currentNodes[activeNodeIndex] = snapshotActiveNode(currentNodes[activeNodeIndex]);
    }
    const nextNodes = [...currentNodes, createEmptyThreadNode()];
    setThreadNodes(nextNodes);
    applyNodeToBuffers(createEmptyThreadNode());
    setActiveNodeIndex(nextNodes.length - 1);
    toast.success(t`Nouvelle pensée ajoutée au fil.`);
  };

  const removeThreadNode = (nodeId: string) => {
    if (threadNodes.length <= 1) return;

    const indexToRemove = threadNodes.findIndex((n) => n.id === nodeId);
    if (indexToRemove === -1) return;

    const targetNode = threadNodes[indexToRemove];
    if (
      (targetNode.text.trim().length > 0 || targetNode.images.length > 0) &&
      indexToRemove === activeNodeIndex
    ) {
      if (!confirm(t`Voulez-vous vraiment supprimer cette pensée et son contenu ?`)) {
        return;
      }
    }

    const nextNodes = threadNodes.filter((n) => n.id !== nodeId);
    let nextIndex = activeNodeIndex;
    if (activeNodeIndex === indexToRemove) {
      nextIndex = Math.max(0, indexToRemove - 1);
    } else if (activeNodeIndex > indexToRemove) {
      nextIndex = activeNodeIndex - 1;
    }

    applyNodeToBuffers(nextNodes[nextIndex]);
    setThreadNodes(nextNodes);
    setActiveNodeIndex(nextIndex);
    toast.success(t`Pensée retirée du fil.`);
  };

  const handleSwitchNode = (targetIndex: number) => {
    if (targetIndex === activeNodeIndex) return;
    const copy = [...threadNodes];
    if (copy[activeNodeIndex]) {
      copy[activeNodeIndex] = snapshotActiveNode(copy[activeNodeIndex]);
    }
    const targetNode = copy[targetIndex];
    setThreadNodes(copy);
    if (targetNode) {
      applyNodeToBuffers(targetNode);
    }
    setActiveNodeIndex(targetIndex);
  };

  const handleLoadLocalThreadDraft = () => {
    const parsed = parseStoredThreadNodes(localStorage.getItem(LOCAL_THREAD_DRAFT_KEY));
    if (!parsed) {
      toast.error(t`Impossible de restaurer le fil.`);
      setIsDraftsOpen(false);
      return;
    }
    setThreadNodes(parsed);
    applyNodeToBuffers(parsed[0]);
    setActiveNodeIndex(0);
    setIsComposerExpanded(true);
    setIsDraftsOpen(false);
    toast.success(t`Fil de discussion restauré avec succès !`);
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (!dbUser) {
      onLoginRequired?.();
      return;
    }
    const val = e.target.value;
    setPostText(val);
    localStorage.setItem('qoe_thought_draft', val);
    if (val.trim()) {
      setIsComposerExpanded(true);
    }
    checkMentionTrigger(val, e.target.selectionStart || val.length);
  };

  const handleLoadDraft = (draft: ThoughtDraft) => {
    setPostText(draft.content || '');
    setImages(
      parseImageUrls(draft.imageUrl).map((url) => ({
        id: generateComposerUuid(),
        url,
        isUploading: false,
      }))
    );
    setVisibility(draft.visibility || 'public');
    setIsScheduled(!!draft.scheduledAt);
    setScheduledDate(draft.scheduledAt ? new Date(draft.scheduledAt) : undefined);
    setIsTriggerWarning(!!draft.triggerWarning);
    setTriggerWarning(draft.triggerWarning || '');
    setLoadedDraftId(draft.id);
    setIsComposerExpanded(true);
    setIsDraftsOpen(false);
    localStorage.setItem('qoe_micro_post_draft', draft.content || '');
    toast.success(t`Brouillon chargé dans l'éditeur.`);
  };

  const handleDeleteDraft = async (draftId: string) => {
    setDrafts((prev) => prev.filter((d) => d.id !== draftId));
    if (loadedDraftId === draftId) {
      setLoadedDraftId(null);
    }
    try {
      const { deletePostAction } = await import('@qoe/sdk/actions/feed');
      const res = await deletePostAction(draftId);
      if (res.ok) {
        toast.success(t`Brouillon supprimé.`);
      } else {
        toast.error('Impossible de supprimer le brouillon.');
        void loadDrafts();
      }
    } catch (err) {
      console.error(err);
      toast.error(t`Erreur réseau lors de la suppression.`);
      void loadDrafts();
    }
  };

  const resetFormAfterPublishOrEscape = (resetQuotesAndDrafts: boolean) => {
    setPostText('');
    setImages([]);
    if (resetQuotesAndDrafts) {
      setQuotedThought(null);
      setQuotedArticle(null);
      setQuotedExcerpt(null);
      setShowPollEditor(false);
      setPollOptions(['', '']);
      localStorage.removeItem(LOCAL_THREAD_DRAFT_KEY);
      localStorage.removeItem('qoe_thought_draft');
      setThreadNodes([createEmptyThreadNode()]);
      setActiveNodeIndex(0);
    } else {
      clearMention();
    }
    setVisibility('public');
    setIsScheduled(false);
    setScheduledDate(undefined);
    setIsTriggerWarning(false);
    setTriggerWarning('');
    setIsDraft(false);
    setShowVisibilityDropdown(false);
    setShowScheduleDropdown(false);
    setShowWarningDropdown(false);
    setOverflowStyle('hidden');
    setIsComposerExpanded(false);
    localStorage.removeItem('qoe_micro_post_draft');
  };

  const handlePostSubmit = async (e: React.FormEvent, forceDraft?: boolean) => {
    e.preventDefault();

    const finalNodes = [...threadNodes];
    if (finalNodes[activeNodeIndex]) {
      finalNodes[activeNodeIndex] = snapshotActiveNode(finalNodes[activeNodeIndex]);
    }

    const isDraftSubmit = forceDraft !== undefined ? forceDraft : isDraft;
    const hasContent = finalNodes.some((n) => n.text.trim().length > 0 || n.images.length > 0);
    if (!hasContent || !dbUser || isSubmitting) return;

    setSubmitError(null);
    setIsSubmitting(true);
    setSubmitProgress(t`Préparation de la publication du fil...`);

    try {
      const { createThoughtThreadAction, deletePostAction } = await import('@qoe/sdk/actions/feed');
      const thoughtsPayload = await buildThoughtsPayload(
        finalNodes,
        quotedArticle?.id || null,
        quotedExcerpt?.trim() || null,
        setSubmitProgress
      );

      setSubmitProgress(
        isDraftSubmit
          ? 'Enregistrement du brouillon de fil...'
          : 'Publisher de votre fil de discussion...'
      );

      const res = await createThoughtThreadAction({
        thoughts: thoughtsPayload,
        visibility,
        isDraft: isDraftSubmit,
        scheduledAt: isScheduled && scheduledDate ? scheduledDate.toISOString() : null,
        replyRestriction,
        parentId: replyToThought?.id || parentId || null,
      });

      if (!res.ok) {
        throw new Error(res.error?.message || 'Impossible de publier le fil de discussion.');
      }
      if (!res.data?.posts || res.data.posts.length === 0) {
        throw new Error(t`Impossible de publier le fil (données de publication manquantes).`);
      }

      finalNodes.forEach((node) =>
        node.images.forEach((img) => {
          if (img.url.startsWith('blob:')) URL.revokeObjectURL(img.url);
        })
      );

      if (loadedDraftId) {
        try {
          await deletePostAction(loadedDraftId);
        } catch (err) {
          console.error('Failed to delete original draft post after publishing:', err);
        }
        setLoadedDraftId(null);
      }

      const isFuture = isScheduled && scheduledDate && scheduledDate > new Date();
      if (!isDraftSubmit && !isFuture && onPostCreated) {
        onPostCreated(toComposedPost(res.data.posts[0], quotedExcerpt, quotedArticle));
      }

      toast.success(
        isDraftSubmit ? t`Brouillon de fil enregistré.` : t`Fil de discussion publié !`
      );
      resetFormAfterPublishOrEscape(true);
    } catch (err: unknown) {
      console.error(err);
      const message =
        err instanceof Error ? err.message : t`Erreur de publication du fil. Veuillez réessayer.`;
      setSubmitError(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
      setSubmitProgress(null);
    }
  };

  const currentLength = calculateCharacters(postText);
  const isOverLimit = currentLength > CHAR_LIMIT;
  const charsRemaining = CHAR_LIMIT - currentLength;
  const isPublishable = isThreadPublishable(postText, images, threadNodes, activeNodeIndex);
  const defaultPlaceholder =
    placeholder ||
    (replyToThought || parentId ? t`Poster votre réponse` : t`Quelle est votre pensée du jour ?`);

  return (
    <div className="pb-4 border-b border-border/30 flex flex-col gap-2 font-sans transition-all duration-200">
      {replyToThought && (
        <ReplyContextHeader
          replyToThought={replyToThought}
          onCancel={() => setReplyToThought(null)}
        />
      )}

      <form onSubmit={(e) => handlePostSubmit(e)} className="space-y-4 font-sans">
        <ThreadNodesList
          dbUser={dbUser}
          threadNodes={threadNodes}
          activeNodeIndex={activeNodeIndex}
          postText={postText}
          images={images}
          defaultPlaceholder={defaultPlaceholder}
          isSubmitting={isSubmitting}
          textareaRef={textareaRef}
          mentionSuggestions={mentionSuggestions}
          mentionSelectedIndex={mentionSelectedIndex}
          quotedThought={quotedThought}
          quotedArticle={quotedArticle}
          quotedExcerpt={quotedExcerpt}
          onTextChange={handleTextChange}
          onTextareaFocus={() => {
            if (!dbUser) {
              textareaRef.current?.blur();
              onLoginRequired?.();
              return;
            }
            setIsComposerExpanded(true);
          }}
          onTextareaKeyDown={(e) => {
            if (mentionSuggestions.length > 0) {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                moveSelection(1);
                return;
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                moveSelection(-1);
                return;
              }
              if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
                insertMention(mentionSuggestions[mentionSelectedIndex]);
                return;
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                clearMention();
                return;
              }
            }

            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
              e.preventDefault();
              void handlePostSubmit(e);
            } else if (e.key === 'Escape') {
              resetFormAfterPublishOrEscape(false);
            }
          }}
          onPaste={handlePaste}
          onSelectMention={insertMention}
          onSwitchNode={handleSwitchNode}
          onRemoveNode={removeThreadNode}
          onClearQuotedThought={() => setQuotedThought(null)}
          onClearQuotedArticle={() => {
            setQuotedArticle(null);
            setQuotedExcerpt(null);
          }}
        />

        <AnimatePresence>
          {(isComposerExpanded || threadNodes.length > 1) && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              onAnimationStart={() => setOverflowStyle('hidden')}
              onAnimationComplete={() => {
                if (isComposerExpanded || threadNodes.length > 1) setOverflowStyle('visible');
              }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="flex flex-col gap-3.5 mt-2"
              style={{ overflow: overflowStyle }}
            >
              {submitError && (
                <div className="bg-destructive/10 text-destructive-text text-[11px] font-semibold p-3 rounded-lg flex items-center gap-2 border border-destructive/20">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{submitError}</span>
                </div>
              )}

              {submitProgress && (
                <div className="bg-primary/10 text-primary text-[11px] font-semibold p-3 rounded-lg flex items-center gap-2.5 border border-primary/20 animate-pulse">
                  <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" />
                  <span>{submitProgress}</span>
                </div>
              )}

              <ImageAttachmentsGrid
                images={images}
                onMove={moveImage}
                onUpdateAlt={updateImageAlt}
                onCrop={setCroppingImage}
                onReplaceClick={startReplaceImage}
                onRemove={removeImage}
              />

              <Input
                type="file"
                ref={replaceInputRef}
                onChange={handleReplaceImage}
                accept="image/*"
                className="hidden"
              />

              {showPollEditor && (
                <PollEditorPanel
                  pollOptions={pollOptions}
                  pollDurationHours={pollDurationHours}
                  onOptionsChange={setPollOptions}
                  onDurationChange={setPollDurationHours}
                  onClose={() => {
                    setShowPollEditor(false);
                    setPollOptions(['', '']);
                  }}
                />
              )}

              <ComposerToolbar
                postText={postText}
                imagesCount={images.length}
                currentLength={currentLength}
                charsRemaining={charsRemaining}
                isOverLimit={isOverLimit}
                isPublishable={isPublishable}
                isSubmitting={isSubmitting}
                isReply={Boolean(replyToThought || parentId)}
                threadNodesCount={threadNodes.length}
                visibility={visibility}
                onVisibilityChange={setVisibility}
                showVisibilityDropdown={showVisibilityDropdown}
                onShowVisibilityDropdownChange={setShowVisibilityDropdown}
                replyRestriction={replyRestriction}
                onReplyRestrictionChange={setReplyRestriction}
                showReplyRestrictionDropdown={showReplyRestrictionDropdown}
                onShowReplyRestrictionDropdownChange={setShowReplyRestrictionDropdown}
                isScheduled={isScheduled}
                onIsScheduledChange={setIsScheduled}
                scheduledDate={scheduledDate}
                onScheduledDateChange={setScheduledDate}
                showScheduleDropdown={showScheduleDropdown}
                onShowScheduleDropdownChange={setShowScheduleDropdown}
                isTriggerWarning={isTriggerWarning}
                onIsTriggerWarningChange={setIsTriggerWarning}
                triggerWarning={triggerWarning}
                onTriggerWarningChange={setTriggerWarning}
                showWarningDropdown={showWarningDropdown}
                onShowWarningDropdownChange={setShowWarningDropdown}
                showPollEditor={showPollEditor}
                onTogglePollEditor={() => {
                  setShowPollEditor(!showPollEditor);
                  if (!showPollEditor && pollOptions.length < 2) {
                    setPollOptions(['', '']);
                  }
                }}
                showDraftPopover={showDraftPopover}
                onShowDraftPopoverChange={setShowDraftPopover}
                onOpenDrafts={() => setIsDraftsOpen(true)}
                onSaveDraft={(e) => void handlePostSubmit(e, true)}
                onImageUpload={handlePostImageUpload}
                onAddThreadNode={addThreadNode}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </form>

      <DraftsSheet
        open={isDraftsOpen}
        onOpenChange={setIsDraftsOpen}
        drafts={drafts}
        loadingDrafts={loadingDrafts}
        onClearLocalThreadDraft={() => {
          localStorage.removeItem(LOCAL_THREAD_DRAFT_KEY);
          toast.success(t`Brouillon local supprimé.`);
          setThreadNodes([createEmptyThreadNode()]);
        }}
        onRestoreLocalThreadDraft={handleLoadLocalThreadDraft}
        onLoadDraft={handleLoadDraft}
        onDeleteDraft={(draftId) => void handleDeleteDraft(draftId)}
      />

      <AnimatePresence>
        {croppingImage && (
          <ImageCropOverlay
            image={croppingImage}
            onClose={() => setCroppingImage(null)}
            onConfirm={(croppedUrl, croppedFile) =>
              applyCroppedImage(croppingImage.id, croppedUrl, croppedFile)
            }
          />
        )}
      </AnimatePresence>

      {pendingImport && (
        <ImageEditorDialog
          open
          onOpenChange={(open) => {
            if (!open) cancelPendingImport();
          }}
          src={pendingImport.src}
          fileName={pendingImport.files[pendingImport.index]?.name}
          presets={THOUGHT_IMAGE_PRESETS}
          initialPresetId="thought-4-3"
          title={t`Recadrer l’image`}
          description={t`Choisissez le format, ajustez le cadrage et vérifiez l’aperçu avant de confirmer.`}
          onApply={handleImportApply}
        />
      )}
    </div>
  );
}
