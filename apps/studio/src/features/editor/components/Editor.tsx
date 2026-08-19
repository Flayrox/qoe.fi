'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Image from '@tiptap/extension-image';
import Collaboration from '@tiptap/extension-collaboration';
import { CollaborationCaret } from '@tiptap/extension-collaboration-caret';
import { HocuspocusProvider } from '@hocuspocus/provider';
import * as Y from 'yjs';
import { PaywallDivider } from '../extensions/PaywallDivider';
import { AnnotationMark } from '../extensions/AnnotationMark';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Code,
  ArrowLeft,
  ImageIcon,
  Loader2,
  Check,
  Globe,
  Lock,
  Unlock,
  Clock,
  Send,
  CheckCircle2,
  Settings,
  FolderOpen,
  Search,
  Eye,
  BarChart3,
  Sparkles,
  X,
  ExternalLink,
  MessageSquare,
  UsersRound,
} from 'lucide-react';
import { cn } from '@qoe/utils';
import { compressImage } from '@/lib/image-compressor';
import { uploadImageToRoute, IMAGE_FOLDERS } from '@qoe/supabase/storage';
import { createClient as createSupabaseClient } from '@qoe/supabase';
import { useAutoSaveArticle, type AutoSavePayload } from '@qoe/api-client';
import type { EditorCapabilities } from '@qoe/api-client/actions/articles';
import { ArticleInspectorModal } from '@/app/(creator)/analytics/components/ArticleInspectorModal';
import { t } from '@lingui/core/macro';
import { ArticleAttributionEditor, type ArticleAttributionDraft } from './ArticleAttributionEditor';

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message) return message;
  }
  return fallback;
}

/**
 * 🎨 Couleur stable par utilisateur pour les curseurs de co-édition.
 * Hash simple du userId → palette contrastée (même id = même couleur).
 */
const CURSOR_COLORS = [
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#14b8a6',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#06b6d4',
  '#84cc16',
];

function colorForUserId(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i += 1) {
    hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  }
  return CURSOR_COLORS[hash % CURSOR_COLORS.length];
}

/** URL WebSocket du serveur de collaboration (Hocuspocus). */
const COLLAB_URL = typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_COLLAB_URL : undefined;

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
  initialAttributions?: ArticleAttributionDraft[];
  collaborationRoomId?: string;
  collaborationEnabled?: boolean;
  subdomain?: string;
  categories?: { id: string; name: string }[];
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
    attributions?: ArticleAttributionDraft[];
  }) => Promise<void>;
  onBack?: () => void;
}

