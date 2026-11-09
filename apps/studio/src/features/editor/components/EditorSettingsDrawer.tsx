'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRightLeft,
  Building2,
  Check,
  Copy,
  CopyCheck,
  Download,
  FolderOpen,
  Globe,
  Highlighter,
  Loader2,
  Lock,
  MessageSquare,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Trash2,
  UserRound,
} from 'lucide-react';
import { cn } from '@qoe/utils';
import { t } from '@lingui/core/macro';
import { Button } from '@qoe/ui/button';
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@qoe/ui/drawer';
import { Input, InputGroup, Textarea } from '@qoe/ui/input';
import { Select } from '@qoe/ui/select';
import { Switch } from '@qoe/ui/switch';
import { toast } from '@qoe/ui/toast';
import {
  bulkUpdateArticlesAction,
  getArticleByIdAction,
  getWorkspacesAction,
  transferArticleAction,
} from '@qoe/sdk/actions/articles';
import { StudioField, StudioRow, StudioRowList } from '@/components/studio-page';
import { ArticleAttributionEditor, type ArticleAttributionDraft } from './ArticleAttributionEditor';
import { ArticleScheduleSection } from './ArticleScheduleSection';
import { resolveArticleCategoryPath, type ArticleWorkspaceOption } from '../lib/article-settings';

export interface EditorSettingsDrawerProps {
  open: boolean;
  onClose: () => void;
  published: boolean;
  status: string;
  scheduledAt: string | null;
  scheduleDraft: string;
  timeZoneLabel: string;
  onScheduleDraftChange: (value: string) => void;
  onSchedule: () => void;
  onClearSchedule: () => void;
  schedulePending?: boolean;
  isPremium: boolean;
  onTogglePremium: (value: boolean) => void;
  categories: { id: string; name: string; parentId?: string | null; slug?: string }[];
  categoryId: string | null;
  onCategoryChange: (value: string | null) => void;
  slug: string;
  onSlugChange: (value: string) => void;
  subdomain?: string;
  attributions: ArticleAttributionDraft[];
  onAttributionsChange: (value: ArticleAttributionDraft[]) => void;
  articleId?: string;
  seoTitle: string;
  seoDescription: string;
  autoSeoTitle: string;
  autoSeoDescription: string;
  onSeoTitleChange: (value: string) => void;
  onSeoDescriptionChange: (value: string) => void;
  allowPublicAnnotations: boolean;
  allowComments: boolean;
  onTogglePublicAnnotations: (value: boolean) => void;
  onToggleComments: (value: boolean) => void;
  allowDownload: boolean;
  downloadSaving: boolean;
  onToggleDownload: (value: boolean) => void;
  workspaces?: ArticleWorkspaceOption[];
  publicationId?: string;
  publicationName?: string;
  publicationSlug?: string;
  publicationType?: 'PERSONAL' | 'MEDIA' | string;
  transferring?: boolean;
  onTransferPublication?: (targetPublicationId: string) => void | Promise<boolean | void>;
  showOnPersonalProfile?: boolean;
  crosspostSaving?: boolean;
  onToggleShowOnPersonalProfile?: (value: boolean) => void;
  canPublish: boolean;
  hasUnpublishedChanges?: boolean;
  onUnpublish: () => void;
  onDiscardDraft?: () => void;
  /** Pied optionnel (ex. Enregistrer/Fermer depuis la liste d'articles). */
  footer?: React.ReactNode;
}

function SectionTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider font-sans flex items-center gap-2">
      {icon}
      {children}
    </h4>
  );
}

function ToggleRow({
  icon,
  title,
  description,
  checked,
  disabled,
  onChange,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <StudioRow
      title={
        <span className="inline-flex items-center gap-1.5">
          {icon}
          <span>{title}</span>
        </span>
      }
      description={description}
    >
      <Switch
        size="sm"
        isSelected={checked}
        isDisabled={disabled}
        onChange={onChange}
        aria-label={title}
      />
    </StudioRow>
  );
}

