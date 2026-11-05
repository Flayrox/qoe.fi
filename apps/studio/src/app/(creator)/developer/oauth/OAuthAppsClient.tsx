'use client';

import React, { useState } from 'react';
import { t } from '@lingui/core/macro';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Plus,
  Trash2,
  Loader2,
  Shield,
  Copy,
  Check,
  AlertCircle,
  KeyRound,
  Globe,
  Lock,
  ArrowRight,
  Building2,
  User,
} from 'lucide-react';
import { Badge } from '@qoe/ui/badge';
import { Button, buttonClasses } from '@qoe/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@qoe/ui/dialog';
import { Input, Textarea } from '@qoe/ui/input';
import { toast } from '@qoe/ui/toast';
import { ImageUploader } from '@qoe/ui/ui/ImageUploader';
import { uploadImageToRoute, IMAGE_FOLDERS } from '@qoe/supabase/storage';
import {
  createOAuthClientAction,
  listOAuthClientsAction,
  rotateOAuthClientSecretAction,
  deleteOAuthClientAction,
  type OAuthClientDTO,
} from './actions';
import { DeveloperNav } from '@/features/developer/components/developer-nav';

const OAUTH_SCOPES = [
  {
    name: 'openid',
    required: true,
    desc: () => t`Identifiant de connexion (obligatoire pour l'OpenID Connect)`,
  },
  { name: 'profile', required: false, desc: () => t`Nom, pseudo et photo de profil` },
  { name: 'email', required: false, desc: () => t`Adresse e-mail` },
  { name: 'media', required: false, desc: () => t`Statut de membre et permissions du média` },
] as const;

const STATUS_META: Record<
  OAuthClientDTO['status'],
  { label: () => string; tone: 'vivid' | 'success' | 'danger' | 'neutral' }
> = {
  PENDING: { label: () => t`En attente`, tone: 'vivid' },
  APPROVED: { label: () => t`Approuvée`, tone: 'success' },
  REJECTED: { label: () => t`Rejetée`, tone: 'danger' },
  REVOKED: { label: () => t`Révoquée`, tone: 'neutral' },
};

interface OAuthAppsClientProps {
  status: string;
  hasOAuthGrant?: boolean;
  clients: OAuthClientDTO[];
  error?: string;
  workspace?: {
    type: string;
    name: string;
    publicationId?: string;
  };
}