export function Editor({
  initialTitle = '',
  initialSlug = '',
  initialContent = '',
  initialImageUrl = null,
  initialPublished = false,
  initialStatus = 'DRAFT',
  initialIsPremium = false,
  initialCategoryId = null,
  initialSeoTitle = '',
  initialSeoDescription = '',
  initialAllowPublicAnnotations = true,
  initialAllowComments = true,
  initialAttributions = [],
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
  const [isPremium, setIsPremium] = useState(initialIsPremium);
  const [categoryId, setCategoryId] = useState<string | null>(initialCategoryId);
  const [seoTitle, setSeoTitle] = useState(initialSeoTitle || '');
  const [seoDescription, setSeoDescription] = useState(initialSeoDescription || '');
  const [allowPublicAnnotations, setAllowPublicAnnotations] = useState(
    initialAllowPublicAnnotations
  );
  const [allowComments, setAllowComments] = useState(initialAllowComments);
  const [attributions, setAttributions] = useState<ArticleAttributionDraft[]>(initialAttributions);

  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const [showSettings, setShowSettings] = useState(false);
  const [showAnalyticsModal, setShowAnalyticsModal] = useState(false);
  const [showAuthorAnnotationModal, setShowAuthorAnnotationModal] = useState(false);
  const [authorNoteInput, setAuthorNoteInput] = useState('');
  const [annotationToast, setAnnotationToast] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const coverFileInputRef = useRef<HTMLInputElement>(null);

  // ─── Collaboration temps réel (Hocuspocus/Yjs) ────────────────────────
  // Document Yjs partagé + provider WebSocket vers apps/collab-server.
  const collaborationDoc = useMemo(
    () =>
      collaborationEnabled && collaborationRoomId && COLLAB_URL && typeof window !== 'undefined'
        ? new Y.Doc()
        : null,
    [collaborationEnabled, collaborationRoomId]
  );
  const collaborationProvider = useMemo(
    () =>
      collaborationDoc && collaborationRoomId && COLLAB_URL
        ? new HocuspocusProvider({
            url: COLLAB_URL,
            name: `article:${collaborationRoomId}`,
            document: collaborationDoc,
            // JWT Supabase de la session courante — validé côté serveur par
            // introspection `/auth/v1/user` (même source de vérité que l'API Go).
            token: async () => {
              const session = await createSupabaseClient().auth.getSession();
              return session.data.session?.access_token ?? '';
            },
          })
        : null,
    [collaborationDoc, collaborationRoomId]
  );

  // Identité affichée sur les curseurs des co-éditeurs.
  const [collabUser, setCollabUser] = useState<{ name: string; color: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const session = await createSupabaseClient().auth.getSession();
      const user = session.data.session?.user;
      if (cancelled || !user) return;
      const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
      const name =
        (typeof meta.name === 'string' && meta.name) ||
        (typeof meta.full_name === 'string' && meta.full_name) ||
        user.email?.split('@')[0] ||
        'Éditeur';
      setCollabUser({ name, color: colorForUserId(user.id) });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Compteur de co-éditeurs (awareness Yjs — hors soi-même).
  const [collaborationPeerCount, setCollaborationPeerCount] = useState(0);
  const [collaborationConnected, setCollaborationConnected] = useState(false);
  useEffect(() => {
    const provider = collaborationProvider;
    if (!provider) return;

    const handleAwareness = () => {
      const states = provider.awareness?.getStates() ?? new Map();
      let editors = 0;
      states.forEach((state) => {
        const s = state as { user?: unknown };
        if (s && s.user) editors += 1;
      });
      // On retire soi-même pour n'afficher que les co-éditeurs.
      setCollaborationPeerCount(Math.max(0, editors - 1));
    };
    const handleStatus = ({ status }: { status: 'connecting' | 'connected' | 'disconnected' }) => {
      setCollaborationConnected(status === 'connected');
      if (status !== 'connected') setCollaborationPeerCount(0);
    };

    provider.awareness?.on('change', handleAwareness);
    provider.on('status', handleStatus);
    handleAwareness();
    return () => {
      provider.awareness?.off('change', handleAwareness);
      provider.off('status', handleStatus);
    };
  }, [collaborationProvider]);

  useEffect(() => () => collaborationProvider?.destroy(), [collaborationProvider]);

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
      handleDrop: (view, event, slice, moved) => {
        if (
          !moved &&
          event.dataTransfer &&
          event.dataTransfer.files &&
          event.dataTransfer.files[0]
        ) {
          event.preventDefault();
          const file = event.dataTransfer.files[0];
          uploadImage(file);
          return true;
        }
        return false;
      },
    },
    onUpdate: () => {
      setHasUnsavedChanges(true);
    },
  });

  // ─── Seed du document partagé ──────────────────────────────────────────
  // Après le PREMIER sync avec le serveur : si le document Yjs est encore
  // vide (personne n'a jamais édité cet article) et qu'un contenu initial
  // existe, on l'insère AVEC propagation (`emitUpdate: true`) pour que le
  // serveur le persiste et que les co-éditeurs le reçoivent.
  // Si le serveur a déjà un état, il gagne : on ne seed pas.
  useEffect(() => {
    const provider = collaborationProvider;
    if (!provider || !editor || !collaborationDoc || !initialContent) return;

    // Le seed ne doit se produire qu'UNE fois, au tout premier sync.
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

  const { scheduleAutoSave, status: autoSaveStatus } = useAutoSaveArticle({
    delay: 2500,
    onSave: async (payload: AutoSavePayload) => {
      await onSave({
        title: payload.title,
        content: payload.content,
        imageUrl,
        slug: payload.slug || slug,
        published: payload.published ?? published,
        isPremium: payload.isPremium ?? isPremium,
        categoryId: payload.categoryId ?? categoryId,
        seoTitle: payload.seoTitle ?? seoTitle,
        seoDescription: payload.seoDescription ?? seoDescription,
        allowPublicAnnotations,
        allowComments,
        attributions,
      });
      setLastSaved(new Date());
      setHasUnsavedChanges(false);
      return { id: initialTitle ? 'existing' : 'new', updatedAt: new Date() };
    },
  });

  // Watch for state changes to trigger debounced auto-save
  useEffect(() => {
    if (
      title !== initialTitle ||
      slug !== initialSlug ||
      categoryId !== initialCategoryId ||
      seoTitle !== (initialSeoTitle || '') ||
      seoDescription !== (initialSeoDescription || '') ||
      attributions !== initialAttributions
    ) {
      setHasUnsavedChanges(true);
      if (title.trim() && editor) {
        scheduleAutoSave({
          title,
          content: editor.getHTML(),
          slug,
          published,
          isPremium,
          categoryId,
          seoTitle,
          seoDescription,
        });
      }
    }
  }, [
    title,
    slug,
    categoryId,
    seoTitle,
    seoDescription,
    published,
    isPremium,
    attributions,
    initialAttributions,
  ]);

  // Generate slug automatically
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

  const uploadImage = async (file: File) => {
    if (!editor) return;

    if (!file.type.startsWith('image/')) {
      setError('Le fichier doit être une image valide.');
      return;
    }

    try {
      setIsUploading(true);
      setError(null);

      const compressedFile = await compressImage(file);
      const url = await uploadImageToRoute(
        compressedFile,
        '/api/articles/upload',
        IMAGE_FOLDERS.articles
      );

      editor.chain().focus().setImage({ src: url }).run();
      setHasUnsavedChanges(true);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Une erreur est survenue lors de l'upload de l'image."));
    } finally {
      setIsUploading(false);
    }
  };

  const handleCoverFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setIsUploading(true);
      const compressedFile = await compressImage(file);
      const url = await uploadImageToRoute(
        compressedFile,
        '/api/articles/upload',
        IMAGE_FOLDERS.articles
      );
      setImageUrl(url);
      setHasUnsavedChanges(true);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Une erreur est survenue lors de l'upload de la couverture."));
    } finally {
      setIsUploading(false);
      if (coverFileInputRef.current) coverFileInputRef.current.value = '';
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadImage(file);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleManualSave = async (statusOverride?: string) => {
    if (!title.trim()) {
      setError("Le titre de l'article est requis avant d'enregistrer.");
      return;
    }

    try {
      setError(null);
      const htmlContent = editor?.getHTML() || '';
      let finalSlug = slug;
      if (!finalSlug) {
        finalSlug = title
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)+/g, '');
        setSlug(finalSlug);
      }

      await onSave({
        title,
        content: htmlContent,
        imageUrl,
        slug: finalSlug,
        published,
        status: statusOverride ?? status,
        isPremium,
        categoryId,
        seoTitle: seoTitle || null,
        seoDescription: seoDescription || null,
        allowPublicAnnotations,
        allowComments,
        attributions,
      });
      if (statusOverride) setStatus(statusOverride);
      setLastSaved(new Date());
      setHasUnsavedChanges(false);
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Échec de la sauvegarde.'));
    }
  };

  const handleSubmitForReview = () => {
    handleManualSave('SUBMITTED');
  };

  // Keyboard shortcut for saving (Cmd+S / Ctrl+S)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        handleManualSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [title, slug, published, isPremium, categoryId, seoTitle, seoDescription, editor]);

  if (!editor) {
    return null;
  }

  return (
    <div className="w-full space-y-10 pb-32 font-sans text-foreground">
      {/* Sleek Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 pb-6 border-b border-border/40">
        <div className="flex items-center gap-4">
          {onBack && (
            <button
              onClick={onBack}
              className="h-8 w-8 rounded-full flex items-center justify-center border border-border/40 bg-card hover:bg-muted text-muted-foreground hover:text-foreground transition-all cursor-pointer"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <div>
            <h2 className="text-xl font-bold text-foreground font-sans tracking-tight flex items-center gap-3">
              {initialTitle ? 'Édition' : 'Nouvel écrit'}
              {collaborationProvider && (
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[10px] font-medium',
                    collaborationConnected
                      ? 'bg-primary/10 text-primary'
                      : 'bg-muted text-muted-foreground'
                  )}
                  data-testid="collaboration-status"
                >
                  <UsersRound className="h-3 w-3" />
                  {collaborationConnected
                    ? collaborationPeerCount > 0
                      ? `${collaborationPeerCount + 1} éditeurs en direct`
                      : 'Co-édition en direct'
                    : 'Co-édition · reconnexion…'}
                </span>
              )}
              {(isSaving || autoSaveStatus === 'saving') && (
                <span className="text-xs text-muted-foreground font-sans flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />{' '}
                  Auto-sauvegarde...
                </span>
              )}
              {autoSaveStatus === 'saved' && (
                <span className="text-[11px] font-normal text-success bg-success/10 border border-success/20 px-2 py-0.5 rounded-md flex items-center gap-1.5 font-sans">
                  <Check className="w-3 h-3 text-success" /> Brouillon auto-enregistré
                </span>
              )}
              {lastSaved && autoSaveStatus !== 'saved' && !isSaving && (
                <span className="text-[11px] font-normal text-muted-foreground flex items-center gap-1.5 font-sans">
                  <Check className="w-3.5 h-3.5 text-muted-foreground" /> Sauvegardé à{' '}
                  {lastSaved.toLocaleTimeString()}
                </span>
              )}
              {hasUnsavedChanges &&
                autoSaveStatus !== 'saving' &&
                autoSaveStatus !== 'saved' &&
                !isSaving && (
                  <span className="text-[10px] font-medium text-highlight bg-highlight/10 border border-highlight/20 px-2 py-0.5 rounded-md font-sans">
                    Modifications en cours... (Cmd+S)
                  </span>
                )}
            </h2>
            <p className="text-xs text-muted-foreground font-sans mt-0.5">
              Rédigez sans bruit ni distraction
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Analytics Inspector Button */}
          <button
            onClick={() => setShowAnalyticsModal(true)}
            className="h-8 px-3 rounded-lg flex items-center gap-1.5 font-sans text-xs font-medium transition-all cursor-pointer border border-border/40 bg-card text-muted-foreground hover:text-foreground hover:bg-muted/50"
            title="Inspecter les statistiques réelles de cet article"
          >
            <BarChart3 className="h-3.5 w-3.5 stroke-[1.5]" />
            <span>Analyses</span>
          </button>

          {/* Options Button */}
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={cn(
              'h-8 px-3 rounded-lg flex items-center gap-1.5 font-sans text-xs font-medium transition-all cursor-pointer border border-border/40',
              showSettings
                ? 'bg-muted text-foreground font-semibold'
                : 'bg-card text-muted-foreground hover:text-foreground hover:bg-muted/50'
            )}
          >
            <Settings className="h-3.5 w-3.5 stroke-[1.5]" />
            <span>Options</span>
          </button>

          {/* Premium / Free Toggle */}
          <button
            onClick={() => {
              setIsPremium(!isPremium);
              setHasUnsavedChanges(true);
            }}
            className={cn(
              'h-8 px-3 rounded-lg flex items-center gap-1.5 font-sans text-xs font-medium transition-all cursor-pointer border border-border/40',
              isPremium
                ? 'bg-highlight/10 border-highlight/30 text-highlight font-semibold'
                : 'bg-card text-muted-foreground hover:text-foreground hover:bg-muted/50'
            )}
          >
            {isPremium ? (
              <Lock className="h-3 w-3 text-highlight" />
            ) : (
              <Unlock className="h-3 w-3" />
            )}
            <span>{isPremium ? 'Premium' : 'Gratuit'}</span>
          </button>

          {/* Workflow média : un rédacteur soumet, il ne publie pas */}
          {capabilities?.isMedia && !capabilities.canPublish ? (
            <>
              {/* État En revue */}
              <span
                className={cn(
                  'h-8 px-3 rounded-lg flex items-center gap-1.5 font-sans text-xs font-medium border border-border/40',
                  status === 'SUBMITTED'
                    ? 'bg-highlight/10 border-highlight/30 text-highlight font-semibold'
                    : 'bg-card text-muted-foreground'
                )}
              >
                {status === 'SUBMITTED' ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-highlight" />
                ) : (
                  <Clock className="h-3.5 w-3.5" />
                )}
                {status === 'SUBMITTED' ? 'En revue' : 'Brouillon'}
              </span>

              {/* Soumettre pour revue */}
              {status !== 'SUBMITTED' && (
                <button
                  onClick={handleSubmitForReview}
                  className="h-8 px-3 rounded-lg flex items-center gap-1.5 font-sans text-xs font-semibold transition-all cursor-pointer bg-highlight text-highlight-foreground hover:opacity-90 border border-transparent"
                  title="Soumettre cet article à l'approbation de votre équipe"
                >
                  <Send className="h-3.5 w-3.5" strokeWidth={1.5} />
                  Soumettre pour revue
                </button>
              )}
            </>
          ) : (
            /* Published / Draft Toggle (créateur perso ou éditeur/owner média) */
            <button
              onClick={() => {
                setPublished(!published);
                if (!published) setStatus('PUBLISHED');
                else setStatus('DRAFT');
                setHasUnsavedChanges(true);
              }}
              className={cn(
                'h-8 px-3 rounded-lg flex items-center gap-1.5 font-sans text-xs font-medium transition-all cursor-pointer border border-border/40',
                published
                  ? 'bg-success/10 border-success/30 text-success font-semibold'
                  : 'bg-card text-muted-foreground hover:text-foreground hover:bg-muted/50'
              )}
            >
              {published ? (
                <Globe className="h-3 w-3 text-success" />
              ) : (
                <Lock className="h-3 w-3" />
              )}
              <span>{published ? 'Publié' : 'Brouillon'}</span>
            </button>
          )}

          {/* Public Article Page Preview Link */}
          {slug && (
            <a
              href={`http://${subdomain || 'heheheh'}.lvh.me:3001/article/${slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="h-8 px-3 rounded-lg flex items-center gap-1.5 font-sans text-xs font-semibold bg-muted/50 text-foreground hover:bg-muted border border-border/40 transition-all cursor-pointer shadow-xs"
              title="Ouvrir la page publique ou la prévisualisation de l'écrit"
            >
              <ExternalLink className="h-3.5 w-3.5 text-primary" />
              <span>{t`Aperçu`}</span>
            </a>
          )}

          {/* Save Action */}
          <button
            onClick={() => handleManualSave()}
            disabled={isSaving}
            className="h-8 px-4 bg-primary text-primary-foreground font-sans text-xs font-bold rounded-lg flex items-center gap-1.5 hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none cursor-pointer shadow-sm"
          >
            <span>Enregistrer</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive/20 text-destructive p-4 font-sans text-xs rounded-xl">
          {error}
        </div>
      )}

      {/* Main Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-12 items-start">
        {/* Editor Column */}
        <div
          className={cn(
            'transition-all space-y-8',
            showSettings ? 'lg:col-span-2' : 'lg:col-span-3'
          )}
        >
          {/* Title Area */}
          <div className="space-y-3">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Titre de votre publication..."
              className="w-full bg-transparent border-0 text-3xl md:text-4xl font-bold tracking-tight text-foreground focus:outline-none placeholder:text-muted-foreground/30 font-sans leading-tight"
            />

            <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
              <span className="text-muted-foreground/60">slug :</span>
              <input
                type="text"
                value={slug}
                onChange={(e) =>
                  setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_-]+/g, '-'))
                }
                placeholder="slug-url"
                className="bg-transparent border-0 p-0 text-xs font-mono text-muted-foreground focus:outline-none w-full"
              />
            </div>
          </div>

          {/* Text Editor Core */}
          <div className="space-y-4">
            {/* Theme-agnostic Sticky Formatting Toolbar */}
            <div className="flex flex-wrap items-center gap-0.5 py-2 px-3 border border-border/40 rounded-xl sticky top-4 bg-background/95 backdrop-blur-md z-20 shadow-sm">
              <ToolbarButton
                active={editor.isActive('bold')}
                onClick={() => editor.chain().focus().toggleBold().run()}
                icon={<Bold className="h-3.5 w-3.5 stroke-[2]" />}
                tooltip="Gras"
              />
              <ToolbarButton
                active={editor.isActive('italic')}
                onClick={() => editor.chain().focus().toggleItalic().run()}
                icon={<Italic className="h-3.5 w-3.5 stroke-[2]" />}
                tooltip="Italique"
              />
              <ToolbarButton
                active={editor.isActive('underline')}
                onClick={() => editor.chain().focus().toggleUnderline().run()}
                icon={<UnderlineIcon className="h-3.5 w-3.5 stroke-[2]" />}
                tooltip="Souligné"
              />
              <ToolbarButton
                active={editor.isActive('strike')}
                onClick={() => editor.chain().focus().toggleStrike().run()}
                icon={<Strikethrough className="h-3.5 w-3.5 stroke-[2]" />}
                tooltip="Barré"
              />

              <div className="h-4 w-[1px] bg-border/40 mx-1.5" />

              <ToolbarButton
                active={editor.isActive('heading', { level: 1 })}
                onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
                icon={<Heading1 className="h-3.5 w-3.5 stroke-[2]" />}
                tooltip="Titre 1"
              />
              <ToolbarButton
                active={editor.isActive('heading', { level: 2 })}
                onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                icon={<Heading2 className="h-3.5 w-3.5 stroke-[2]" />}
                tooltip="Titre 2"
              />
              <ToolbarButton
                active={editor.isActive('heading', { level: 3 })}
                onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
                icon={<Heading3 className="h-3.5 w-3.5 stroke-[2]" />}
                tooltip="Titre 3"
              />

              <div className="h-4 w-[1px] bg-border/40 mx-1.5" />

              <ToolbarButton
                active={editor.isActive('bulletList')}
                onClick={() => editor.chain().focus().toggleBulletList().run()}
                icon={<List className="h-3.5 w-3.5 stroke-[2]" />}
                tooltip="Liste à puces"
              />
              <ToolbarButton
                active={editor.isActive('orderedList')}
                onClick={() => editor.chain().focus().toggleOrderedList().run()}
                icon={<ListOrdered className="h-3.5 w-3.5 stroke-[2]" />}
                tooltip="Liste numérotée"
              />

              <div className="h-4 w-[1px] bg-border/40 mx-1.5" />

              <ToolbarButton
                active={editor.isActive('blockquote')}
                onClick={() => editor.chain().focus().toggleBlockquote().run()}
                icon={<Quote className="h-3.5 w-3.5 stroke-[2]" />}
                tooltip="Citation"
              />
              <ToolbarButton
                active={editor.isActive('codeBlock')}
                onClick={() => editor.chain().focus().toggleCodeBlock().run()}
                icon={<Code className="h-3.5 w-3.5 stroke-[2]" />}
                tooltip="Bloc de Code"
              />

              <div className="h-4 w-[1px] bg-border/40 mx-1.5" />

              {/* Media Selection */}
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                accept="image/*"
                className="hidden"
                aria-label="Insérer image"
              />
              <input
                type="file"
                ref={coverFileInputRef}
                onChange={handleCoverFileSelect}
                accept="image/*"
                className="hidden"
                aria-label="Choisir la couverture de l'article"
              />
              <ToolbarButton
                onClick={() => fileInputRef.current?.click()}
                icon={
                  isUploading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                  ) : (
                    <ImageIcon className="h-3.5 w-3.5 stroke-[2]" />
                  )
                }
                tooltip="Insérer une Image"
                disabled={isUploading}
              />

              <div className="h-4 w-[1px] bg-border/40 mx-1.5" />

              {/* Official Author Annotation Insertion & Edition */}
              <ToolbarButton
                active={editor.isActive('annotationMark')}
                onClick={() => {
                  if (editor.isActive('annotationMark')) {
                    const attrs = editor.getAttributes('annotationMark');
                    setAuthorNoteInput(attrs.note || '');
                    setShowAuthorAnnotationModal(true);
                    return;
                  }
                  const selection = editor.state.selection;
                  if (selection.empty) {
                    setAnnotationToast("Sélectionnez d'abord un passage de texte à annoter.");
                    setTimeout(() => setAnnotationToast(null), 3000);
                    return;
                  }
                  setAuthorNoteInput('');
                  setShowAuthorAnnotationModal(true);
                }}
                icon={<Eye className="h-3.5 w-3.5 text-highlight stroke-[2]" />}
                tooltip={
                  editor.isActive('annotationMark')
                    ? "Modifier / Supprimer l'Annotation Officielle"
                    : "Ajouter une Annotation Officielle d'Auteur"
                }
              />

              <div className="h-4 w-[1px] bg-border/40 mx-1.5" />

              {/* Paywall Divider Insertion */}
              <ToolbarButton
                onClick={() => editor.chain().focus().setPaywallDivider().run()}
                icon={<Lock className="h-3.5 w-3.5 text-highlight stroke-[2]" />}
                tooltip="Insérer la limite Paywall (Contenu Premium)"
              />
            </div>

            {/* TipTap Main Body */}
            <div className="py-4">
              <EditorContent editor={editor} />
            </div>
          </div>
        </div>

        {/* Options / Settings Sidebar */}
        {showSettings && (
          <div className="space-y-8 lg:col-span-1 animate-in fade-in-50 duration-200 lg:sticky lg:top-24 bg-card border border-border/40 rounded-2xl p-6 shadow-none">
            {/* Article cover */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider font-sans flex items-center gap-2">
                <ImageIcon className="h-3.5 w-3.5 text-muted-foreground stroke-[1.5]" />
                Image de couverture
              </h3>
              <button
                type="button"
                onClick={() => coverFileInputRef.current?.click()}
                disabled={isUploading}
                className="group relative flex aspect-[16/7] w-full items-center justify-center overflow-hidden rounded-xl border border-border/40 bg-muted/30 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground disabled:opacity-50"
              >
                {imageUrl ? (
                  <img
                    src={imageUrl}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                ) : (
                  <span>Ajouter une image pour la carte du feed</span>
                )}
                <span className="absolute inset-x-2 bottom-2 rounded-lg bg-background/80 px-2 py-1 text-[10px] backdrop-blur-sm">
                  {imageUrl ? 'Remplacer la couverture' : 'Choisir une couverture'}
                </span>
              </button>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Cette image sera utilisée en priorité dans la carte article. Sans image, la photo de
                profil sera utilisée.
              </p>
            </div>

            {/* Editorial byline */}
            <ArticleAttributionEditor value={attributions} onChange={setAttributions} />

            {/* Category Selection */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider font-sans flex items-center gap-2">
                <FolderOpen className="h-3.5 w-3.5 text-muted-foreground stroke-[1.5]" />
                Catégorie
              </h3>

              <div className="space-y-2">
                <select
                  value={categoryId || ''}
                  onChange={(e) => {
                    setCategoryId(e.target.value || null);
                  }}
                  className="w-full bg-background border border-border/40 rounded-lg p-2.5 text-xs text-foreground focus:outline-none focus:border-primary transition-colors font-sans cursor-pointer"
                >
                  <option value="">{t`-- Sans catégorie --`}</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-muted-foreground leading-relaxed font-sans">
                  Associez cet écrit à un thème pour l'organiser sur votre espace créateur.
                </p>
              </div>
            </div>

            {/* Community Interaction Permissions */}
            <div className="space-y-3 pt-4 border-t border-border/30 font-sans">
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <MessageSquare className="h-3.5 w-3.5 text-muted-foreground stroke-[1.5]" />
                Interactions Lecteurs
              </h3>

              <div className="space-y-2.5">
                <label className="flex items-center justify-between gap-3 text-xs text-foreground cursor-pointer select-none">
                  <span>Annotations publiques</span>
                  <input
                    type="checkbox"
                    checked={allowPublicAnnotations}
                    onChange={(e) => {
                      setAllowPublicAnnotations(e.target.checked);
                      setHasUnsavedChanges(true);
                    }}
                    className="w-4 h-4 rounded-md text-primary border-border/40 focus:ring-primary cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between gap-3 text-xs text-foreground cursor-pointer select-none">
                  <span>Espace commentaires</span>
                  <input
                    type="checkbox"
                    checked={allowComments}
                    onChange={(e) => {
                      setAllowComments(e.target.checked);
                      setHasUnsavedChanges(true);
                    }}
                    className="w-4 h-4 rounded-md text-primary border-border/40 focus:ring-primary cursor-pointer"
                  />
                </label>
              </div>
            </div>

            {/* SEO Optimization */}
            <div className="space-y-4 pt-4 border-t border-border/30">
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider font-sans flex items-center gap-2">
                <Search className="h-3.5 w-3.5 text-muted-foreground stroke-[1.5]" />
                Optimisation SEO
              </h3>

              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-[10px] text-muted-foreground font-sans uppercase tracking-wider font-semibold">
                    Titre alternatif
                  </label>
                  <input
                    type="text"
                    value={seoTitle}
                    onChange={(e) => setSeoTitle(e.target.value)}
                    placeholder={title || "Titre d'origine"}
                    className="w-full bg-background border border-border/40 rounded-lg p-2.5 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary transition-colors font-sans"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] text-muted-foreground font-sans uppercase tracking-wider font-semibold">
                    Description SEO
                  </label>
                  <textarea
                    rows={3}
                    value={seoDescription}
                    onChange={(e) => setSeoDescription(e.target.value)}
                    placeholder="Une courte accroche pour les moteurs de recherche..."
                    className="w-full bg-background border border-border/40 rounded-lg p-2.5 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary transition-colors font-sans resize-none"
                  />
                </div>

                {/* Google Preview */}
                <div className="p-4 bg-muted/30 rounded-xl border border-border/30 space-y-1 font-sans">
                  <span className="text-[9px] text-muted-foreground font-mono block uppercase">
                    Aperçu Google
                  </span>
                  <span className="text-xs font-semibold text-foreground block truncate">
                    {seoTitle || title || "Titre de l'écrit"}
                  </span>
                  <span className="text-[10px] text-muted-foreground block line-clamp-2 leading-relaxed">
                    {seoDescription ||
                      'Aucune description SEO saisie. Google utilisera le début de votre article.'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Article Inspector Drawer Modal */}
      {showAnalyticsModal && (
        <ArticleInspectorModal
          urlPath={slug ? `/article/${slug}` : null}
          onClose={() => setShowAnalyticsModal(false)}
          onEdit={() => setShowAnalyticsModal(false)}
        />
      )}

      {/* Toast Notification */}
      {annotationToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-highlight text-highlight-foreground font-bold text-xs px-4 py-2.5 rounded-xl shadow-xl animate-in fade-in-50 slide-in-from-bottom-2 duration-200">
          {annotationToast}
        </div>
      )}

      {/* Custom UI Modal for Official Author Annotation (No window.prompt!) */}
      {showAuthorAnnotationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/60 backdrop-blur-xs font-sans">
          <div className="bg-card border border-border/40 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl animate-in fade-in-50 zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-highlight" />
                <h3 className="text-sm font-bold text-foreground">
                  Annotation Officielle D'Auteur
                </h3>
              </div>
              <button
                onClick={() => setShowAuthorAnnotationModal(false)}
                className="text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              Ajoutez une note d'auteur certifiée qui apparaîtra sous forme de marge dorée
              interactive pour vos lecteurs.
            </p>

            <textarea
              autoFocus
              rows={3}
              value={authorNoteInput}
              onChange={(e) => setAuthorNoteInput(e.target.value)}
              placeholder="Explication, contexte ou commentaire d'auteur..."
              className="w-full bg-background border border-border/40 rounded-xl p-3 text-xs text-foreground focus:outline-none focus:border-highlight resize-none font-sans"
            />

            <div className="flex items-center justify-between gap-2 pt-2">
              {editor?.isActive('annotationMark') ? (
                <button
                  type="button"
                  onClick={() => {
                    if (editor) {
                      editor.chain().focus().unsetAnnotationMark().run();
                      setHasUnsavedChanges(true);
                      setAuthorNoteInput('');
                      setShowAuthorAnnotationModal(false);
                    }
                  }}
                  className="px-3.5 py-1.5 rounded-xl border border-destructive/30 text-destructive hover:bg-destructive/10 text-xs font-semibold cursor-pointer transition-colors"
                >
                  Supprimer l'annotation
                </button>
              ) : (
                <div />
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowAuthorAnnotationModal(false)}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  disabled={!authorNoteInput.trim()}
                  onClick={() => {
                    if (authorNoteInput.trim() && editor) {
                      editor
                        .chain()
                        .focus()
                        .setAnnotationMark({ note: authorNoteInput.trim() })
                        .run();
                      setHasUnsavedChanges(true);
                      setAuthorNoteInput('');
                      setShowAuthorAnnotationModal(false);
                    }
                  }}
                  className="px-4 py-1.5 rounded-xl bg-highlight text-highlight-foreground font-bold text-xs hover:bg-highlight/90 cursor-pointer disabled:opacity-50 transition-colors"
                >
                  {editor?.isActive('annotationMark') ? 'Mettre à jour' : "Attacher l'annotation"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface ToolbarButtonProps {
  active?: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  tooltip: string;
  disabled?: boolean;
}

function ToolbarButton({ active, onClick, icon, tooltip, disabled }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={tooltip}
      disabled={disabled}
      className={cn(
        'h-8 w-8 flex items-center justify-center rounded-lg transition-all font-sans text-sm cursor-pointer',
        active
          ? 'bg-primary/15 text-primary font-semibold'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
    >
      {icon}
    </button>
  );
}
