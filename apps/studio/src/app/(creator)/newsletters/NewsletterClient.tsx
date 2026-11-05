'use client';

import React, { useState } from 'react';
import { t } from '@lingui/core/macro';
import {
  Mail,
  Settings,
  History,
  Send,
  Plus,
  Trash2,
  Pencil,
  Eye,
  Loader2,
  Check,
  Lock,
  RotateCcw,
  Monitor,
  Smartphone,
  ExternalLink,
  Sparkles,
} from 'lucide-react';
import { Button } from '@qoe/ui/button';
import { Input } from '@qoe/ui/input';
import { Badge } from '@qoe/ui/badge';
import { Tabs, TabList, Tab, TabPanel } from '@qoe/ui/tabs';
import {
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
  sortRows,
  type SortSpec,
  type SortDescriptorLike,
} from '@qoe/ui/table';
import { toast } from '@qoe/ui/toast';
import {
  createNewsletterAction,
  deleteNewsletterAction,
  listNewslettersAction,
  sendNewsletterAction,
  updateNewsletterAction,
  type NewsletterIssue,
} from './actions';
import {
  updateEmailSettingsAction,
  sendTestEmailAction,
  type PublicationEmailSettings,
} from '@/features/settings/actions';
import { attemptWithStepUp } from '@/lib/authz-feedback';
import { cn } from '@qoe/utils';
import Link from 'next/link';

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

