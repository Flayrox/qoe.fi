'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { t } from '@lingui/core/macro';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Key,
  Plus,
  Loader2,
  Copy,
  Check,
  Trash2,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  PenLine,
} from 'lucide-react';
import { toast } from '@qoe/ui/toast';
import { cn } from '@qoe/utils';
import {
  listMediaApiKeysAction,
  createMediaApiKeyAction,
  updateMediaApiKeyAction,
  rotateMediaApiKeyAction,
  revokeMediaApiKeyAction,
  type MediaApiKeyInfo,
  type MediaApiKeyCreatedInfo,
} from './actions';

const MEDIA_SCOPES = ['READ', 'WRITE', 'ANALYTICS'] as const;
type MediaScope = (typeof MEDIA_SCOPES)[number];

const SCOPE_META: Record<MediaScope, { label: string; desc: () => string; badgeClass: string }> = {
  READ: {
    label: 'READ',
    desc: () => t`Lecture des articles, profils et catégories publiques`,
    badgeClass: 'bg-primary/10 border-primary/20 text-primary',
  },
  WRITE: {
    label: 'WRITE',
    desc: () => t`Création et publication de contenus au nom du média`,
    badgeClass: 'bg-success/10 border-success/20 text-success',
  },
  ANALYTICS: {
    label: 'ANALYTICS',
    desc: () => t`Accès aux métriques de lecture et d'audience du média`,
    badgeClass: 'bg-highlight/10 border-highlight/20 text-highlight',
  },
};

interface MediaApiKeysTabProps {
  mediaId: string;
  mediaName: string;
}

