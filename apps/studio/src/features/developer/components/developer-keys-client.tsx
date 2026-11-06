'use client';

import { useState } from 'react';
import { AlertCircle, Check, Copy, Key, Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { Badge } from '@qoe/ui/badge';
import { Button } from '@qoe/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@qoe/ui/dialog';
import { Input } from '@qoe/ui/input';
import { Table, TableBody, TableCell, TableColumn, TableHeader, TableRow } from '@qoe/ui/table';
import { toast } from '@qoe/ui/toast';
import { StudioSection } from '@/components/studio-page';
import { attemptWithStepUp } from '@/lib/authz-feedback';
import {
  generateApiKeyAction,
  revokeApiKeyAction,
  rotateApiKeyAction,
} from '@qoe/sdk/actions/dashboard';
import {
  createMediaApiKeyAction,
  revokeMediaApiKeyAction,
  rotateMediaApiKeyAction,
} from '@/app/(creator)/media/actions';
import { listDeveloperKeysAction } from '../actions';
import { DeveloperAccessState } from './developer-access-state';
import { DeveloperShell } from './developer-shell';
import type { DeveloperAccess, DeveloperApiKey, DeveloperWorkspace } from '../types';

const API_KEY_SCOPES = ['READ', 'WRITE', 'ANALYTICS'] as const;
type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

const GRANT_TO_SCOPE: Record<string, ApiKeyScope> = {
  'api:read': 'READ',
  'api:write': 'WRITE',
  'api:analytics': 'ANALYTICS',
};

const SCOPE_META: Record<ApiKeyScope, { label: string; description: string }> = {
  READ: { label: 'READ', description: 'Articles, profils et catégories publiques' },
  WRITE: { label: 'WRITE', description: 'Créer, modifier et publier des contenus' },
  ANALYTICS: { label: 'ANALYTICS', description: 'Métriques de lecture et complétion' },
};

function copyText(text: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text);
  }
  return Promise.reject(new Error('Presse-papiers indisponible'));
}

function formatDate(value: string, withYear = false): string {
  return new Date(value).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    ...(withYear ? { year: 'numeric' } : { hour: '2-digit', minute: '2-digit' }),
  });
}

