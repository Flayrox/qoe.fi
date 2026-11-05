'use client';

import React, { useEffect, useState } from 'react';
import { t } from '@lingui/core/macro';
import { Button } from '@qoe/ui/button';
import { Input } from '@qoe/ui/input';
import { Badge } from '@qoe/ui/badge';
import { toast } from '@qoe/ui/toast';
import { sendArticleTestEmailAction } from '@qoe/sdk/actions/articles';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@qoe/ui/dialog';
import { cn } from '@qoe/utils';
import {
  Globe,
  Mail,
  Lock,
  Send,
  Check,
  Loader2,
  Eye,
  Users,
  Smartphone,
  Monitor,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';

export interface PublishOptions {
  sendEmail: boolean;
  isPremium: boolean;
  emailSubject?: string;
  emailPreviewText?: string;
  isMajorUpdate?: boolean;
}

interface PublishModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (options: PublishOptions) => Promise<void>;
  articleTitle: string;
  articleExcerpt?: string;
  articleId?: string;
  publicationName: string;
  initialIsPremium?: boolean;
  isAlreadyPublished?: boolean;
  emailStatus?: string | null;
  emailSentAt?: string | null;
  emailSentCount?: number;
  /** Points à vérifier avant publication (non bloquants). */
  warnings?: string[];
}

