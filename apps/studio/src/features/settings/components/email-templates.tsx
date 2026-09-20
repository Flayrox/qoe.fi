'use client';

// =====================================================================
// 📧 EmailTemplates — personnalisation des emails transactionnels
// =====================================================================
// Panneau studio branché sur GET|PATCH /v1/settings/email et
// POST /v1/settings/email/preview. Le créateur règle expéditeur, reply-to,
// couleur d'accent, logo, sujets et textes d'aperçu (fr/en), note de pied
// de page, corps du bienvenue (fr/en) et l'activation du bienvenue.
//
// La prévisualisation est le rendu RÉEL du backend (même moteur que les
// envois) : ce que voit le créateur est ce que recevront ses abonnés,
// langue par langue (Subscriber.locale captée à l'inscription).

import { useCallback, useEffect, useRef, useState } from 'react';
import { t } from '@lingui/core/macro';
import { toast } from '@qoe/ui/toast';
import { ImageUploader } from '@qoe/ui/ui/ImageUploader';
import { uploadImageToRoute, IMAGE_FOLDERS } from '@qoe/supabase/storage';
import { Check, Loader2, Mail, SendHorizonal } from 'lucide-react';
import {
  getEmailSettingsAction,
  previewEmailSettingsAction,
  sendTestEmailAction,
  updateEmailSettingsAction,
  type PublicationEmailSettings,
} from '../actions';

const ACCENT_SWATCHES = ['#111827', '#e11d48', '#ea580c', '#16a34a', '#2563eb', '#7c3aed'];

const EMPTY: PublicationEmailSettings = {};

type PreviewState = {
  subject: string;
  from: string;
  html: string;
  text: string;
} | null;

const rowClass = 'py-5 grid grid-cols-1 sm:grid-cols-3 gap-4 items-start';
const labelClass = 'text-xs font-semibold text-foreground block';
const hintClass = 'text-xs text-muted-foreground block mt-0.5';
const inputClass =
  'w-full px-3.5 py-2 bg-muted/20 border border-border/30 rounded-lg text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary/80';

