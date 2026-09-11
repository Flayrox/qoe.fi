'use client';

import React, { useState } from 'react';
import { t } from '@lingui/core/macro';
import {
  Globe,
  Mail,
  Lock,
  Sparkles,
  Send,
  Check,
  Loader2,
  X,
  Eye,
  Users,
  Smartphone,
  Monitor,
} from 'lucide-react';

export interface PublishOptions {
  sendEmail: boolean;
  isPremium: boolean;
}

interface PublishModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (options: PublishOptions) => Promise<void>;
  articleTitle: string;
  articleExcerpt?: string;
  publicationName: string;
  initialIsPremium?: boolean;
}

export function PublishModal({
  isOpen,
  onClose,
  onConfirm,
  articleTitle,
  articleExcerpt = '',
  publicationName,
  initialIsPremium = false,
}: PublishModalProps) {
  const [sendEmail, setSendEmail] = useState(true);
  const [isPremium, setIsPremium] = useState(initialIsPremium);
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [testSent, setTestSent] = useState(false);

  if (!isOpen) return null;

  const handleSendTest = async () => {
    setIsSendingTest(true);
    setTestSent(false);
    // Simulate/trigger test email to author
    setTimeout(() => {
      setIsSendingTest(false);
      setTestSent(true);
      setTimeout(() => setTestSent(false), 3000);
    }, 800);
  };

  const handlePublish = async () => {
    setIsSubmitting(true);
    try {
      await onConfirm({ sendEmail, isPremium });
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-md transition-opacity"
        onClick={onClose}
      />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-2xl bg-background text-foreground rounded-3xl border border-border shadow-2xl overflow-hidden z-10 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-6 border-b border-border/60 relative flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 text-primary mb-1.5 font-medium text-xs tracking-wider uppercase">
              <Sparkles className="w-3.5 h-3.5" />
              <span>{t`Prêt pour la publication`}</span>
            </div>
            <h3 className="text-xl font-bold tracking-tight line-clamp-1">
              {articleTitle || t`Sans titre`}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t`Diffusion sur`} <strong className="text-foreground">{publicationName}</strong>
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
            aria-label={t`Fermer`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Section 1: Canal de distribution */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 block">
              {t`Canal de diffusion`}
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Web + Email */}
              <div
                onClick={() => setSendEmail(true)}
                className={`p-4 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between ${
                  sendEmail
                    ? 'border-primary bg-primary/5 shadow-sm ring-1 ring-primary'
                    : 'border-border/60 hover:bg-muted/30'
                }`}
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
                  {t`Publie sur votre blog et expédie la newsletter par e-mail à tous vos abonnés actifs.`}
                </p>
              </div>

              {/* Web only */}
              <div
                onClick={() => setSendEmail(false)}
                className={`p-4 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between ${
                  !sendEmail
                    ? 'border-primary bg-primary/5 shadow-sm ring-1 ring-primary'
                    : 'border-border/60 hover:bg-muted/30'
                }`}
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

          {/* Section 2: Audience (Public vs Premium) */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 block">
              {t`Accès & Monétisation`}
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Gratuit / Public */}
              <div
                onClick={() => setIsPremium(false)}
                className={`p-4 rounded-2xl border cursor-pointer transition-all flex items-start gap-3 ${
                  !isPremium
                    ? 'border-foreground/80 bg-foreground/5 ring-1 ring-foreground/60'
                    : 'border-border/60 hover:bg-muted/30'
                }`}
              >
                <div className="w-8 h-8 rounded-xl bg-muted flex items-center justify-center shrink-0 mt-0.5">
                  <Users className="w-4 h-4 text-foreground" />
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold text-sm">{t`Tous les lecteurs (Gratuit)`}</h4>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                    {t`Accessible librement. Idéal pour maximiser votre audience et vos nouveaux abonnés.`}
                  </p>
                </div>
              </div>

              {/* Réservé aux abonnés payants */}
              <div
                onClick={() => setIsPremium(true)}
                className={`p-4 rounded-2xl border cursor-pointer transition-all flex items-start gap-3 ${
                  isPremium
                    ? 'border-primary bg-primary/5 ring-1 ring-primary'
                    : 'border-border/60 hover:bg-muted/30'
                }`}
              >
                <div className="w-8 h-8 rounded-xl bg-warning/10 text-warning flex items-center justify-center shrink-0 mt-0.5">
                  <Lock className="w-4 h-4" />
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold text-sm">{t`Abonnés payants (Premium)`}</h4>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                    {t`Extrait gratuit + Paywall Triptyque (Stripe ou 2,00 € à l'article).`}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Email Preview Drawer (si sendEmail = true) */}
          {sendEmail && (
            <div className="rounded-2xl border border-border/60 overflow-hidden bg-muted/20">
              <div className="p-4 flex items-center justify-between border-b border-border/40">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <Eye className="w-4 h-4" />
                  <span>{t`Aperçu de l'email envoyé`}</span>
                </div>
                <div className="flex items-center gap-1 bg-muted p-0.5 rounded-lg">
                  <button
                    onClick={() => setPreviewDevice('desktop')}
                    className={`p-1.5 rounded-md text-xs transition-colors ${
                      previewDevice === 'desktop'
                        ? 'bg-background shadow-xs text-foreground'
                        : 'text-muted-foreground'
                    }`}
                    aria-label="Bureau"
                  >
                    <Monitor className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setPreviewDevice('mobile')}
                    className={`p-1.5 rounded-md text-xs transition-colors ${
                      previewDevice === 'mobile'
                        ? 'bg-background shadow-xs text-foreground'
                        : 'text-muted-foreground'
                    }`}
                    aria-label="Mobile"
                  >
                    <Smartphone className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="p-4 sm:p-6 flex justify-center bg-muted/30">
                <div
                  className={`bg-card text-card-foreground border border-border/80 rounded-xl shadow-md p-6 transition-all duration-300 ${
                    previewDevice === 'mobile' ? 'max-w-[320px] w-full text-xs' : 'max-w-md w-full'
                  }`}
                >
                  <div className="border-b border-border/40 pb-3 mb-4 space-y-1 text-xs">
                    <div className="text-muted-foreground">
                      {t`De :`}{' '}
                      <span className="text-foreground font-medium">
                        {publicationName} &lt;newsletter@qoe.fi&gt;
                      </span>
                    </div>
                    <div className="text-muted-foreground">
                      {t`Objet :`}{' '}
                      <span className="text-foreground font-medium">
                        {articleTitle || t`Nouvelle parution`}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="h-2 w-20 bg-primary/30 rounded-full" />
                    <h5 className="font-bold text-base leading-snug">
                      {articleTitle || t`Titre de l'article`}
                    </h5>
                    <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">
                      {articleExcerpt ||
                        t`Découvrez le texte complet de cette nouvelle publication rédigée par l'auteur...`}
                    </p>
                    <div className="pt-2">
                      <span className="inline-block px-4 py-1.5 rounded-full text-xs font-semibold bg-foreground text-background">
                        {t`Lire sur le web`}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Send test email bar */}
              <div className="p-3 bg-muted/40 border-t border-border/40 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  {t`Vérifiez le rendu dans votre messagerie avant d'envoyer.`}
                </span>
                <button
                  type="button"
                  onClick={handleSendTest}
                  disabled={isSendingTest}
                  className="px-3 py-1.5 rounded-lg border border-border bg-background hover:bg-muted font-medium transition-all flex items-center gap-1.5"
                >
                  {isSendingTest ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : testSent ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-success" />
                      <span>{t`Envoyé !`}</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      <span>{t`Envoyer un test`}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-6 border-t border-border/60 bg-muted/20 flex flex-col sm:flex-row items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors order-2 sm:order-1"
          >
            {t`Continuer d'éditer`}
          </button>

          <button
            type="button"
            onClick={handlePublish}
            disabled={isSubmitting}
            className="w-full sm:w-auto px-6 py-2.5 rounded-full font-semibold text-sm transition-all flex items-center justify-center gap-2 bg-primary text-primary-foreground hover:opacity-90 active:scale-95 disabled:opacity-50 order-1 sm:order-2 shadow-sm"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{t`Publication en cours...`}</span>
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                <span>{sendEmail ? t`Publier & Envoyer maintenant` : t`Publier sur le web`}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