export function NewsletterClient({
  initialIssues,
  publicationId,
  publicationName,
  initialEmailSettings,
  emailPro,
  accentColor = '#18181b',
  logoUrl = '',
}: NewsletterClientProps) {
  const [activeTab, setActiveTab] = useState<string>('config');
  const [issues, setIssues] = useState<NewsletterIssue[]>(initialIssues);

  // ─── Configuration State ───
  const [settings, setSettings] = useState<PublicationEmailSettings>(
    initialEmailSettings ?? {
      fromName: '',
      replyTo: '',
      footerNote: '',
      welcomeBody: '',
      welcomeEnabled: true,
      logoUrl: logoUrl ?? '',
      accentColor: accentColor ?? '#18181b',
    }
  );
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');

  // ─── Direct Newsletter Composer State ───
  const [showComposer, setShowComposer] = useState(false);
  const [editingIssue, setEditingIssue] = useState<NewsletterIssue | null>(null);
  const [composerSubject, setComposerSubject] = useState('');
  const [composerPreviewText, setComposerPreviewText] = useState('');
  const [composerHtml, setComposerHtml] = useState('');
  const [isSubmittingCampaign, setIsSubmittingCampaign] = useState(false);
  const [busyActionId, setBusyActionId] = useState<string | null>(null);

  // ─── Table Sorting ───
  const [sortDescriptor, setSortDescriptor] = useState<SortDescriptorLike>({
    column: 'sentAt',
    direction: 'descending',
  });

  const sortedIssues = sortRows(issues, sortDescriptor, ISSUE_SORT);

  const refreshIssues = async () => {
    const res = await listNewslettersAction();
    if (res.success) setIssues(res.items);
  };

  const handleSaveSettings = async () => {
    setIsSavingSettings(true);
    try {
      const res = await updateEmailSettingsAction(publicationId, settings);
      if (res?.emailSettings) {
        setSettings(res.emailSettings);
        toast.success(t`Réglages newsletter enregistrés.`);
      } else {
        toast.success(t`Réglages mis à jour.`);
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t`Échec de la sauvegarde des réglages.`);
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleSendConfigTestEmail = async () => {
    setIsSendingTest(true);
    try {
      await sendTestEmailAction(publicationId, 'welcome', 'fr', settings);
      toast.success(t`Email test envoyé à votre adresse personnelle.`);
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
    setShowComposer(true);
  };

  const handleSaveComposer = async () => {
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
      if (res.success) {
        toast.success(editingIssue ? t`Brouillon mis à jour` : t`Brouillon créé`);
        setShowComposer(false);
        await refreshIssues();
      }
    } finally {
      setIsSubmittingCampaign(false);
    }
  };

  const handleSendIssue = async (issue: NewsletterIssue) => {
    if (!emailPro) {
      toast.error(t`L'envoi de messages directs sans article est réservé aux publications PRO.`);
      return;
    }
    if (
      !confirm(
        t`Envoyer « ${issue.subject} » à tous vos abonnés actifs ? Cette action est définitive.`
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
      toast.success(t`Envoi lancé — vos abonnés recevront l'email d'ici quelques minutes.`);
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
    .filter((i) => i.status === 'SENT')
    .reduce((acc, i) => acc + i.sentCount, 0);

  return (
    <div className="space-y-6 p-6 lg:p-10 max-w-6xl mx-auto">
      {/* ─── Header ─── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pb-6 border-b border-border/40">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <Mail className="h-4 w-4 text-primary stroke-[1.5]" />
            <span className="text-[11px] font-bold tracking-wider uppercase text-muted-foreground">
              {t`Diffusion & Abonnés`}
            </span>
            {emailPro && (
              <Badge variant="soft" tone="brand" size="xs">
                PRO
              </Badge>
            )}
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{t`Newsletters & Diffusion`}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t`Configurez l'apparence de vos emails automatiques, envoyez des messages directs et suivez vos envois.`}
          </p>
        </div>

        {/* Navigation par onglets segmentés en creux (conforme UI Lab) */}
        <Tabs
          variant="segmented"
          size="sm"
          value={activeTab}
          onValueChange={setActiveTab}
          className="self-start sm:self-auto"
        >
          <TabList aria-label={t`Sections newsletter`}>
            <Tab id="config" icon={Settings}>
              {t`Configuration`}
            </Tab>
            <Tab id="direct" icon={Send}>
              {t`Message direct`}
              {!emailPro && (
                <span className="ml-1.5 px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-primary/10 text-primary">
                  PRO
                </span>
              )}
            </Tab>
            <Tab id="history" icon={History} count={issues.length}>
              {t`Historique`}
            </Tab>
          </TabList>
        </Tabs>
      </div>

      {/* ─── Onglet 1: Configuration ─── */}
      {activeTab === 'config' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-7 space-y-6">
            {/* Carte 1 : Identité d'expéditeur */}
            <div className="rounded-2xl border border-border/60 bg-card p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-border/40 pb-3">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">{t`Identité d'expédition`}</h3>
                  <p className="text-xs text-muted-foreground">
                    {t`Nom et adresse affichés dans la boîte de réception de vos abonnés.`}
                  </p>
                </div>
                {!emailPro && (
                  <Badge variant="outline" tone="neutral" size="xs">
                    {t`Standard`}
                  </Badge>
                )}
              </div>

              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-medium text-foreground">{t`Nom d'expéditeur`}</label>
                    {!emailPro && (
                      <span className="text-[10px] text-muted-foreground font-medium">
                        {t`Par défaut : ${publicationName}`}
                      </span>
                    )}
                  </div>
                  <Input
                    size="sm"
                    value={settings.fromName ?? ''}
                    disabled={!emailPro}
                    onChange={(e) => setSettings({ ...settings, fromName: e.target.value })}
                    placeholder={publicationName}
                  />
                  {!emailPro && (
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {t`Personnalisation réservée aux publications PRO. Votre nom de publication est utilisé.`}
                    </p>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-medium text-foreground">{t`Adresse de réponse (Reply-To)`}</label>
                    {emailPro && (
                      <Badge variant="soft" tone="brand" size="xs">
                        PRO
                      </Badge>
                    )}
                  </div>
                  <Input
                    size="sm"
                    type="email"
                    value={settings.replyTo ?? ''}
                    disabled={!emailPro}
                    onChange={(e) => setSettings({ ...settings, replyTo: e.target.value })}
                    placeholder="contact@votredomaine.com"
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {emailPro
                      ? t`Les réponses de vos abonnés seront transférées directement vers cette boîte email.`
                      : t`En version standard, les emails sont diffusés via l'infrastructure sécurisée qoe.fi.`}
                  </p>
                </div>
              </div>
            </div>

            {/* Carte 2 : Visuel & Signature */}
            <div className="rounded-2xl border border-border/60 bg-card p-6 space-y-4">
              <div className="border-b border-border/40 pb-3">
                <h3 className="text-sm font-semibold text-foreground">{t`Branding & Signature`}</h3>
                <p className="text-xs text-muted-foreground">
                  {t`Détails graphiques et note personnalisée ajoutés au bas de chaque envoi.`}
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-foreground mb-1 block">
                    {t`Logo d'en-tête (URL)`}
                  </label>
                  <Input
                    size="sm"
                    value={settings.logoUrl ?? ''}
                    onChange={(e) => setSettings({ ...settings, logoUrl: e.target.value })}
                    placeholder="https://..."
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-medium text-foreground">
                      {t`Note de pied de page (Signature)`}
                    </label>
                    {emailPro && (
                      <Badge variant="soft" tone="brand" size="xs">
                        PRO
                      </Badge>
                    )}
                  </div>
                  <Input
                    size="sm"
                    value={settings.footerNote ?? ''}
                    disabled={!emailPro}
                    onChange={(e) => setSettings({ ...settings, footerNote: e.target.value })}
                    placeholder={t`Merci de lire ${publicationName}. Retrouvez nos archives sur le site.`}
                  />
                </div>
              </div>
            </div>

            {/* Carte 3 : Action Bar */}
            <div className="flex items-center justify-between pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleSendConfigTestEmail}
                disabled={isSendingTest}
                className="gap-2"
              >
                {isSendingTest ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Mail className="w-3.5 h-3.5" />
                )}
                <span>{t`Envoyer un test à mon adresse`}</span>
              </Button>

              <Button
                variant="solid"
                tone="brand"
                size="sm"
                onClick={handleSaveSettings}
                disabled={isSavingSettings}
                className="gap-2"
              >
                {isSavingSettings ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Check className="w-3.5 h-3.5" />
                )}
                <span>{t`Enregistrer les modifications`}</span>
              </Button>
            </div>
          </div>

          {/* Colonne latérale : Live Preview */}
          <div className="lg:col-span-5 sticky top-6">
            <div className="rounded-2xl border border-border/60 bg-muted/20 overflow-hidden">
              <div className="p-3.5 flex items-center justify-between border-b border-border/40 bg-card">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <Eye className="w-3.5 h-3.5" />
                  <span>{t`Aperçu du rendu`}</span>
                </div>
                <div className="flex items-center gap-0.5 bg-muted p-0.5 rounded-control">
                  <Button
                    variant="ghost"
                    size="xs"
                    shape="icon"
                    onClick={() => setPreviewDevice('desktop')}
                    className={cn(
                      'size-6',
                      previewDevice === 'desktop'
                        ? 'bg-background shadow-xs text-foreground'
                        : 'text-muted-foreground'
                    )}
                  >
                    <Monitor />
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    shape="icon"
                    onClick={() => setPreviewDevice('mobile')}
                    className={cn(
                      'size-6',
                      previewDevice === 'mobile'
                        ? 'bg-background shadow-xs text-foreground'
                        : 'text-muted-foreground'
                    )}
                  >
                    <Smartphone />
                  </Button>
                </div>
              </div>

              <div className="p-4 sm:p-6 flex justify-center bg-muted/40">
                <div
                  className={cn(
                    'bg-card text-card-foreground border border-border/80 rounded-xl shadow-sm p-5 transition-all duration-200',
                    previewDevice === 'mobile' ? 'max-w-[300px] w-full text-xs' : 'max-w-md w-full'
                  )}
                >
                  <div className="border-b border-border/40 pb-3 mb-4 space-y-1 text-xs">
                    <div className="text-muted-foreground">
                      {t`De :`}{' '}
                      <span className="text-foreground font-medium">
                        {settings.fromName?.trim() || publicationName} &lt;noreply@qoe.fi&gt;
                      </span>
                    </div>
                    {settings.replyTo?.trim() && (
                      <div className="text-muted-foreground text-[11px]">
                        {t`Répondre à :`}{' '}
                        <span className="text-foreground font-mono">{settings.replyTo.trim()}</span>
                      </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    {settings.logoUrl?.trim() && (
                      <img
                        src={settings.logoUrl.trim()}
                        alt="Logo"
                        className="w-10 h-10 rounded-lg object-cover mb-2"
                      />
                    )}
                    <h5 className="font-bold text-sm leading-snug">
                      {t`Titre d'exemple de votre parution`}
                    </h5>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {t`Voici à quoi ressemblera le texte distribué dans la messagerie de vos lecteurs. Le style respecte la typographie haute lisibilité et s'adapte au mode sombre.`}
                    </p>
                    <div className="pt-2">
                      <span className="inline-block px-3 py-1 rounded-full text-[11px] font-semibold bg-foreground text-background">
                        {t`Lire sur le web`}
                      </span>
                    </div>
                  </div>

                  {settings.footerNote?.trim() && (
                    <div className="mt-6 pt-3 border-t border-border/30 text-[11px] text-muted-foreground italic">
                      {settings.footerNote.trim()}
                    </div>
                  )}

                  <div className="mt-4 pt-3 border-t border-border/30 text-[10px] text-muted-foreground flex justify-between">
                    <span>{t`Envoyé par ${publicationName}`}</span>
                    <span className="underline">{t`Se désabonner`}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Onglet 2: Message direct (Broadcast PRO) ─── */}
      {activeTab === 'direct' && (
        <div className="space-y-6">
          {!emailPro ? (
            /* Bannière Upsell PRO sobre et élégante (zéro auto-pilot ou hype IA) */
            <div className="rounded-2xl border border-primary/20 bg-primary/5 p-8 max-w-3xl mx-auto space-y-6 text-center">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto">
                <Sparkles className="w-6 h-6 stroke-[1.5]" />
              </div>
              <div className="space-y-2 max-w-lg mx-auto">
                <div className="flex items-center justify-center gap-2">
                  <Badge variant="solid" tone="brand" size="xs">
                    PRO
                  </Badge>
                  <h2 className="text-lg font-bold tracking-tight text-foreground">
                    {t`Communication directe par email`}
                  </h2>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {t`L'envoi automatique de vos articles lors de leur publication est 100% gratuit et illimité. L'envoi de messages directs dédiés (annonces, lettres privées sans article web) fait partie de la suite d'outils PRO.`}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left pt-2 max-w-xl mx-auto">
                <div className="p-4 rounded-xl border border-border/50 bg-background/60">
                  <span className="text-xs font-semibold text-foreground flex items-center gap-1.5 mb-1">
                    <Check className="w-4 h-4 text-success-text" />
                    {t`Inclus Gratuitement`}
                  </span>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {t`Publication d'articles illimitée avec option d'envoi immédiat par email à toute votre audience.`}
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-primary/30 bg-primary/10">
                  <span className="text-xs font-semibold text-foreground flex items-center gap-1.5 mb-1">
                    <Sparkles className="w-4 h-4 text-primary" />
                    {t`Avec le forfait PRO`}
                  </span>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {t`Messages directs sans publication, renvoi de mises à jour majeures, nom et signature personnalisés.`}
                  </p>
                </div>
              </div>

              <div className="pt-2">
                <Link href="/settings">
                  <Button variant="solid" tone="brand" size="md" className="gap-2">
                    <span>{t`Découvrir les avantages PRO`}</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Button>
                </Link>
              </div>
            </div>
          ) : (
            /* Mode PRO Actif : Compositeur direct */
            <div className="space-y-6">
              <div className="flex items-center justify-between pb-2">
                <div>
                  <h3 className="text-base font-semibold text-foreground">
                    {t`Messages directs aux abonnés`}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {t`Rédigez et diffusez une lettre d'information indépendante de vos publications web.`}
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
                    <Plus className="w-4 h-4" />
                    <span>{t`Nouveau message direct`}</span>
                  </Button>
                )}
              </div>

              {showComposer ? (
                <div className="rounded-2xl border border-border/70 bg-card p-6 space-y-4">
                  <div className="flex items-center justify-between border-b border-border/40 pb-3">
                    <h4 className="text-sm font-semibold text-foreground">
                      {editingIssue ? t`Modifier le message direct` : t`Composer un message direct`}
                    </h4>
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
                    <div>
                      <label className="text-xs font-medium text-foreground mb-1 block">
                        {t`Objet du message`}
                      </label>
                      <Input
                        size="sm"
                        value={composerSubject}
                        onChange={(e) => setComposerSubject(e.target.value)}
                        placeholder={t`Nouvelles de l'équipe, mot de l'auteur...`}
                      />
                    </div>

                    <div>
                      <label className="text-xs font-medium text-foreground mb-1 block">
                        {t`Texte d'aperçu (Preheader)`}
                      </label>
                      <Input
                        size="sm"
                        value={composerPreviewText}
                        onChange={(e) => setComposerPreviewText(e.target.value)}
                        placeholder={t`Court extrait visible avant ouverture...`}
                      />
                    </div>

                    <div>
                      <label className="text-xs font-medium text-foreground mb-1 block">
                        {t`Contenu du message (HTML ou texte formaté)`}
                      </label>
                      <textarea
                        rows={10}
                        value={composerHtml}
                        onChange={(e) => setComposerHtml(e.target.value)}
                        placeholder={t`<p>Chers abonnés, voici les dernières nouvelles...</p>`}
                        className="w-full rounded-control border border-border bg-background p-3 text-xs font-mono leading-relaxed focus:outline-hidden focus:ring-1 focus:ring-primary"
                      />
                    </div>

                    <div className="flex items-center justify-end gap-3 pt-2">
                      <Button variant="ghost" size="sm" onClick={() => setShowComposer(false)}>
                        {t`Annuler`}
                      </Button>
                      <Button
                        variant="solid"
                        tone="brand"
                        size="sm"
                        onClick={handleSaveComposer}
                        disabled={isSubmittingCampaign}
                        className="gap-2"
                      >
                        {isSubmittingCampaign ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Check className="w-3.5 h-3.5" />
                        )}
                        <span>
                          {editingIssue ? t`Mettre à jour le brouillon` : t`Créer le brouillon`}
                        </span>
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-border/40 bg-muted/20 p-8 text-center space-y-2">
                  <p className="text-sm font-medium text-foreground">{t`Aucun brouillon en cours de rédaction`}</p>
                  <p className="text-xs text-muted-foreground">
                    {t`Cliquez sur « Nouveau message direct » pour rédiger un e-mail à destination de vos abonnés.`}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ─── Onglet 3: Historique & Campagnes ─── */}
      {activeTab === 'history' && (
        <div className="space-y-6">
          {/* Métriques récapitulatives */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-xl border border-border/50 bg-card p-5">
              <span className="text-[11px] font-bold tracking-wider uppercase text-muted-foreground block mb-2">
                {t`Envois totaux`}
              </span>
              <div className="text-2xl font-bold tracking-tight text-foreground">
                {issues.length}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {issues.filter((i) => i.status === 'SENT').length} {t`envoyés avec succès`}
              </p>
            </div>

            <div className="rounded-xl border border-border/50 bg-card p-5">
              <span className="text-[11px] font-bold tracking-wider uppercase text-muted-foreground block mb-2">
                {t`Emails délivrés`}
              </span>
              <div className="text-2xl font-bold tracking-tight text-foreground">
                {totalSentCount.toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground mt-1">{t`Cumul auprès de vos abonnés`}</p>
            </div>

            <div className="rounded-xl border border-border/50 bg-card p-5">
              <span className="text-[11px] font-bold tracking-wider uppercase text-muted-foreground block mb-2">
                {t`En attente`}
              </span>
              <div className="text-2xl font-bold tracking-tight text-foreground">
                {issues.filter((i) => i.status === 'DRAFT' || i.status === 'FAILED').length}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {issues.filter((i) => i.status === 'FAILED').length}{' '}
                {t`en échec pouvant être réessayés`}
              </p>
            </div>
          </div>

          {/* Table conforme UI Lab */}
          {issues.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-12 text-center space-y-3">
              <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center mx-auto text-muted-foreground">
                <History className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">{t`Aucune campagne envoyée pour l'instant`}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {t`Vos parutions d'articles et vos messages directs apparaîtront dans cette liste.`}
                </p>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
              <Table
                aria-label={t`Historique des newsletters`}
                sortDescriptor={sortDescriptor}
                onSortChange={setSortDescriptor}
              >
                <TableHeader>
                  <TableColumn id="subject" isRowHeader allowsSorting>
                    {t`Sujet de l'email`}
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
                  <TableColumn id="actions">{t`Actions`}</TableColumn>
                </TableHeader>
                <TableBody items={sortedIssues}>
                  {(issue) => {
                    const isDraft = issue.status === 'DRAFT';
                    const isFailed = issue.status === 'FAILED';
                    const isSending = issue.status === 'SENDING';
                    const isSent = issue.status === 'SENT';

                    return (
                      <TableRow id={issue.id}>
                        <TableCell>
                          <div className="py-1">
                            <span className="font-medium text-xs text-foreground block truncate max-w-md">
                              {issue.subject}
                            </span>
                            {issue.previewText && (
                              <span className="text-[11px] text-muted-foreground block truncate max-w-md">
                                {issue.previewText}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {isSent && (
                            <Badge variant="soft" tone="success" dot size="xs">
                              {t`Envoyée`}
                            </Badge>
                          )}
                          {isSending && (
                            <Badge variant="soft" tone="brand" dot size="xs">
                              {t`Envoi en cours...`}
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
                        <TableCell className="tabular-nums text-xs">
                          {isSent ? (
                            <span>
                              {issue.sentCount.toLocaleString()} {t`abonnés`}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="tabular-nums text-xs text-muted-foreground">
                          {issue.sentAt
                            ? new Date(issue.sentAt).toLocaleDateString('fr-FR', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                              })
                            : new Date(issue.createdAt).toLocaleDateString('fr-FR', {
                                day: 'numeric',
                                month: 'short',
                              })}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {(isDraft || isFailed) && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="xs"
                                  shape="icon"
                                  onClick={() => handleOpenComposer(issue)}
                                  aria-label={t`Modifier`}
                                  className="text-muted-foreground hover:text-foreground"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="xs"
                                  shape="icon"
                                  onClick={() => handleSendIssue(issue)}
                                  disabled={busyActionId === issue.id}
                                  aria-label={isFailed ? t`Renvoyer` : t`Envoyer`}
                                  className="text-primary hover:text-primary"
                                >
                                  {busyActionId === issue.id ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : isFailed ? (
                                    <RotateCcw className="w-3.5 h-3.5" />
                                  ) : (
                                    <Send className="w-3.5 h-3.5" />
                                  )}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="xs"
                                  shape="icon"
                                  onClick={() => handleDeleteIssue(issue.id)}
                                  disabled={busyActionId === issue.id}
                                  aria-label={t`Supprimer`}
                                  className="text-muted-foreground hover:text-destructive-text"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  }}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
