'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
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
  Sparkles,
} from 'lucide-react';
import {
  submitApiApplicationAction,
  generateApiKeyAction,
  revokeApiKeyAction,
} from '@qoe/sdk/actions/dashboard';
import { DeveloperNav } from './developer-nav';
import { cn } from '@qoe/utils';

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

const SCOPE_META: Record<ApiKeyScope, { label: string; desc: string; badgeClass: string }> = {
  READ: {
    label: 'READ',
    desc: 'Lecture des articles, profils et catégories publiques',
    badgeClass: 'bg-primary/10 border-primary/20 text-primary',
  },
  WRITE: {
    label: 'WRITE',
    desc: 'Création, modification et publication de contenus',
    badgeClass: 'bg-success/10 border-success/20 text-success',
  },
  ANALYTICS: {
    label: 'ANALYTICS',
    desc: 'Accès aux métriques de lecture et temps de complétion',
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

interface DeveloperClientProps {
  initialStatus: string;
  initialReason: string | null;
  initialKeys: ApiKeyType[];
}

type CodeSnippetTab = 'curl' | 'typescript' | 'python';

export function DeveloperClient({
  initialStatus,
  initialReason,
  initialKeys,
}: DeveloperClientProps) {
  const [status, setStatus] = useState<string>(initialStatus);
  const [reason, setReason] = useState<string>(initialReason || '');
  const [keys, setKeys] = useState<ApiKeyType[]>(initialKeys);

  // Forms & Loading states
  const [isSubmittingApp, setIsSubmittingApp] = useState(false);
  const [isGeneratingKey, setIsGeneratingKey] = useState(false);
  const [isRevokingKeyId, setIsRevokingKeyId] = useState<string | null>(null);

  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyScopes, setNewKeyScopes] = useState<ApiKeyScope[]>(() => [...API_KEY_SCOPES]);
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [snippetTab, setSnippetTab] = useState<CodeSnippetTab>('curl');
  const [snippetCopied, setSnippetCopied] = useState(false);

  // Copy to clipboard
  const handleCopy = (text: string, isSnippet = false) => {
    const showSuccess = () => {
      if (isSnippet) {
        setSnippetCopied(true);
        toast.success('Extrait de code copié !');
        setTimeout(() => setSnippetCopied(false), 2000);
      } else {
        setCopied(true);
        toast.success("Clé d'API copiée dans le presse-papiers !");
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
    if (reason.trim().length < 10) {
      toast.error("Veuillez expliquer votre cas d'usage d'au moins 10 caractères.");
      return;
    }

    setIsSubmittingApp(true);
    try {
      const res = await submitApiApplicationAction(reason);
      if (res.ok) {
        setStatus('pending');
        toast.success("Votre demande d'accès API a bien été soumise !");
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
      toast.error("Veuillez donner un nom à la clé d'API.");
      return;
    }

    setIsGeneratingKey(true);
    try {
      const res = await generateApiKeyAction({ name: newKeyName, scopes: newKeyScopes });
      if (res.ok && res.data?.apiKey) {
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
        setNewKeyScopes([...API_KEY_SCOPES]);
        toast.success("Nouvelle clé d'API générée avec succès !");
      }
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Erreur lors de la génération de la clé.'));
    } finally {
      setIsGeneratingKey(false);
    }
  };

  const toggleKeyScope = (scope: ApiKeyScope) => {
    setNewKeyScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    );
  };

  // Handle revoking key
  const handleRevokeKey = async (id: string) => {
    setIsRevokingKeyId(id);
    try {
      const res = await revokeApiKeyAction(id);
      if (res.ok) {
        setKeys(keys.filter((k) => k.id !== id));
        setConfirmDeleteId(null);
        toast.success("Clé d'API révoquée avec succès.");
      }
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Erreur lors de la révocation de la clé.'));
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
              Connectez votre portfolio, automatisez vos publications et intégrez qoe.fi à votre
              propre infrastructure avec nos SDKs et webhooks.
            </p>
          </div>

          {/* Status Badge */}
          <div className="flex items-center gap-2 self-start md:self-auto bg-card border border-border/80 rounded-full px-3.5 py-1.5 text-xs shadow-xs">
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
              <span className="font-semibold text-success flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-success" />
                Accès Actif
              </span>
            )}
            {status === 'rejected' && (
              <span className="font-semibold text-destructive">Rejeté</span>
            )}
            {status === 'revoked' && (
              <span className="font-semibold text-destructive">Accès Révoqué</span>
            )}
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
            className="grid grid-cols-1 lg:grid-cols-3 gap-8"
          >
            {/* Form Column */}
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-card border border-border/80 rounded-2xl shadow-xs p-6 md:p-8 space-y-6">
                <div className="space-y-1.5">
                  <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-primary" />
                    Demander l'accès développeur
                  </h2>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    L'utilisation de notre API est soumise à une validation pour garantir la qualité
                    du réseau et la sécurité des données. Remplissez ce court formulaire et notre
                    équipe l'étudiera rapidement.
                  </p>
                </div>

                <form onSubmit={handleSubmitApplication} className="space-y-5">
                  <div className="space-y-2">
                    <label
                      htmlFor="reason"
                      className="text-xs font-semibold text-foreground flex items-center justify-between"
                    >
                      <span>
                        Quelle utilisation souhaitez-vous faire de l'API ?{' '}
                        <span className="text-primary">*</span>
                      </span>
                      <span
                        className={cn(
                          'text-[11px]',
                          reason.trim().length >= 10
                            ? 'text-success font-medium'
                            : 'text-muted-foreground'
                        )}
                      >
                        {reason.trim().length} car. (min 10)
                      </span>
                    </label>
                    <textarea
                      id="reason"
                      rows={5}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Ex : Je souhaite synchroniser automatiquement mes articles sur mon blog Next.js personnel hébergé sur Vercel (https://monportfolio.com)..."
                      className="w-full rounded-xl border border-border px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary placeholder:text-muted-foreground/60 bg-muted/30 transition-all"
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmittingApp || reason.trim().length < 10}
                    className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed font-semibold text-xs tracking-wide py-3 px-6 rounded-xl transition-all duration-200 shadow-xs"
                  >
                    {isSubmittingApp ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Traitement en cours...
                      </>
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5" />
                        Envoyer ma demande d'accès
                      </>
                    )}
                  </button>
                </form>
              </div>
            </div>

            {/* Explainer Sidebar */}
            <div className="space-y-6">
              <div className="bg-card border border-border/80 rounded-2xl p-6 space-y-4 shadow-xs">
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-primary" />
                  Caractéristiques de l'API
                </h3>
                <ul className="space-y-3.5 text-xs text-muted-foreground">
                  <li className="flex items-start gap-2.5">
                    <Check className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                    <span>
                      <strong className="text-foreground">Lecture & Écriture</strong> : accès aux
                      articles, métadonnées, statistiques et flux RSS JSON.
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Check className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                    <span>
                      <strong className="text-foreground">Authentification Bearer</strong> :
                      standard et sécurisée via clé secrète avec hachage SHA-256 en base.
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Check className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                    <span>
                      <strong className="text-foreground">Webhooks temps réel</strong> :
                      notifications instantanées signées par HMAC SHA-256 sur vos serveurs.
                    </span>
                  </li>
                </ul>
              </div>

              <div className="border border-border/80 rounded-2xl p-6 bg-muted/30 space-y-2.5">
                <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">
                  Besoin d'aide ?
                </h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Notre équipe technique valide généralement les demandes en moins de 24h ouvrées.
                </p>
                <a
                  href="mailto:support@qoe.fi"
                  className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1 mt-1"
                >
                  Contacter le support <ExternalLink className="w-3 h-3" />
                </a>
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
            className="bg-card border border-border/80 rounded-2xl shadow-xs p-8 text-center max-w-2xl mx-auto space-y-6"
          >
            <div className="w-16 h-16 bg-highlight/10 rounded-2xl flex items-center justify-center mx-auto text-highlight border border-highlight/20 animate-pulse">
              <Clock className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-foreground">
                Demande d'accès en cours d'analyse
              </h2>
              <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
                Votre demande a bien été transmise à notre équipe. Nous étudions votre projet pour
                activer vos clés d'API.
              </p>
            </div>

            <div className="bg-muted/40 border border-border/80 rounded-xl p-4 text-left text-xs max-w-md mx-auto space-y-1">
              <span className="font-semibold text-foreground block">
                Votre message d'application :
              </span>
              <p className="font-mono text-muted-foreground break-words text-[11px]">
                {reason || 'Aucun motif renseigné'}
              </p>
            </div>

            <p className="text-xs text-muted-foreground">
              Vous recevrez une notification par email dès confirmation.
            </p>
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
                  Générer une nouvelle clé d'API
                </h2>
                <p className="text-xs text-muted-foreground mt-1">
                  Créez des clés distinctes pour chacun de vos environnements ou applications afin
                  d'appliquer le principe de moindre privilège.
                </p>
              </div>

              <form onSubmit={handleGenerateKey} className="space-y-4 max-w-2xl">
                <div className="flex flex-col sm:flex-row gap-3">
                  <input
                    type="text"
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    placeholder="Nom de la clé (ex: Blog Vercel Prod, App Mobile...)"
                    className="flex-1 rounded-xl border border-border px-4 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary placeholder:text-muted-foreground/60 bg-muted/30 transition-all text-foreground"
                    required
                  />
                  <button
                    type="submit"
                    disabled={isGeneratingKey || !newKeyName.trim() || newKeyScopes.length === 0}
                    className="bg-primary hover:bg-primary/90 text-primary-foreground disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed text-xs font-semibold px-5 py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition-all duration-200 shadow-xs"
                  >
                    {isGeneratingKey ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Plus className="w-3.5 h-3.5" />
                    )}
                    Générer la clé
                  </button>
                </div>

                {/* Permissions de la clé */}
                <div className="space-y-2">
                  <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                    Permissions accordées
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {API_KEY_SCOPES.map((scope) => {
                      const active = newKeyScopes.includes(scope);
                      const meta = SCOPE_META[scope];
                      return (
                        <button
                          key={scope}
                          type="button"
                          onClick={() => toggleKeyScope(scope)}
                          title={meta.desc}
                          className={cn(
                            'text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all duration-200 cursor-pointer flex items-center gap-1.5',
                            active
                              ? meta.badgeClass
                              : 'bg-muted/30 border-border text-muted-foreground hover:border-muted-foreground/40'
                          )}
                        >
                          <span>{active ? '✓' : '+'}</span>
                          <span>{scope}</span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    💡 Sélectionnez uniquement les permissions strictement nécessaires à votre
                    application.
                  </p>
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
                    Aucune clé d'API générée pour le moment.
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Remplissez le formulaire ci-dessus pour obtenir votre premier identifiant.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left">
                    <thead>
                      <tr className="bg-muted/40 border-b border-border/80 text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
                        <th className="px-6 py-3.5">Nom & Identifiant</th>
                        <th className="px-6 py-3.5">Permissions</th>
                        <th className="px-6 py-3.5">Dernière Activité</th>
                        <th className="px-6 py-3.5">Date de Création</th>
                        <th className="px-6 py-3.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60 text-xs">
                      {keys.map((key) => {
                        const isRecentlyActive =
                          key.lastUsedAt &&
                          Date.now() - new Date(key.lastUsedAt).getTime() < 86400000;

                        return (
                          <tr key={key.id} className="hover:bg-muted/20 transition-colors">
                            <td className="px-6 py-4">
                              <div className="font-semibold text-foreground">{key.name}</div>
                              <div className="mt-1 flex items-center gap-1.5">
                                <code className="bg-muted/60 text-muted-foreground px-2 py-0.5 rounded font-mono text-[11px] border border-border/50">
                                  {key.keyPrefix}••••••••••••••••
                                </code>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex flex-wrap gap-1.5">
                                {(key.scopes?.length
                                  ? (key.scopes as ApiKeyScope[])
                                  : (['READ', 'WRITE', 'ANALYTICS'] as ApiKeyScope[])
                                ).map((scope) => {
                                  const meta = SCOPE_META[scope] || {
                                    badgeClass: 'bg-muted border-border text-muted-foreground',
                                  };
                                  return (
                                    <span
                                      key={scope}
                                      className={cn(
                                        'text-[10px] font-bold tracking-wide border px-1.5 py-0.5 rounded-md',
                                        meta.badgeClass
                                      )}
                                    >
                                      {scope}
                                    </span>
                                  );
                                })}
                              </div>
                            </td>
                            <td className="px-6 py-4">
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
                            </td>
                            <td className="px-6 py-4 text-muted-foreground text-[11px]">
                              {new Date(key.createdAt).toLocaleDateString('fr-FR', {
                                day: 'numeric',
                                month: 'long',
                                year: 'numeric',
                              })}
                            </td>
                            <td className="px-6 py-4 text-right">
                              {confirmDeleteId === key.id ? (
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    onClick={() => setConfirmDeleteId(null)}
                                    className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded"
                                    disabled={isRevokingKeyId === key.id}
                                  >
                                    Annuler
                                  </button>
                                  <button
                                    onClick={() => handleRevokeKey(key.id)}
                                    disabled={isRevokingKeyId === key.id}
                                    className="bg-destructive hover:bg-destructive/90 text-destructive-foreground text-xs font-semibold px-3 py-1 rounded-lg flex items-center gap-1 transition-colors"
                                  >
                                    {isRevokingKeyId === key.id ? (
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : (
                                      'Révoquer'
                                    )}
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setConfirmDeleteId(key.id)}
                                  title="Révoquer cette clé d'API"
                                  className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 p-1.5 rounded-lg transition-colors inline-flex cursor-pointer"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Quick Start Documentation with Language Tabs */}
            <div className="bg-card border border-border/80 rounded-2xl shadow-xs p-6 md:p-8 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Code2 className="w-5 h-5 text-primary" />
                  <div>
                    <h3 className="text-base font-bold text-foreground">
                      Guide de démarrage rapide
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Exemple d'appel d'API avec authentification Bearer.
                    </p>
                  </div>
                </div>

                {/* Code Tabs */}
                <div className="flex items-center bg-muted/60 p-1 rounded-xl border border-border/60 text-xs self-start">
                  {(['curl', 'typescript', 'python'] as CodeSnippetTab[]).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setSnippetTab(tab)}
                      className={cn(
                        'px-3 py-1 rounded-lg font-semibold transition-all duration-150 capitalize cursor-pointer',
                        snippetTab === tab
                          ? 'bg-card text-foreground shadow-xs'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {tab === 'typescript' ? 'TypeScript' : tab === 'python' ? 'Python' : 'cURL'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Code Snippet Box */}
              <div className="relative bg-muted/40 border border-border/80 rounded-xl p-4 font-mono text-xs overflow-x-auto">
                <button
                  onClick={() => handleCopy(snippets[snippetTab], true)}
                  className="absolute top-3 right-3 p-1.5 rounded-lg bg-card border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  title="Copier l'extrait de code"
                >
                  {snippetCopied ? (
                    <Check className="w-3.5 h-3.5 text-success" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
                <pre className="text-foreground whitespace-pre overflow-x-auto pr-8">
                  {snippets[snippetTab]}
                </pre>
              </div>

              {/* Endpoints overview cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <div className="border border-border/80 rounded-xl p-4 space-y-1.5 bg-muted/20">
                  <h4 className="font-bold text-foreground flex items-center gap-1 text-xs">
                    <span className="bg-success/10 text-success border border-success/20 px-1.5 py-0.5 rounded text-[9px] font-black mr-1">
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
                    <span className="bg-success/10 text-success border border-success/20 px-1.5 py-0.5 rounded text-[9px] font-black mr-1">
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
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* KEY GENERATED MODAL */}
      <AnimatePresence>
        {showKeyModal && generatedKey && (
          <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-card border border-border shadow-xl rounded-2xl p-6 md:p-8 max-w-xl w-full space-y-6 text-foreground"
            >
              <div className="text-center space-y-2">
                <div className="w-12 h-12 bg-success/10 text-success border border-success/20 rounded-2xl flex items-center justify-center mx-auto mb-2">
                  <CheckCircle className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-foreground">
                  Votre clé d'API a été générée avec succès
                </h3>
                <p className="text-xs text-muted-foreground max-w-md mx-auto">
                  Copiez cette clé secrète dès maintenant. Pour des raisons de sécurité, nous ne
                  pourrons plus jamais vous la réafficher.
                </p>
              </div>

              {/* API Key container */}
              <div className="bg-muted/50 border border-border rounded-xl p-4 flex items-center justify-between gap-3 font-mono text-xs select-all">
                <code className="text-foreground break-all font-semibold font-mono text-xs">
                  {generatedKey}
                </code>
                <button
                  type="button"
                  onClick={() => handleCopy(generatedKey)}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground p-2 rounded-lg transition-colors shrink-0 cursor-pointer"
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>

              {/* Danger alert banner */}
              <div className="bg-highlight/10 border border-highlight/20 rounded-xl p-4 flex gap-3 text-xs text-highlight">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <span className="font-bold">Stockage sécurisé</span>
                  <p className="leading-relaxed text-[11px]">
                    Gardez cette clé confidentielle dans vos variables d'environnement serveur. Ne
                    l'exposez jamais dans du code client JavaScript public.
                  </p>
                </div>
              </div>

              {/* Confirm / Close Button */}
              <button
                type="button"
                onClick={() => {
                  setShowKeyModal(false);
                  setGeneratedKey(null);
                }}
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs py-3 rounded-xl transition-colors cursor-pointer shadow-xs"
              >
                J'ai sauvegardé ma clé d'API
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
