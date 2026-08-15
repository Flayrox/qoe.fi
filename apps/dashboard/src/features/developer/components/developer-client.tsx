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
  FileCode,
  CheckCircle,
} from 'lucide-react';
import {
  submitApiApplicationAction,
  generateApiKeyAction,
  revokeApiKeyAction,
} from '@qoe/api-client/actions/dashboard';
import { t } from '@lingui/core/macro';

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message) return message;
  }
  return fallback;
}

// Scopes de clé API (moindre privilège) — miroir de packages/api-client actions/dashboard.
const API_KEY_SCOPES = ['READ', 'WRITE', 'ANALYTICS'] as const;
type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

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

  // Copy to clipboard
  const handleCopy = (text: string) => {
    const showSuccess = () => {
      setCopied(true);
      toast.success("Clé d'API copiée dans le presse-papiers !");
      setTimeout(() => setCopied(false), 2000);
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
        toast.error("Impossible de copier la clé d'API.");
      }
    } catch {
      toast.error("Impossible de copier la clé d'API.");
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
            keyPrefix: 'qoe_live',
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

  return (
    <div className="w-full space-y-8 font-sans pb-16 text-foreground">
      {/* Premium Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#EE4B2B] mb-1.5">
            <Terminal className="w-3.5 h-3.5" />
            Espace Développeur
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground font-sans">
            API Créateur qoe.fi
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Connectez vos outils, affichez vos articles sur votre portfolio personnel et intégrez
            qoe.fi à vos propres serveurs.
          </p>
        </div>

        {/* Status Badge */}
        <div className="flex items-center gap-2 self-start md:self-auto bg-muted border border-border rounded-full px-3 py-1 text-xs">
          <span className="text-muted-foreground">Statut de l'accès :</span>
          {status === 'none' && (
            <span className="font-semibold text-muted-foreground">Non demandé</span>
          )}
          {status === 'pending' && (
            <span className="font-semibold text-highlight flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-highlight animate-pulse" />
              En attente d'approbation
            </span>
          )}
          {status === 'approved' && (
            <span className="font-semibold text-success flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-success" />
              Approuvé
            </span>
          )}
          {status === 'rejected' && (
            <span className="font-semibold text-destructive">Rejeté (réessayez)</span>
          )}
          {status === 'revoked' && (
            <span className="font-semibold text-destructive">Accès Révoqué</span>
          )}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {/* STATE 1: No access yet or rejected (Request Access Form) */}
        {(status === 'none' || status === 'rejected' || status === 'revoked') && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.3 }}
            className="grid grid-cols-1 lg:grid-cols-3 gap-8"
          >
            {/* Form Column */}
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white border border-border/80 rounded-2xl shadow-sm p-6 md:p-8 space-y-6">
                <div className="space-y-2">
                  <h2 className="text-xl font-bold text-foreground">
                    Demander l'accès développeur
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    L'utilisation de notre API est soumise à une validation pour éviter tout abus et
                    garantir la sécurité du réseau. Remplissez ce court formulaire et notre équipe
                    l'étudiera rapidement.
                  </p>
                </div>

                <form onSubmit={handleSubmitApplication} className="space-y-4">
                  <div className="space-y-2">
                    <label
                      htmlFor="reason"
                      className="text-xs font-semibold text-muted-foreground block"
                    >
                      Quelle utilisation souhaitez-vous faire de l'API ?{' '}
                      <span className="text-[#EE4B2B]">*</span>
                    </label>
                    <textarea
                      id="reason"
                      rows={5}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Ex : Je souhaite afficher la liste de mes derniers articles qoe.fi sur mon portfolio personnel hébergé sur Vercel (https://monportfolio.com)..."
                      className="w-full rounded-xl border border-border px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:border-[#EE4B2B] focus:ring-[#EE4B2B]/30 placeholder:text-muted-foreground bg-muted/50 transition-colors"
                      required
                    />
                    <div className="flex justify-between items-center text-[11px] text-muted-foreground px-1">
                      <span>Expliquez votre projet en quelques mots.</span>
                      <span
                        className={
                          reason.trim().length >= 10
                            ? 'text-success font-medium'
                            : 'text-muted-foreground'
                        }
                      >
                        {reason.trim().length} car. (min 10)
                      </span>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmittingApp || reason.trim().length < 10}
                    className="w-full flex items-center justify-center gap-2 bg-foreground hover:bg-[#EE4B2B] text-background disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed font-medium text-xs tracking-wide py-3 px-6 rounded-xl transition-all duration-300 shadow-sm"
                  >
                    {isSubmittingApp ? (
                      <>
                        <Loader2 className="w-4.5 h-4.5 animate-spin" />
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
              <div className="bg-muted border border-border rounded-2xl p-6 space-y-4">
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-[#EE4B2B]" />
                  Caractéristiques de l'API
                </h3>
                <ul className="space-y-3 text-xs text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <Check className="w-3.5 h-3.5 text-[#EE4B2B] shrink-0 mt-0.5" />
                    <span>
                      <strong>Lecture Seule</strong> : endpoints de GET pour lister les articles et
                      récupérer le contenu TipTap JSON.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-3.5 h-3.5 text-[#EE4B2B] shrink-0 mt-0.5" />
                    <span>
                      <strong>Authentification</strong> : Bearer token standard par en-tête
                      d'autorisation.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-3.5 h-3.5 text-[#EE4B2B] shrink-0 mt-0.5" />
                    <span>
                      <strong>{t`Rapidité d'intégration`}</strong> : documentation complète fournie
                      dès validation.
                    </span>
                  </li>
                </ul>
              </div>

              <div className="border border-border rounded-2xl p-6 bg-white space-y-3">
                <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">
                  Des questions ?
                </h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Notre équipe valide généralement les demandes en moins de 24h. Si vous avez un cas
                  d'usage spécifique ou besoin d'aide pour l'intégration, écrivez-nous.
                </p>
                <a
                  href="mailto:support@qoe.fi"
                  className="text-xs font-semibold text-[#EE4B2B] hover:underline inline-flex items-center gap-1 mt-1"
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
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.3 }}
            className="bg-white border border-border/80 rounded-2xl shadow-sm p-8 text-center max-w-2xl mx-auto space-y-6"
          >
            <div className="w-16 h-16 bg-highlight/10 rounded-full flex items-center justify-center mx-auto text-highlight border border-highlight/20 animate-pulse">
              <Clock className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-foreground">
                Demande d'accès en cours d'analyse
              </h2>
              <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
                Merci ! Votre dossier a été transmis aux administrateurs de qoe.fi. Nous analysons
                votre cas d'usage pour valider votre accès.
              </p>
            </div>

            <div className="bg-muted border border-border rounded-xl p-4 text-left text-xs text-muted-foreground max-w-md mx-auto">
              <span className="font-semibold text-muted-foreground block mb-1">
                Votre message d'application :
              </span>
              <p className="italic font-mono text-muted-foreground break-words">
                {reason || 'Pas de raison fournie'}
              </p>
            </div>

            <div className="text-xs text-muted-foreground">
              Vous recevrez une notification par email dès que la demande sera validée ou rejetée.
              Généralement traité en moins de 24h.
            </div>
          </motion.div>
        )}

        {/* STATE 3: Approved (Dashboard Console & API Keys management) */}
        {status === 'approved' && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.3 }}
            className="space-y-8"
          >
            {/* Generate key form */}
            <div className="bg-white border border-border/80 rounded-2xl shadow-sm p-6 md:p-8 space-y-6">
              <div>
                <h2 className="text-xl font-bold text-foreground">Générer une clé d'API</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Générez une clé d'API pour vous connecter à votre compte à partir de vos
                  applications ou de votre site personnel.
                </p>
              </div>

              <form
                onSubmit={handleGenerateKey}
                className="flex flex-col md:flex-row gap-3 max-w-2xl"
              >
                <input
                  type="text"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder="Nom de la clé (ex: Site personnel, App React...)"
                  className="flex-1 rounded-xl border border-border px-4 py-2.5 text-xs focus:outline-none focus:ring-1 focus:border-[#EE4B2B] focus:ring-[#EE4B2B]/30 placeholder:text-muted-foreground bg-muted/50 transition-all"
                  required
                />
                <button
                  type="submit"
                  disabled={isGeneratingKey || !newKeyName.trim() || newKeyScopes.length === 0}
                  className="bg-foreground hover:bg-[#EE4B2B] text-background disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed text-xs font-semibold px-6 py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition-all duration-300"
                >
                  {isGeneratingKey ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Plus className="w-3.5 h-3.5" />
                  )}
                  Générer la clé
                </button>
              </form>

              {/* Permissions de la clé (moindre privilège) */}
              <div className="space-y-2">
                <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                  Permissions de la clé
                </p>
                <div className="flex flex-wrap gap-2">
                  {API_KEY_SCOPES.map((scope) => {
                    const active = newKeyScopes.includes(scope);
                    return (
                      <button
                        key={scope}
                        type="button"
                        onClick={() => toggleKeyScope(scope)}
                        className={`text-[11px] font-semibold px-3 py-1.5 rounded-lg border transition-all duration-200 ${
                          active
                            ? 'bg-[#EE4B2B]/10 border-[#EE4B2B]/40 text-[#EE4B2B]'
                            : 'bg-muted border-border text-muted-foreground hover:border-muted-foreground/40'
                        }`}
                      >
                        {active ? '✓ ' : ''}
                        {scope}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  READ : lecture des articles et catégories · WRITE : créer, modifier, publier ·
                  ANALYTICS : statistiques de lecture
                </p>
                {newKeyScopes.length === 0 && (
                  <p className="text-[11px] font-semibold text-destructive">
                    Sélectionnez au moins un scope pour générer la clé.
                  </p>
                )}
              </div>
            </div>

            {/* List active keys */}
            <div className="bg-white border border-border/80 rounded-2xl shadow-sm overflow-hidden">
              <div className="px-6 py-5 border-b border-border flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-foreground">Vos clés d'API</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Gérez et révoquez vos clés actives ci-dessous.
                  </p>
                </div>
                <span className="text-xs font-semibold bg-muted border border-border px-2.5 py-1 rounded-full text-muted-foreground">
                  {keys.length} clé{keys.length > 1 ? 's' : ''} active{keys.length > 1 ? 's' : ''}
                </span>
              </div>

              {keys.length === 0 ? (
                <div className="p-12 text-center text-muted-foreground space-y-2">
                  <Key className="w-8 h-8 text-muted-foreground mx-auto" />
                  <p className="text-xs font-medium">Vous n'avez pas encore généré de clé d'API.</p>
                  <p className="text-[11px] text-muted-foreground">
                    Remplissez le formulaire ci-dessus pour obtenir votre première clé.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left">
                    <thead>
                      <tr className="bg-muted border-b border-border text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
                        <th className="px-6 py-3.5">Nom</th>
                        <th className="px-6 py-3.5">Prévisualisation de la clé</th>
                        <th className="px-6 py-3.5">Permissions</th>
                        <th className="px-6 py-3.5">Créée le</th>
                        <th className="px-6 py-3.5">Dernière utilisation</th>
                        <th className="px-6 py-3.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border text-xs">
                      {keys.map((key) => (
                        <tr key={key.id} className="hover:bg-muted/50 transition-colors">
                          <td className="px-6 py-4 font-semibold text-foreground">{key.name}</td>
                          <td className="px-6 py-4">
                            <code className="bg-muted text-muted-foreground px-2 py-0.5 rounded font-mono text-[11px]">
                              {key.keyPrefix}••••••••••••••••
                            </code>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-wrap gap-1">
                              {(key.scopes?.length
                                ? key.scopes
                                : ['READ', 'WRITE', 'ANALYTICS']
                              ).map((scope) => (
                                <span
                                  key={scope}
                                  className="text-[9px] font-bold uppercase tracking-wide border border-border bg-muted text-muted-foreground px-1.5 py-0.5 rounded"
                                >
                                  {scope}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-muted-foreground">
                            {new Date(key.createdAt).toLocaleDateString('fr-FR', {
                              day: 'numeric',
                              month: 'long',
                              year: 'numeric',
                            })}
                          </td>
                          <td className="px-6 py-4 text-muted-foreground">
                            {key.lastUsedAt ? (
                              <span className="flex items-center gap-1.5 text-success font-medium">
                                <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                                {new Date(key.lastUsedAt).toLocaleDateString('fr-FR', {
                                  day: 'numeric',
                                  month: 'short',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">Jamais utilisée</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-right">
                            {confirmDeleteId === key.id ? (
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => setConfirmDeleteId(null)}
                                  className="text-xs text-muted-foreground hover:text-muted-foreground px-2 py-1 rounded"
                                  disabled={isRevokingKeyId === key.id}
                                >
                                  Annuler
                                </button>
                                <button
                                  onClick={() => handleRevokeKey(key.id)}
                                  disabled={isRevokingKeyId === key.id}
                                  className="bg-destructive/10 hover:bg-destructive/20 text-destructive hover:text-destructive text-xs font-semibold px-2.5 py-1 rounded flex items-center gap-1"
                                >
                                  {isRevokingKeyId === key.id ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    'Confirmer'
                                  )}
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setConfirmDeleteId(key.id)}
                                className="text-muted-foreground hover:text-destructive hover:bg-destructive/10/50 p-1.5 rounded-lg transition-colors inline-flex"
                              >
                                <Trash2 className="w-4.5 h-4.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Developers Quick Start Documentation */}
            <div className="bg-foreground text-background rounded-2xl shadow-md border border-border p-6 md:p-8 space-y-6">
              <div className="flex items-center gap-2">
                <FileCode className="w-5 h-5 text-[#EE4B2B]" />
                <h3 className="text-base font-bold text-background">Guide de démarrage rapide</h3>
              </div>

              <div className="space-y-4 text-xs text-muted-foreground">
                <p>
                  Pour vous authentifier, incluez votre clé d'API complète dans l'en-tête
                  d'autorisation de chaque requête :
                </p>

                <div className="bg-foreground border border-border rounded-xl p-4 font-mono text-[11px] text-muted-foreground overflow-x-auto space-y-2">
                  <div className="text-[#EE4B2B] font-bold">// curl example</div>
                  <div>
                    curl -H{' '}
                    <span className="text-success">
                      "Authorization: Bearer qoe_live_votre_cle_api"
                    </span>{' '}
                    \
                  </div>
                  <div className="pl-5">https://api.qoe.fi/v1/articles</div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                  <div className="border border-border rounded-xl p-4 space-y-1.5">
                    <h4 className="font-bold text-background flex items-center gap-1 text-[11px] uppercase tracking-wider text-muted-foreground">
                      <span className="bg-success/10 text-success border border-success/20 px-1.5 py-0.5 rounded text-[9px] font-black mr-1">
                        GET
                      </span>
                      Lister vos articles
                    </h4>
                    <p className="text-[11px] text-muted-foreground">
                      Récupère la liste complète de vos articles publiés.
                    </p>
                    <code className="text-[10px] text-muted-foreground block font-mono bg-popover/50 p-1.5 rounded">
                      /v1/articles?limit=10&page=1
                    </code>
                  </div>

                  <div className="border border-border rounded-xl p-4 space-y-1.5">
                    <h4 className="font-bold text-background flex items-center gap-1 text-[11px] uppercase tracking-wider text-muted-foreground">
                      <span className="bg-success/10 text-success border border-success/20 px-1.5 py-0.5 rounded text-[9px] font-black mr-1">
                        GET
                      </span>
                      Détail d'un article
                    </h4>
                    <p className="text-[11px] text-muted-foreground">
                      Récupère le contenu complet d'un article à partir de son slug.
                    </p>
                    <code className="text-[10px] text-muted-foreground block font-mono bg-popover/50 p-1.5 rounded">
                      /v1/articles/:slug
                    </code>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* KEY GENERATED MODAL */}
      <AnimatePresence>
        {showKeyModal && generatedKey && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white border border-border shadow-2xl rounded-2xl p-6 md:p-8 max-w-xl w-full space-y-6 text-foreground"
            >
              <div className="text-center space-y-2">
                <div className="w-12 h-12 bg-success/10 text-success border border-success/20 rounded-full flex items-center justify-center mx-auto mb-2">
                  <CheckCircle className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-foreground font-sans">
                  Votre clé d'API a été générée
                </h3>
                <p className="text-xs text-muted-foreground">
                  Copiez cette clé immédiatement. Pour des raisons de sécurité, nous ne
                  l'afficherons plus jamais dans le futur.
                </p>
              </div>

              {/* API Key container */}
              <div className="bg-muted border border-border rounded-xl p-4 flex items-center justify-between gap-3 font-mono text-xs select-all">
                <code className="text-foreground break-all font-semibold font-mono text-[11px]">
                  {generatedKey}
                </code>
                <button
                  type="button"
                  onClick={() => handleCopy(generatedKey)}
                  className="bg-foreground hover:bg-[#EE4B2B] text-background p-2 rounded-lg transition-colors shrink-0"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>

              {/* Danger alert banner */}
              <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-4 flex gap-3 text-xs text-destructive">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-destructive" />
                <div className="space-y-1">
                  <span className="font-bold">Attention</span>
                  <p className="leading-relaxed text-destructive/90 text-[11px]">
                    Si vous perdez cette clé, vous devrez la révoquer et en recréer une nouvelle. Ne
                    partagez jamais votre clé d'API publique dans des environnements clients non
                    sécurisés (ex: code frontend direct sans proxy backend).
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
                className="w-full bg-foreground hover:bg-foreground text-background font-semibold text-xs py-3 rounded-xl transition-colors font-sans"
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
