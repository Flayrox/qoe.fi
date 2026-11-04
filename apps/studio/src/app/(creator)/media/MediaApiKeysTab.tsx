'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { t } from '@lingui/core/macro';
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
import { Badge } from '@qoe/ui/badge';
import { Button } from '@qoe/ui/button';
import { Checkbox } from '@qoe/ui/checkbox';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@qoe/ui/dialog';
import { Input } from '@qoe/ui/input';
import { Table, TableBody, TableCell, TableColumn, TableHeader, TableRow } from '@qoe/ui/table';
import { toast } from '@qoe/ui/toast';
import { cn } from '@qoe/utils';
import {
  listMediaApiKeysAction,
  createMediaApiKeyAction,
  updateMediaApiKeyAction,
  rotateMediaApiKeyAction,
  revokeMediaApiKeyAction,
  type MediaApiKeyInfo,
} from './actions';
import { attemptWithStepUp, notifyActionFailure } from '@/lib/authz-feedback';

const MEDIA_SCOPES = ['READ', 'WRITE', 'ANALYTICS'] as const;
type MediaScope = (typeof MEDIA_SCOPES)[number];

const SCOPE_META: Record<
  MediaScope,
  { label: string; desc: () => string; tone: 'brand' | 'success' | 'vivid' }