export function PublishModal({
  isOpen,
  onClose,
  onConfirm,
  articleTitle,
  articleExcerpt = '',
  articleId,
  publicationName,
  initialIsPremium = false,
  isAlreadyPublished = false,
  emailStatus = null,
  emailSentAt = null,
  emailSentCount = 0,
  warnings = [],
}: PublishModalProps) {
  const isAlreadySent = emailStatus === 'SENT';

  const [sendEmail, setSendEmail] = useState(!isAlreadySent);
  const [isPremium, setIsPremium] = useState(initialIsPremium);
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);

  // Personnalisation d'envoi newsletter (Substack-like)
  const [emailSubject, setEmailSubject] = useState(articleTitle || '');
  const [emailPreviewText, setEmailPreviewText] = useState('');
  const [isMajorUpdate, setIsMajorUpdate] = useState(false);
  const [confirmMajorUpdateText, setConfirmMajorUpdateText] = useState('');

  // Sync title when articleTitle changes
  useEffect(() => {
    if (articleTitle && !emailSubject) {
      setEmailSubject(articleTitle);
    }
  }, [articleTitle, emailSubject]);

  // Compatibilité Échap au niveau `window`
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const inDialog =
        event.target instanceof Element && Boolean(event.target.closest('[role="dialog"]'));
      if (event.key === 'Escape' && !isSubmitting && !inDialog) {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen) return null;

  const handleSendTestEmail = async () => {
    if (!articleId) {
      toast.info(t`Sauvegardez d'abord l'article pour pouvoir envoyer un test.`);
      return;
    }
    setIsSendingTest(true);
    try {
      const res = await sendArticleTestEmailAction({ articleId });
      if (res.ok) {
        toast.success(t`Email test envoyé à votre adresse avec succès.`);
      } else {
        toast.error(res.error.message || t`Impossible d'envoyer l'email test.`);
      }
    } catch {
      toast.error(t`Erreur lors de l'envoi de l'email test.`);
    } finally {
      setIsSendingTest(false);
    }
  };

  const handlePublish = async () => {
    if (isSubmitting) return;
    if (isMajorUpdate && confirmMajorUpdateText.trim().toUpperCase() !== 'CONFIRMER') {
      toast.error(t`Veuillez taper CONFIRMER pour valider le renvoi de mise à jour.`);
      return;
    }

    setIsSubmitting(true);
    try {
      const opts: PublishOptions = {
        sendEmail,
        isPremium,
      };
      if (sendEmail) {
        if (emailSubject.trim() && emailSubject.trim() !== articleTitle) {
          opts.emailSubject = emailSubject.trim();
        }
        if (emailPreviewText.trim()) {
          opts.emailPreviewText = emailPreviewText.trim();
        }
        if (isMajorUpdate) {
          opts.isMajorUpdate = true;
        }
      }
      await onConfirm(opts);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const effectiveSubject = emailSubject.trim() || articleTitle || t`Sans titre`;
  const effectivePreview = emailPreviewText.trim() || articleExcerpt || t`Lire l'article.`;

  return (
    <Dialog
      open={isOpen}
      size="xl"
      isDismissable={!isSubmitting}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !isSubmitting) onClose();
      }}
    >
      <DialogContent
        aria-label={isAlreadyPublished ? t`Paramètres de diffusion` : t`Prêt pour la publication`}
        className="max-h-[92vh] gap-0 overflow-hidden bg-background p-0 sm:p-0 text-foreground"
      >
        {/* Header */}
        <DialogHeader className="border-b border-border/60 p-6 pr-12">
          <div className="flex items-center gap-2 text-primary mb-1 font-medium text-xs tracking-wider uppercase">
            <Send className="w-3.5 h-3.5" />
            <span>
              {isAlreadyPublished ? t`Diffusion & Distribution` : t`Prêt pour la publication`}
            </span>
          </div>
          <DialogTitle className="text-xl font-bold tracking-tight line-clamp-1">
            {articleTitle || t`Sans titre`}
          </DialogTitle>
          <DialogDescription className="text-xs flex items-center gap-2">
            <span>
              {t`Diffusion sur`} <strong className="text-foreground">{publicationName}</strong>
            </span>
            {isAlreadySent && (
              <Badge variant="soft" tone="success" dot size="xs">
                {t`Déjà envoyé aux abonnés`}
              </Badge>
            )}
          </DialogDescription>
        </DialogHeader>

        {/* Content Body */}
        <DialogBody className="p-6 space-y-6 overflow-y-auto max-h-[calc(92vh-180px)]">
          {/* Section 1: Canal de distribution */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 block">
              {t`Canal de diffusion`}
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Web + Email */}
              <div
                onClick={() => setSendEmail(true)}
                className={cn(
                  'p-4 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between',
                  sendEmail
                    ? 'border-primary bg-primary/5 shadow-sm ring-1 ring-primary'
                    : 'border-border/60 hover:bg-muted/30'
                )}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                      <Mail className="w-4 h-4" />
                    </div>
                    <span className="font-semibold text-sm">{t`Web + Newsletter`}</span>
                  </div>
                  {sendEmail && <Check className="w-4 h-4 text-primary" />}
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {t`Publie sur votre site et expédie la newsletter par e-mail à tous vos abonnés actifs.`}
                </p>
              </div>

              {/* Web only */}
              <div
                onClick={() => setSendEmail(false)}
                className={cn(
                  'p-4 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between',
                  !sendEmail
                    ? 'border-primary bg-primary/5 shadow-sm ring-1 ring-primary'
                    : 'border-border/60 hover:bg-muted/30'
                )}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-muted text-muted-foreground flex items-center justify-center">
                      <Globe className="w-4 h-4" />
                    </div>
                    <span className="font-semibold text-sm">{t`Web uniquement`}</span>
                  </div>
                  {!sendEmail && <Check className="w-4 h-4 text-primary" />}
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {t`Publie l'article sur votre site sans envoyer de notification par email.`}
                </p>
              </div>
            </div>
          </div>

          {/* Si déjà envoyé par le passé : alerte et option Major Update */}
          {isAlreadySent && sendEmail && (
            <div className="rounded-xl border border-border/80 bg-muted/40 p-4 space-y-3">
              <div className="flex items-start gap-2.5 text-xs text-muted-foreground">
                <RotateCcw className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium text-foreground">
                    {t`Cet article a déjà été envoyé par email.`}
                  </p>
                  <p className="mt-0.5">
                    {emailSentAt
                      ? t`Dernier envoi le ${new Date(emailSentAt).toLocaleDateString()} (${emailSentCount} abonnés).`
                      : t`Envoi antérieur validé.`}
                  </p>
                </div>
              </div>

              <div className="pt-2 border-t border-border/40 flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-foreground">{t`Mise à jour majeure (PRO)`}</span>
                  <p className="text-[11px] text-muted-foreground">{t`Renvoie une version mise à jour précédée de [Mise à jour]. Limité à 1 envoi.`}</p>
                </div>
                <Button
                  size="xs"
                  variant={isMajorUpdate ? 'solid' : 'outline'}
                  tone={isMajorUpdate ? 'brand' : 'neutral'}
                  onClick={() => setIsMajorUpdate(!isMajorUpdate)}
                >
                  {isMajorUpdate ? t`Activé` : t`Activer`}
                </Button>
              </div>

              {isMajorUpdate && (
                <div className="p-3 rounded-lg bg-background border border-border space-y-2">
                  <label className="text-xs font-medium text-muted-foreground block">
                    {t`Tapez CONFIRMER pour autoriser ce second envoi :`}
                  </label>
                  <Input
                    size="sm"
                    value={confirmMajorUpdateText}
                    onChange={(e) => setConfirmMajorUpdateText(e.target.value)}
                    placeholder="CONFIRMER"
                    className="font-mono text-xs uppercase"
                  />
                </div>
              )}
            </div>
          )}

          {/* Section 2: Audience (Public vs Premium) */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 block">
              {t`Accès & Monétisation`}
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Gratuit / Public */}
              <div
                onClick={() => setIsPremium(false)}
                className={cn(
                  'p-4 rounded-2xl border cursor-pointer transition-all flex items-start gap-3',
                  !isPremium
                    ? 'border-foreground/80 bg-foreground/5 ring-1 ring-foreground/60'
                    : 'border-border/60 hover:bg-muted/30'
                )}
              >
                <div className="w-8 h-8 rounded-xl bg-muted flex items-center justify-center shrink-0 mt-0.5">
                  <Users className="w-4 h-4 text-foreground" />
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold text-sm">{t`Tous les lecteurs (Gratuit)`}</h4>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                    {t`Accessible librement. Contenu distribué intégralement aux abonnés.`}
                  </p>
                </div>
              </div>

              {/* Réservé aux abonnés payants */}
              <div
                onClick={() => setIsPremium(true)}
                className={cn(
                  'p-4 rounded-2xl border cursor-pointer transition-all flex items-start gap-3',
                  isPremium
                    ? 'border-primary bg-primary/5 ring-1 ring-primary'
                    : 'border-border/60 hover:bg-muted/30'
                )}
              >
                <div className="w-8 h-8 rounded-xl bg-highlight/10 text-highlight flex items-center justify-center shrink-0 mt-0.5">
                  <Lock className="w-4 h-4" />
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold text-sm">{t`Abonnés payants (Premium)`}</h4>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                    {t`Découpage Zero-Leak côté serveur : teaser + CTA vers l'offre payante.`}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Configuration de l'email & Aperçu (si sendEmail = true) */}
          {sendEmail && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-border/60 p-4 space-y-3 bg-muted/10">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {t`Personnalisation de l'email`}
                  </label>
                  {articleId && (
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={handleSendTestEmail}
                      disabled={isSendingTest}
                      className="text-xs gap-1.5"
                    >
                      {isSendingTest ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Mail className="w-3 h-3" />
                      )}
                      <span>{t`Envoyer un test à mon adresse`}</span>
                    </Button>
                  )}
                </div>

                <div className="space-y-3 pt-1">
                  <div>
                    <label
                      htmlFor="publish-email-subject"
                      className="text-xs font-medium text-foreground mb-1 block"
                    >
                      {t`Objet du message`}
                    </label>
                    <Input
                      id="publish-email-subject"
                      size="sm"
                      value={emailSubject}
                      onChange={(e) => setEmailSubject(e.target.value)}
                      placeholder={articleTitle || t`Objet de l'email`}
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="publish-email-preview"
                      className="text-xs font-medium text-foreground mb-1 block"
                    >
                      {t`Texte d'aperçu (Preheader)`}
                    </label>
                    <Input
                      id="publish-email-preview"
                      size="sm"
                      value={emailPreviewText}
                      onChange={(e) => setEmailPreviewText(e.target.value)}
                      placeholder={t`Visible à côté du sujet, avant ouverture.`}
                    />
                  </div>
                </div>
              </div>

              {/* Email Preview Drawer */}
              <div className="rounded-2xl border border-border/60 overflow-hidden bg-muted/20">
                <div className="p-4 flex items-center justify-between border-b border-border/40">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <Eye className="w-4 h-4" />
                    <span>{t`Aperçu de l'email`}</span>
                  </div>
                  <div className="flex items-center gap-0.5 bg-muted p-0.5 rounded-control">
                    <Button
                      variant="ghost"
                      size="xs"
                      shape="icon"
                      onClick={() => setPreviewDevice('desktop')}
                      aria-label="Bureau"
                      className={cn(
                        'size-6',
                        previewDevice === 'desktop'
                          ? 'bg-background shadow-xs text-foreground hover:bg-background'
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
                      aria-label="Mobile"
                      className={cn(
                        'size-6',
                        previewDevice === 'mobile'
                          ? 'bg-background shadow-xs text-foreground hover:bg-background'
                          : 'text-muted-foreground'
                      )}
                    >
                      <Smartphone />
                    </Button>
                  </div>
                </div>

                <div className="p-4 sm:p-6 flex justify-center bg-muted/30">
                  <div
                    className={cn(
                      'bg-card text-card-foreground border border-border/80 rounded-xl shadow-md p-6 transition-all duration-300',
                      previewDevice === 'mobile'
                        ? 'max-w-[320px] w-full text-xs'
                        : 'max-w-md w-full'
                    )}
                  >
                    <div className="border-b border-border/40 pb-3 mb-4 space-y-1 text-xs">
                      <div className="text-muted-foreground">
                        {t`De :`}{' '}
                        <span className="text-foreground font-medium">
                          {publicationName} &lt;noreply@qoe.fi&gt;
                        </span>
                      </div>
                      <div className="text-muted-foreground">
                        {t`Objet :`}{' '}
                        <span className="text-foreground font-medium">
                          {isMajorUpdate ? `[Mise à jour] ${effectiveSubject}` : effectiveSubject}
                        </span>
                      </div>
                      {emailPreviewText.trim() && (
                        <div className="text-muted-foreground text-[11px] truncate">
                          {t`Aperçu :`}{' '}
                          <span className="text-muted-foreground">{emailPreviewText.trim()}</span>
                        </div>
                      )}
                    </div>

                    <div className="space-y-3">
                      <div className="h-2 w-20 bg-primary/30 rounded-full" />
                      <h5 className="font-bold text-base leading-snug">
                        {articleTitle || t`Titre de l'article`}
                      </h5>
                      <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">
                        {effectivePreview}
                      </p>
                      {isPremium && (
                        <div className="p-3 bg-muted/60 border border-border/50 rounded-lg text-center">
                          <p className="text-xs font-semibold text-foreground">{t`Contenu réservé aux abonnés payants`}</p>
                          <span className="inline-block mt-2 px-3 py-1 rounded-md text-[11px] font-semibold bg-foreground text-background">
                            {t`Découvrir l'offre Premium →`}
                          </span>
                        </div>
                      )}
                      {!isPremium && (
                        <div className="pt-2 text-center">
                          <span className="inline-block text-xs text-muted-foreground underline">
                            {t`Lire ou commenter sur le web →`}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-muted/40 border-t border-border/40 text-xs text-muted-foreground">
                  {t`Cet aperçu est local (titre + extrait). Pour recevoir un vrai test dans votre boîte : Réglages → Emails & Abonnés → « Envoyer un test à mon adresse ».`}
                </div>
              </div>
            </div>
          )}
        </DialogBody>

        {warnings.length > 0 && (
          <div className="px-4 sm:px-6 py-3 border-t border-highlight/30 bg-highlight/5 space-y-1">
            {warnings.map((warning) => (
              <p
                key={warning}
                className="flex items-start gap-2 text-[11px] font-sans text-foreground/80"
              >
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-highlight mt-0.5" />
                <span>{warning}</span>
              </p>
            ))}
          </div>
        )}

        {/* Footer */}
        <DialogFooter className="p-4 sm:p-6 border-t border-border/60 bg-muted/20 flex-col sm:flex-row items-center justify-between gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={isSubmitting}
            className="order-2 sm:order-1 text-muted-foreground"
          >
            {t`Continuer d'éditer`}
          </Button>

          <Button
            variant="solid"
            tone="brand"
            size="lg"
            onClick={handlePublish}
            disabled={isSubmitting}
            className="w-full sm:w-auto rounded-full px-6 order-1 sm:order-2"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="animate-spin" />
                <span>{t`Publication en cours...`}</span>
              </>
            ) : (
              <>
                <Send />
                <span>
                  {sendEmail
                    ? isAlreadySent
                      ? t`Envoyer la mise à jour aux abonnés`
                      : t`Publier & Envoyer maintenant`
                    : t`Publier sur le web`}
                </span>
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
