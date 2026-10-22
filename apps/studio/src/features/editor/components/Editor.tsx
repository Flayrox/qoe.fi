'use client';

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Image from '@tiptap/extension-image';
import Collaboration from '@tiptap/extension-collaboration';
import { CollaborationCaret } from '@tiptap/extension-collaboration-caret';
import { TextSelection } from '@tiptap/pm/state';
import {
  setArticleAllowDownloadAction,
  unpublishArticleAction,
  scheduleArticleAction,
} from '@qoe/sdk/actions/articles';
import { toast } from '@qoe/ui/toast';
import { useAutoSaveArticle, type AutoSavePayload } from '@qoe/sdk';
import type { EditorCapabilities } from '@qoe/sdk/actions/articles';
import { t } from '@lingui/core/macro';
import { ArticleInspectorModal } from '@/app/(creator)/analytics/components/ArticleInspectorModal';
import { compressImage } from '@/lib/image-compressor';
import { uploadImageToRoute, IMAGE_FOLDERS } from '@qoe/supabase/storage';
import { PaywallDivider } from '../extensions/PaywallDivider';
import { AnnotationMark } from '../extensions/AnnotationMark';
import { ImageGallery, GalleryImage } from '../extensions/ImageGallery';
import { useCollaborationSession } from '../hooks/useCollaborationSession';
import { computePayloadHash } from '../lib/payload-hash';
import {
  currentTimeZoneLabel,
  parseDateTimeLocalValue,
  toDateTimeLocalValue,
} from '../lib/datetime';
import type { ArticleAttributionDraft } from './ArticleAttributionEditor';
import { EditorHeader } from './EditorHeader';
import { EditorToolbar } from './EditorToolbar';
import { buildPublicExcerpt } from '@qoe/utils';
import { ContentVisibility } from '@qoe/config';
import { EditorSettingsDrawer } from './EditorSettingsDrawer';
import { CoverUploader } from './CoverUploader';
import { AnnotationPopover } from './AnnotationPopover';
import { PublishModal, type PublishOptions } from './PublishModal';

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message) return message;
  }
  return fallback;
}

const EMPTY_ATTRIBUTIONS: ArticleAttributionDraft[] = [];

export interface EditorProps {
  initialTitle?: string;
  initialSlug?: string;
  initialContent?: string;
  initialImageUrl?: string | null;
  initialPublished?: boolean;
  initialScheduledAt?: string | null;
  initialStatus?: string;
  initialIsPremium?: boolean;
  initialCategoryId?: string | null;
  initialSeoTitle?: string | null;
  initialSeoDescription?: string | null;
  initialAllowPublicAnnotations?: boolean;
  initialAllowComments?: boolean;
  initialAllowDownload?: boolean;
  initialAttributions?: ArticleAttributionDraft[];
  collaborationRoomId?: string;
  collaborationEnabled?: boolean;
  subdomain?: string;
  categories?: { id: string; name: string; parentId?: string | null; slug?: string }[];
  isSaving?: boolean;
  capabilities?: EditorCapabilities;
  onSave: (data: {
    title: string;
    content: string;
    imageUrl: string | null;
    slug: string;
    published: boolean;
    scheduledAt?: string | null;
    status?: string;
    isPremium: boolean;
    categoryId: string | null;
    seoTitle: string | null;
    seoDescription: string | null;
    allowPublicAnnotations?: boolean;
    allowComments?: boolean;
    allowDownload?: boolean;
    attributions?: ArticleAttributionDraft[];
  }) => Promise<{ id?: string } | void>;
  onBack?: () => void;
}