export function OAuthAppsClient({
  status,
  hasOAuthGrant = true,
  clients: initialClients,
  error,
  workspace,
}: OAuthAppsClientProps) {
  const router = useRouter();
  const [clients, setClients] = useState<OAuthClientDTO[]>(initialClients);

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [homepageUrl, setHomepageUrl] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [redirectUrisText, setRedirectUrisText] = useState('');
  const [clientType, setClientType] = useState<'CONFIDENTIAL' | 'PUBLIC'>('CONFIDENTIAL');
  const [selectedScopes, setSelectedScopes] = useState<string[]>(['openid', 'profile', 'email']);
  const [creating, setCreating] = useState(false);

  // Secret reveal
  const [revealed, setRevealed] = useState<{ clientId: string; clientSecret: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const redirectUris = redirectUrisText
    .split('\n')
    .map((u) => u.trim())
    .filter(Boolean);

  const copy = (text: string) => {
    if (typeof window !== 'undefined' && navigator?.clipboard?.writeText) {
      navigator.clipboard
        .writeText(text)
        .then(() => {
          setCopied(true);
          toast.success(t`Copié dans le presse-papiers.`);
          setTimeout(() => setCopied(false), 2000);
        })
        .catch(() => toast.error('Copie impossible.'));
    }
  };

  const refresh = async () => {
    const res = await listOAuthClientsAction(workspace?.publicationId);
    if (res.success) setClients(res.clients);
    router.refresh();
  };

  const toggleScope = (scope: string) => {
    if (scope === 'openid') return; // toujours requis
    setSelectedScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    );
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error("Le nom de l'application est requis.");
      return;
    }
    if (redirectUris.length === 0) {
      toast.error('Ajoutez au moins une URL de redirection (une par ligne).');
      return;
    }
    setCreating(true);
    const res = await createOAuthClientAction({
      name: name.trim(),
      description: description.trim(),
      homepageUrl: homepageUrl.trim(),
      logoUrl: logoUrl.trim(),
      redirectUris,
      scopes: selectedScopes,
      clientType,
    });
    setCreating(false);
    if (res.success) {
      toast.success(t`Application créée !`);
      setName('');
      setDescription('');
      setHomepageUrl('');
      setLogoUrl('');
      setRedirectUrisText('');
      setShowCreate(false);
      await refresh();
      if (res.clientSecret) {
        setRevealed({ clientId: res.clientId, clientSecret: res.clientSecret });
      }
    } else {
      toast.error(res.error || t`Échec de la création.`);
    }
  };

  const handleRotate = async (client: OAuthClientDTO) => {
    setBusyId(client.id);
    const res = await rotateOAuthClientSecretAction(client.id);
    setBusyId(null);
    if (res.success) {
      setRevealed({ clientId: client.clientId, clientSecret: res.clientSecret });
      await refresh();
    } else {
      toast.error(res.error || 'Rotation impossible.');
    }
  };

  const handleDelete = async (client: OAuthClientDTO) => {
    if (
      !confirm(
        `Supprimer l'application « ${client.name} » ?\nTous les tokens et consentements associés seront révoqués.`
      )
    ) {
      return;
    }
    setBusyId(client.id);
    const res = await deleteOAuthClientAction(client.id);
    setBusyId(null);
    if (res.success) {
      setClients((prev) => prev.filter((c) => c.id !== client.id));
      toast.success(t`Application supprimée.`);
    } else {
      toast.error(res.error || 'Suppression impossible.');
    }
  };

  const gated = status !== 'approved' || !hasOAuthGrant;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 text-foreground">
      {/* Header */}
      <div className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              {workspace && (
                <Badge variant="outline" shape="pill" size="sm">
                  {workspace.type === 'MEDIA' ? (
                    <>
                      <Building2 className="text-primary" />
                      <span>
                        Média : <strong>{workspace.name}</strong>
                      </span>
                    </>
                  ) : (
                    <>
                      <User />
                      <span>Espace Personnel</span>
                    </>
                  )}
                </Badge>
              )}
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Applications OAuth
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              Proposez « Se connecter avec qoefi » à vos utilisateurs via OAuth 2.1 / OpenID
              Connect, avec PKCE, signatures ES256 et consentement explicite.
            </p>
          </div>

          {!gated && (
            <Button
              variant="solid"
              tone="brand"
              size="md"
              onClick={() => setShowCreate((s) => !s)}
              className="self-start md:self-auto"
            >
              <Plus />
              Nouvelle application
            </Button>
          )}
        </div>

        <DeveloperNav activeTab="oauth" />
      </div>

      {error && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-xs text-destructive-text">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Gated state */}
      {gated && (
        <div className="bg-card border border-border/50 rounded-2xl p-10 text-center max-w-2xl mx-auto space-y-4 shadow-xs">
          <div className="w-14 h-14 rounded-2xl bg-muted/40 text-muted-foreground flex items-center justify-center mx-auto border border-border/60">
            <Lock className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-foreground">
            {status?.toLowerCase() !== 'approved'
              ? 'Accès développeur requis'
              : 'Permission OAuth non accordée'}
          </h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
            {status?.toLowerCase() !== 'approved'
              ? status?.toLowerCase() === 'pending'
                ? "Votre demande d'accès développeur est en cours d'examen par notre équipe. Une fois approuvée, vous pourrez créer des applications OAuth 2.1 et OIDC."
                : 'Les applications OAuth permettent à des services tiers de se connecter via « Se connecter avec qoefi ». Activez votre accès développeur pour commencer.'
              : "Votre compte dispose d'un accès API actif, mais la permission spécifique « OAuth » ne vous a pas encore été accordée par un administrateur."}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Link
              href="/developer"
              className={buttonClasses({ variant: 'solid', tone: 'brand', size: 'md' })}
            >
              {status?.toLowerCase() === 'approved'
                ? 'Gérer mes accès développeur'
                : "Demander l'accès développeur"}{' '}
              <ArrowRight />
            </Link>
            <a
              href="https://docs.qoe.fi"
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClasses({ variant: 'outline', size: 'md' })}
            >
              Documentation OAuth <Globe className="opacity-70" />
            </a>
          </div>
        </div>
      )}

      {/* Create form */}
      {!gated && showCreate && (
        <div className="bg-card border border-border/50 rounded-2xl p-6 md:p-8 space-y-5 shadow-xs">
          <div className="space-y-1">
            <h3 className="text-base font-bold text-foreground">Créer une application OAuth</h3>
            <p className="text-xs text-muted-foreground">
              Les applications sont examinées avant activation. Utilisez des URL de redirection en
              HTTPS (http://localhost autorisé en développement).
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-foreground">
                Nom de l&apos;application <span className="text-primary">*</span>
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex : Mon portefolio Next.js"
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-foreground">
                URL d&apos;accueil (affichée sur l&apos;écran de consentement)
              </label>
              <Input
                value={homepageUrl}
                onChange={(e) => setHomepageUrl(e.target.value)}
                placeholder="https://monapp.com"
              />
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-foreground">
                Description (facultatif)
              </label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t`À quoi sert votre application ?`}
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-foreground">
                Logo (facultatif)
              </label>
              <ImageUploader
                value={logoUrl || null}
                onChange={(url) => setLogoUrl(url ?? '')}
                upload={(file) =>
                  uploadImageToRoute(file, '/api/articles/upload', IMAGE_FOLDERS.avatars)
                }
                aspect={1}
                shape="circle"
                maxDimension={512}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-foreground">
              URL de redirection (une par ligne) <span className="text-primary">*</span>
            </label>
            <Textarea
              value={redirectUrisText}
              onChange={(e) => setRedirectUrisText(e.target.value)}
              rows={3}
              placeholder={
                'https://monapp.com/api/auth/callback\nhttp://localhost:3000/api/auth/callback'
              }
            />
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-semibold text-foreground">Type de client</label>
            <div className="flex flex-wrap gap-2">
              {(['CONFIDENTIAL', 'PUBLIC'] as const).map((type) => (
                <Button
                  key={type}
                  variant={clientType === type ? 'soft' : 'outline'}
                  tone={clientType === type ? 'brand' : 'neutral'}
                  size="sm"
                  onClick={() => setClientType(type)}
                >
                  {type === 'CONFIDENTIAL' ? <KeyRound /> : <Globe />}
                  {type === 'CONFIDENTIAL'
                    ? 'Confidentielle (secret client)'
                    : 'Publique (PKCE seul)'}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-semibold text-foreground">
              Permissions (scopes)
            </label>
            <div className="flex flex-wrap gap-2">
              {OAUTH_SCOPES.map((scope) => {
                const active = scope.required || selectedScopes.includes(scope.name);
                return (
                  <Button
                    key={scope.name}
                    variant={active ? 'soft' : 'outline'}
                    tone={active ? 'brand' : 'neutral'}
                    size="xs"
                    disabled={scope.required}
                    onClick={() => toggleScope(scope.name)}
                    title={scope.desc()}
                  >
                    <span>{active ? '✓' : '+'}</span> {scope.name}
                  </Button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-border/60">
            <Button variant="ghost" size="sm" onClick={() => setShowCreate(false)}>
              Annuler
            </Button>
            <Button
              variant="solid"
              tone="brand"
              size="md"
              onClick={handleCreate}
              disabled={creating || !name.trim() || redirectUris.length === 0}
            >
              {creating ? <Loader2 className="animate-spin" /> : <Plus />}
              Créer l&apos;application
            </Button>
          </div>
        </div>
      )}

      {/* List */}
      {!gated && clients.length === 0 && !showCreate && (
        <div className="py-20 text-center bg-card border border-border/50 rounded-2xl p-8 shadow-xs">
          <div className="w-14 h-14 rounded-2xl bg-muted/40 text-primary flex items-center justify-center mx-auto mb-4 border border-border/60">
            <Shield className="w-6 h-6" strokeWidth={1.5} />
          </div>
          <h3 className="text-lg font-bold text-foreground">Aucune application OAuth</h3>
          <p className="text-xs text-muted-foreground mt-1 mb-6 max-w-sm mx-auto leading-relaxed">
            Créez une application pour permettre à vos utilisateurs de se connecter avec leur compte
            qoefi.
          </p>
          <Button variant="solid" tone="brand" size="md" onClick={() => setShowCreate(true)}>
            <Plus />
            Créer ma première application
          </Button>
        </div>
      )}

      {!gated && clients.length > 0 && (
        <div className="bg-card border border-border/50 rounded-2xl shadow-xs overflow-hidden divide-y divide-border/60">
          <div className="px-6 py-4 border-b border-border/50 flex items-center justify-between">
            <h3 className="text-base font-bold text-foreground">Vos applications</h3>
            <Badge variant="outline" shape="pill" size="sm">
              {clients.length} application{clients.length > 1 ? 's' : ''}
            </Badge>
          </div>

          {clients.map((client) => {
            const meta = STATUS_META[client.status] ?? STATUS_META.PENDING;
            return (
              <div
                key={client.id}
                className="p-5 flex flex-col gap-4 hover:bg-muted/10 transition-colors"
              >
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                  <div className="min-w-0 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-foreground">{client.name}</p>
                      <Badge variant="outline" tone={meta.tone} shape="pill">
                        {meta.label()}
                      </Badge>
                      <Badge variant="soft" shape="pill">
                        {client.clientType === 'CONFIDENTIAL' ? 'Confidentielle' : 'Publique'}
                      </Badge>
                    </div>

                    {client.description && (
                      <p className="text-xs text-muted-foreground">{client.description}</p>
                    )}

                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-muted-foreground shrink-0">Client ID :</span>
                      <code className="bg-muted/60 text-muted-foreground px-2 py-0.5 rounded font-sans font-medium text-[11px] border border-border/50 truncate">
                        {client.clientId}
                      </code>
                      <Button
                        variant="ghost"
                        size="xs"
                        shape="icon"
                        onClick={() => copy(client.clientId)}
                        title="Copier le Client ID"
                        aria-label="Copier le Client ID"
                      >
                        {copied ? <Check className="text-success-text" /> : <Copy />}
                      </Button>
                    </div>

                    <div className="space-y-1">
                      {client.redirectUris.map((uri) => (
                        <p
                          key={uri}
                          className="text-[11px] text-muted-foreground font-sans truncate"
                        >
                          ↳ {uri}
                        </p>
                      ))}
                    </div>

                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {client.scopes.map((scope) => (
                        <Badge key={scope} variant="outline">
                          {scope}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 self-end md:self-start">
                    {client.clientType === 'CONFIDENTIAL' && (
                      <Button
                        variant="outline"
                        size="xs"
                        onClick={() => handleRotate(client)}
                        disabled={busyId === client.id}
                        title={t`Régénérer le secret client`}
                      >
                        {busyId === client.id ? (
                          <Loader2 className="animate-spin" />
                        ) : (
                          <KeyRound className="text-primary" />
                        )}
                        Régénérer le secret
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      tone="danger"
                      size="sm"
                      shape="icon"
                      onClick={() => handleDelete(client)}
                      disabled={busyId === client.id}
                      title="Supprimer cette application"
                      aria-label="Supprimer cette application"
                      className="text-muted-foreground"
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Secret reveal modal */}
      <Dialog
        open={Boolean(revealed)}
        size="lg"
        isDismissable={false}
        onOpenChange={(open) => {
          if (!open) {
            setRevealed(null);
            setCopied(false);
          }
        }}
      >
        <DialogContent role="alertdialog" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-primary" />
              Client Secret généré
            </DialogTitle>
            <DialogDescription>
              Copiez ce secret dès maintenant. Pour des raisons de sécurité, nous ne pourrons plus
              jamais vous le réafficher — vous pourrez uniquement le régénérer.
            </DialogDescription>
          </DialogHeader>

          {revealed && (
            <div className="space-y-3">
              <div className="space-y-1">
                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                  Client ID
                </span>
                <code className="block bg-muted/50 border border-border rounded-xl p-3 font-sans text-xs break-all">
                  {revealed.clientId}
                </code>
              </div>
              <div className="space-y-1">
                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                  Client Secret
                </span>
                <div className="flex items-center gap-2 bg-muted/50 border border-border rounded-xl p-3">
                  <code className="flex-1 font-sans text-xs break-all select-all">
                    {revealed.clientSecret}
                  </code>
                  <Button
                    variant="solid"
                    tone="brand"
                    size="sm"
                    shape="icon"
                    onClick={() => copy(revealed.clientSecret)}
                    aria-label="Copier le Client Secret"
                  >
                    {copied ? <Check /> : <Copy />}
                  </Button>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-start gap-3 p-3.5 rounded-xl bg-highlight/10 border border-highlight/20 text-xs text-highlight">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <p className="leading-relaxed text-[11px]">
              Stockez ce secret côté serveur uniquement (variables d&apos;environnement). Ne
              l&apos;exposez jamais dans du code client public.
            </p>
          </div>

          <DialogFooter>
            <Button
              variant="solid"
              tone="brand"
              size="md"
              block
              onClick={() => {
                setRevealed(null);
                setCopied(false);
              }}
            >
              J&apos;ai sauvegardé mon secret
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
