'use client';

import React, { useState } from 'react';
import { t } from '@lingui/core/macro';
import { motion, AnimatePresence } from 'framer-motion';
import { Badge } from '@qoe/ui/badge';
import { Button } from '@qoe/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@qoe/ui/dialog';
import { Input, Textarea } from '@qoe/ui/input';
import { Table, TableBody, TableCell, TableColumn, TableHeader, TableRow } from '@qoe/ui/table';
import { Tab, TabList, Tabs } from '@qoe/ui/tabs';
import { toast } from '@qoe/ui/toast';
import {
  Terminal,
  Key,
  Copy,
  Check,
  Trash2,
  Plus,
  Loader2,
  AlertCircle,
  Clock,
  ExternalLink,
  ShieldCheck,
  Send,
  CheckCircle,
  Code2,
  RefreshCw,
  Globe,
  BookOpen,
  Building2,
  User,
} from 'lucide-react';
import {
  submitApiApplicationAction,
  generateApiKeyAction,
  revokeApiKeyAction,
  rotateApiKeyAction,
} from '@qoe/sdk/actions/dashboard';
import {
  createMediaApiKeyAction,
  revokeMediaApiKeyAction,
  rotateMediaApiKeyAction,
} from '@/app/(creator)/media/actions';
import { DeveloperNav } from './developer-nav';
import { cn } from '@qoe/utils';
import { attemptWithStepUp } from '@/lib/authz-feedback';

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message) return message;
  }
  return fallback;
}

// Scopes de clé API (moindre privilège)
const API_KEY_SCOPES = ['READ', 'WRITE', 'ANALYTICS'] as const;
type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

// Correspondance permission (grant admin) → scope de clé API : une clé ne peut
// jamais porter un scope non couvert par les permissions accordées par l'admin.
const GRANT_TO_SCOPE: Record<string, ApiKeyScope> = {
  'api:read': 'READ',
  'api:write': 'WRITE',
  'api:analytics': 'ANALYTICS',
};

// Métadonnées d'affichage des permissions accordées (page développeur).
const GRANT_META: Record<string, { label: string; badgeClass: string }> = {
  'api:read': { label: 'API lecture', badgeClass: 'bg-primary/10 border-primary/20 text-primary' },
  'api:write': {
    label: 'API écriture',
    badgeClass: 'bg-primary/10 border-primary/20 text-primary',
  },
  'api:analytics': {
    label: 'Analytics',
    badgeClass: 'bg-highlight/10 border-highlight/20 text-highlight',
  },
  webhooks: { label: 'Webhooks', badgeClass: 'bg-highlight/10 border-highlight/20 text-highlight' },
  oauth: { label: 'OAuth', badgeClass: 'bg-success/10 border-success/20 text-success-text' },
};

const APPLICATION_PRESETS = [
  {
    id: 'portfolio',
    title: 'Site web ou Portfolio',
    subtitle: 'Next.js, Astro, Remix, SvelteKit',
    icon: Globe,
    template:
      "Je souhaite intégrer l'API qoefi à mon site web personnel pour afficher dynamiquement mes derniers articles publiés, tags et informations d'auteur.",
  },
  {
    id: 'automation',
    title: 'Automatisation & CMS',
    subtitle: 'Zapier, Notion, Make, n8n',
    icon: RefreshCw,
    template:
      "Je souhaite connecter l'API de publication qoefi à mes outils d'automatisation (Zapier / Make / Notion) pour synchroniser mes brouillons et articles.",
  },
  {
    id: 'ai-agent',
    title: 'Agent IA & Index Sémantique',
    subtitle: 'Recherche sémantique, résumés',
    icon: Code2,
    template:
      "Je souhaite utiliser l'API en lecture pour alimenter un agent d'indexation sémantique et générer des résumés contextuels de mes publications.",
  },
  {
    id: 'webhooks',
    title: 'Webhooks & Pipeline Privé',
    subtitle: 'Discord, Telegram, Backend',
    icon: Send,
    template:
      'Je souhaite souscrire aux webhooks sortants pour être notifié en direct lors de chaque publication et synchroniser ma communauté privée.',
  },
] as const;

const SCOPE_META: Record<ApiKeyScope, { label: string; desc: () => string; badgeClass: string }> = {
  READ: {
    label: 'READ',
    desc: () => t`Lecture des articles, profils et catégories publiques`,
    badgeClass: 'bg-primary/10 border-primary/20 text-primary',
  },
  WRITE: {
    label: 'WRITE',
    desc: () => t`Création, modification et publication de contenus`,
    badgeClass: 'bg-success/10 border-success/20 text-success-text',
  },
  ANALYTICS: {
    label: 'ANALYTICS',
    desc: () => t`Accès aux métriques de lecture et temps de complétion`,
    badgeClass: 'bg-highlight/10 border-highlight/20 text-highlight',
  },
};

interface ApiKeyType {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
}

export interface ActiveWorkspaceContext {
  type: 'PERSONAL' | 'MEDIA';
  name: string;
  mediaId?: string;
  publicationId: string;
}

interface DeveloperClientProps {
  initialStatus: string;
  initialGrants: string[];
  initialReason: string | null;
  initialKeys: ApiKeyType[];
  activeWorkspace?: ActiveWorkspaceContext;
}