export function Editor({
  initialTitle = '',
  initialSlug = '',
  initialContent = '',
  initialImageUrl = null,
  initialPublished = false,
  initialStatus = 'DRAFT',
  initialScheduledAt = null,
  initialIsPremium = false,
  initialCategoryId = null,
  initialSeoTitle = '',
  initialSeoDescription = '',
  initialAllowPublicAnnotations = true,
  initialAllowComments = true,
  initialAllowDownload = true,
  initialAttributions = EMPTY_ATTRIBUTIONS,
  collaborationRoomId,
  collaborationEnabled = true,
  subdomain,
  categories = [],
  isSaving = false,
  capabilities,
  onSave,
  onBack,
}: EditorProps) {
  const [title, setTitle] = useState(initialTitle);
  const [slug, setSlug] = useState(initialSlug);
  const [imageUrl, setImageUrl] = useState<string | null>(initialImageUrl);
  const [published, setPublished] = useState(initialPublished);
  const [status, setStatus] = useState<string>(initialStatus || 'DRAFT');
  const [scheduledAt, setScheduledAt] = useState<string | null>(initialScheduledAt ?? null);
  const [scheduleDraft, setScheduleDraft] = useState('');
  const [isPremium, setIsPremium] = useState(initialIsPremium);
  const [categoryId, setCategoryId] = useState<string | null>(initialCategoryId);
  const [seoTitle, setSeoTitle] = useState(initialSeoTitle || '');
  const [seoDescription, setSeoDescription] = useState(initialSeoDescription || '');
  const [allowPublicAnnotations, setAllowPublicAnnotations] = useState(
    initialAllowPublicAnnotations
  );
  const [allowComments, setAllowComments] = useState(initialAllowComments);
  const [allowDownload, setAllowDownload] = useState(initialAllowDownload);
  const [downloadSaving, setDownloadSaving] = useState(false);
  const [attributions, setAttributions] = useState<ArticleAttributionDraft[]>(initialAttributions);

  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadCount, setUploadCount] = useState(0);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const [showSettings, setShowSettings] = useState(false);
  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
  const [showAnalyticsModal, setShowAnalyticsModal] = useState(false);
  const [showAuthorAnnotationModal, setShowAuthorAnnotationModal] = useState(false);
  const [authorNoteInput, setAuthorNoteInput] = useState('');
  const [selectedQuoteForAnnotation, setSelectedQuoteForAnnotation] = useState('');
  const [annotationToast, setAnnotationToast] = useState<string | null>(null);
  const [popoverPosition, setPopoverPosition] = useState<{ top: number; left: number } | null>(
    null
  );
  const [isDocked, setIsDocked] = useState(false);
  const lastSavedHashRef = useRef<string>('');
  const persistedIdRef = useRef<string | undefined>(collaborationRoomId);

  const bodyImageInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const toolbarSentinelRef = useRef<HTMLDivElement>(null);
  const openAnnotationPopoverRef = useRef<(text?: string, existingNote?: string) => void>(() => {});

  const timeZoneLabel = useMemo(() => currentTimeZoneLabel(), []);

  const {
    collaborationDoc,
    collaborationProvider,
    collabUser,
    peerCount,
    connected: collaborationConnected,
  } = useCollaborationSession({
    enabled: collaborationEnabled,
    roomId: collaborationRoomId,
  });

  // Détection de l'amarrage de la barre d'outils sous le header (56px).
  useEffect(() => {
    const sentinel = toolbarSentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(([entry]) => setIsDocked(!entry.isIntersecting), {
      rootMargin: '-56px 0px 0px 0px',
      threshold: 0,
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  // ─── Refs d'état frais pour l'auto-save ────────────────────────────────
  const editorStateRef = useRef({
    title,
    slug,
    published,
    status,
    scheduledAt,
    isPremium,
    categoryId,
    seoTitle,
    seoDescription,
    imageUrl,
    allowPublicAnnotations,
    allowComments,
    allowDownload,
    attributions,
  });
  editorStateRef.current = {
    title,
    slug,
    published,
    status,
    scheduledAt,
    isPremium,
    categoryId,
    seoTitle,
    seoDescription,
    imageUrl,
    allowPublicAnnotations,
    allowComments,
    allowDownload,
    attributions,
  };
  const scheduleAutoSaveRef = useRef<(p: AutoSavePayload) => void>(() => {});

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      PaywallDivider,
      AnnotationMark,
      Image.configure({
        HTMLAttributes: {
          class: 'rounded-2xl border border-border/40 my-10 max-w-full h-auto shadow-sm',
        },
      }),
      ImageGallery,
      GalleryImage,
      ...(collaborationDoc
        ? [
            Collaboration.configure({ document: collaborationDoc, field: 'default' }),
            ...(collaborationProvider && collabUser
              ? [
                  CollaborationCaret.configure({
                    provider: collaborationProvider,
                    user: collabUser,
                  }),
                ]
              : []),
          ]
        : []),
    ],
    content: collaborationDoc ? '' : initialContent,
    editorProps: {
      attributes: {
        class:
          'prose prose-zinc dark:prose-invert max-w-none focus:outline-none min-h-[500px] text-foreground text-[17px] leading-relaxed placeholder:text-muted-foreground/40 font-sans',
      },
      handleClick: (view, pos) => {
        const $pos = view.state.doc.resolve(pos);
        const markType = view.state.schema.marks.annotationMark;
        if (!markType) return false;

        let foundMark: { note: string; text: string; from: number; to: number } | null = null;
        $pos.parent.nodesBetween(0, $pos.parent.content.size, (node, offset) => {
          const mark = node.marks.find((m) => m.type === markType);
          if (mark) {
            const abs = $pos.start() + offset;
            if (abs <= $pos.pos && abs + node.nodeSize >= $pos.pos) {
              foundMark = {
                note: (mark.attrs.note as string) || '',
                text: node.text || '',
                from: abs,
                to: abs + node.nodeSize,
              };
            }
          }
        });

        if (foundMark) {
          const { note, text, from, to } = foundMark;
          view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to)));
          openAnnotationPopoverRef.current(text, note);
          return true;
        }
        return false;
      },
      handleKeyDown: (view, event) => {
        if (
          (event.metaKey || event.ctrlKey) &&
          event.shiftKey &&
          (event.key === 'a' || event.key === 'A')
        ) {
          event.preventDefault();
          openAnnotationPopoverRef.current();
          return true;
        }
        return false;
      },
      handleDrop: (view, event) => {
        const files = Array.from(event.dataTransfer?.files ?? []);
        if (files.length > 0) {
          event.preventDefault();
          void uploadFiles(files, files.length > 1 ? 'gallery' : 'single');
          return true;
        }
        return false;
      },
      handlePaste: (_view, event) => {
        const files = Array.from(event.clipboardData?.files ?? []).filter((file) =>
          file.type.startsWith('image/')
        );
        if (files.length > 0) {
          event.preventDefault();
          void uploadFiles(files, files.length > 1 ? 'gallery' : 'single');
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      setHasUnsavedChanges(true);
      const s = editorStateRef.current;
      if (s.title.trim()) {
        scheduleAutoSaveRef.current({
          title: s.title,
          content: currentEditor.getHTML(),
          slug: s.slug,
          published: s.published,
          isPremium: s.isPremium,
          categoryId: s.categoryId,
          seoTitle: s.seoTitle,
          seoDescription: s.seoDescription,
          imageUrl: s.imageUrl,
          allowPublicAnnotations: s.allowPublicAnnotations,
          allowComments: s.allowComments,
          allowDownload: s.allowDownload,
        });
      }
    },
  });

  const uploadFiles = useCallback(
    async (files: File[], mode: 'single' | 'gallery') => {
      if (!editor || files.length === 0) return;
      const images = files.filter((file) => file.type.startsWith('image/'));
      if (images.length !== files.length) {
        setError(t`Certains fichiers ne sont pas des images valides.`);
      }
      if (images.length === 0) return;

      try {
        setIsUploading(true);
        setUploadCount(images.length);
        setError(null);

        const urls: string[] = [];
        for (const file of images) {
          const compressedFile = await compressImage(file);
          const url = await uploadImageToRoute(
            compressedFile,
            '/api/articles/upload',
            IMAGE_FOLDERS.articles
          );
          urls.push(url);
          setUploadCount((count) => Math.max(0, count - 1));
        }

        if (urls.length === 0) return;

        if (mode === 'gallery' || urls.length > 1) {
          editor
            .chain()
            .focus()
            .insertContent({
              type: 'imageGallery',
              content: urls.map((url) => ({
                type: 'galleryImage',
                attrs: { src: url, alt: '' },
              })),
            })
            .run();
        } else {
          editor.chain().focus().setImage({ src: urls[0] }).run();
        }
        setHasUnsavedChanges(true);
      } catch (err: unknown) {
        setError(getErrorMessage(err, t`Échec de l'upload de l'image.`));
      } finally {
        setIsUploading(false);
        setUploadCount(0);
      }
    },
    [editor]
  );

  const uploadImage = useCallback(
    (file: File) => {
      void uploadFiles([file], 'single');
    },
    [uploadFiles]
  );

  // ─── Annotation d'auteur ───────────────────────────────────────────────
  const openAnnotationPopover = useCallback(
    (text?: string, existingNote?: string) => {
      if (!editor) return;
      let quote = text;
      if (quote === undefined) {
        const selection = editor.state.selection;
        quote = editor.state.doc.textBetween(selection.from, selection.to, ' ');
        if (!quote && selection.$from.parent.isTextblock) {
          quote = selection.$from.parent.textBetween(0, selection.$from.parent.content.size, ' ');
        }
      }
      setSelectedQuoteForAnnotation(quote || '');
      setAuthorNoteInput(
        existingNote !== undefined
          ? existingNote
          : editor.getAttributes('annotationMark').note || ''
      );

      const sel = typeof window !== 'undefined' ? window.getSelection() : null;
      if (sel && sel.rangeCount > 0) {
        const rect = sel.getRangeAt(0).getBoundingClientRect();
        if (rect && (rect.top > 0 || rect.bottom > 0)) {
          let top = rect.bottom + 10;
          if (top + 280 > window.innerHeight) {
            top = Math.max(70, rect.top - 270);
          }
          const left = Math.max(
            20,
            Math.min(window.innerWidth - 400, rect.left + rect.width / 2 - 190)
          );
          setPopoverPosition({ top, left });
          setShowAuthorAnnotationModal(true);
          return;
        }
      }

      setPopoverPosition({
        top: 100,
        left: typeof window !== 'undefined' ? Math.max(20, (window.innerWidth - 380) / 2) : 100,
      });
      setShowAuthorAnnotationModal(true);
    },
    [editor]
  );

  useEffect(() => {
    openAnnotationPopoverRef.current = openAnnotationPopover;
  }, [openAnnotationPopover]);

  const handleSaveAnnotation = () => {
    if (!authorNoteInput.trim() || !editor) return;
    editor.chain().focus().setAnnotationMark({ note: authorNoteInput.trim() }).run();
    setHasUnsavedChanges(true);
    setAuthorNoteInput('');
    setShowAuthorAnnotationModal(false);
  };

  const handleDeleteAnnotation = () => {
    if (!editor) return;
    editor.chain().focus().unsetAnnotationMark().run();
    setHasUnsavedChanges(true);
    setAuthorNoteInput('');
    setShowAuthorAnnotationModal(false);
  };

  // ─── Seed du document partagé ──────────────────────────────────────────
  useEffect(() => {
    const provider = collaborationProvider;
    if (!provider || !editor || !collaborationDoc || !initialContent) return;

    let seeded = false;
    const seedOnce = () => {
      if (seeded) return;
      seeded = true;
      if (collaborationDoc.getXmlFragment('default').length === 0) {
        editor.commands.setContent(initialContent);
      }
    };
    provider.on('synced', seedOnce);
    if (provider.isSynced) seedOnce();
    return () => {
      provider.off('synced', seedOnce);
    };
  }, [collaborationProvider, editor, collaborationDoc, initialContent]);

  // Hash initial calculé UNE seule fois : ne dépend plus de l'identité des
  // tableaux de props (l'ancien effet réinitialisait le hash à chaque render).
  const initialHash = useMemo(
    () =>
      computePayloadHash({
        title: initialTitle,
        content: initialContent || '',
        slug: initialSlug,
        published: initialPublished,
        status: initialStatus,
        scheduledAt: initialScheduledAt ?? null,
        isPremium: initialIsPremium,
        categoryId: initialCategoryId,
        seoTitle: initialSeoTitle,
        seoDescription: initialSeoDescription,
        imageUrl: initialImageUrl,
        allowComments: initialAllowComments,
        allowPublicAnnotations: initialAllowPublicAnnotations,
        attributions: initialAttributions,
      }),
    // Volontairement monté une fois : la page d'édition ne change pas d'article
    // sans remonter le composant (navigation Next).
    []
  );
  if (lastSavedHashRef.current === '') {
    lastSavedHashRef.current = initialHash;
  }

  const {
    scheduleAutoSave,
    status: autoSaveStatus,
    errorMessage: autoSaveError,
    saveNow,
  } = useAutoSaveArticle({
    delay: 2500,
    enabled: true,
    onSave: async (payload: AutoSavePayload) => {
      const s = editorStateRef.current;
      const res = (await onSave({
        title: payload.title,
        content: payload.content,
        imageUrl: s.imageUrl,
        slug: payload.slug || s.slug,
        // 🔒 L'auto-save ne publie jamais : le Go isole les modifications
        // dans draftContent dès que published=false, même si status=PUBLISHED.
        published: false,
        scheduledAt: s.scheduledAt,
        status: s.status,
        isPremium: payload.isPremium ?? s.isPremium,
        categoryId: payload.categoryId ?? s.categoryId,
        seoTitle: payload.seoTitle ?? s.seoTitle,
        seoDescription: payload.seoDescription ?? s.seoDescription,
        allowPublicAnnotations: s.allowPublicAnnotations,
        allowComments: s.allowComments,
        allowDownload: s.allowDownload,
        attributions: s.attributions,
      })) as { id?: string } | void;
      if (res?.id) persistedIdRef.current = res.id;
      setLastSaved(new Date());
      setHasUnsavedChanges(false);
      lastSavedHashRef.current = computePayloadHash({
        title: payload.title,
        content: payload.content,
        imageUrl: s.imageUrl,
        slug: payload.slug || s.slug,
        published: s.published,
        scheduledAt: s.scheduledAt,
        status: s.status,
        isPremium: payload.isPremium ?? s.isPremium,
        categoryId: payload.categoryId ?? s.categoryId,
        seoTitle: payload.seoTitle ?? s.seoTitle,
        seoDescription: payload.seoDescription ?? s.seoDescription,
        allowPublicAnnotations: s.allowPublicAnnotations,
        allowComments: s.allowComments,
        allowDownload: s.allowDownload,
        attributions: s.attributions,
      });
      return { id: persistedIdRef.current, updatedAt: new Date() };
    },
  });

  scheduleAutoSaveRef.current = scheduleAutoSave;

  const retryAutoSave = () => {
    const s = editorStateRef.current;
    if (!s.title.trim() || !editor) return;
    saveNow({
      title: s.title,
      content: editor.getHTML(),
      slug: s.slug,
      published: s.published,
      scheduledAt: s.scheduledAt,
      status: s.status,
      isPremium: s.isPremium,
      categoryId: s.categoryId,
      seoTitle: s.seoTitle,
      seoDescription: s.seoDescription,
    });
  };

  // Déclenche l'auto-save sur les changements de métadonnées.
  useEffect(() => {
    if (!editor) return;
    const currentPayload = {
      title,
      content: editor.getHTML(),
      slug,
      published,
      status,
      scheduledAt,
      isPremium,
      categoryId,
      seoTitle,
      seoDescription,
      imageUrl,
      allowComments,
      allowPublicAnnotations,
      attributions,
    };
    const currentHash = computePayloadHash(currentPayload);

    if (currentHash === lastSavedHashRef.current) {
      setHasUnsavedChanges(false);
      return;
    }

    setHasUnsavedChanges(true);
    if (title.trim()) {
      scheduleAutoSave({
        title,
        content: currentPayload.content,
        slug,
        published,
        isPremium,
        categoryId,
        seoTitle,
        seoDescription,
        imageUrl,
        allowPublicAnnotations,
        allowComments,
        allowDownload,
      });
    }
  }, [
    editor,
    title,
    slug,
    categoryId,
    seoTitle,
    seoDescription,
    published,
    status,
    scheduledAt,
    isPremium,
    imageUrl,
    allowPublicAnnotations,
    allowComments,
    attributions,
    scheduleAutoSave,
  ]);

  // Slug auto uniquement tant que l'auteur ne l'a jamais personnalisé.
  useEffect(() => {
    if (!initialSlug && title && !slug) {
      const generated = title
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '');
      setSlug(generated);
    }
  }, [title, initialSlug, slug]);

  const buildSlug = useCallback(() => {
    if (slug) return slug;
    return title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');
  }, [slug, title]);

  const baseSavePayload = useCallback(
    (overrides: {
      published: boolean;
      status: string;
      scheduledAt: string | null;
      isPremium?: boolean;
    }) => ({
      title,
      content: editor?.getHTML() || '',
      imageUrl,
      slug: buildSlug(),
      published: overrides.published,
      status: overrides.status,
      scheduledAt: overrides.scheduledAt,
      isPremium: overrides.isPremium ?? isPremium,
      categoryId,
      seoTitle: seoTitle || null,
      seoDescription: seoDescription || null,
      allowPublicAnnotations,
      allowComments,
      allowDownload,
      attributions,
    }),
    [
      title,
      editor,
      imageUrl,
      buildSlug,
      isPremium,
      categoryId,
      seoTitle,
      seoDescription,
      allowPublicAnnotations,
      allowComments,
      allowDownload,
      attributions,
    ]
  );

  const handleManualSave = useCallback(async () => {
    if (!title.trim()) {
      setError("Le titre de l'article est requis avant d'enregistrer.");
      return;
    }

    try {
      setError(null);
      const finalSlug = buildSlug();
      if (!slug && finalSlug) setSlug(finalSlug);
      // Sur un article publié, « Enregistrer » ne doit pas publier en direct :
      // published=false isole la version de travail dans draftContent.
      const payload = baseSavePayload({ published: false, status, scheduledAt });
      const localPayload = baseSavePayload({ published, status, scheduledAt });
      const res = (await onSave(payload)) as { id?: string } | void;
      if (res?.id) persistedIdRef.current = res.id;
      lastSavedHashRef.current = computePayloadHash(localPayload);
      setLastSaved(new Date());
      setHasUnsavedChanges(false);
    } catch (err: unknown) {
      setError(getErrorMessage(err, t`Échec de la sauvegarde.`));
    }
  }, [title, buildSlug, slug, baseSavePayload, status, scheduledAt, onSave]);

  const handleSubmitForReview = useCallback(() => {
    void (async () => {
      try {
        setError(null);
        const payload = baseSavePayload({
          published: false,
          status: 'SUBMITTED',
          scheduledAt: null,
        });
        const res = (await onSave(payload)) as { id?: string } | void;
        if (res?.id) persistedIdRef.current = res.id;
        setStatus('SUBMITTED');
        setScheduledAt(null);
        setPublished(false);
        lastSavedHashRef.current = computePayloadHash(payload);
        setLastSaved(new Date());
        setHasUnsavedChanges(false);
      } catch (err: unknown) {
        setError(getErrorMessage(err, t`Échec de la soumission.`));
      }
    })();
  }, [baseSavePayload, onSave]);

  const handleConfirmPublish = useCallback(
    async (options: PublishOptions) => {
      const previous = { published, status, scheduledAt, isPremium };
      setIsPremium(options.isPremium);
      setPublished(true);
      setStatus('PUBLISHED');
      setScheduledAt(null);

      try {
        setError(null);
        const payload = baseSavePayload({
          published: true,
          status: 'PUBLISHED',
          scheduledAt: null,
          isPremium: options.isPremium,
        });
        const res = (await onSave(payload)) as { id?: string } | void;
        if (res?.id) persistedIdRef.current = res.id;
        lastSavedHashRef.current = computePayloadHash(payload);
        setLastSaved(new Date());
        setHasUnsavedChanges(false);
      } catch (err: unknown) {
        setError(getErrorMessage(err, t`Échec de la publication.`));
        setPublished(previous.published);
        setStatus(previous.status);
        setScheduledAt(previous.scheduledAt);
        setIsPremium(previous.isPremium);
      }
    },
    [baseSavePayload, onSave, published, status, scheduledAt, isPremium]
  );

  const handleUpdateLive = useCallback(async () => {
    try {
      setError(null);
      const payload = baseSavePayload({ published: true, status: 'PUBLISHED', scheduledAt: null });
      const res = (await onSave(payload)) as { id?: string } | void;
      if (res?.id) persistedIdRef.current = res.id;
      lastSavedHashRef.current = computePayloadHash(payload);
      setLastSaved(new Date());
      setHasUnsavedChanges(false);
    } catch (err: unknown) {
      setError(getErrorMessage(err, t`Échec de la mise à jour.`));
    }
  }, [baseSavePayload, onSave]);

  const handleUnpublish = useCallback(async () => {
    const id = persistedIdRef.current;
    if (!id) {
      setPublished(false);
      setStatus('DRAFT');
      setScheduledAt(null);
      return;
    }
    try {
      setError(null);
      const res = await unpublishArticleAction(id);
      if (!res.ok) throw new Error(res.error.message);
      setPublished(false);
      setStatus('DRAFT');
      setScheduledAt(null);
      lastSavedHashRef.current = computePayloadHash(
        baseSavePayload({ published: false, status: 'DRAFT', scheduledAt: null })
      );
      setLastSaved(new Date());
      setHasUnsavedChanges(false);
      toast.success(t`Article dépublié`);
    } catch (err: unknown) {
      setError(getErrorMessage(err, t`Échec de la dépublication.`));
    }
  }, [baseSavePayload]);

  const handleSchedule = useCallback(async () => {
    const date = parseDateTimeLocalValue(scheduleDraft);
    if (!date) {
      setError(t`Choisissez une date de programmation.`);
      return;
    }
    if (date.getTime() <= Date.now()) {
      setError(t`La date de programmation doit être dans le futur.`);
      return;
    }

    try {
      setError(null);
      let id = persistedIdRef.current;
      if (!id) {
        const res = (await onSave(
          baseSavePayload({ published: false, status, scheduledAt: null })
        )) as { id?: string } | void;
        id = res?.id;
        if (!id) throw new Error(t`Enregistrez d'abord l'article avant de le programmer.`);
        persistedIdRef.current = id;
      }

      const iso = date.toISOString();
      const res = await scheduleArticleAction({ id, scheduledAt: iso });
      if (!res.ok) throw new Error(res.error.message);

      setScheduledAt(iso);
      setStatus('SCHEDULED');
      setPublished(false);
      // Évite qu'un auto-save immédiat ne réécrive le statut SCHEDULED.
      lastSavedHashRef.current = computePayloadHash(
        baseSavePayload({ published: false, status: 'SCHEDULED', scheduledAt: iso })
      );
      setLastSaved(new Date());
      setHasUnsavedChanges(false);
      setShowSettings(false);
      toast.success(t`Publication programmée`);
    } catch (err: unknown) {
      setError(getErrorMessage(err, t`Échec de la programmation.`));
    }
  }, [scheduleDraft, baseSavePayload, status, onSave]);

  const handleClearSchedule = useCallback(async () => {
    const id = persistedIdRef.current;
    try {
      if (id) {
        const res = await scheduleArticleAction({ id, scheduledAt: null });
        if (!res.ok) throw new Error(res.error.message);
      }
      setScheduledAt(null);
      setStatus('DRAFT');
      setPublished(false);
      setScheduleDraft('');
      lastSavedHashRef.current = computePayloadHash(
        baseSavePayload({ published: false, status: 'DRAFT', scheduledAt: null })
      );
      setHasUnsavedChanges(false);
      toast.success(t`Programmation annulée`);
    } catch (err: unknown) {
      setError(getErrorMessage(err, t`Échec de l'annulation.`));
    }
  }, [baseSavePayload]);

  const handleToggleDownload = useCallback((next: boolean) => {
    const id = persistedIdRef.current;
    if (!id) return;
    setDownloadSaving(true);
    void setArticleAllowDownloadAction({ articleId: id, allowDownload: next }).then((res) => {
      setDownloadSaving(false);
      if (res.ok) {
        setAllowDownload(res.data.allowDownload);
        toast.success(next ? t`Téléchargement autorisé` : t`Téléchargement refusé`);
      } else {
        toast.error(res.error.message || t`Action impossible`);
      }
    });
  }, []);

  // Cmd/Ctrl+S : ref stable → plus de closure périmée sur les métadonnées.
  const manualSaveRef = useRef(handleManualSave);
  manualSaveRef.current = handleManualSave;
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void manualSaveRef.current();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  const articlePath = useMemo(() => {
    const selected = categories.find((category) => category.id === categoryId);
    if (!selected?.slug) return '/uncategorized';
    const parent = selected.parentId
      ? categories.find((category) => category.id === selected.parentId)
      : undefined;
    return `/${parent?.slug ? `${parent.slug}/` : ''}${selected.slug}`;
  }, [categories, categoryId]);

  const previewHref = useMemo(() => {
    if (!slug) return undefined;
    const sub = subdomain || 'preview';
    const path = `${articlePath}/${slug}`;
    let previewUrl = `https://${sub}.qoe.fi${path}`;
    if (typeof window !== 'undefined') {
      const host = window.location.hostname;
      const isCaddy = !window.location.port;
      if (host.includes('lvh.me')) {
        previewUrl = `http://${sub}.lvh.me${isCaddy ? '' : ':15403'}${path}`;
      } else if (host.includes('qoe.test')) {
        previewUrl = `http://${sub}.qoe.test${path}`;
      } else if (host.includes('localhost')) {
        previewUrl = `http://${sub}.lvh.me:15403${path}`;
      }
    }
    return previewUrl;
  }, [slug, subdomain, articlePath]);

  const handleAnnotationButton = () => {
    if (!editor) return;
    if (editor.isActive('annotationMark')) {
      const attrs = editor.getAttributes('annotationMark');
      openAnnotationPopover(undefined, attrs.note || '');
      return;
    }
    const selection = editor.state.selection;
    if (selection.empty) {
      setAnnotationToast(t`Sélectionnez d'abord un passage de texte à annoter.`);
      setTimeout(() => setAnnotationToast(null), 3000);
      return;
    }
    openAnnotationPopover();
  };

  if (!editor) {
    return null;
  }

  return (
    <div className="w-full space-y-8 pb-32 font-sans text-foreground">
      <EditorHeader
        isNew={!initialTitle}
        isPremium={isPremium}
        published={published}
        status={status}
        scheduledAt={scheduledAt}
        previewHref={previewHref}
        capabilities={capabilities}
        collaborationConnected={collaborationConnected}
        collaborationPeerCount={peerCount}
        showCollaboration={Boolean(collaborationProvider)}
        isSaving={isSaving}
        autoSaveStatus={autoSaveStatus}
        autoSaveError={autoSaveError}
        hasUnsavedChanges={hasUnsavedChanges}
        lastSaved={lastSaved}
        settingsOpen={showSettings}
        onBack={onBack}
        onOpenAnalytics={() => setShowAnalyticsModal(true)}
        onToggleSettings={() => setShowSettings((open) => !open)}
        onOpenSchedule={() => {
          setScheduleDraft(toDateTimeLocalValue(scheduledAt));
          setShowSettings(true);
        }}
        onTogglePremium={() => {
          setIsPremium((value) => !value);
          setHasUnsavedChanges(true);
        }}
        onPublish={() => setIsPublishModalOpen(true)}
        onUpdateLive={() => void handleUpdateLive()}
        onSubmitReview={handleSubmitForReview}
        onSave={() => void handleManualSave()}
        onRetryAutoSave={retryAutoSave}
      />

      {error && (
        <div className="bg-destructive/10 border border-destructive/20 text-destructive p-4 font-sans text-xs rounded-xl">
          {error}
        </div>
      )}

      <div className="max-w-3xl mx-auto w-full space-y-6">
        <div className="space-y-3">
          <input
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={t`Titre de votre article...`}
            className="w-full bg-transparent border-0 text-3xl md:text-4xl font-bold tracking-tight text-foreground focus:outline-none placeholder:text-muted-foreground/30 font-sans leading-tight"
          />

          <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-sans flex-nowrap">
            <span className="text-muted-foreground/60 font-medium whitespace-nowrap shrink-0 select-none">
              slug:
            </span>
            <input
              type="text"
              value={slug}
              onChange={(event) =>
                setSlug(event.target.value.toLowerCase().replace(/[^a-z0-9_-]+/g, '-'))
              }
              placeholder="slug-url"
              className="bg-transparent border-0 p-0 text-xs font-sans font-medium text-muted-foreground focus:outline-none flex-1 min-w-0"
            />
          </div>
        </div>

        <CoverUploader
          imageUrl={imageUrl}
          title={title}
          isUploading={isUploading}
          onUpload={(file) => {
            void (async () => {
              try {
                setIsUploading(true);
                setError(null);
                const compressed = await compressImage(file);
                const url = await uploadImageToRoute(
                  compressed,
                  '/api/articles/upload',
                  IMAGE_FOLDERS.articles
                );
                setImageUrl(url);
                setHasUnsavedChanges(true);
              } catch (err: unknown) {
                setError(getErrorMessage(err, t`Échec de l'upload de l'image.`));
              } finally {
                setIsUploading(false);
              }
            })();
          }}
          onRemove={() => {
            setImageUrl(null);
            setHasUnsavedChanges(true);
          }}
        />

        <div className="space-y-3">
          <div
            ref={toolbarSentinelRef}
            className="h-px w-full pointer-events-none opacity-0 -mb-4"
          />

          <input
            ref={bodyImageInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            aria-label={t`Insérer image`}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) uploadImage(file);
              event.target.value = '';
            }}
          />
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            aria-label={t`Insérer une galerie`}
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              if (files.length > 0) void uploadFiles(files, 'gallery');
              event.target.value = '';
            }}
          />

          <EditorToolbar
            editor={editor}
            docked={isDocked}
            isUploading={isUploading}
            uploadCount={uploadCount}
            onPickImage={() => bodyImageInputRef.current?.click()}
            onPickGallery={() => galleryInputRef.current?.click()}
            onAnnotation={handleAnnotationButton}
          />

          <div className="py-4">
            <EditorContent editor={editor} />
          </div>
        </div>
      </div>

      <EditorSettingsDrawer
        open={showSettings}
        onClose={() => setShowSettings(false)}
        published={published}
        status={status}
        scheduledAt={scheduledAt}
        scheduleDraft={scheduleDraft}
        timeZoneLabel={timeZoneLabel}
        onScheduleDraftChange={setScheduleDraft}
        onSchedule={() => void handleSchedule()}
        onClearSchedule={() => void handleClearSchedule()}
        isPremium={isPremium}
        onTogglePremium={(value) => {
          setIsPremium(value);
          setHasUnsavedChanges(true);
        }}
        categories={categories}
        categoryId={categoryId}
        onCategoryChange={(value) => {
          setCategoryId(value);
          setHasUnsavedChanges(true);
        }}
        slug={slug}
        onSlugChange={(value) => {
          setSlug(value);
          setHasUnsavedChanges(true);
        }}
        subdomain={subdomain}
        attributions={attributions}
        onAttributionsChange={(value) => {
          setAttributions(value);
          setHasUnsavedChanges(true);
        }}
        articleId={persistedIdRef.current}
        seoTitle={seoTitle}
        seoDescription={seoDescription}
        autoSeoTitle={title ?? ''}
        autoSeoDescription={
          buildPublicExcerpt(
            editor?.getText() || '',
            isPremium ? ContentVisibility.PAID_SUBSCRIBERS : ContentVisibility.PUBLIC,
            null,
            160
          ) ?? ''
        }
        onSeoTitleChange={(value) => {
          setSeoTitle(value);
          setHasUnsavedChanges(true);
        }}
        onSeoDescriptionChange={(value) => {
          setSeoDescription(value);
          setHasUnsavedChanges(true);
        }}
        allowPublicAnnotations={allowPublicAnnotations}
        allowComments={allowComments}
        onTogglePublicAnnotations={(value) => {
          setAllowPublicAnnotations(value);
          setHasUnsavedChanges(true);
        }}
        onToggleComments={(value) => {
          setAllowComments(value);
          setHasUnsavedChanges(true);
        }}
        allowDownload={allowDownload}
        downloadSaving={downloadSaving}
        onToggleDownload={handleToggleDownload}
        canPublish={capabilities?.canPublish ?? true}
        onUnpublish={() => void handleUnpublish()}
      />

      {showAnalyticsModal && (
        <ArticleInspectorModal
          urlPath={slug ? `${articlePath}/${slug}` : null}
          onClose={() => setShowAnalyticsModal(false)}
          onEdit={() => setShowAnalyticsModal(false)}
        />
      )}

      {annotationToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-highlight text-highlight-foreground font-bold text-xs px-4 py-2.5 rounded-xl shadow-xl animate-in fade-in-50 slide-in-from-bottom-2 duration-200">
          {annotationToast}
        </div>
      )}

      <AnnotationPopover
        open={showAuthorAnnotationModal}
        position={popoverPosition}
        quote={selectedQuoteForAnnotation}
        note={authorNoteInput}
        onChangeNote={setAuthorNoteInput}
        onSave={handleSaveAnnotation}
        onDelete={handleDeleteAnnotation}
        onClose={() => setShowAuthorAnnotationModal(false)}
        canDelete={Boolean(editor?.isActive('annotationMark'))}
      />

      <PublishModal
        isOpen={isPublishModalOpen}
        onClose={() => setIsPublishModalOpen(false)}
        onConfirm={handleConfirmPublish}
        articleTitle={title}
        articleExcerpt={editor.getText().slice(0, 180)}
        publicationName={subdomain ? `${subdomain}.qoe.fi` : 'Votre site web'}
        initialIsPremium={isPremium}
      />
    </div>
  );
}