export function EmailTemplates({ publicationId }: { publicationId: string }) {
  const [settings, setSettings] = useState<PublicationEmailSettings>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  // Langues disponibles : fournies par l'API (QOE_EMAIL_LOCALES côté Go).
  // Ajouter une langue = un seul changement côté backend, le panneau suit.
  const [locales, setLocales] = useState<string[]>(['fr', 'en']);
  const [lang, setLang] = useState('fr');
  const [template, setTemplate] = useState<'confirm' | 'welcome'>('confirm');
  const [preview, setPreview] = useState<PreviewState>(null);
  const [previewing, setPreviewing] = useState(false);
  const [showText, setShowText] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Chargement initial : réglages stockés (assainis côté API) + langues.
  useEffect(() => {
    let alive = true;
    getEmailSettingsAction(publicationId)
      .then((res) => {
        if (!alive) return;
        setSettings(res.emailSettings ?? {});
        if (res.locales?.length) {
          setLocales(res.locales);
          if (!res.locales.includes(lang)) setLang(res.locales[0]);
        }
      })
      .catch(() => {
        if (alive) toast.error(t`Impossible de charger les réglages email.`);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [publicationId]);

  // Prévisualisation live (débounce 500 ms) : rendu backend réel.
  const refreshPreview = useCallback(
    async (s: PublicationEmailSettings) => {
      setPreviewing(true);
      try {
        const res = await previewEmailSettingsAction(publicationId, template, lang, s);
        setPreview({ subject: res.subject, from: res.from, html: res.html, text: res.text });
      } catch {
        // Silencieux : l'aperçu ne doit jamais casser la saisie.
      } finally {
        setPreviewing(false);
      }
    },
    [publicationId, template, lang]
  );

  useEffect(() => {
    if (loading) return;
    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(() => refreshPreview(settings), 500);
    return () => {
      if (previewTimer.current) clearTimeout(previewTimer.current);
    };
  }, [settings, template, lang, loading, refreshPreview]);

  const set = <K extends keyof PublicationEmailSettings>(
    key: K,
    value: PublicationEmailSettings[K]
  ) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  };
  const setMap = (
    key: 'subjects' | 'preheaders',
    tpl: 'confirm' | 'welcome',
    locale: string,
    value: string
  ) => {
    setSettings((prev) => ({
      ...prev,
      [key]: { ...prev[key], [`${tpl}.${locale}`]: value },
    }));
    setSaved(false);
  };

  const setWelcomeBody = (locale: string, value: string) => {
    setSettings((prev) => ({
      ...prev,
      welcomeBodies: { ...prev.welcomeBodies, [locale]: value },
    }));
    setSaved(false);
  };

  const handleSendTest = async () => {
    setSendingTest(true);
    try {
      const res = await sendTestEmailAction(publicationId, template, lang, settings);
      toast.success(t`Email de test envoyé à ${res.to} — vérifiez votre boîte (pensez aux spams).`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t`Échec de l'envoi du test.`);
    } finally {
      setSendingTest(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await updateEmailSettingsAction(publicationId, settings);
      // Ce qui est stocké est la version assainie : on reflète la vérité backend.
      setSettings(res.emailSettings ?? {});
      setSaved(true);
      toast.success(t`Réglages email enregistrés.`);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t`Erreur de sauvegarde.`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin mr-2" />
        <span className="text-xs">{t`Chargement des réglages email…`}</span>
      </div>
    );
  }

  const welcomeOn = settings.welcomeEnabled !== false;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_460px] gap-8 items-start">
      {/* ══════════════════ COLONNE RÉGLAGES ══════════════════ */}
      <div className="divide-y divide-border/30">
        {/* Expéditeur */}
        <div className={rowClass}>
          <div>
            <label className={labelClass}>{t`Nom de l'expéditeur`}</label>
            <span className={hintClass}>{t`Affiché comme « De » dans la boîte de réception.`}</span>
          </div>
          <div className="sm:col-span-2">
            <input
              type="text"
              value={settings.fromName || ''}
              onChange={(e) => set('fromName', e.target.value)}
              maxLength={60}
              placeholder={t`Ex. La Gazette du Net`}
              className={inputClass}
            />
          </div>
        </div>

        {/* Reply-To */}
        <div className={rowClass}>
          <div>
            <label className={labelClass}>{t`Adresse de réponse`}</label>
            <span className={hintClass}>{t`Les réponses des lecteurs arrivent ici.`}</span>
          </div>
          <div className="sm:col-span-2">
            <input
              type="email"
              value={settings.replyTo || ''}
              onChange={(e) => set('replyTo', e.target.value)}
              maxLength={254}
              placeholder="contact@exemple.fr"
              className={inputClass}
            />
          </div>
        </div>

        {/* Couleur d'accent des boutons */}
        <div className={rowClass}>
          <div>
            <label className={labelClass}>{t`Couleur des boutons`}</label>
            <span className={hintClass}>{t`Teinte du bouton principal des emails.`}</span>
          </div>
          <div className="sm:col-span-2 space-y-2">
            <div className="flex flex-wrap gap-2">
              {ACCENT_SWATCHES.map((c) => {
                const active = (settings.accentColor || '').toLowerCase() === c;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => set('accentColor', c)}
                    aria-label={c}
                    className={`w-7 h-7 rounded-full border-2 cursor-pointer transition-all ${
                      active ? 'border-foreground scale-110' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: c }}
                  />
                );
              })}
            </div>
            <input
              type="text"
              value={settings.accentColor || ''}
              onChange={(e) => set('accentColor', e.target.value)}
              maxLength={7}
              placeholder="#2563eb"
              className={`${inputClass} max-w-[120px] font-sans`}
            />
          </div>
        </div>

        {/* Logo d'en-tête */}
        <div className={rowClass}>
          <div>
            <label className={labelClass}>{t`Logo des emails`}</label>
            <span
              className={hintClass}
            >{t`Affiché en en-tête (défaut : initiale de la publication).`}</span>
          </div>
          <div className="sm:col-span-2">
            <ImageUploader
              value={settings.logoUrl || null}
              onChange={(url) => set('logoUrl', url ?? '')}
              upload={(file) =>
                uploadImageToRoute(file, '/api/articles/upload', IMAGE_FOLDERS.avatars)
              }
              aspect={1}
              shape="circle"
              maxDimension={512}
            />
          </div>
        </div>

        {/* Sujets + aperçus par langue */}
        {(['confirm', 'welcome'] as const).map((tpl) => (
          <div key={tpl} className={rowClass}>
            <div>
              <label className={labelClass}>
                {tpl === 'confirm' ? t`Sujet de la confirmation` : t`Sujet du bienvenue`}
              </label>
              <span
                className={hintClass}
              >{t`Texte d'aperçu = phrase visible dans la boîte de réception.`}</span>
            </div>
            <div className="sm:col-span-2 space-y-2">
              {locales.map((l) => (
                <div key={l} className="flex items-center gap-2">
                  <span className="w-8 text-[10px] font-bold uppercase text-muted-foreground">
                    {l}
                  </span>
                  <input
                    type="text"
                    value={settings.subjects?.[`${tpl}.${l}`] ?? ''}
                    onChange={(e) => setMap('subjects', tpl, l, e.target.value)}
                    maxLength={120}
                    placeholder={
                      l === 'fr'
                        ? tpl === 'confirm'
                          ? t`Confirmez votre abonnement — (nom)`
                          : t`Bienvenue chez (nom)`
                        : tpl === 'confirm'
                          ? 'Confirm your subscription — (name)'
                          : 'Welcome to (name)'
                    }
                    className={inputClass}
                  />
                </div>
              ))}
              {locales.map((l) => (
                <div key={`pre-${l}`} className="flex items-center gap-2">
                  <span className="w-8 text-[10px] font-bold uppercase text-muted-foreground opacity-50">
                    {l}
                  </span>
                  <input
                    type="text"
                    value={settings.preheaders?.[`${tpl}.${l}`] ?? ''}
                    onChange={(e) => setMap('preheaders', tpl, l, e.target.value)}
                    maxLength={140}
                    placeholder={t`Texte d'aperçu (${l})`}
                    className={inputClass}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Corps du bienvenue (fr/en) + activation */}
        <div className={rowClass}>
          <div>
            <label className={labelClass}>{t`Corps de l'email de bienvenue`}</label>
            <span
              className={hintClass}
            >{t`Texte brut — les liens sont ajoutés automatiquement.`}</span>
            <div className="mt-3 space-y-1">
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={welcomeOn}
                  onChange={(e) => set('welcomeEnabled', e.target.checked)}
                  className="w-4 h-4 rounded border-border/40 text-primary focus:ring-primary cursor-pointer"
                />
                <span className="font-medium">{t`Envoyer l'email de bienvenue`}</span>
              </label>
            </div>
          </div>
          <div className="sm:col-span-2 space-y-2">
            {locales.map((l) => (
              <div key={l} className="flex items-start gap-2">
                <span className="w-8 pt-2 text-[10px] font-bold uppercase text-muted-foreground">
                  {l}
                </span>
                <textarea
                  value={settings.welcomeBodies?.[l] ?? ''}
                  onChange={(e) => setWelcomeBody(l, e.target.value)}
                  maxLength={2000}
                  rows={3}
                  disabled={!welcomeOn}
                  placeholder={
                    l === 'fr'
                      ? t`Votre inscription est confirmée. À très vite !`
                      : l === 'en'
                        ? 'Your subscription is confirmed. See you soon!'
                        : ''
                  }
                  className={`${inputClass} resize-none disabled:opacity-40`}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Note de pied de page */}
        <div className={rowClass}>
          <div>
            <label className={labelClass}>{t`Note de pied de page`}</label>
            <span className={hintClass}>{t`Mention libre sous le texte de consentement.`}</span>
          </div>
          <div className="sm:col-span-2">
            <input
              type="text"
              value={settings.footerNote || ''}
              onChange={(e) => set('footerNote', e.target.value)}
              maxLength={200}
              placeholder={t`Ex. Propulsé avec amour depuis Lyon`}
              className={inputClass}
            />
          </div>
        </div>

        {/* Sauvegarde */}
        <div className="py-5 flex items-center justify-end gap-3">
          {saved && (
            <span className="flex items-center gap-1 text-xs text-success font-medium">
              <Check className="w-3.5 h-3.5" /> {t`Enregistré`}
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold transition-all active:scale-95 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <span>{t`Enregistrer les réglages email`}</span>
          </button>
        </div>
      </div>

      {/* ══════════════════ COLONNE PRÉVISUALISATION (rendu réel backend) ══════════════════ */}
      <div className="lg:sticky lg:top-24 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <Mail className="w-3.5 h-3.5 text-primary" />
            {t`Aperçu réel`}
          </div>
          <div className="flex items-center gap-1 bg-muted/40 rounded-lg p-0.5">
            {(['confirm', 'welcome'] as const).map((tpl) => (
              <button
                key={tpl}
                onClick={() => setTemplate(tpl)}
                className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                  template === tpl
                    ? 'bg-background shadow-sm text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {tpl === 'confirm' ? t`Confirmation` : t`Bienvenue`}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 bg-muted/40 rounded-lg p-0.5">
            {locales.map((l) => (
              <button
                key={l}
                onClick={() => setLang(l)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium uppercase transition-colors cursor-pointer ${
                  lang === l
                    ? 'bg-background shadow-sm text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {l}
              </button>
            ))}
          </div>
          {previewing && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
        </div>

        {/* Fenêtre type client mail */}
        <div className="rounded-xl border border-border/50 overflow-hidden bg-background shadow-sm">
          <div className="px-4 py-3 border-b border-border/40 bg-muted/30">
            <p className="text-[11px] font-semibold text-foreground truncate">
              {preview?.from || '…'}
            </p>
            <p className="text-[11px] text-foreground font-medium truncate mt-0.5">
              {preview?.subject || '…'}
            </p>
          </div>
          {preview && (
            <iframe
              title="email-preview"
              srcDoc={preview.html}
              sandbox=""
              className="w-full h-[560px] bg-white"
            />
          )}
        </div>

        {/* Envoi d'un vrai email de test à l'adresse du compte créateur */}
        <button
          onClick={handleSendTest}
          disabled={sendingTest || loading}
          className="w-full flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg border border-border/50 bg-muted/30 text-xs font-semibold text-foreground transition-all active:scale-95 hover:bg-muted/50 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
        >
          {sendingTest ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <SendHorizonal className="w-3.5 h-3.5" />
          )}
          <span>
            {t`Envoyer un test à mon adresse`}
            <span className="uppercase opacity-60"> ({lang})</span>
          </span>
        </button>

        <button
          onClick={() => setShowText((v) => !v)}
          className="text-[11px] text-muted-foreground hover:text-foreground underline cursor-pointer"
        >
          {showText ? t`Masquer la version texte` : t`Voir la version texte`}
        </button>
        {showText && preview && (
          <pre className="whitespace-pre-wrap text-[10px] leading-relaxed text-muted-foreground bg-muted/20 border border-border/30 rounded-lg p-3 max-h-64 overflow-y-auto">
            {preview.text}
          </pre>
        )}
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          {t`Rendu par le même moteur que les envois réels. La langue suit chaque abonné (captée à l'inscription).`}
        </p>
      </div>
    </div>
  );
}