export function EditorSettingsDrawer(props: EditorSettingsDrawerProps) {
  const {
    open,
    onClose,
    published,
    status,
    scheduledAt,
    scheduleDraft,
    timeZoneLabel,
    onScheduleDraftChange,
    onSchedule,
    onClearSchedule,
    schedulePending = false,
    isPremium,
    onTogglePremium,
    categories,
    categoryId,
    onCategoryChange,
    slug,
    onSlugChange,
    subdomain,
    attributions,
    onAttributionsChange,
    articleId,
    seoTitle,
    seoDescription,
    autoSeoTitle,
    autoSeoDescription,
    onSeoTitleChange,
    onSeoDescriptionChange,
    allowPublicAnnotations,
    allowComments,
    onTogglePublicAnnotations,
    onToggleComments,
    allowDownload,
    downloadSaving,
    onToggleDownload,
    workspaces: externalWorkspaces,
    publicationId: externalPublicationId,
    publicationName: externalPublicationName,
    publicationSlug: externalPublicationSlug,
    publicationType: externalPublicationType,
    transferring: externalTransferring = false,
    onTransferPublication,
    showOnPersonalProfile: externalShowOnPersonalProfile,
    crosspostSaving: externalCrosspostSaving = false,
    onToggleShowOnPersonalProfile,
    canPublish,
    hasUnpublishedChanges,
    onUnpublish,
    onDiscardDraft,
    footer,
  } = props;

  const [slugCopied, setSlugCopied] = useState(false);
  const [seoAdvancedOpen, setSeoAdvancedOpen] = useState(Boolean(seoTitle || seoDescription));
  const [internalWorkspaces, setInternalWorkspaces] = useState<ArticleWorkspaceOption[]>([]);
  const [internalPub, setInternalPub] = useState<{
    id?: string;
    name?: string;
    slug?: string;
    type?: 'PERSONAL' | 'MEDIA' | string;
  }>({});
  const [internalShowOnPersonal, setInternalShowOnPersonal] = useState<boolean>(true);
  const [internalTransferring, setInternalTransferring] = useState(false);
  const [internalCrosspostSaving, setInternalCrosspostSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    if (!externalWorkspaces) {
      void getWorkspacesAction().then((res) => {
        if (cancelled || !res.ok || !res.data) return;
        setInternalWorkspaces([res.data.personal, ...(res.data.medias ?? [])]);
      });
    }
    if (articleId && externalPublicationId === undefined) {
      void getArticleByIdAction(articleId).then((res) => {
        if (cancelled || !res.ok || !res.data) return;
        setInternalPub({
          id: res.data.publication?.id || res.data.publicationId,
          name: res.data.publication?.name,
          slug: res.data.publication?.slug,
          type: res.data.publication?.type,
        });
        setInternalShowOnPersonal(res.data.showOnPersonalProfile ?? true);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [open, articleId, externalWorkspaces, externalPublicationId]);

  const workspaces = externalWorkspaces ?? internalWorkspaces;
  const effectivePubId = externalPublicationId ?? internalPub.id;
  const effectivePubName = externalPublicationName ?? internalPub.name;
  const effectivePubSlug = externalPublicationSlug ?? internalPub.slug;
  const effectivePubType = externalPublicationType ?? internalPub.type;
  const effectiveShowOnPersonal = externalShowOnPersonalProfile ?? internalShowOnPersonal;
  const isTransferring = externalTransferring || internalTransferring;
  const isCrosspostSaving = externalCrosspostSaving || internalCrosspostSaving;

  const isWorkspaceCurrent = (ws: ArticleWorkspaceOption) => {
    if (effectivePubType === 'PERSONAL' && ws.type === 'PERSONAL') return true;
    if (effectivePubId && ws.id === effectivePubId) return true;
    if (effectivePubSlug && ws.slug === effectivePubSlug) return true;
    if (effectivePubName && ws.name === effectivePubName) return true;
    return false;
  };

  const handleTransferClick = async (ws: ArticleWorkspaceOption) => {
    if (!articleId || isTransferring || isWorkspaceCurrent(ws)) return;
    if (onTransferPublication) {
      await onTransferPublication(ws.id);
      return;
    }
    setInternalTransferring(true);
    try {
      const res = await transferArticleAction({
        articleId,
        targetPublicationId: ws.id,
        showOnPersonalProfile: effectiveShowOnPersonal,
      });
      if (!res.ok || !res.data) {
        throw new Error(res.ok ? t`Échec du transfert.` : res.error.message);
      }
      setInternalPub({
        id: res.data.publication?.id || res.data.publicationId,
        name: res.data.publication?.name || ws.name,
        slug: res.data.publication?.slug || ws.slug,
        type: res.data.publication?.type || ws.type,
      });
      if (res.data.categoryId !== undefined) {
        onCategoryChange(res.data.categoryId);
      }
      if (res.data.slug) {
        onSlugChange(res.data.slug);
      }
      toast.success(t`Article transféré vers ${res.data.publication?.name || ws.name}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t`Échec du transfert de l'article.`);
    } finally {
      setInternalTransferring(false);
    }
  };

  const handleToggleCrosspost = async (value: boolean) => {
    if (onToggleShowOnPersonalProfile) {
      onToggleShowOnPersonalProfile(value);
      return;
    }
    setInternalShowOnPersonal(value);
    if (!articleId) return;
    setInternalCrosspostSaving(true);
    try {
      const res = await bulkUpdateArticlesAction({
        ids: [articleId],
        showOnPersonalProfile: value,
      });
      if (!res.ok || res.data.failed.includes(articleId)) {
        throw new Error(!res.ok ? res.error.message : t`Action impossible`);
      }
      toast.success(
        value
          ? t`Affiché sur votre profil et blog personnel`
          : t`Masqué de votre profil et blog personnel`
      );
    } catch (err) {
      setInternalShowOnPersonal(!value);
      toast.error(err instanceof Error ? err.message : t`Action impossible`);
    } finally {
      setInternalCrosspostSaving(false);
    }
  };

  const articlePath = useMemo(
    () => resolveArticleCategoryPath(categories, categoryId),
    [categories, categoryId]
  );

  const hierarchicalCategories = useMemo(() => {
    const formatted = categories.map((category) => ({
      ...category,
      displayName: category.name?.trim() || category.slug || t`Catégorie sans titre`,
    }));
    const roots = formatted.filter((category) => !category.parentId);
    const childrenMap = new Map<string, typeof formatted>();
    for (const category of formatted) {
      if (category.parentId) {
        const list = childrenMap.get(category.parentId) || [];
        list.push(category);
        childrenMap.set(category.parentId, list);
      }
    }
    return { roots, childrenMap };
  }, [categories]);

  if (!open) return null;

  return (
    <Drawer
      side="right"
      width="md"
      isOpen={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <DrawerContent aria-label={t`Paramètres de l'article`}>
        <DrawerHeader>
          <div className="flex items-center gap-2.5">
            <SlidersHorizontal className="size-4 text-primary" />
            <div>
              <DrawerTitle className="text-sm font-bold">{t`Paramètres de l'article`}</DrawerTitle>
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
                <span
                  className={cn(
                    'w-1.5 h-1.5 rounded-full',
                    published ? 'bg-success' : scheduledAt ? 'bg-highlight' : 'bg-muted-foreground'
                  )}
                />
                <span>
                  {published
                    ? t`En ligne (Publié)`
                    : scheduledAt
                      ? t`Programmé`
                      : status === 'SUBMITTED'
                        ? t`En revue`
                        : t`Brouillon privé`}
                </span>
              </div>
            </div>
          </div>
        </DrawerHeader>

        <DrawerBody className="p-5 space-y-6">
          <section className="space-y-3 pb-4 border-b border-border/40">
            <SectionTitle
              icon={<ArrowRightLeft className="h-3.5 w-3.5 text-primary stroke-[1.5]" />}
            >
              {t`Publication & Diffusion`}
            </SectionTitle>

            {effectivePubName && (
              <div className="flex items-center justify-between gap-2 rounded-xl border border-border/50 bg-muted/20 px-3 py-2 text-xs">
                <span className="text-muted-foreground">{t`Publié dans`}</span>
                <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                  {effectivePubType === 'MEDIA' ? (
                    <Building2 className="h-3.5 w-3.5 text-primary" />
                  ) : (
                    <UserRound className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                  <span>{effectivePubName}</span>
                </span>
              </div>
            )}

            {articleId && workspaces.length > 1 && (
              <div className="space-y-1.5">
                <p className="text-[11px] text-muted-foreground">
                  {t`Transférer cet article vers une autre publication en 1 clic :`}
                </p>
                <div className="grid grid-cols-1 gap-1.5">
                  {workspaces.map((ws) => {
                    const current = isWorkspaceCurrent(ws);
                    return (
                      <Button
                        key={`${ws.type}-${ws.id}`}
                        variant={current ? 'soft' : 'outline'}
                        tone={current ? 'brand' : 'neutral'}
                        size="sm"
                        disabled={current || isTransferring}
                        onClick={() => void handleTransferClick(ws)}
                        className="w-full justify-between"
                      >
                        <span className="inline-flex items-center gap-2 truncate">
                          {ws.type === 'MEDIA' ? (
                            <Building2 className="h-3.5 w-3.5 shrink-0 text-primary" />
                          ) : (
                            <UserRound className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          )}
                          <span className="truncate">{ws.name}</span>
                          <span className="text-[10px] text-muted-foreground">
                            {ws.type === 'MEDIA' ? t`Média` : t`Personnel`}
                          </span>
                        </span>
                        {current ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold">
                            <Check className="h-3 w-3" />
                            {t`Actuel`}
                          </span>
                        ) : isTransferring ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] text-primary">
                            <ArrowRightLeft className="h-3 w-3" />
                            {t`Transférer`}
                          </span>
                        )}
                      </Button>
                    );
                  })}
                </div>
              </div>
            )}

            <StudioRowList>
              <ToggleRow
                icon={<UserRound className="w-3.5 h-3.5 text-primary" />}
                title={t`Afficher aussi sur mon profil et mon blog personnel`}
                description={t`Permet à vos articles publiés dans un Média d'apparaître également sur votre profil et votre blog personnel.`}
                checked={effectiveShowOnPersonal}
                disabled={isCrosspostSaving}
                onChange={(val) => void handleToggleCrosspost(val)}
              />
            </StudioRowList>
          </section>

          <section className="space-y-3">
            <SectionTitle icon={<FolderOpen className="h-3.5 w-3.5 text-primary stroke-[1.5]" />}>
              {t`Thématique & Catégorie`}
            </SectionTitle>
            <Select
              label={t`Catégorie`}
              hideLabel
              size="sm"
              value={categoryId || ''}
              onValueChange={(value) => onCategoryChange(value || null)}
              options={[
                { id: '', label: t`Non catégorisé` },
                ...hierarchicalCategories.roots
                  .filter(
                    (root) => (hierarchicalCategories.childrenMap.get(root.id) || []).length === 0
                  )
                  .map((root) => ({ id: root.id, label: root.displayName })),
              ]}
              groups={hierarchicalCategories.roots
                .filter(
                  (root) => (hierarchicalCategories.childrenMap.get(root.id) || []).length > 0
                )
                .map((root) => ({
                  label: root.displayName,
                  options: [
                    { id: root.id, label: root.displayName },
                    ...(hierarchicalCategories.childrenMap.get(root.id) || []).map((child) => ({
                      id: child.id,
                      label: child.displayName,
                    })),
                  ],
                }))}
            />
          </section>

          <section className="space-y-3 pt-4 border-t border-border/40">
            <div className="flex items-center justify-between">
              <SectionTitle icon={<Globe className="h-3.5 w-3.5 text-primary stroke-[1.5]" />}>
                {t`Adresse URL de l'écrit`}
              </SectionTitle>
              <Button
                variant="ghost"
                tone={slugCopied ? 'success' : 'brand'}
                size="xs"
                onClick={() => {
                  const fullUrl = `https://${subdomain ? `${subdomain}.qoe.fi` : 'qoe.fi'}${articlePath}/${slug || ''}`;
                  navigator.clipboard.writeText(fullUrl);
                  setSlugCopied(true);
                  setTimeout(() => setSlugCopied(false), 2000);
                }}
                className="h-auto px-1.5 py-0.5 text-[11px]"
              >
                {slugCopied ? (
                  <>
                    <CopyCheck />
                    <span>{t`Copié !`}</span>
                  </>
                ) : (
                  <>
                    <Copy />
                    <span>{t`Copier le lien`}</span>
                  </>
                )}
              </Button>
            </div>

            <InputGroup
              size="sm"
              left={<span className="select-none whitespace-nowrap text-xs">{articlePath}/</span>}
            >
              <Input
                type="text"
                size="sm"
                value={slug}
                onChange={(event) =>
                  onSlugChange(event.target.value.toLowerCase().replace(/[^a-z0-9_-]+/g, '-'))
                }
                placeholder="mon-titre-article"
              />
            </InputGroup>
          </section>

          {canPublish && (
            <ArticleScheduleSection
              status={status}
              scheduledAt={scheduledAt}
              scheduleDraft={scheduleDraft}
              timeZoneLabel={timeZoneLabel}
              onScheduleDraftChange={onScheduleDraftChange}
              onSchedule={onSchedule}
              onClearSchedule={onClearSchedule}
              schedulePending={schedulePending}
            />
          )}

          <section className="space-y-3 pt-4 border-t border-border/40">
            <ArticleAttributionEditor
              value={attributions}
              onChange={onAttributionsChange}
              articleId={articleId}
            />
          </section>

          <section className="space-y-4 pt-4 border-t border-border/40">
            <SectionTitle icon={<Search className="h-3.5 w-3.5 text-primary stroke-[1.5]" />}>
              {t`Référencement SEO & Social`}
            </SectionTitle>

            <div className="space-y-1">
              <p className="text-sm font-medium text-primary line-clamp-1">
                {seoTitle.trim() || autoSeoTitle || t`Titre de l'article`}
              </p>
              <p className="text-[11px] text-muted-foreground line-clamp-2 leading-snug">
                {seoDescription.trim() ||
                  autoSeoDescription ||
                  t`Description générée depuis le début de l'article.`}
              </p>
              <p className="text-[10px] text-muted-foreground/70 truncate">
                {`${subdomain ? `${subdomain}.qoe.fi` : 'qoe.fi'}${articlePath}/${slug || 'mon-titre-article'}`}
              </p>
            </div>

            <Button
              variant="ghost"
              tone="brand"
              size="xs"
              onClick={() => setSeoAdvancedOpen((value) => !value)}
              className="h-auto px-0 py-0.5 text-[11px] hover:bg-transparent hover:underline"
            >
              {seoAdvancedOpen ? t`Masquer la configuration avancée` : t`Personnaliser le SEO`}
            </Button>

            <div className={cn('space-y-3', seoAdvancedOpen ? 'block' : 'hidden')}>
              <StudioField label={t`Titre SEO`} counter={`${seoTitle.length}/60`}>
                <Input
                  type="text"
                  size="sm"
                  value={seoTitle}
                  onChange={(event) => onSeoTitleChange(event.target.value)}
                  placeholder={autoSeoTitle || t`Titre de l'article`}
                />
              </StudioField>

              <StudioField
                label={t`Description SEO`}
                counter={`${seoDescription.length}/160`}
                hint={t`Affichée sous le titre dans les résultats de recherche et les partages.`}
              >
                <Textarea
                  size="sm"
                  rows={3}
                  value={seoDescription}
                  onChange={(event) => onSeoDescriptionChange(event.target.value)}
                  placeholder={autoSeoDescription || t`Résumé de l'article.`}
                />
              </StudioField>
            </div>
          </section>

          <section className="space-y-3 pt-4 border-t border-border/40">
            <SectionTitle icon={<Lock className="h-3.5 w-3.5 text-primary stroke-[1.5]" />}>
              {t`Accès & Monétisation`}
            </SectionTitle>

            <StudioRowList>
              <ToggleRow
                icon={<Lock className="w-3.5 h-3.5 text-highlight" />}
                title={t`Article Paywall Premium`}
                description={t`Réservé aux membres disposant d'un abonnement payant.`}
                checked={isPremium}
                onChange={onTogglePremium}
              />
              <ToggleRow
                icon={<Highlighter className="w-3.5 h-3.5 text-primary" />}
                title={t`Annotations publiques`}
                description={t`Permet aux lecteurs de surligner et d'annoter publiquement vos phrases.`}
                checked={allowPublicAnnotations}
                onChange={onTogglePublicAnnotations}
              />
              <ToggleRow
                icon={<MessageSquare className="w-3.5 h-3.5 text-primary" />}
                title={t`Espace commentaires`}
                description={t`Ouvre un espace de débat et d'échange sous l'article.`}
                checked={allowComments}
                onChange={onToggleComments}
              />
              {articleId && (
                <ToggleRow
                  icon={<Download className="w-3.5 h-3.5 text-primary" />}
                  title={t`Téléchargement hors-ligne`}
                  description={t`Autorise les lecteurs Plus à mettre cet article hors-ligne et dans leur file d'écoute.`}
                  checked={allowDownload}
                  disabled={downloadSaving}
                  onChange={onToggleDownload}
                />
              )}
            </StudioRowList>
          </section>

          {published && hasUnpublishedChanges && onDiscardDraft && (
            <section className="space-y-2 pt-4 border-t border-destructive/20">
              <SectionTitle icon={<RotateCcw className="h-3.5 w-3.5 text-destructive-text" />}>
                {t`Modifications non publiées`}
              </SectionTitle>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                {t`Abandonner le brouillon réinitialise l'éditeur à la version actuellement visible par vos lecteurs.`}
              </p>
              <Button variant="outline" tone="danger" size="sm" onClick={onDiscardDraft}>
                <RotateCcw />
                {t`Abandonner les modifications`}
              </Button>
            </section>
          )}

          {published && canPublish && (
            <section className="space-y-2 pt-4 border-t border-destructive/20">
              <SectionTitle icon={<Trash2 className="h-3.5 w-3.5 text-destructive-text" />}>
                {t`Zone sensible`}
              </SectionTitle>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                {t`Dépublier retire immédiatement l'article du site public. Le contenu est conservé en brouillon.`}
              </p>
              <Button variant="outline" tone="danger" size="sm" onClick={onUnpublish}>
                {t`Dépublier l'article`}
              </Button>
            </section>
          )}
        </DrawerBody>

        {footer && <DrawerFooter className="justify-stretch">{footer}</DrawerFooter>}
      </DrawerContent>
    </Drawer>
  );
}