export function DeveloperKeysClient({
  access,
  initialKeys,
  workspace,
}: {
  access: DeveloperAccess;
  initialKeys: DeveloperApiKey[];
  workspace: DeveloperWorkspace;
}) {
  const isMediaWorkspace = workspace.type === 'MEDIA' && Boolean(workspace.mediaId);
  const allowedScopes = API_KEY_SCOPES.filter((scope) =>
    isMediaWorkspace ? true : access.grants.some((grant) => GRANT_TO_SCOPE[grant] === scope)
  );
  const hasApiAccess = access.status === 'approved' && allowedScopes.length > 0;
  const [keys, setKeys] = useState(initialKeys);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyScopes, setNewKeyScopes] = useState<ApiKeyScope[]>(allowedScopes);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRotatingId, setIsRotatingId] = useState<string | null>(null);
  const [isRevokingId, setIsRevokingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [keyModalMode, setKeyModalMode] = useState<'generated' | 'rotated'>('generated');
  const [copied, setCopied] = useState(false);

  const refreshKeys = async () => {
    const list = await listDeveloperKeysAction();
    if (list.success) {
      setKeys(list.keys);
    } else {
      toast.error(list.error || 'Impossible de rafraîchir la liste des clés.');
    }
  };

  const handleCopy = (value: string) => {
    copyText(value)
      .then(() => {
        setCopied(true);
        toast.success('Clé copiée dans le presse-papiers.');
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => toast.error('Impossible de copier dans le presse-papiers.'));
  };

  const handleGenerate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!newKeyName.trim() || newKeyScopes.length === 0) return;

    setIsGenerating(true);
    try {
      if (isMediaWorkspace && workspace.mediaId) {
        const res = await attemptWithStepUp(
          () => createMediaApiKeyAction(workspace.mediaId!, newKeyName.trim(), newKeyScopes),
          { fallback: 'Erreur lors de la génération de la clé.' }
        );
        if (res.success && res.key) {
          setGeneratedKey(res.key.secret);
          await refreshKeys();
          toast.success('Nouvelle clé Média générée.');
        } else {
          toast.error('Erreur lors de la génération de la clé.');
        }
      } else {
        const res = await attemptWithStepUp(
          () => generateApiKeyAction({ name: newKeyName.trim(), scopes: newKeyScopes }),
          { fallback: 'Erreur lors de la génération de la clé.' }
        );
        if (res.ok && res.data?.apiKey) {
          setGeneratedKey(res.data.apiKey);
          await refreshKeys();
          toast.success("Nouvelle clé d'API générée.");
        } else {
          toast.error('Erreur lors de la génération de la clé.');
        }
      }

      setKeyModalMode('generated');
      setNewKeyName('');
      setNewKeyScopes([...allowedScopes]);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Erreur lors de la génération de la clé.'
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRotate = async (id: string) => {
    setIsRotatingId(id);
    try {
      if (isMediaWorkspace && workspace.mediaId) {
        const res = await attemptWithStepUp(() => rotateMediaApiKeyAction(workspace.mediaId!, id), {
          fallback: 'Erreur lors de la rotation de la clé.',
        });
        if (res.success && res.key) {
          setKeyModalMode('rotated');
          setGeneratedKey(res.key.secret);
          toast.success("Clé d'API rotatée.");
        } else {
          toast.error('Erreur lors de la rotation de la clé.');
        }
      } else {
        const res = await attemptWithStepUp(() => rotateApiKeyAction(id), {
          fallback: 'Erreur lors de la rotation de la clé.',
        });
        if (res.ok && res.data?.apiKey) {
          setKeyModalMode('rotated');
          setGeneratedKey(res.data.apiKey);
          toast.success("Clé d'API rotatée.");
        } else {
          toast.error('Erreur lors de la rotation de la clé.');
        }
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erreur lors de la rotation de la clé.');
    } finally {
      setIsRotatingId(null);
    }
  };

  const handleRevoke = async (id: string) => {
    setIsRevokingId(id);
    try {
      if (isMediaWorkspace && workspace.mediaId) {
        const res = await attemptWithStepUp(() => revokeMediaApiKeyAction(workspace.mediaId!, id), {
          fallback: 'Erreur lors de la révocation de la clé.',
        });
        if (res.success) {
          setKeys((current) => current.filter((key) => key.id !== id));
          setConfirmDeleteId(null);
          toast.success("Clé d'API révoquée.");
        } else {
          toast.error('Erreur lors de la révocation de la clé.');
        }
      } else {
        const res = await attemptWithStepUp(() => revokeApiKeyAction(id), {
          fallback: 'Erreur lors de la révocation de la clé.',
        });
        if (res.ok) {
          setKeys((current) => current.filter((key) => key.id !== id));
          setConfirmDeleteId(null);
          toast.success("Clé d'API révoquée.");
        } else {
          toast.error('Erreur lors de la révocation de la clé.');
        }
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Erreur lors de la révocation de la clé.'
      );
    } finally {
      setIsRevokingId(null);
    }
  };

  if (access.status !== 'approved') {
    return (
      <DeveloperShell access={access} description={`Clés d’API de ${workspace.name}.`}>
        <DeveloperAccessState access={access} />
      </DeveloperShell>
    );
  }

  if (!hasApiAccess) {
    return (
      <DeveloperShell access={access} description={`Clés d’API de ${workspace.name}.`}>
        <DeveloperAccessState
          access={access}
          title="Aucune permission API accordée"
          description="Votre accès est actif, mais aucune permission de lecture, d’écriture ou d’analytics ne vous a été accordée."
        />
      </DeveloperShell>
    );
  }

  return (
    <DeveloperShell access={access} description={`Clés d’API de ${workspace.name}.`}>
      <StudioSection title="Générer une clé" icon={Key}>
        <form onSubmit={handleGenerate} className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input
              value={newKeyName}
              onChange={(event) => setNewKeyName(event.target.value)}
              placeholder={
                isMediaWorkspace
                  ? 'Nom de la clé (CMS, bot Discord, Next.js…)'
                  : 'Nom de la clé (Blog Vercel, app mobile…)'
              }
              className="flex-1"
              required
            />
            <Button
              type="submit"
              variant="solid"
              tone="brand"
              disabled={isGenerating || !newKeyName.trim() || newKeyScopes.length === 0}
            >
              {isGenerating ? <Loader2 className="animate-spin" /> : <Plus />}
              Générer la clé
            </Button>
          </div>

          <div className="space-y-2">
            <p className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
              Permissions de la clé
            </p>
            <div className="flex flex-wrap gap-2">
              {allowedScopes.map((scope) => {
                const active = newKeyScopes.includes(scope);
                return (
                  <Button
                    key={scope}
                    type="button"
                    variant={active ? 'soft' : 'outline'}
                    tone={active ? 'brand' : 'neutral'}
                    size="xs"
                    onClick={() =>
                      setNewKeyScopes((current) =>
                        current.includes(scope)
                          ? current.filter((value) => value !== scope)
                          : [...current, scope]
                      )
                    }
                    title={SCOPE_META[scope].description}
                  >
                    <span>{active ? '✓' : '+'}</span>
                    {scope}
                  </Button>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Une clé ne peut jamais dépasser les permissions accordées à votre compte.
            </p>
          </div>
        </form>
      </StudioSection>

      <StudioSection
        title="Clés actives"
        icon={Key}
        actions={
          <Badge variant="outline" shape="pill" size="sm">
            {keys.length} clé{keys.length > 1 ? 's' : ''}
          </Badge>
        }
      >
        <Table aria-label="Clés d’API actives" size="sm" className="rounded-lg">
          <TableHeader>
            <TableColumn isRowHeader>Nom et identifiant</TableColumn>
            <TableColumn>Permissions</TableColumn>
            <TableColumn>Dernière activité</TableColumn>
            <TableColumn>Créée le</TableColumn>
            <TableColumn className="text-right">Actions</TableColumn>
          </TableHeader>
          <TableBody
            items={keys}
            dependencies={[confirmDeleteId, isRevokingId, isRotatingId]}
            emptyState={
              <div className="space-y-1 py-4">
                <p className="text-xs font-medium text-foreground">Aucune clé pour le moment.</p>
                <p>Générez votre première clé ci-dessus.</p>
              </div>
            }
          >
            {(key) => (
              <TableRow id={key.id}>
                <TableCell>
                  <p className="font-semibold text-foreground">{key.name}</p>
                  <code className="mt-1 inline-block rounded border border-border/50 bg-muted/60 px-2 py-0.5 font-sans text-[11px] text-muted-foreground">
                    {key.keyPrefix}••••••••••••
                  </code>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {(key.scopes.length ? key.scopes : allowedScopes).map((scope) => (
                      <Badge key={scope} variant="soft" tone="brand" size="xs">
                        {scope}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell className="text-[11px] text-muted-foreground">
                  {key.lastUsedAt ? formatDate(key.lastUsedAt) : 'Jamais utilisée'}
                </TableCell>
                <TableCell className="text-[11px] text-muted-foreground">
                  {formatDate(key.createdAt, true)}
                </TableCell>
                <TableCell className="text-right">
                  {confirmDeleteId === key.id ? (
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => setConfirmDeleteId(null)}
                        disabled={isRevokingId === key.id}
                      >
                        Annuler
                      </Button>
                      <Button
                        variant="solid"
                        tone="danger"
                        size="xs"
                        onClick={() => handleRevoke(key.id)}
                        disabled={isRevokingId === key.id}
                      >
                        {isRevokingId === key.id ? <Loader2 className="animate-spin" /> : null}
                        Révoquer
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="xs"
                        shape="icon"
                        onClick={() => handleRotate(key.id)}
                        disabled={isRotatingId === key.id || isRevokingId === key.id}
                        title="Rotation : régénère le secret et invalide l’ancienne clé"
                        aria-label="Rotater la clé"
                      >
                        <RefreshCw
                          className={isRotatingId === key.id ? 'animate-spin' : undefined}
                        />
                      </Button>
                      <Button
                        variant="ghost"
                        tone="danger"
                        size="xs"
                        shape="icon"
                        onClick={() => setConfirmDeleteId(key.id)}
                        title="Révoquer cette clé"
                        aria-label="Révoquer cette clé"
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </StudioSection>

      <Dialog
        open={Boolean(generatedKey)}
        onOpenChange={(open) => !open && setGeneratedKey(null)}
        isDismissable={false}
        size="lg"
      >
        <DialogContent showCloseButton={false}>
          {generatedKey ? (
            <div className="space-y-5">
              <div className="text-center">
                <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-xl border border-success/20 bg-success/10 text-success-text">
                  <Check className="size-5" />
                </div>
                <DialogTitle className="text-center text-lg">
                  {keyModalMode === 'rotated'
                    ? "Clé d'API rotatée"
                    : "Clé d'API générée avec succès"}
                </DialogTitle>
                <DialogDescription className="mx-auto mt-2 max-w-md text-center">
                  Copiez ce secret maintenant : il ne sera plus jamais réaffiché.
                </DialogDescription>
              </div>

              <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/50 p-4">
                <code className="select-all break-all font-sans text-xs font-semibold text-foreground">
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

              <div className="flex gap-3 rounded-lg border border-highlight/20 bg-highlight/10 p-4 text-xs text-highlight">
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <p className="leading-relaxed">
                  Stockez cette clé dans les variables d’environnement de votre serveur. Ne
                  l’exposez jamais dans du JavaScript public.
                </p>
              </div>

              <Button
                type="button"
                variant="solid"
                tone="brand"
                block
                onClick={() => setGeneratedKey(null)}
              >
                J’ai sauvegardé ma clé
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </DeveloperShell>
  );
}
