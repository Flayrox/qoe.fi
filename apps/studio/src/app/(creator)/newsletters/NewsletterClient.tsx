'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { t } from '@lingui/core/macro';
import Link from 'next/link';
import {
  Check,
  Eye,
  FileText,
  History,
  Image as ImageIcon,
  Loader2,
  Mail,
  Monitor,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Send,
  Settings2,
  Smartphone,
  Trash2,
} from 'lucide-react';
import { ColorPicker } from '@qoe/ui';
import { Badge } from '@qoe/ui/badge';
import { Button, buttonClasses } from '@qoe/ui/button';
import { Dropdown, type DropdownItem } from '@qoe/ui/dropdown';
import { Input, Textarea } from '@qoe/ui/input';
import { Switch } from '@qoe/ui/switch';
import { Tab, TabList, Tabs } from '@qoe/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  sortRows,
  type SortDescriptorLike,
  type SortSpec,
} from '@qoe/ui/table';
import { ToggleButton, ToggleGroup } from '@qoe/ui/toggle';
import { toast } from '@qoe/ui/toast';
import { ImageUploader } from '@qoe/ui/ui/ImageUploader';
import { uploadImageToRoute, IMAGE_FOLDERS } from '@qoe/supabase/storage';
import { cn } from '@qoe/utils';
import {
  createNewsletterAction,
  deleteNewsletterAction,
  listNewslettersAction,
  sendNewsletterAction,
  updateNewsletterAction,
  type NewsletterIssue,
} from './actions';
import {
  previewEmailSettingsAction,
  sendTestEmailAction,
  updateEmailSettingsAction,
  type PublicationEmailSettings,
} from '@/features/settings/actions';
import { attemptWithStepUp } from '@/lib/authz-feedback';
import { StudioHeader } from '@/components/studio-page';

interface NewsletterClientProps {
  initialIssues: NewsletterIssue[];
  publicationId: string;
  publicationName: string;
  initialEmailSettings: PublicationEmailSettings | null;
  emailPro: boolean;
  locales: string[];
  accentColor?: string;
  logoUrl?: string;
}

type Section = 'config' | 'direct' | 'history';
type PreviewTemplate = 'confirm' | 'welcome';

interface EmailPreview {
  subject: string;
  from: string;
  html: string;
  text: string;
}

const ACCENT_PRESETS = [
  { name: 'Noir', hex: '#18181b' },
  { name: 'Rouge', hex: '#e11d48' },
  { name: 'Orange', hex: '#ea580c' },
  { name: 'Vert', hex: '#16a34a' },
  { name: 'Bleu', hex: '#2563eb' },
  { name: 'Violet', hex: '#7c3aed' },
];

const ISSUE_SORT: SortSpec<NewsletterIssue> = {
  subject: { kind: 'text', value: (row) => row.subject },
  status: {
    kind: 'rank',
    rank: ['SENDING', 'SENT', 'FAILED', 'DRAFT'],
    value: (row) => row.status,
  },
  recipients: { kind: 'number', value: (row) => row.totalRecipients },
  sentAt: { kind: 'date', value: (row) => (row.sentAt ? new Date(row.sentAt) : new Date(0)) },
};