> = {
  READ: {
    label: 'READ',
    desc: () => t`Lecture des articles, profils et catégories publiques`,
    tone: 'brand',
  },
  WRITE: {
    label: 'WRITE',
    desc: () => t`Création et publication de contenus au nom du média`,
    tone: 'success',
  },
  ANALYTICS: {
    label: 'ANALYTICS',
    desc: () => t`Accès aux métriques de lecture et d'audience du média`,
    tone: 'vivid',
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
      notifyActionFailure(res, t`Impossible de charger les clés API`);
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
    const res = await attemptWithStepUp(
      () => createMediaApiKeyAction(mediaId, newKeyName.trim(), newKeyScopes),
      { fallback: t`Erreur lors de la création de la clé API` }
    );
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
    }
  };

  const handleRename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renameData || !renameData.name.trim()) return;

    setIsRenaming(true);
    const res = await attemptWithStepUp(
      () => updateMediaApiKeyAction(mediaId, renameData.id, renameData.name.trim()),
      { fallback: t`Erreur de renommage` }
    );
    setIsRenaming(false);

    if (res.success) {
      toast.success(t`Nom de la clé mis à jour.`);
      setRenameData(null);
      fetchKeys();
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
    const res = await attemptWithStepUp(() => rotateMediaApiKeyAction(mediaId, key.id), {
      fallback: t`Erreur lors de la rotation de la clé`,
    });
    setRotatingKeyId(null);

    if (res.success && res.key) {
      setSecretModalData({
        secret: res.key.secret,
        mode: 'rotated',
        keyName: key.name,
      });
      fetchKeys();
    }
  };

  const handleRevoke = async (keyId: string) => {
    setRevokingKeyId(keyId);
    const res = await attemptWithStepUp(() => revokeMediaApiKeyAction(mediaId, keyId), {
      fallback: t`Erreur lors de la révocation de la clé`,
    });
    setRevokingKeyId(null);
    setConfirmRevokeId(null);

    if (res.success) {
      toast.success(t`Clé API révoquée avec succès.`);
      fetchKeys();
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
          <Badge variant="outline" tone="neutral" shape="pill" size="sm">
            {keys.length} / 10 {t`clés`}
          </Badge>

          <Button
            variant="solid"
            tone="brand"
            size="sm"
            onClick={() => setShowCreateModal(true)}
            disabled={keys.length >= 10 || loading}
          >
            <Plus />
            {t`Nouvelle clé API`}
          </Button>
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
      {loading ? (
        <div className="bg-card border border-border/80 rounded-2xl shadow-xs flex items-center justify-center py-20 text-muted-foreground text-xs">
          <Loader2 className="w-4 h-4 animate-spin mr-2" />
          {t`Chargement des clés API...`}
        </div>
      ) : keys.length === 0 ? (
        <div className="bg-card border border-border/80 rounded-2xl shadow-xs p-12 text-center text-muted-foreground space-y-2">
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
        <Table aria-label={t`Clés API du Média`} size="md">
          <TableHeader>
            <TableColumn isRowHeader>{t`Nom & Préfixe`}</TableColumn>
            <TableColumn>{t`Permissions`}</TableColumn>
            <TableColumn>{t`Créée par`}</TableColumn>
            <TableColumn>{t`Dernière activité`}</TableColumn>
            <TableColumn>{t`Création`}</TableColumn>
            <TableColumn className="text-right">{t`Actions`}</TableColumn>
          </TableHeader>
          <TableBody items={keys}>
            {(key) => {
              const isRecentlyActive =
                key.lastUsedAt && Date.now() - new Date(key.lastUsedAt).getTime() < 86400000;

              return (
                <TableRow id={key.id}>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-foreground">{key.name}</span>
                      <Button
                        variant="ghost"
                        size="xs"
                        shape="icon"
                        onClick={() => setRenameData({ id: key.id, name: key.name })}
                        className="size-6 text-muted-foreground hover:text-foreground"
                        title={t`Renommer la clé`}
                        aria-label={t`Renommer la clé`}
                      >
                        <PenLine />
                      </Button>
                    </div>
                    <div className="mt-1 flex items-center gap-1.5">
                      <code className="bg-muted/60 text-muted-foreground px-2 py-0.5 rounded font-sans font-medium text-[11px] border border-border/50">
                        {key.keyPrefix}••••••••••••••••
                      </code>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1.5">
                      {(key.scopes || []).map((s) => {
                        const scope = s as MediaScope;
                        const meta = SCOPE_META[scope];
                        return (
                          <Badge
                            key={s}
                            variant="soft"
                            tone={meta ? meta.tone : 'neutral'}
                            size="xs"
                          >
                            {s}
                          </Badge>
                        );
                      })}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-[11px]">
                    <span className="font-medium text-foreground">
                      {key.createdByName || key.createdByUsername || t`Membre`}
                    </span>
                  </TableCell>
                  <TableCell>
                    {key.lastUsedAt ? (
                      <span className="flex items-center gap-1.5 text-foreground font-medium text-[11px]">
                        <span
                          className={cn(
                            'w-1.5 h-1.5 rounded-full',
                            isRecentlyActive ? 'bg-success animate-pulse' : 'bg-muted-foreground'
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
                  </TableCell>
                  <TableCell className="text-muted-foreground text-[11px]">
                    {new Date(key.createdAt).toLocaleDateString('fr-FR', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </TableCell>
                  <TableCell className="text-right">
                    {confirmRevokeId === key.id ? (
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => setConfirmRevokeId(null)}
                          disabled={revokingKeyId === key.id}
                        >
                          {t`Annuler`}
                        </Button>
                        <Button
                          variant="solid"
                          tone="danger"
                          size="xs"
                          disabled={revokingKeyId === key.id}
                          onClick={() => handleRevoke(key.id)}
                        >
                          {revokingKeyId === key.id && <Loader2 className="animate-spin" />}
                          {t`Révoquer`}
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="xs"
                          shape="icon"
                          disabled={rotatingKeyId === key.id || revokingKeyId === key.id}
                          onClick={() => handleRotate(key)}
                          title={t`Faire tourner la clé (régénère le secret et invalide l'ancien)`}
                          aria-label={t`Faire tourner la clé`}
                        >
                          <RefreshCw className={cn(rotatingKeyId === key.id && 'animate-spin')} />
                        </Button>
                        <Button
                          variant="ghost"
                          tone="danger"
                          size="xs"
                          shape="icon"
                          onClick={() => setConfirmRevokeId(key.id)}
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

      {/* MODAL CRÉATION DE CLÉ */}
      <Dialog
        open={showCreateModal}
        onOpenChange={(open) => {
          if (!open && !isCreating) {
            setShowCreateModal(false);
            setNewKeyName('');
          }
        }}
        size="md"
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="size-4 text-primary" />
              {t`Créer une clé API pour ${mediaName}`}
            </DialogTitle>
            <DialogDescription>
              {t`Choisissez un nom descriptif et limitez les permissions au strict nécessaire.`}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateKey} className="space-y-4">
            <DialogBody className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
                  {t`Nom de la clé`}
                </label>
                <Input
                  type="text"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder={t`Ex: Zapier Sync, Application Mobile, Bot Discord...`}
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
                        <Checkbox
                          isSelected={active}
                          onChange={() => handleToggleScope(scope)}
                          aria-label={scope}
                          size="sm"
                          className="mt-0.5 pointer-events-none"
                        />
                        <div className="space-y-0.5">
                          <Badge variant="soft" tone={meta.tone} size="xs" className="mr-2">
                            {scope}
                          </Badge>
                          <span className="text-xs text-muted-foreground block">{meta.desc()}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </DialogBody>

            <DialogFooter className="border-t border-border/40 pt-3">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowCreateModal(false);
                  setNewKeyName('');
                }}
                disabled={isCreating}
              >
                {t`Annuler`}
              </Button>
              <Button
                type="submit"
                variant="solid"
                tone="brand"
                size="sm"
                disabled={isCreating || !newKeyName.trim() || newKeyScopes.length === 0}
              >
                {isCreating ? <Loader2 className="animate-spin" /> : <Plus />}
                {t`Générer la clé`}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL RENOMMER */}
      <Dialog
        open={Boolean(renameData)}
        onOpenChange={(open) => {
          if (!open && !isRenaming) setRenameData(null);
        }}
        size="sm"
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t`Renommer la clé API`}</DialogTitle>
            <DialogDescription>
              {t`Le changement de nom n'affecte pas le secret ni la validité des accès.`}
            </DialogDescription>
          </DialogHeader>

          {renameData && (
            <form onSubmit={handleRename} className="space-y-4">
              <Input
                type="text"
                value={renameData.name}
                onChange={(e) => setRenameData({ ...renameData, name: e.target.value })}
                autoFocus
                required
              />
              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setRenameData(null)}
                  disabled={isRenaming}
                >
                  {t`Annuler`}
                </Button>
                <Button
                  type="submit"
                  variant="solid"
                  tone="brand"
                  size="sm"
                  disabled={isRenaming || !renameData.name.trim()}
                >
                  {isRenaming && <Loader2 className="animate-spin" />}
                  {t`Enregistrer`}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* MODAL SECRET DISPLAY (AFFICHAGE UNIQUE) */}
      <Dialog
        open={Boolean(secretModalData)}
        onOpenChange={(open) => {
          if (!open) setSecretModalData(null);
        }}
        isDismissable={false}
        size="lg"
      >
        <DialogContent showCloseButton={false}>
          {secretModalData && (
            <div className="space-y-5">
              <div className="text-center space-y-2">
                <div className="w-12 h-12 bg-success/10 text-success-text border border-success/20 rounded-2xl flex items-center justify-center mx-auto mb-2">
                  <CheckCircle className="w-6 h-6" />
                </div>
                <DialogTitle className="text-center text-lg">
                  {secretModalData.mode === 'rotated'
                    ? t`Clé API rotatée avec succès`
                    : t`Clé API générée avec succès`}
                </DialogTitle>
                <DialogDescription className="max-w-md mx-auto text-center">
                  {secretModalData.mode === 'rotated'
                    ? t`L'ancien secret est désormais révoqué. Copiez cette nouvelle clé secrète dès maintenant : elle ne sera plus jamais réaffichée.`
                    : t`Copiez cette clé secrète dès maintenant. Pour des raisons de sécurité, nous ne pourrons plus jamais vous la réafficher.`}
                </DialogDescription>
              </div>

              <div className="bg-muted/50 border border-border rounded-xl p-4 flex items-center justify-between gap-3 font-sans text-xs select-all">
                <code className="text-foreground break-all font-semibold font-sans text-xs">
                  {secretModalData.secret}
                </code>
                <Button
                  type="button"
                  variant="solid"
                  tone="brand"
                  size="sm"
                  shape="icon"
                  onClick={() => handleCopy(secretModalData.secret)}
                  aria-label={t`Copier la clé`}
                >
                  {copied ? <Check /> : <Copy />}
                </Button>
              </div>

              <div className="bg-highlight/10 border border-highlight/20 rounded-xl p-4 flex gap-3 text-xs text-highlight">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <span className="font-bold">{t`Stockage sécurisé`}</span>
                  <p className="leading-relaxed text-[11px]">
                    {t`Gardez cette clé confidentielle dans vos variables d'environnement serveur. Ne l'exposez jamais dans du code client JavaScript ou sur un dépôt public.`}
                  </p>
                </div>
              </div>

              <Button
                type="button"
                variant="solid"
                tone="brand"
                block
                onClick={() => setSecretModalData(null)}
              >
                {t`J'ai sauvegardé ma clé d'API`}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