export function MediaApiKeysTab({ mediaId, mediaName }: MediaApiKeysTabProps) {
  const [keys, setKeys] = useState<MediaApiKeyInfo[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal Create
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyScopes, setNewKeyScopes] = useState<MediaScope[]>(['READ', 'WRITE']);
  const [isCreating, setIsCreating] = useState(false);

  // Modal Secret (One-time display)
  const [secretModalData, setSecretModalData] = useState<{
    secret: string;
    mode: 'created' | 'rotated';
    keyName: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  // Rename modal / inline
  const [renameData, setRenameData] = useState<{ id: string; name: string } | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);

  // Rotation & Revocation
  const [rotatingKeyId, setRotatingKeyId] = useState<string | null>(null);
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);
  const [revokingKeyId, setRevokingKeyId] = useState<string | null>(null);

  const fetchKeys = useCallback(async () => {
    setLoading(true);
    const res = await listMediaApiKeysAction(mediaId);
    setLoading(false);
    if (res.success) {
      setKeys(res.keys);
    } else {
      toast.error(res.error || t`Impossible de charger les clés API`);
    }
  }, [mediaId]);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success(t`Clé copiée dans le presse-papiers !`);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleToggleScope = (scope: MediaScope) => {
    if (newKeyScopes.includes(scope)) {
      if (newKeyScopes.length === 1) {
        toast.error(t`Une clé API doit comporter au moins un scope.`);
        return;
      }
      setNewKeyScopes(newKeyScopes.filter((s) => s !== scope));
    } else {
      setNewKeyScopes([...newKeyScopes, scope]);
    }
  };

  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyName.trim()) {
      toast.error(t`Le nom de la clé est requis.`);
      return;
    }
    if (newKeyScopes.length === 0) {
      toast.error(t`Sélectionnez au moins une permission.`);
      return;
    }

    setIsCreating(true);
    const res = await createMediaApiKeyAction(mediaId, newKeyName.trim(), newKeyScopes);
    setIsCreating(false);

    if (res.success && res.key) {
      setShowCreateModal(false);
      setNewKeyName('');
      setNewKeyScopes(['READ', 'WRITE']);
      setSecretModalData({
        secret: res.key.secret,
        mode: 'created',
        keyName: res.key.name,
      });
      fetchKeys();
    } else {
      toast.error(res.error || t`Erreur lors de la création de la clé API`);
    }
  };

  const handleRename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renameData || !renameData.name.trim()) return;

    setIsRenaming(true);
    const res = await updateMediaApiKeyAction(mediaId, renameData.id, renameData.name.trim());
    setIsRenaming(false);

    if (res.success) {
      toast.success(t`Nom de la clé mis à jour.`);
      setRenameData(null);
      fetchKeys();
    } else {
      toast.error(res.error || t`Erreur de renommage`);
    }
  };

  const handleRotate = async (key: MediaApiKeyInfo) => {
    if (
      !window.confirm(
        `Faire tourner la clé "${key.name}" ? L'ancien secret cessera immédiatement de fonctionner.`
      )
    ) {
      return;
    }

    setRotatingKeyId(key.id);
    const res = await rotateMediaApiKeyAction(mediaId, key.id);
    setRotatingKeyId(null);

    if (res.success && res.key) {
      setSecretModalData({
        secret: res.key.secret,
        mode: 'rotated',
        keyName: key.name,
      });
      fetchKeys();
    } else {
      toast.error(res.error || t`Erreur lors de la rotation de la clé`);
    }
  };

  const handleRevoke = async (keyId: string) => {
    setRevokingKeyId(keyId);
    const res = await revokeMediaApiKeyAction(mediaId, keyId);
    setRevokingKeyId(null);
    setConfirmRevokeId(null);

    if (res.success) {
      toast.success(t`Clé API révoquée avec succès.`);
      fetchKeys();
    } else {
      toast.error(res.error || t`Erreur lors de la révocation de la clé`);
    }
  };

  return (
    <div className="space-y-8">
      {/* En-tête & Bouton Création */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Key className="w-4 h-4 text-primary" strokeWidth={1.5} />
            {t`Clés API du Média`}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5 max-w-xl leading-relaxed">
            {t`Ces clés d'API agissent directement au nom de ${mediaName}. Elles permettent d'automatiser des publications, d'intégrer des outils éditoriaux ou d'alimenter une application headless.`}
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs font-semibold bg-muted/60 border border-border/80 px-2.5 py-1 rounded-full text-muted-foreground">
            {keys.length} / 10 {t`clés`}
          </span>

          <button
            onClick={() => setShowCreateModal(true)}
            disabled={keys.length >= 10 || loading}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 active:scale-[0.99] transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-3.5 h-3.5" strokeWidth={1.5} />
            {t`Nouvelle clé API`}
          </button>
        </div>
      </div>

      {/* Notice info */}
      <div className="bg-muted/30 border border-border/60 rounded-xl p-3.5 flex items-start gap-2.5 text-xs text-muted-foreground">
        <AlertCircle className="w-4 h-4 text-primary shrink-0 mt-0.5" />
        <div className="space-y-0.5 leading-relaxed">
          <span className="font-semibold text-foreground">
            {t`Identité Média & Moindre privilège`} :
          </span>{' '}
          {t`Les requêtes signées avec ces clés ne sont pas rattachées à votre compte personnel mais au média lui-même. Vous pouvez attribuer des rôles délégués aux membres pour administrer ces accès.`}
        </div>
      </div>

      {/* Liste des clés */}
      <div className="bg-card border border-border/80 rounded-2xl shadow-xs overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground text-xs">
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            {t`Chargement des clés API...`}
          </div>
        ) : keys.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-muted/40 flex items-center justify-center mx-auto text-muted-foreground">
              <Key className="w-6 h-6" strokeWidth={1.5} />
            </div>
            <p className="text-xs font-medium text-foreground">
              {t`Aucune clé API active pour ce média.`}
            </p>
            <p className="text-[11px] text-muted-foreground max-w-sm mx-auto">
              {t`Générez une première clé API pour connecter vos scripts d'import ou vos intégrations automatisées.`}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="bg-muted/40 border-b border-border/80 text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
                  <th className="px-6 py-3.5">{t`Nom & Préfixe`}</th>
                  <th className="px-6 py-3.5">{t`Permissions`}</th>
                  <th className="px-6 py-3.5">{t`Créée par`}</th>
                  <th className="px-6 py-3.5">{t`Dernière activité`}</th>
                  <th className="px-6 py-3.5">{t`Création`}</th>
                  <th className="px-6 py-3.5 text-right">{t`Actions`}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60 text-xs">
                {keys.map((key) => {
                  const isRecentlyActive =
                    key.lastUsedAt && Date.now() - new Date(key.lastUsedAt).getTime() < 86400000;

                  return (
                    <tr key={key.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-foreground">{key.name}</span>
                          <button
                            onClick={() => setRenameData({ id: key.id, name: key.name })}
                            className="p-1 text-muted-foreground hover:text-foreground rounded transition-colors"
                            title={t`Renommer la clé`}
                          >
                            <PenLine className="w-3 h-3" />
                          </button>
                        </div>
                        <div className="mt-1 flex items-center gap-1.5">
                          <code className="bg-muted/60 text-muted-foreground px-2 py-0.5 rounded font-mono text-[11px] border border-border/50">
                            {key.keyPrefix}••••••••••••••••
                          </code>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1.5">
                          {(key.scopes || []).map((s) => {
                            const scope = s as MediaScope;
                            const meta = SCOPE_META[scope] || {
                              badgeClass: 'bg-muted border-border text-muted-foreground',
                            };
                            return (
                              <span
                                key={s}
                                className={cn(
                                  'text-[10px] font-bold tracking-wide border px-1.5 py-0.5 rounded-md',
                                  meta.badgeClass
                                )}
                              >
                                {s}
                              </span>
                            );
                          })}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground text-[11px]">
                        <span className="font-medium text-foreground">
                          {key.createdByName || key.createdByUsername || t`Membre`}
                        </span>
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
                            {t`Jamais utilisée`}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-muted-foreground text-[11px]">
                        {new Date(key.createdAt).toLocaleDateString('fr-FR', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {confirmRevokeId === key.id ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => setConfirmRevokeId(null)}
                              className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded"
                              disabled={revokingKeyId === key.id}
                            >
                              {t`Annuler`}
                            </button>
                            <button
                              onClick={() => handleRevoke(key.id)}
                              disabled={revokingKeyId === key.id}
                              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground text-xs font-semibold px-3 py-1 rounded-lg flex items-center gap-1 transition-colors"
                            >
                              {revokingKeyId === key.id ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                t`Révoquer`
                              )}
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleRotate(key)}
                              disabled={rotatingKeyId === key.id || revokingKeyId === key.id}
                              title={t`Faire tourner la clé (régénère le secret et invalide l'ancien)`}
                              className="text-muted-foreground hover:text-primary hover:bg-primary/10 p-1.5 rounded-lg transition-colors inline-flex cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {rotatingKeyId === key.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <RefreshCw className="w-4 h-4" />
                              )}
                            </button>
                            <button
                              onClick={() => setConfirmRevokeId(key.id)}
                              title={t`Révoquer cette clé d'API`}
                              className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 p-1.5 rounded-lg transition-colors inline-flex cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
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

      {/* MODAL CRÉATION DE CLÉ */}
      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-card border border-border shadow-xl rounded-2xl p-6 max-w-lg w-full space-y-6 text-foreground"
            >
              <div>
                <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <Key className="w-4 h-4 text-primary" />
                  {t`Créer une clé API pour ${mediaName}`}
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  {t`Choisissez un nom descriptif et limitez les permissions au strict nécessaire.`}
                </p>
              </div>

              <form onSubmit={handleCreateKey} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">
                    {t`Nom de la clé`}
                  </label>
                  <input
                    type="text"
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    placeholder={t`Ex: Zapier Sync, Application Mobile, Bot Discord...`}
                    className="w-full rounded-xl border border-border px-3.5 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary placeholder:text-muted-foreground/60 bg-muted/30 text-foreground"
                    autoFocus
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-muted-foreground">
                    {t`Permissions accordées (Scopes)`}
                  </label>
                  <div className="space-y-2">
                    {MEDIA_SCOPES.map((scope) => {
                      const active = newKeyScopes.includes(scope);
                      const meta = SCOPE_META[scope];
                      return (
                        <div
                          key={scope}
                          onClick={() => handleToggleScope(scope)}
                          className={cn(
                            'flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all',
                            active
                              ? 'border-primary/40 bg-primary/5'
                              : 'border-border/60 bg-muted/20 hover:border-border'
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={active}
                            onChange={() => {}}
                            className="accent-[var(--primary)] mt-0.5 cursor-pointer"
                          />
                          <div className="space-y-0.5">
                            <span
                              className={cn(
                                'text-[10px] font-bold tracking-wide border px-1.5 py-0.5 rounded-md inline-block mr-2',
                                meta.badgeClass
                              )}
                            >
                              {scope}
                            </span>
                            <span className="text-xs text-muted-foreground block">
                              {meta.desc()}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-border/40">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateModal(false);
                      setNewKeyName('');
                    }}
                    className="px-4 py-2 rounded-lg text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                    disabled={isCreating}
                  >
                    {t`Annuler`}
                  </button>
                  <button
                    type="submit"
                    disabled={isCreating || !newKeyName.trim() || newKeyScopes.length === 0}
                    className="px-5 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 active:scale-[0.99] transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {isCreating ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Plus className="w-3.5 h-3.5" />
                    )}
                    {t`Générer la clé`}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL RENOMMER */}
      <AnimatePresence>
        {renameData && (
          <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-card border border-border shadow-xl rounded-2xl p-6 max-w-md w-full space-y-4 text-foreground"
            >
              <div>
                <h3 className="text-base font-bold text-foreground">{t`Renommer la clé API`}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t`Le changement de nom n'affecte pas le secret ni la validité des accès.`}
                </p>
              </div>

              <form onSubmit={handleRename} className="space-y-4">
                <input
                  type="text"
                  value={renameData.name}
                  onChange={(e) => setRenameData({ ...renameData, name: e.target.value })}
                  className="w-full rounded-xl border border-border px-3.5 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary bg-muted/30 text-foreground"
                  autoFocus
                  required
                />
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setRenameData(null)}
                    className="px-4 py-2 rounded-lg text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                    disabled={isRenaming}
                  >
                    {t`Annuler`}
                  </button>
                  <button
                    type="submit"
                    disabled={isRenaming || !renameData.name.trim()}
                    className="px-5 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 active:scale-[0.99] transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {isRenaming && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    {t`Enregistrer`}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL SECRET DISPLAY (AFFICHAGE UNIQUE) */}
      <AnimatePresence>
        {secretModalData && (
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
                  {secretModalData.mode === 'rotated'
                    ? t`Clé API rotatée avec succès`
                    : t`Clé API générée avec succès`}
                </h3>
                <p className="text-xs text-muted-foreground max-w-md mx-auto">
                  {secretModalData.mode === 'rotated'
                    ? t`L'ancien secret est désormais révoqué. Copiez cette nouvelle clé secrète dès maintenant : elle ne sera plus jamais réaffichée.`
                    : t`Copiez cette clé secrète dès maintenant. Pour des raisons de sécurité, nous ne pourrons plus jamais vous la réafficher.`}
                </p>
              </div>

              {/* Secret display container */}
              <div className="bg-muted/50 border border-border rounded-xl p-4 flex items-center justify-between gap-3 font-mono text-xs select-all">
                <code className="text-foreground break-all font-semibold font-mono text-xs">
                  {secretModalData.secret}
                </code>
                <button
                  type="button"
                  onClick={() => handleCopy(secretModalData.secret)}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground p-2 rounded-lg transition-colors shrink-0 cursor-pointer"
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>

              {/* Danger alert banner */}
              <div className="bg-highlight/10 border border-highlight/20 rounded-xl p-4 flex gap-3 text-xs text-highlight">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <span className="font-bold">{t`Stockage sécurisé`}</span>
                  <p className="leading-relaxed text-[11px]">
                    {t`Gardez cette clé confidentielle dans vos variables d'environnement serveur. Ne l'exposez jamais dans du code client JavaScript ou sur un dépôt public.`}
                  </p>
                </div>
              </div>

              {/* Confirm / Close Button */}
              <button
                type="button"
                onClick={() => {
                  setSecretModalData(null);
                }}
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs py-3 rounded-xl transition-colors cursor-pointer shadow-xs"
              >
                {t`J'ai sauvegardé ma clé d'API`}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