type CodeSnippetTab = 'curl' | 'typescript' | 'python';

export function DeveloperClient({
  initialStatus,
  initialGrants,
  initialReason,
  initialKeys,
  activeWorkspace,
}: DeveloperClientProps) {
  const isMediaWorkspace = activeWorkspace?.type === 'MEDIA' && Boolean(activeWorkspace?.mediaId);

  const [status, setStatus] = useState<string>(isMediaWorkspace ? 'approved' : initialStatus);
  const [grants] = useState<string[]>(initialGrants);
  const [reason, setReason] = useState<string>(initialReason || '');
  const [keys, setKeys] = useState<ApiKeyType[]>(initialKeys);

  // Scopes autorisés : en mode média, tous les scopes (READ/WRITE/ANALYTICS) sont gérés par le RBAC média.
  const allowedScopes: ApiKeyScope[] = isMediaWorkspace
    ? [...API_KEY_SCOPES]
    : API_KEY_SCOPES.filter((scope) => Object.values(GRANT_TO_SCOPE).includes(scope)).filter(
        (scope) => grants.some((g) => GRANT_TO_SCOPE[g] === scope)
      );
  const hasApiAccess = isMediaWorkspace || allowedScopes.length > 0;

  // Forms & Loading states
  const [isSubmittingApp, setIsSubmittingApp] = useState(false);
  const [isGeneratingKey, setIsGeneratingKey] = useState(false);
  const [isRevokingKeyId, setIsRevokingKeyId] = useState<string | null>(null);
  const [isRotatingKeyId, setIsRotatingKeyId] = useState<string | null>(null);
  // Mode d'affichage du modal « clé affichée une seule fois ».
  const [keyModalMode, setKeyModalMode] = useState<'generated' | 'rotated'>('generated');

  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyScopes, setNewKeyScopes] = useState<ApiKeyScope[]>(() => [...allowedScopes]);
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [snippetTab, setSnippetTab] = useState<CodeSnippetTab>('curl');
  const [snippetCopied, setSnippetCopied] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [projectUrl, setProjectUrl] = useState('');

  // Copy to clipboard
  const handleCopy = (text: string, isSnippet = false) => {
    const showSuccess = () => {
      if (isSnippet) {
        setSnippetCopied(true);
        toast.success(t`Extrait de code copié !`);
        setTimeout(() => setSnippetCopied(false), 2000);
      } else {
        setCopied(true);
        toast.success(t`Clé d'API copiée dans le presse-papiers !`);
        setTimeout(() => setCopied(false), 2000);
      }
    };

    if (typeof window !== 'undefined' && navigator?.clipboard?.writeText) {
      navigator.clipboard
        .writeText(text)
        .then(showSuccess)
        .catch(() => fallbackCopy(text, showSuccess));
    } else {
      fallbackCopy(text, showSuccess);
    }
  };

  const fallbackCopy = (text: string, onSuccess: () => void) => {
    try {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.top = '0';
      textArea.style.left = '0';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      if (successful) {
        onSuccess();
      } else {
        toast.error('Impossible de copier dans le presse-papiers.');
      }
    } catch {
      toast.error('Impossible de copier dans le presse-papiers.');
    }
  };

  // Handle access application submission
  const handleSubmitApplication = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalReason = projectUrl.trim()
      ? `${reason.trim()}\n\nLien du projet : ${projectUrl.trim()}`
      : reason.trim();

    if (finalReason.length < 10) {
      toast.error(t`Veuillez expliquer votre cas d'usage d'au moins 10 caractères.`);
      return;
    }

    setIsSubmittingApp(true);
    try {
      const res = await submitApiApplicationAction(finalReason);
      if (res.ok) {
        setStatus('pending');
        toast.success(t`Votre demande d'accès API a bien été soumise !`);
      }
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Une erreur est survenue lors de la soumission.'));
    } finally {
      setIsSubmittingApp(false);
    }
  };

  // Handle generating new key
  const handleGenerateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyName.trim()) {
      toast.error(t`Veuillez donner un nom à la clé d'API.`);
      return;
    }

    setIsGeneratingKey(true);
    try {
      const mediaId = activeWorkspace?.mediaId;
      if (isMediaWorkspace && mediaId) {
        // `attemptWithStepUp` rejoue l'action après une vérification de facteur.
        const res = await attemptWithStepUp(
          () => createMediaApiKeyAction(mediaId, newKeyName.trim(), newKeyScopes),
          { fallback: t`Erreur lors de la génération de la clé.` }
        );
        if (res.success && res.key) {
          setKeyModalMode('generated');
          setGeneratedKey(res.key.secret);
          setKeys([
            {
              id: res.key.id,
              name: res.key.name,
              keyPrefix: res.key.keyPrefix,
              scopes: res.key.scopes,
              createdAt: res.key.createdAt,
              lastUsedAt: null,
            },
            ...keys,
          ]);
          setShowKeyModal(true);

          setNewKeyName('');
          setNewKeyScopes([...allowedScopes]);
          toast.success(t`Nouvelle clé d'API Média générée avec succès !`);
        }
      } else {
        const res = await attemptWithStepUp(
          () => generateApiKeyAction({ name: newKeyName, scopes: newKeyScopes }),
          { fallback: t`Erreur lors de la génération de la clé.` }
        );
        if (res.ok && res.data?.apiKey) {
          setKeyModalMode('generated');
          setGeneratedKey(res.data.apiKey);
          setKeys([
            {
              id: `tmp-${Date.now()}`,
              name: newKeyName.trim(),
              keyPrefix: 'qoe_live_',
              scopes: newKeyScopes,
              createdAt: new Date().toISOString(),
              lastUsedAt: null,
            },
            ...keys,
          ]);
          setShowKeyModal(true);

          setNewKeyName('');
          setNewKeyScopes([...allowedScopes]);
          toast.success(t`Nouvelle clé d'API générée avec succès !`);
        }
      }
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, t`Erreur lors de la génération de la clé.`));
    } finally {
      setIsGeneratingKey(false);
    }
  };

  const toggleKeyScope = (scope: ApiKeyScope) => {
    setNewKeyScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    );
  };

  // Handle key rotation (nouveau secret, l'ancien est invalidé)
  const handleRotateKey = async (id: string) => {
    setIsRotatingKeyId(id);
    try {
      const mediaId = activeWorkspace?.mediaId;
      if (isMediaWorkspace && mediaId) {
        const res = await attemptWithStepUp(() => rotateMediaApiKeyAction(mediaId, id), {
          fallback: t`Erreur lors de la rotation de la clé.`,
        });
        if (res.success && res.key) {
          setKeyModalMode('rotated');
          setGeneratedKey(res.key.secret);
          setShowKeyModal(true);
          toast.success(t`Clé d'API rotatée avec succès.`);
        }
      } else {
        const res = await attemptWithStepUp(() => rotateApiKeyAction(id), {
          fallback: t`Erreur lors de la rotation de la clé.`,
        });
        if (res.ok && res.data?.apiKey) {
          setKeyModalMode('rotated');
          setGeneratedKey(res.data.apiKey);
          setShowKeyModal(true);
          toast.success(t`Clé d'API rotatée avec succès.`);
        }
      }
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, t`Erreur lors de la rotation de la clé.`));
    } finally {
      setIsRotatingKeyId(null);
    }
  };

  // Handle revoking key
  const handleRevokeKey = async (id: string) => {
    setIsRevokingKeyId(id);
    try {
      const mediaId = activeWorkspace?.mediaId;
      if (isMediaWorkspace && mediaId) {
        const res = await attemptWithStepUp(() => revokeMediaApiKeyAction(mediaId, id), {
          fallback: t`Erreur lors de la révocation de la clé.`,
        });
        if (res.success) {
          setKeys(keys.filter((k) => k.id !== id));
          setConfirmDeleteId(null);
          toast.success(t`Clé d'API révoquée avec succès.`);
        }
      } else {
        const res = await attemptWithStepUp(() => revokeApiKeyAction(id), {
          fallback: t`Erreur lors de la révocation de la clé.`,
        });
        if (res.ok) {
          setKeys(keys.filter((k) => k.id !== id));
          setConfirmDeleteId(null);
          toast.success(t`Clé d'API révoquée avec succès.`);
        }
      }
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, t`Erreur lors de la révocation de la clé.`));
    } finally {
      setIsRevokingKeyId(null);
    }
  };

  // Code snippets by language
  const snippets: Record<CodeSnippetTab, string> = {
    curl: `curl -X GET "https://api.qoe.fi/v1/articles" \\
  -H "Authorization: Bearer qoe_live_votre_cle_api" \\
  -H "Accept: application/json"`,
    typescript: `import { QoeClient } from '@qoe/sdk';

const qoe = new QoeClient({
  apiKey: process.env.QOE_API_KEY, // 'qoe_live_...'
});

// Récupérer vos derniers articles
const { data: articles } = await qoe.articles.list({
  limit: 10,
  published: true,
});

console.log(articles);`,
    python: `import requests
import os

headers = {
    "Authorization": f"Bearer {os.getenv('QOE_API_KEY')}",
    "Accept": "application/json"
}

response = requests.get("https://api.qoe.fi/v1/articles", headers=headers)
articles = response.json()
print(articles)`,
  };

  return (
    <div className="w-full space-y-8 font-sans pb-16 text-foreground">
      {/* Header section */}
      <div className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary mb-1.5">
              <Terminal className="w-3.5 h-3.5" />
              Plateforme Développeur & API
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              API Créateur & Intégrations
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              Connectez votre portfolio, automatisez vos publications et intégrez qoefi à votre
              propre infrastructure avec nos SDKs et webhooks.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 self-start md:self-auto">
            {/* Workspace Context Badge */}
            {activeWorkspace && (
              <div className="flex items-center gap-2 bg-card border border-border/80 rounded-full px-3.5 py-1.5 text-xs shadow-xs">
                <span className="text-muted-foreground">Workspace :</span>
                {isMediaWorkspace ? (
                  <span className="font-semibold text-primary flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5" />
                    {activeWorkspace.name}
                  </span>
                ) : (
                  <span className="font-semibold text-foreground flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5" />
                    Personnel
                  </span>
                )}
              </div>
            )}

            {/* Status Badge */}
            <div className="flex items-center gap-2 bg-card border border-border/80 rounded-full px-3.5 py-1.5 text-xs shadow-xs">
              <span className="text-muted-foreground">Statut d'accès :</span>
              {status === 'none' && (
                <span className="font-medium text-muted-foreground">Non demandé</span>
              )}
              {status === 'pending' && (
                <span className="font-semibold text-highlight flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-highlight animate-pulse" />
                  En attente d'approbation
                </span>
              )}
              {status === 'approved' && (
                <span className="font-semibold text-success-text flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-success" />
                  Accès Actif
                </span>
              )}
              {status === 'approved' && grants.length > 0 && (
                <span className="flex flex-wrap items-center gap-1">
                  {grants.map((g) => {
                    const meta = GRANT_META[g];
                    if (!meta) return null;
                    return (
                      <span
                        key={g}
                        className={`text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full border ${meta.badgeClass}`}
                      >
                        {meta.label}
                      </span>
                    );
                  })}
                </span>
              )}
              {status === 'rejected' && (
                <span className="font-semibold text-destructive-text">Rejeté</span>
              )}
              {status === 'revoked' && (
                <span className="font-semibold text-destructive-text">Accès Révoqué</span>
              )}
            </div>
          </div>
        </div>

        {/* Sub-Navigation */}
        <DeveloperNav activeTab="keys" />
      </div>

      <AnimatePresence mode="wait">
        {/* STATE 1: No access yet or rejected (Request Access Form) */}
        {(status === 'none' || status === 'rejected' || status === 'revoked') && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25 }}
            className="space-y-8"
          >
            {/* Hero value proposition */}
            <div className="relative overflow-hidden rounded-3xl border border-border/80 bg-gradient-to-br from-card via-card to-primary/5 p-6 md:p-8 shadow-xs">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
                <div className="space-y-2 max-w-2xl">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary border border-primary/20">
                      <Code2 className="w-3 h-3" /> REST v1
                    </span>
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium bg-muted/60 text-muted-foreground border border-border/60">
                      TypeScript SDK
                    </span>
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium bg-muted/60 text-muted-foreground border border-border/60">
                      Webhooks HMAC
                    </span>
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium bg-muted/60 text-muted-foreground border border-border/60">
                      OAuth 2.1
                    </span>
                  </div>
                  <h2 className="text-2xl font-bold tracking-tight text-foreground">
                    Développez et automatisez avec l'API qoefi
                  </h2>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Connectez vos articles, abonnés et métriques de lecture directement à vos sites
                    personnels, vos outils d'automatisation ou vos serveurs d'événements.
                  </p>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <a
                    href="https://docs.qoe.fi"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-card border border-border/80 text-foreground hover:border-primary/40 hover:text-primary text-xs font-semibold shadow-xs transition-all"
                  >
                    <BookOpen className="w-3.5 h-3.5 text-primary" />
                    Explorer docs.qoe.fi
                    <ExternalLink className="w-3 h-3 opacity-60" />
                  </a>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Form Column */}
              <div className="lg:col-span-2 space-y-6">
                <div className="bg-card border border-border/80 rounded-2xl shadow-xs p-6 md:p-8 space-y-6">
                  <div className="space-y-1.5">
                    <h3 className="text-lg font-bold text-foreground">
                      Demande d'activation développeur
                    </h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Sélectionnez un modèle de projet ou écrivez votre cas d'usage. Notre équipe
                      valide les demandes en moins de 24 heures ouvrées.
                    </p>
                  </div>

                  {/* Preset Templates */}
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-foreground block">
                      Cas d'usage rapides (cliquez pour pré-remplir)
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {APPLICATION_PRESETS.map((preset) => {
                        const Icon = preset.icon;
                        const isSelected = selectedPreset === preset.id;
                        return (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() => {
                              setSelectedPreset(preset.id);
                              setReason(preset.template);
                            }}
                            className={cn(
                              'text-left p-3 rounded-xl border transition-all duration-150 cursor-pointer flex items-start gap-3',
                              isSelected
                                ? 'bg-primary/5 border-primary/40 ring-1 ring-primary/20'
                                : 'bg-muted/30 border-border/70 hover:bg-muted/50 hover:border-border'
                            )}
                          >
                            <div
                              className={cn(
                                'w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 border',
                                isSelected
                                  ? 'bg-primary text-primary-foreground border-primary'
                                  : 'bg-card text-muted-foreground border-border/80'
                              )}
                            >
                              <Icon className="w-3.5 h-3.5" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-foreground truncate">
                                {preset.title}
                              </p>
                              <p className="text-[11px] text-muted-foreground truncate">
                                {preset.subtitle}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <form onSubmit={handleSubmitApplication} className="space-y-5">
                    <div className="space-y-2">
                      <label
                        htmlFor="reason"
                        className="text-xs font-semibold text-foreground flex items-center justify-between"
                      >
                        <span>
                          Description de votre projet ou intégration{' '}
                          <span className="text-primary">*</span>
                        </span>
                        <span
                          className={cn(
                            'text-[11px]',
                            reason.trim().length >= 10
                              ? 'text-success-text font-medium'
                              : 'text-muted-foreground'
                          )}
                        >
                          {reason.trim().length} car. (min 10)
                        </span>
                      </label>
                      <Textarea
                        id="reason"
                        rows={4}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Décrivez votre projet, les données que vous souhaitez requêter et les technologies employées..."
                        required
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label htmlFor="projectUrl" className="text-xs font-semibold text-foreground">
                        Lien de votre site ou dépôt (optionnel)
                      </label>
                      <Input
                        id="projectUrl"
                        type="url"
                        value={projectUrl}
                        onChange={(e) => setProjectUrl(e.target.value)}
                        placeholder="https://monportfolio.com ou https://github.com/mon-projet"
                      />
                    </div>

                    <div className="pt-1">
                      <Button
                        type="submit"
                        variant="solid"
                        tone="brand"
                        block
                        disabled={isSubmittingApp || reason.trim().length < 10}
                      >
                        {isSubmittingApp ? <Loader2 className="animate-spin" /> : <Send />}
                        {isSubmittingApp
                          ? 'Transmission de votre dossier...'
                          : "Transmettre ma demande d'accès"}
                      </Button>
                    </div>
                  </form>
                </div>
              </div>

              {/* Explainer Sidebar */}
              <div className="space-y-6">
                <div className="bg-card border border-border/80 rounded-2xl p-6 space-y-4 shadow-xs">
                  <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-primary" />
                    Permissions incluses
                  </h3>
                  <div className="space-y-3 text-xs text-muted-foreground">
                    <div className="p-2.5 rounded-xl bg-muted/30 border border-border/60 space-y-1">
                      <div className="flex items-center gap-1.5 font-bold text-foreground">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                        Lecture (READ)
                      </div>
                      <p className="text-[11px] leading-normal text-muted-foreground">
                        Articles publiés, flux JSON, taxonomies et profil public.
                      </p>
                    </div>

                    <div className="p-2.5 rounded-xl bg-muted/30 border border-border/60 space-y-1">
                      <div className="flex items-center gap-1.5 font-bold text-foreground">
                        <span className="w-1.5 h-1.5 rounded-full bg-success" />
                        Écriture (WRITE)
                      </div>
                      <p className="text-[11px] leading-normal text-muted-foreground">
                        Création d'articles, mise à jour et gestion des brouillons.
                      </p>
                    </div>

                    <div className="p-2.5 rounded-xl bg-muted/30 border border-border/60 space-y-1">
                      <div className="flex items-center gap-1.5 font-bold text-foreground">
                        <span className="w-1.5 h-1.5 rounded-full bg-highlight" />
                        Webhooks temps réel
                      </div>
                      <p className="text-[11px] leading-normal text-muted-foreground">
                        Signatures HMAC SHA-256 lors de chaque événement.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="border border-border/80 rounded-2xl p-6 bg-muted/30 space-y-3">
                  <h4 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5 text-primary" />
                    Documentation & SDK
                  </h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Retrouvez tous les endpoints, schémas TypeScript et exemples d'appels sur notre
                    documentation officielle.
                  </p>
                  <a
                    href="https://docs.qoe.fi"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
                  >
                    Consulter docs.qoe.fi <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* STATE 2: Pending Approval */}
        {status === 'pending' && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25 }}
            className="max-w-3xl mx-auto space-y-8"
          >
            {/* Timeline Stepper Tracker */}
            <div className="bg-card border border-border/80 rounded-2xl shadow-xs p-6 md:p-8 space-y-6">
              <div className="text-center space-y-2 max-w-md mx-auto">
                <div className="w-14 h-14 bg-highlight/10 text-highlight rounded-2xl flex items-center justify-center mx-auto border border-highlight/20 animate-pulse">
                  <Clock className="w-7 h-7" />
                </div>
                <h2 className="text-2xl font-bold text-foreground">
                  Demande d'accès en cours d'examen
                </h2>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Votre demande est transmise à notre équipe technique. Dès validation, vos clés
                  d'API seront activées automatiquement.
                </p>
              </div>

              {/* Steps */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-border/60">
                <div className="p-4 rounded-xl border border-success/30 bg-success/5 space-y-1.5 text-left">
                  <div className="flex items-center gap-2 text-xs font-bold text-success-text">
                    <CheckCircle className="w-4 h-4 text-success-text" />
                    <span>1. Demande envoyée</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Dossier technique enregistré et soumis aux admins.
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-highlight/40 bg-highlight/5 space-y-1.5 text-left ring-1 ring-highlight/20">
                  <div className="flex items-center gap-2 text-xs font-bold text-highlight">
                    <span className="w-2 h-2 rounded-full bg-highlight animate-ping" />
                    <span>2. Analyse en cours</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Revue de conformité sous 24h ouvrées.
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-border/70 bg-muted/20 space-y-1.5 text-left opacity-75">
                  <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
                    <Key className="w-4 h-4 text-muted-foreground" />
                    <span>3. Clés activées</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Génération des tokens et accès aux endpoints.
                  </p>
                </div>
              </div>

              {/* Reason card */}
              <div className="bg-muted/30 border border-border/70 rounded-xl p-4 text-left text-xs space-y-1.5">
                <span className="font-semibold text-foreground block text-[11px] uppercase tracking-wider text-muted-foreground">
                  Cas d'usage renseigné :
                </span>
                <p className="text-foreground leading-relaxed break-words whitespace-pre-wrap font-sans text-xs">
                  {reason || 'Aucun motif renseigné'}
                </p>
              </div>
            </div>

            {/* In the meantime docs card */}
            <div className="bg-card border border-border/80 rounded-2xl p-6 md:p-8 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-6">
              <div className="space-y-1.5">
                <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-primary" />
                  Préparez votre code dès maintenant
                </h3>
                <p className="text-xs text-muted-foreground max-w-lg leading-relaxed">
                  Consultez la documentation officielle sur{' '}
                  <strong className="text-foreground font-semibold">docs.qoe.fi</strong> pour
                  découvrir les schémas d'API, les types TypeScript et installer le SDK.
                </p>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <a
                  href="https://docs.qoe.fi"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-all shadow-xs"
                >
                  Ouvrir docs.qoe.fi <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          </motion.div>
        )}

        {/* STATE 3: Approved (Dashboard Console & API Keys management) */}
        {status === 'approved' && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25 }}
            className="space-y-8"
          >
            {/* Generate key form */}
            <div className="bg-card border border-border/80 rounded-2xl shadow-xs p-6 md:p-8 space-y-6">
              <div>
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <Key className="w-4 h-4 text-primary" />
                  {isMediaWorkspace
                    ? t`Générer une nouvelle clé d'API Média`
                    : t`Générer une nouvelle clé d'API`}
                </h2>
                <p className="text-xs text-muted-foreground mt-1">
                  {isMediaWorkspace
                    ? t`Créez une clé d'API dédiée au média « ${activeWorkspace?.name} » pour vos scripts et intégrations externes.`
                    : t`Créez des clés distinctes pour chacun de vos environnements ou applications afin d'appliquer le principe de moindre privilège.`}
                </p>
              </div>

              <form onSubmit={handleGenerateKey} className="space-y-4 max-w-2xl">
                <div className="flex flex-col sm:flex-row gap-3">
                  <Input
                    type="text"
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    placeholder={
                      isMediaWorkspace
                        ? t`Nom de la clé (ex: CMS Import, Bot Discord, Next.js...)`
                        : t`Nom de la clé (ex: Blog Vercel Prod, App Mobile...)`
                    }
                    className="flex-1"
                    required
                  />
                  <Button
                    type="submit"
                    variant="solid"
                    tone="brand"
                    disabled={isGeneratingKey || !newKeyName.trim() || newKeyScopes.length === 0}
                  >
                    {isGeneratingKey ? <Loader2 className="animate-spin" /> : <Plus />}
                    {isMediaWorkspace ? t`Générer pour le Média` : t`Générer la clé`}
                  </Button>
                </div>

                {/* Permissions de la clé (bornées par les permissions accordées) */}
                <div className="space-y-2">
                  <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                    Permissions de la clé
                  </p>
                  {hasApiAccess ? (
                    <>
                      <div className="flex flex-wrap gap-2">
                        {allowedScopes.map((scope) => {
                          const active = newKeyScopes.includes(scope);
                          const meta = SCOPE_META[scope];
                          return (
                            <Button
                              key={scope}
                              type="button"
                              variant={active ? 'soft' : 'outline'}
                              tone={active ? 'brand' : 'neutral'}
                              size="xs"
                              onClick={() => toggleKeyScope(scope)}
                              title={meta.desc()}
                            >
                              <span>{active ? '✓' : '+'}</span>
                              <span>{scope}</span>
                            </Button>
                          );
                        })}
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {isMediaWorkspace
                          ? t`Cette clé est rattachée au média « ${activeWorkspace?.name} » et donne accès à ses ressources selon les permissions choisies.`
                          : t`Sélectionnez uniquement les permissions nécessaires. Une clé ne peut pas dépasser celles accordées par l'admin.`}
                      </p>
                    </>
                  ) : (
                    <p className="text-[11px] text-highlight leading-relaxed">
                      Aucune permission d&apos;API entrante ne vous a été accordée (lecture /
                      écriture / analytics). Contactez un administrateur pour étendre vos
                      permissions — vos webhooks et applications OAuth restent actifs.
                    </p>
                  )}
                </div>
              </form>
            </div>

            {/* List active keys */}
            <div className="bg-card border border-border/80 rounded-2xl shadow-xs overflow-hidden">
              <div className="px-6 py-4.5 border-b border-border/80 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-foreground">Clés d'API Actives</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Surveillez l'activité et révoquez vos accès à tout moment.
                  </p>
                </div>
                <span className="text-xs font-semibold bg-muted/60 border border-border/80 px-2.5 py-1 rounded-full text-foreground">
                  {keys.length} clé{keys.length > 1 ? 's' : ''}
                </span>
              </div>

              {keys.length === 0 ? (
                <div className="p-12 text-center text-muted-foreground space-y-2">
                  <div className="w-12 h-12 rounded-2xl bg-muted/40 flex items-center justify-center mx-auto text-muted-foreground">
                    <Key className="w-6 h-6" />
                  </div>
                  <p className="text-xs font-medium text-foreground">
                    Aucune clé d&apos;API générée pour le moment.
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Remplissez le formulaire ci-dessus pour obtenir votre premier identifiant.
                  </p>
                </div>
              ) : (
                <Table aria-label="Clés d'API actives" size="md" className="rounded-none border-0">
                  <TableHeader>
                    <TableColumn isRowHeader>Nom & Identifiant</TableColumn>
                    <TableColumn>Permissions</TableColumn>
                    <TableColumn>Dernière Activité</TableColumn>
                    <TableColumn>Date de Création</TableColumn>
                    <TableColumn className="text-right">Actions</TableColumn>
                  </TableHeader>
                  <TableBody items={keys}>
                    {(key) => {
                      const isRecentlyActive =
                        key.lastUsedAt &&
                        Date.now() - new Date(key.lastUsedAt).getTime() < 86400000;

                      return (
                        <TableRow id={key.id}>
                          <TableCell>
                            <div className="font-semibold text-foreground">{key.name}</div>
                            <div className="mt-1 flex items-center gap-1.5">
                              <code className="bg-muted/60 text-muted-foreground px-2 py-0.5 rounded font-sans font-medium text-[11px] border border-border/50">
                                {key.keyPrefix}••••••••••••••••
                              </code>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1.5">
                              {(key.scopes?.length
                                ? (key.scopes as ApiKeyScope[])
                                : (['READ', 'WRITE', 'ANALYTICS'] as ApiKeyScope[])
                              ).map((scope) => (
                                <Badge
                                  key={scope}
                                  variant="soft"
                                  tone={
                                    scope === 'WRITE'
                                      ? 'success'
                                      : scope === 'ANALYTICS'
                                        ? 'vivid'
                                        : 'brand'
                                  }
                                  size="xs"
                                >
                                  {scope}
                                </Badge>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell>
                            {key.lastUsedAt ? (
                              <span className="flex items-center gap-1.5 text-foreground font-medium text-[11px]">
                                <span
                                  className={cn(
                                    'w-1.5 h-1.5 rounded-full',
                                    isRecentlyActive
                                      ? 'bg-success animate-pulse'
                                      : 'bg-muted-foreground'
                                  )}
                                />
                                {new Date(key.lastUsedAt).toLocaleDateString('fr-FR', {
                                  day: 'numeric',
                                  month: 'short',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                            ) : (
                              <span className="text-muted-foreground text-[11px] flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" />
                                Jamais utilisée
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-[11px]">
                            {new Date(key.createdAt).toLocaleDateString('fr-FR', {
                              day: 'numeric',
                              month: 'long',
                              year: 'numeric',
                            })}
                          </TableCell>
                          <TableCell className="text-right">
                            {confirmDeleteId === key.id ? (
                              <div className="flex items-center justify-end gap-1.5">
                                <Button
                                  variant="ghost"
                                  size="xs"
                                  onClick={() => setConfirmDeleteId(null)}
                                  disabled={isRevokingKeyId === key.id}
                                >
                                  Annuler
                                </Button>
                                <Button
                                  variant="solid"
                                  tone="danger"
                                  size="xs"
                                  disabled={isRevokingKeyId === key.id}
                                  onClick={() => handleRevokeKey(key.id)}
                                >
                                  {isRevokingKeyId === key.id && (
                                    <Loader2 className="animate-spin" />
                                  )}
                                  Révoquer
                                </Button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="xs"
                                  shape="icon"
                                  disabled={
                                    isRotatingKeyId === key.id || isRevokingKeyId === key.id
                                  }
                                  onClick={() => handleRotateKey(key.id)}
                                  title={t`Rotater la clé : régénère le secret et invalide l'ancienne clé`}
                                  aria-label={t`Rotater la clé`}
                                >
                                  <RefreshCw
                                    className={cn(isRotatingKeyId === key.id && 'animate-spin')}
                                  />
                                </Button>
                                <Button
                                  variant="ghost"
                                  tone="danger"
                                  size="xs"
                                  shape="icon"
                                  onClick={() => setConfirmDeleteId(key.id)}
                                  title={t`Révoquer cette clé d'API`}
                                  aria-label={t`Révoquer cette clé d'API`}
                                >
                                  <Trash2 />
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    }}
                  </TableBody>
                </Table>
              )}
            </div>

            {/* Quick Start Documentation with Language Tabs */}
            <div className="bg-card border border-border/80 rounded-2xl shadow-xs p-6 md:p-8 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Code2 className="w-5 h-5 text-primary" />
                  <div>
                    <div className="flex items-center gap-2.5">
                      <h3 className="text-base font-bold text-foreground">
                        Guide de démarrage rapide
                      </h3>
                      <a
                        href="https://docs.qoe.fi"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
                      >
                        docs.qoe.fi <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Exemple d&apos;appel d&apos;API avec authentification Bearer.
                    </p>
                  </div>
                </div>

                {/* Code Tabs */}
                <Tabs
                  variant="segmented"
                  size="sm"
                  selectedKey={snippetTab}
                  onSelectionChange={(key) => setSnippetTab(String(key) as CodeSnippetTab)}
                  className="self-start"
                >
                  <TabList aria-label="Langage de l'extrait">
                    <Tab id="curl">cURL</Tab>
                    <Tab id="typescript">TypeScript</Tab>
                    <Tab id="python">Python</Tab>
                  </TabList>
                </Tabs>
              </div>

              {/* Code Snippet Box */}
              <div className="relative bg-muted/40 border border-border/80 rounded-xl p-4 font-sans text-xs overflow-x-auto">
                <Button
                  variant="outline"
                  size="xs"
                  shape="icon"
                  onClick={() => handleCopy(snippets[snippetTab], true)}
                  className="absolute top-3 right-3 bg-card"
                  title="Copier l'extrait de code"
                  aria-label="Copier l'extrait de code"
                >
                  {snippetCopied ? <Check className="text-success-text" /> : <Copy />}
                </Button>
                <pre className="text-foreground whitespace-pre overflow-x-auto pr-8">
                  {snippets[snippetTab]}
                </pre>
              </div>

              {/* Endpoints overview cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <div className="border border-border/80 rounded-xl p-4 space-y-1.5 bg-muted/20">
                  <h4 className="font-bold text-foreground flex items-center gap-1 text-xs">
                    <span className="bg-success/10 text-success-text border border-success/20 px-1.5 py-0.5 rounded text-[9px] font-black mr-1">
                      GET
                    </span>
                    /v1/articles
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Liste paginée de tous vos articles publiés avec tags sémantiques et temps de
                    lecture.
                  </p>
                </div>

                <div className="border border-border/80 rounded-xl p-4 space-y-1.5 bg-muted/20">
                  <h4 className="font-bold text-foreground flex items-center gap-1 text-xs">
                    <span className="bg-success/10 text-success-text border border-success/20 px-1.5 py-0.5 rounded text-[9px] font-black mr-1">
                      GET
                    </span>
                    /v1/articles/:slug
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Contenu complet de l'article avec structure JSON TipTap riche et métadonnées
                    d'auteur.
                  </p>
                </div>
              </div>

              {/* Footer link to docs.qoe.fi */}
              <div className="pt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-border/60 text-xs">
                <span className="text-muted-foreground">
                  Besoin d'aller plus loin ? Webhooks sortants, filtres avancés, pagination et SDK
                  officiel :
                </span>
                <a
                  href="https://docs.qoe.fi"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-primary hover:underline inline-flex items-center gap-1.5 shrink-0"
                >
                  Explorer toute la documentation sur docs.qoe.fi{' '}
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* KEY GENERATED MODAL */}
      <Dialog
        open={Boolean(showKeyModal && generatedKey)}
        onOpenChange={(open) => {
          if (!open) {
            setShowKeyModal(false);
            setGeneratedKey(null);
          }
        }}
        isDismissable={false}
        size="lg"
      >
        <DialogContent showCloseButton={false}>
          {generatedKey && (
            <div className="space-y-5">
              <div className="text-center space-y-2">
                <div className="w-12 h-12 bg-success/10 text-success-text border border-success/20 rounded-2xl flex items-center justify-center mx-auto mb-2">
                  <CheckCircle className="w-6 h-6" />
                </div>
                <DialogTitle className="text-center text-lg">
                  {keyModalMode === 'rotated'
                    ? t`Votre clé d'API a été rotatée avec succès`
                    : t`Votre clé d'API a été générée avec succès`}
                </DialogTitle>
                <DialogDescription className="max-w-md mx-auto text-center">
                  {keyModalMode === 'rotated'
                    ? t`L'ancienne clé est désormais invalide. Copiez cette nouvelle clé secrète dès maintenant : elle ne sera plus jamais réaffichée.`
                    : t`Copiez cette clé secrète dès maintenant. Pour des raisons de sécurité, nous ne pourrons plus jamais vous la réafficher.`}
                </DialogDescription>
              </div>

              <div className="bg-muted/50 border border-border rounded-xl p-4 flex items-center justify-between gap-3 font-sans text-xs select-all">
                <code className="text-foreground break-all font-semibold font-sans text-xs">
                  {generatedKey}
                </code>
                <Button
                  type="button"
                  variant="solid"
                  tone="brand"
                  size="sm"
                  shape="icon"
                  onClick={() => handleCopy(generatedKey)}
                  aria-label="Copier la clé"
                >
                  {copied ? <Check /> : <Copy />}
                </Button>
              </div>

              <div className="bg-highlight/10 border border-highlight/20 rounded-xl p-4 flex gap-3 text-xs text-highlight">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <span className="font-bold">Stockage sécurisé</span>
                  <p className="leading-relaxed text-[11px]">
                    Gardez cette clé confidentielle dans vos variables d&apos;environnement serveur.
                    Ne l&apos;exposez jamais dans du code client JavaScript public.
                  </p>
                </div>
              </div>

              <Button
                type="button"
                variant="solid"
                tone="brand"
                block
                onClick={() => {
                  setShowKeyModal(false);
                  setGeneratedKey(null);
                }}
              >
                J&apos;ai sauvegardé ma clé d&apos;API
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