/** Carte de réglage, au format des panneaux de /settings. */
function SettingsCard({
  icon: Icon,
  title,
  aside,
  children,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border/50 bg-card p-4 shadow-2xs">
      <header className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Icon className="h-3.5 w-3.5 shrink-0 text-primary" strokeWidth={1.5} />
          <h2 className="truncate text-xs font-bold tracking-wider text-muted-foreground uppercase">
            {title}
          </h2>
        </div>
        {aside}
      </header>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

/** Libellé + indice + badge Pro, avec l'association `htmlFor` explicite. */
function Field({
  id,
  label,
  hint,
  aside,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-xs font-semibold text-foreground">
          {label}
        </label>
        {aside}
      </div>
      {children}
      {hint && <p className="text-[11px] leading-relaxed text-muted-foreground">{hint}</p>}
    </div>
  );
}

function ProBadge() {
  return (
    <Badge variant="soft" tone="brand" size="xs">
      PRO
    </Badge>
  );
}

export function NewsletterClient({
  initialIssues,
  publicationId,
  publicationName,
  initialEmailSettings,
  emailPro,
  locales = ['fr', 'en'],
  accentColor = '#18181b',
  logoUrl = '',
}: NewsletterClientProps) {
  const [activeSection, setActiveSection] = useState<Section>('config');
  const [issues, setIssues] = useState<NewsletterIssue[]>(initialIssues);

  // ─── Configuration ───
  const initialSettings: PublicationEmailSettings = initialEmailSettings ?? {
    fromName: '',
    replyTo: '',
    footerNote: '',
    welcomeBody: '',
    welcomeEnabled: true,
    logoUrl: logoUrl ?? '',
    accentColor: accentColor ?? '#18181b',
  };
  const [settings, setSettings] = useState<PublicationEmailSettings>(initialSettings);
  const [savedSettings, setSavedSettings] = useState<PublicationEmailSettings>(initialSettings);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);

  // ─── Aperçu (rendu du backend) ───
  const [previewTemplate, setPreviewTemplate] = useState<PreviewTemplate>('welcome');
  const [previewLocale, setPreviewLocale] = useState(locales[0] ?? 'fr');
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [preview, setPreview] = useState<EmailPreview | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [showTextVersion, setShowTextVersion] = useState(false);
  const previewRequest = useRef(0);

  // ─── Compositeur de message direct ───
  const [showComposer, setShowComposer] = useState(false);
  const [editingIssue, setEditingIssue] = useState<NewsletterIssue | null>(null);
  const [composerSubject, setComposerSubject] = useState('');
  const [composerPreviewText, setComposerPreviewText] = useState('');
  const [composerHtml, setComposerHtml] = useState('');
  const [isSubmittingCampaign, setIsSubmittingCampaign] = useState(false);
  const [busyActionId, setBusyActionId] = useState<string | null>(null);

  // ─── Tri de l'historique ───
  const [sortDescriptor, setSortDescriptor] = useState<SortDescriptorLike>({
    column: 'sentAt',
    direction: 'descending',
  });

  const sortedIssues = sortRows(issues, sortDescriptor, ISSUE_SORT);
  const hasSettingsChanges = JSON.stringify(settings) !== JSON.stringify(savedSettings);

  const refreshIssues = async () => {
    const res = await listNewslettersAction();
    if (res.success) setIssues(res.items);
  };

  const updateSetting = <K extends keyof PublicationEmailSettings>(
    key: K,
    value: PublicationEmailSettings[K]
  ) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const setTemplateMap = (
    key: 'subjects' | 'preheaders',
    template: PreviewTemplate,
    value: string
  ) => {
    setSettings((prev) => ({ ...prev, [key]: { ...prev[key], [template]: value } }));
  };

  /**
   * L'aperçu est le rendu RÉEL du backend — le même moteur que les envois.
   * Débounce court : une frappe ne déclenche pas un rendu par caractère.
   */
  const refreshPreview = useCallback(
    async (next: PublicationEmailSettings) => {
      const request = ++previewRequest.current;
      setIsPreviewing(true);
      try {
        const res = await previewEmailSettingsAction(
          publicationId,
          previewTemplate,
          previewLocale,
          next
        );
        if (request === previewRequest.current) {
          setPreview({ subject: res.subject, from: res.from, html: res.html, text: res.text });
        }
      } catch {
        // Silencieux : un aperçu ne doit jamais interrompre la saisie.
      } finally {
        if (request === previewRequest.current) setIsPreviewing(false);
      }
    },
    [publicationId, previewTemplate, previewLocale]
  );

  useEffect(() => {
    const timer = window.setTimeout(() => void refreshPreview(settings), 450);
    return () => window.clearTimeout(timer);
  }, [settings, refreshPreview]);

  const handleSaveSettings = async () => {
    setIsSavingSettings(true);
    try {
      const res = await updateEmailSettingsAction(publicationId, settings);
      const stored = res.emailSettings ?? settings;
      setSettings(stored);
      setSavedSettings(stored);
      toast.success(t`Réglages enregistrés.`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t`Échec de la sauvegarde des réglages.`);
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleSendTestEmail = async () => {
    setIsSendingTest(true);
    try {
      await sendTestEmailAction(publicationId, previewTemplate, previewLocale, settings);
      toast.success(t`Email test envoyé.`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t`Échec de l'envoi du test.`);
    } finally {
      setIsSendingTest(false);
    }
  };

  const handleOpenComposer = (issue?: NewsletterIssue) => {
    if (issue) {
      setEditingIssue(issue);
      setComposerSubject(issue.subject);
      setComposerPreviewText(issue.previewText ?? '');
      setComposerHtml(issue.html);
    } else {
      setEditingIssue(null);
      setComposerSubject('');
      setComposerPreviewText('');
      setComposerHtml('');
    }
    // Depuis l'historique, éditer sans basculer d'onglet laisserait
    // l'utilisateur devant une page inchangée.
    setActiveSection('direct');
    setShowComposer(true);
  };

  const handleSaveComposer = async (options?: { sendAfter?: boolean }) => {
    if (!composerSubject.trim() || !composerHtml.trim()) {
      toast.error(t`Sujet et contenu de l'email requis.`);
      return;
    }
    setIsSubmittingCampaign(true);
    try {
      const res = await attemptWithStepUp(
        () =>
          editingIssue
            ? updateNewsletterAction(editingIssue.id, {
                subject: composerSubject,
                previewText: composerPreviewText,
                html: composerHtml,
              })
            : createNewsletterAction({
                subject: composerSubject,
                previewText: composerPreviewText,
                html: composerHtml,
              }),
        { fallback: t`Erreur lors de la sauvegarde du brouillon` }
      );
      if (!res.success) return;

      toast.success(editingIssue ? t`Brouillon mis à jour` : t`Brouillon créé`);
      const savedIssue = res.issue ?? editingIssue;
      setEditingIssue(null);
      setShowComposer(false);
      await refreshIssues();

      if (options?.sendAfter && savedIssue) {
        await handleSendIssue(savedIssue);
      }
    } finally {
      setIsSubmittingCampaign(false);
    }
  };

  const handleSendIssue = async (issue: NewsletterIssue) => {
    if (!emailPro) {
      toast.error(t`L'envoi sans article est réservé au forfait PRO.`);
      return;
    }
    if (
      !confirm(
        t`Envoyer « ${issue.subject} » à tous les abonnés actifs ? L'envoi ne peut pas être annulé.`
      )
    ) {
      return;
    }
    setBusyActionId(issue.id);
    const res = await attemptWithStepUp(() => sendNewsletterAction(issue.id), {
      fallback: t`Envoi impossible`,
    });
    setBusyActionId(null);
    if (res.success) {
      toast.success(t`Envoi lancé. L'email part dans quelques minutes.`);
      await refreshIssues();
    }
  };

  const handleDeleteIssue = async (id: string) => {
    if (!confirm(t`Supprimer définitivement ce brouillon ?`)) return;
    setBusyActionId(id);
    const res = await attemptWithStepUp(() => deleteNewsletterAction(id), {
      fallback: t`Suppression impossible`,
    });
    setBusyActionId(null);
    if (res.success) {
      toast.success(t`Brouillon supprimé.`);
      await refreshIssues();
    }
  };

  const totalSentCount = issues
    .filter((issue) => issue.status === 'SENT')
    .reduce((total, issue) => total + issue.sentCount, 0);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <StudioHeader
        title={t`Newsletter`}
        description={t`Emails automatiques, messages directs et historique des envois.`}
        badge={
          emailPro ? (
            <Badge variant="soft" tone="brand" size="xs">
              PRO
            </Badge>
          ) : undefined
        }
        actions={
          <Tabs
            variant="segmented"
            size="sm"
            value={activeSection}
            onValueChange={(key) => setActiveSection(key as Section)}
          >
            <TabList aria-label={t`Sections newsletter`}>
              <Tab id="config" icon={Settings2}>
                {t`Configuration`}
              </Tab>
              <Tab id="direct" icon={Send}>
                {t`Message direct`}
              </Tab>
              <Tab id="history" icon={History} count={issues.length}>
                {t`Historique`}
              </Tab>
            </TabList>
          </Tabs>
        }
      />

      {/* ═══ Onglet 1 : configuration ═══ */}
      {activeSection === 'config' && (
        <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
          <div className="space-y-5 lg:col-span-7">
            <SettingsCard
              icon={Mail}
              title={t`Expéditeur`}
              aside={
                !emailPro ? <Badge variant="outline" size="xs">{t`Standard`}</Badge> : undefined
              }
            >
              <Field
                id="newsletter-from-name"
                label={t`Nom d'expéditeur`}
                hint={
                  emailPro
                    ? t`Affiché comme nom d'expéditeur.`
                    : t`Réservé au forfait PRO. Le nom de la publication est utilisé.`
                }
                aside={emailPro ? undefined : <ProBadge />}
              >
                <Input
                  id="newsletter-from-name"
                  size="sm"
                  value={settings.fromName ?? ''}
                  disabled={!emailPro}
                  maxLength={60}
                  onChange={(e) => updateSetting('fromName', e.target.value)}
                  placeholder={publicationName}
                />
              </Field>

              <Field
                id="newsletter-reply-to"
                label={t`Adresse de réponse (Reply-To)`}
                hint={
                  emailPro
                    ? t`Les réponses arrivent dans cette boîte.`
                    : t`Les emails partent de l'infrastructure qoe.fi.`
                }
                aside={emailPro ? <ProBadge /> : undefined}
              >
                <Input
                  id="newsletter-reply-to"
                  size="sm"
                  type="email"
                  value={settings.replyTo ?? ''}
                  disabled={!emailPro}
                  maxLength={254}
                  onChange={(e) => updateSetting('replyTo', e.target.value)}
                  placeholder="contact@votredomaine.com"
                />
              </Field>
            </SettingsCard>

            <SettingsCard
              icon={FileText}
              title={t`Emails automatiques`}
              aside={!emailPro ? <ProBadge /> : undefined}
            >
              <Switch
                size="sm"
                isSelected={settings.welcomeEnabled !== false}
                onChange={(enabled) => updateSetting('welcomeEnabled', enabled)}
                label={t`Email de bienvenue`}
                description={t`Envoyé une fois l'inscription confirmée.`}
                className="rounded-lg border border-border/40 bg-muted/20 px-3 py-2"
              />

              <Field
                id="newsletter-subject-confirm"
                label={t`Sujet de la confirmation`}
                hint={t`Une seule version pour toutes les langues.`}
                aside={!emailPro ? <ProBadge /> : undefined}
              >
                <Input
                  id="newsletter-subject-confirm"
                  size="sm"
                  value={settings.subjects?.confirm ?? ''}
                  disabled={!emailPro}
                  maxLength={120}
                  onChange={(e) => setTemplateMap('subjects', 'confirm', e.target.value)}
                  placeholder={t`Confirmez votre abonnement — ${publicationName}`}
                />
              </Field>

              <Field
                id="newsletter-preheader-confirm"
                label={t`Texte d'aperçu de la confirmation`}
                hint={t`Visible à côté du sujet, avant ouverture.`}
                aside={!emailPro ? <ProBadge /> : undefined}
              >
                <Input
                  id="newsletter-preheader-confirm"
                  size="sm"
                  value={settings.preheaders?.confirm ?? ''}
                  disabled={!emailPro}
                  maxLength={140}
                  onChange={(e) => setTemplateMap('preheaders', 'confirm', e.target.value)}
                  placeholder={t`Un clic suffit pour recevoir vos prochaines parutions.`}
                />
              </Field>

              <Field
                id="newsletter-subject-welcome"
                label={t`Sujet du bienvenue`}
                aside={!emailPro ? <ProBadge /> : undefined}
              >
                <Input
                  id="newsletter-subject-welcome"
                  size="sm"
                  value={settings.subjects?.welcome ?? ''}
                  disabled={!emailPro}
                  maxLength={120}
                  onChange={(e) => setTemplateMap('subjects', 'welcome', e.target.value)}
                  placeholder={t`Bienvenue chez ${publicationName}`}
                />
              </Field>

              <Field
                id="newsletter-preheader-welcome"
                label={t`Texte d'aperçu du bienvenue`}
                aside={!emailPro ? <ProBadge /> : undefined}
              >
                <Input
                  id="newsletter-preheader-welcome"
                  size="sm"
                  value={settings.preheaders?.welcome ?? ''}
                  disabled={!emailPro}
                  maxLength={140}
                  onChange={(e) => setTemplateMap('preheaders', 'welcome', e.target.value)}
                  placeholder={t`Votre inscription est confirmée.`}
                />
              </Field>

              <Field
                id="newsletter-welcome-body"
                label={t`Corps de l'email de bienvenue`}
                hint={t`Texte brut, identique pour toutes les langues.`}
                aside={
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {(settings.welcomeBody ?? '').length}/2000
                  </span>
                }
              >
                <Textarea
                  id="newsletter-welcome-body"
                  size="sm"
                  rows={4}
                  value={settings.welcomeBody ?? ''}
                  disabled={!emailPro || settings.welcomeEnabled === false}
                  maxLength={2000}
                  onChange={(e) => updateSetting('welcomeBody', e.target.value)}
                  placeholder={t`Votre inscription est confirmée. À très vite !`}
                />
              </Field>
            </SettingsCard>

            <SettingsCard icon={ImageIcon} title={t`Logo et signature`}>
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-foreground">{t`Logo d'en-tête`}</p>
                <ImageUploader
                  value={settings.logoUrl || null}
                  onChange={(url) => updateSetting('logoUrl', url ?? '')}
                  upload={(file) =>
                    uploadImageToRoute(file, '/api/articles/upload', IMAGE_FOLDERS.avatars)
                  }
                  aspect={1}
                  shape="circle"
                  maxDimension={512}
                />
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  {t`À défaut, l'initiale de la publication.`}
                </p>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-foreground">{t`Couleur des boutons`}</span>
                  {!emailPro ? <ProBadge /> : undefined}
                </div>
                <fieldset disabled={!emailPro} className={cn('min-w-0', !emailPro && 'opacity-50')}>
                  <ColorPicker
                    value={settings.accentColor ?? '#18181b'}
                    onChange={(hex) => updateSetting('accentColor', hex ?? '#18181b')}
                    presets={ACCENT_PRESETS}
                    allowClear={false}
                    defaultLabel={t`Couleur par défaut`}
                  />
                </fieldset>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  {t`Couleur du bouton principal des emails.`}
                </p>
              </div>

              <Field
                id="newsletter-footer-note"
                label={t`Note de pied de page (signature)`}
                hint={t`Mention libre sous le texte de consentement.`}
                aside={!emailPro ? <ProBadge /> : undefined}
              >
                <Input
                  id="newsletter-footer-note"
                  size="sm"
                  value={settings.footerNote ?? ''}
                  disabled={!emailPro}
                  maxLength={200}
                  onChange={(e) => updateSetting('footerNote', e.target.value)}
                  placeholder={t`Merci de lire ${publicationName}. Retrouvez nos archives sur le site.`}
                />
              </Field>
            </SettingsCard>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={handleSendTestEmail}
                disabled={isSendingTest}
                className="gap-2"
              >
                {isSendingTest ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Mail className="h-3.5 w-3.5" />
                )}
                <span>{t`Envoyer un test à mon adresse`}</span>
              </Button>

              <Button
                variant="solid"
                tone="brand"
                size="sm"
                onClick={handleSaveSettings}
                disabled={isSavingSettings || !hasSettingsChanges}
                className="gap-2"
              >
                {isSavingSettings ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
                <span>{t`Enregistrer`}</span>
              </Button>
            </div>
          </div>

          {/* ─── Aperçu ─── */}
          <div className="lg:sticky lg:top-6 lg:col-span-5">
            <div className="overflow-hidden rounded-xl border border-border/60 bg-card">
              <div className="space-y-2.5 border-b border-border/40 p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <Eye className="h-3.5 w-3.5 text-primary" />
                    {t`Aperçu`}
                    {isPreviewing && (
                      <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                    )}
                  </div>
                  <ToggleGroup
                    aria-label={t`Appareil d'aperçu`}
                    variant="inset"
                    selectionMode="single"
                    disallowEmptySelection
                    selectedKeys={[previewDevice]}
                    onSelectionChange={(keys) => {
                      const [next] = Array.from(keys);
                      if (next) setPreviewDevice(next as 'desktop' | 'mobile');
                    }}
                  >
                    <ToggleButton id="desktop" size="xs" aria-label={t`Bureau`}>
                      <Monitor className="size-3.5" />
                    </ToggleButton>
                    <ToggleButton id="mobile" size="xs" aria-label={t`Mobile`}>
                      <Smartphone className="size-3.5" />
                    </ToggleButton>
                  </ToggleGroup>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <ToggleGroup
                    aria-label={t`Modèle d'email`}
                    variant="inset"
                    selectionMode="single"
                    disallowEmptySelection
                    selectedKeys={[previewTemplate]}
                    onSelectionChange={(keys) => {
                      const [next] = Array.from(keys);
                      if (next) setPreviewTemplate(next as PreviewTemplate);
                    }}
                  >
                    <ToggleButton id="confirm" size="xs">
                      {t`Confirmation`}
                    </ToggleButton>
                    <ToggleButton id="welcome" size="xs">
                      {t`Bienvenue`}
                    </ToggleButton>
                  </ToggleGroup>

                  {locales.length > 1 && (
                    <ToggleGroup
                      aria-label={t`Langue d'aperçu`}
                      variant="inset"
                      selectionMode="single"
                      disallowEmptySelection
                      selectedKeys={[previewLocale]}
                      onSelectionChange={(keys) => {
                        const [next] = Array.from(keys);
                        if (next) setPreviewLocale(String(next));
                      }}
                    >
                      {locales.map((locale) => (
                        <ToggleButton key={locale} id={locale} size="xs" className="uppercase">
                          {locale}
                        </ToggleButton>
                      ))}
                    </ToggleGroup>
                  )}
                </div>
              </div>

              <div className="bg-muted/30 p-4 sm:p-5">
                <div
                  className={cn(
                    'mx-auto overflow-hidden bg-background transition-all duration-200',
                    previewDevice === 'mobile'
                      ? 'max-w-[320px] rounded-xl border-4 border-border shadow-lg'
                      : 'w-full rounded-xl border border-border/50 shadow-sm'
                  )}
                >
                  <div className="border-b border-border/40 bg-muted/30 px-3.5 py-2.5">
                    <p className="truncate text-[11px] font-semibold text-foreground">
                      {preview?.from || publicationName}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-foreground">
                      {preview?.subject || t`Chargement…`}
                    </p>
                  </div>

                  {preview ? (
                    <iframe
                      title={t`Aperçu de l'email`}
                      srcDoc={preview.html}
                      sandbox=""
                      style={{ backgroundColor: '#ffffff' }}
                      className={cn(
                        'w-full',
                        previewDevice === 'mobile' ? 'h-[440px]' : 'h-[520px]'
                      )}
                    />
                  ) : (
                    <div className="flex h-[320px] items-center justify-center text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2 border-t border-border/40 p-3.5">
                <Button
                  variant="outline"
                  size="sm"
                  block
                  onClick={handleSendTestEmail}
                  disabled={isSendingTest}
                  className="gap-2"
                >
                  {isSendingTest ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                  <span>
                    {t`Envoyer un test`}
                    <span className="uppercase opacity-60"> ({previewLocale})</span>
                  </span>
                </Button>

                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => setShowTextVersion((visible) => !visible)}
                  className="px-0 text-[11px] text-muted-foreground underline hover:bg-transparent hover:text-foreground"
                >
                  {showTextVersion ? t`Masquer la version texte` : t`Voir la version texte`}
                </Button>

                {showTextVersion && preview && (
                  <pre className="max-h-56 overflow-y-auto rounded-lg border border-border/30 bg-muted/20 p-3 text-[10px] leading-relaxed whitespace-pre-wrap text-muted-foreground">
                    {preview.text}
                  </pre>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Onglet 2 : message direct ═══ */}
      {activeSection === 'direct' && (
        <div className="space-y-5">
          {!emailPro ? (
            <div className="max-w-2xl rounded-xl border border-border/50 bg-card p-5 shadow-2xs">
              <div className="flex items-center gap-2">
                <Badge variant="outline" size="xs">
                  {t`PRO`}
                </Badge>
                <h2 className="text-sm font-semibold text-foreground">{t`Messages directs`}</h2>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {t`L'envoi de vos articles est inclus dans toutes les offres. Rédiger un message sans article demande le forfait PRO.`}
              </p>
              <Link
                href="/pricing"
                className={buttonClasses({
                  variant: 'outline',
                  size: 'sm',
                  className: 'mt-4',
                })}
              >
                {t`Voir les offres`}
              </Link>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-foreground">{t`Messages directs`}</h2>
                  <p className="text-xs text-muted-foreground">
                    {t`Un email à vos abonnés, sans article.`}
                  </p>
                </div>
                {!showComposer && (
                  <Button
                    variant="solid"
                    tone="brand"
                    size="sm"
                    onClick={() => handleOpenComposer()}
                    className="gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    <span>{t`Nouveau message direct`}</span>
                  </Button>
                )}
              </div>

              {showComposer ? (
                <div className="rounded-xl border border-border/60 bg-card p-5 sm:p-6">
                  <div className="mb-4 flex items-center justify-between border-b border-border/40 pb-3">
                    <h3 className="text-sm font-semibold text-foreground">
                      {editingIssue ? t`Modifier le message direct` : t`Composer un message direct`}
                    </h3>
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => setShowComposer(false)}
                      className="text-muted-foreground"
                    >
                      {t`Fermer`}
                    </Button>
                  </div>

                  <div className="space-y-4">
                    <Field
                      id="composer-subject"
                      label={t`Objet du message`}
                      aside={
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {composerSubject.length}/120
                        </span>
                      }
                    >
                      <Input
                        id="composer-subject"
                        size="sm"
                        value={composerSubject}
                        maxLength={120}
                        onChange={(e) => setComposerSubject(e.target.value)}
                        placeholder={t`Nouvelles de la rédaction`}
                      />
                    </Field>

                    <Field
                      id="composer-preheader"
                      label={t`Texte d'aperçu`}
                      aside={
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {composerPreviewText.length}/140
                        </span>
                      }
                    >
                      <Input
                        id="composer-preheader"
                        size="sm"
                        value={composerPreviewText}
                        maxLength={140}
                        onChange={(e) => setComposerPreviewText(e.target.value)}
                        placeholder={t`Visible avant ouverture.`}
                      />
                    </Field>

                    <Field
                      id="composer-html"
                      label={t`Contenu du message`}
                      hint={t`Contenu injecté dans le gabarit email de la publication.`}
                    >
                      <Textarea
                        id="composer-html"
                        size="sm"
                        rows={12}
                        value={composerHtml}
                        onChange={(e) => setComposerHtml(e.target.value)}
                        placeholder={t`<p>Chers abonnés, voici les dernières nouvelles…</p>`}
                        className="font-mono text-xs leading-relaxed"
                      />
                    </Field>

                    <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowComposer(false)}
                        disabled={isSubmittingCampaign}
                      >
                        {t`Annuler`}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void handleSaveComposer()}
                        disabled={isSubmittingCampaign}
                        className="gap-2"
                      >
                        {isSubmittingCampaign ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <FileText className="h-3.5 w-3.5" />
                        )}
                        <span>
                          {editingIssue ? t`Mettre à jour le brouillon` : t`Créer le brouillon`}
                        </span>
                      </Button>

                      {(editingIssue?.status === 'DRAFT' || editingIssue?.status === 'FAILED') && (
                        <Button
                          variant="solid"
                          tone="brand"
                          size="sm"
                          onClick={() => void handleSaveComposer({ sendAfter: true })}
                          disabled={isSubmittingCampaign}
                          className="gap-2"
                        >
                          <Send className="h-3.5 w-3.5" />
                          <span>{t`Enregistrer et envoyer`}</span>
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border p-6 text-center">
                  <p className="text-xs text-muted-foreground">{t`Aucun brouillon.`}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleOpenComposer()}
                    className="mt-3 gap-2"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>{t`Écrire un message`}</span>
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ═══ Onglet 3 : historique ═══ */}
      {activeSection === 'history' && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-muted-foreground">
            <span>
              {t`Envois`} :{' '}
              <span className="font-medium text-foreground tabular-nums">{issues.length}</span>
            </span>
            <span>
              {t`Délivrés`} :{' '}
              <span className="font-medium text-foreground tabular-nums">
                {totalSentCount.toLocaleString('fr-FR')}
              </span>
            </span>
            <span>
              {t`En attente`} :{' '}
              <span className="font-medium text-foreground tabular-nums">
                {
                  issues.filter((issue) => issue.status === 'DRAFT' || issue.status === 'FAILED')
                    .length
                }
              </span>
            </span>
          </div>

          {issues.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-8 text-center">
              <p className="text-sm font-medium text-foreground">{t`Aucun envoi.`}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t`Les parutions d'articles et les messages directs apparaîtront ici.`}
              </p>
            </div>
          ) : (
            <Table
              aria-label={t`Historique des envois`}
              sortDescriptor={sortDescriptor}
              onSortChange={setSortDescriptor}
            >
              <TableHeader>
                <TableColumn id="subject" isRowHeader allowsSorting>
                  {t`Sujet`}
                </TableColumn>
                <TableColumn id="status" allowsSorting>
                  {t`État`}
                </TableColumn>
                <TableColumn id="recipients" allowsSorting>
                  {t`Destinataires`}
                </TableColumn>
                <TableColumn id="sentAt" allowsSorting>
                  {t`Date`}
                </TableColumn>
                <TableColumn id="actions">
                  <span className="sr-only">{t`Actions`}</span>
                </TableColumn>
              </TableHeader>

              <TableBody items={sortedIssues} emptyState={t`Aucun envoi`}>
                {(issue) => {
                  const isDraft = issue.status === 'DRAFT';
                  const isFailed = issue.status === 'FAILED';
                  const isSending = issue.status === 'SENDING';
                  const isSent = issue.status === 'SENT';

                  const actions: DropdownItem[] = [];
                  if (isDraft || isFailed) {
                    actions.push({
                      id: 'edit',
                      label: t`Modifier`,
                      icon: <Pencil />,
                      onAction: () => handleOpenComposer(issue),
                    });
                    actions.push({
                      id: 'send',
                      label: isFailed ? t`Renvoyer` : t`Envoyer`,
                      icon: isFailed ? <RotateCcw /> : <Send />,
                      onAction: () => void handleSendIssue(issue),
                    });
                    actions.push({
                      id: 'delete',
                      label: t`Supprimer`,
                      icon: <Trash2 />,
                      tone: 'danger',
                      onAction: () => void handleDeleteIssue(issue.id),
                    });
                  }

                  return (
                    <TableRow id={issue.id}>
                      <TableCell>
                        <div className="py-1">
                          <span className="block max-w-md truncate text-xs font-medium text-foreground">
                            {issue.subject}
                          </span>
                          {issue.previewText && (
                            <span className="block max-w-md truncate text-[11px] text-muted-foreground">
                              {issue.previewText}
                            </span>
                          )}
                        </div>
                      </TableCell>

                      <TableCell>
                        {isSent && (
                          <Badge variant="soft" tone="success" dot size="xs">
                            {t`Envoyé`}
                          </Badge>
                        )}
                        {isSending && (
                          <Badge variant="soft" tone="brand" dot size="xs">
                            {t`Envoi en cours…`}
                          </Badge>
                        )}
                        {isFailed && (
                          <Badge variant="soft" tone="danger" dot size="xs">
                            {t`Échec`}
                          </Badge>
                        )}
                        {isDraft && (
                          <Badge variant="soft" tone="neutral" size="xs">
                            {t`Brouillon`}
                          </Badge>
                        )}
                      </TableCell>

                      <TableCell className="text-xs tabular-nums">
                        {isSent ? (
                          <span>
                            {issue.sentCount.toLocaleString('fr-FR')} {t`abonnés`}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>

                      <TableCell className="text-xs text-muted-foreground tabular-nums">
                        {(issue.sentAt ?? issue.createdAt)
                          ? new Date(issue.sentAt ?? issue.createdAt).toLocaleDateString('fr-FR', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })
                          : '—'}
                      </TableCell>

                      <TableCell className="text-right">
                        {busyActionId === issue.id ? (
                          <Loader2 className="ml-auto h-3.5 w-3.5 animate-spin text-muted-foreground" />
                        ) : actions.length > 0 ? (
                          <Dropdown
                            ariaLabel={t`Actions pour « ${issue.subject} »`}
                            label={<MoreHorizontal className="h-3.5 w-3.5" />}
                            items={actions}
                            size="xs"
                            variant="ghost"
                            chevron={false}
                            align="end"
                            className="ml-auto"
                          />
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                }}
              </TableBody>
            </Table>
          )}
        </div>
      )}
    </div>
  );
}
