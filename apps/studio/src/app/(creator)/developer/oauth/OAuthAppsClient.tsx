'use client';

import React, { useState } from 'react';
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
} from 'lucide-react';
import { cn } from '@qoe/utils';
import { toast } from '@qoe/ui/toast';
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
    desc: "Identifiant de connexion (obligatoire pour l'OpenID Connect)",
  },
  { name: 'profile', required: false, desc: 'Nom, pseudo et photo de profil' },
  { name: 'email', required: false, desc: 'Adresse e-mail' },
] as const;

const STATUS_META: Record<OAuthClientDTO['status'], { label: string; className: string }> = {
  PENDING: { label: 'En attente', className: 'bg-highlight/10 text-highlight border-highlight/20' },
  APPROVED: { label: 'Approuvée', className: 'bg-success/10 text-success border-success/20' },
  REJECTED: {
    label: 'Rejetée',
    className: 'bg-destructive/10 text-destructive border-destructive/20',
  },
  REVOKED: { label: 'Révoquée', className: 'bg-muted text-muted-foreground border-border' },
};

interface OAuthAppsClientProps {
  status: string;
  clients: OAuthClientDTO[];
  error?: string;
}

export function OAuthAppsClient({ status, clients: initialClients, error }: OAuthAppsClientProps) {
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
          toast.success('Copié dans le presse-papiers.');
          setTimeout(() => setCopied(false), 2000);
        })
        .catch(() => toast.error('Copie impossible.'));
    }
  };

  const refresh = async () => {
    const res = await listOAuthClientsAction();
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
      toast.success('Application créée !');
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
      toast.error(res.error || 'Échec de la création.');
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
      toast.success('Application supprimée.');
    } else {
      toast.error(res.error || 'Suppression impossible.');
    }
  };

  const gated = status !== 'approved';

  return (
    <div className="w-full space-y-8 font-sans pb-16 text-foreground">
      {/* Header */}
      <div className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary mb-1.5">
              <Shield className="w-3.5 h-3.5" />
              OpenID Connect
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              Applications OAuth
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              Proposez « Se connecter avec qoe.fi » à vos utilisateurs via OAuth 2.1 / OpenID
              Connect, avec PKCE, signatures ES256 et consentement explicite.
            </p>
          </div>

          {!gated && (
            <button
              onClick={() => setShowCreate((s) => !s)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 active:scale-[0.99] transition-all cursor-pointer shadow-xs self-start md:self-auto"
            >
              <Plus className="w-3.5 h-3.5" strokeWidth={2} />
              Nouvelle application
            </button>
          )}
        </div>

        <DeveloperNav activeTab="oauth" />
      </div>

      {error && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-xs text-destructive">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Gated state */}
      {gated && (
        <div className="bg-card border border-border/80 rounded-2xl p-10 text-center max-w-2xl mx-auto space-y-4 shadow-xs">
          <div className="w-14 h-14 rounded-2xl bg-muted/40 text-muted-foreground flex items-center justify-center mx-auto border border-border/60">
            <Lock className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-foreground">Accès développeur requis</h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
            Les applications OAuth permettent à des tiers de se connecter avec votre identité
            qoe.fi. Pour en créer, votre demande d'accès API doit d'abord être approuvée.
          </p>
          <Link
            href="/developer"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-all cursor-pointer shadow-xs"
          >
            Demander l'accès développeur <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      )}

      {/* Create form */}
      {!gated && showCreate && (
        <div className="bg-card border border-border/80 rounded-2xl p-6 md:p-8 space-y-5 shadow-xs">
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
                Nom de l'application <span className="text-primary">*</span>
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex : Mon portefolio Next.js"
                className="w-full bg-muted/30 border border-border rounded-xl px-3.5 py-2.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-foreground">
                URL d'accueil (affichée sur l'écran de consentement)
              </label>
              <input
                value={homepageUrl}
                onChange={(e) => setHomepageUrl(e.target.value)}
                placeholder="https://monapp.com"
                className="w-full bg-muted/30 border border-border rounded-xl px-3.5 py-2.5 text-xs font-mono text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              />
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-foreground">
                Description (facultatif)
              </label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="À quoi sert votre application ?"
                className="w-full bg-muted/30 border border-border rounded-xl px-3.5 py-2.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-foreground">
                Logo URL (facultatif)
              </label>
              <input
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="https://monapp.com/logo.png"
                className="w-full bg-muted/30 border border-border rounded-xl px-3.5 py-2.5 text-xs font-mono text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-foreground">
              URL de redirection (une par ligne) <span className="text-primary">*</span>
            </label>
            <textarea
              value={redirectUrisText}
              onChange={(e) => setRedirectUrisText(e.target.value)}
              rows={3}
              placeholder={
                'https://monapp.com/api/auth/callback\nhttp://localhost:3000/api/auth/callback'
              }
              className="w-full bg-muted/30 border border-border rounded-xl px-3.5 py-2.5 text-xs font-mono text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-semibold text-foreground">Type de client</label>
            <div className="flex gap-2">
              {(['CONFIDENTIAL', 'PUBLIC'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setClientType(type)}
                  className={cn(
                    'px-3.5 py-2 rounded-lg text-xs font-semibold border transition-all cursor-pointer flex items-center gap-1.5',
                    clientType === type
                      ? 'bg-primary/10 border-primary/30 text-primary'
                      : 'bg-muted/30 border-border text-muted-foreground hover:border-muted-foreground/40'
                  )}
                >
                  {type === 'CONFIDENTIAL' ? (
                    <KeyRound className="w-3.5 h-3.5" />
                  ) : (
                    <Globe className="w-3.5 h-3.5" />
                  )}
                  {type === 'CONFIDENTIAL'
                    ? 'Confidentielle (secret client)'
                    : 'Publique (PKCE seul)'}
                </button>
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
                  <button
                    key={scope.name}
                    type="button"
                    onClick={() => toggleScope(scope.name)}
                    title={scope.desc}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer',
                      active
                        ? 'bg-primary/10 border-primary/30 text-primary'
                        : 'bg-muted/30 border-border text-muted-foreground hover:border-muted-foreground/40',
                      scope.required && 'cursor-not-allowed opacity-80'
                    )}
                  >
                    <span>{active ? '✓' : '+'}</span> {scope.name}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-border/60">
            <button
              onClick={() => setShowCreate(false)}
              className="text-xs text-muted-foreground hover:text-foreground font-medium px-3 py-2"
            >
              Annuler
            </button>
            <button
              onClick={handleCreate}
              disabled={creating || !name.trim() || redirectUris.length === 0}
              className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 active:scale-[0.99] transition-all flex items-center gap-2 cursor-pointer disabled:opacity-60 shadow-xs"
            >
              {creating ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Plus className="w-3.5 h-3.5" />
              )}
              Créer l'application
            </button>
          </div>
        </div>
      )}

      {/* List */}
      {!gated && clients.length === 0 && !showCreate && (
        <div className="py-20 text-center bg-card border border-border/80 rounded-2xl p-8 shadow-xs">
          <div className="w-14 h-14 rounded-2xl bg-muted/40 text-primary flex items-center justify-center mx-auto mb-4 border border-border/60">
            <Shield className="w-6 h-6" strokeWidth={1.5} />
          </div>
          <h3 className="text-lg font-bold text-foreground">Aucune application OAuth</h3>
          <p className="text-xs text-muted-foreground mt-1 mb-6 max-w-sm mx-auto leading-relaxed">
            Créez une application pour permettre à vos utilisateurs de se connecter avec leur compte
            qoe.fi.
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-all cursor-pointer shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            Créer ma première application
          </button>
        </div>
      )}

      {!gated && clients.length > 0 && (
        <div className="bg-card border border-border/80 rounded-2xl shadow-xs overflow-hidden divide-y divide-border/60">
          <div className="px-6 py-4 border-b border-border/80 flex items-center justify-between">
            <h3 className="text-base font-bold text-foreground">Vos applications</h3>
            <span className="text-xs font-semibold bg-muted/60 border border-border/80 px-2.5 py-1 rounded-full text-foreground">
              {clients.length} application{clients.length > 1 ? 's' : ''}
            </span>
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
                      <span
                        className={cn(
                          'text-[10px] font-bold px-2 py-0.5 rounded-full border',
                          meta.className
                        )}
                      >
                        {meta.label}
                      </span>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-muted/60 text-muted-foreground border border-border/40">
                        {client.clientType === 'CONFIDENTIAL' ? 'Confidentielle' : 'Publique'}
                      </span>
                    </div>

                    {client.description && (
                      <p className="text-xs text-muted-foreground">{client.description}</p>
                    )}

                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-muted-foreground shrink-0">Client ID :</span>
                      <code className="bg-muted/60 text-muted-foreground px-2 py-0.5 rounded font-mono text-[11px] border border-border/50 truncate">
                        {client.clientId}
                      </code>
                      <button
                        onClick={() => copy(client.clientId)}
                        className="p-1 text-muted-foreground hover:text-foreground rounded hover:bg-muted/50 transition-colors cursor-pointer shrink-0"
                        title="Copier le Client ID"
                      >
                        {copied ? (
                          <Check className="w-3.5 h-3.5 text-success" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>

                    <div className="space-y-1">
                      {client.redirectUris.map((uri) => (
                        <p
                          key={uri}
                          className="text-[11px] text-muted-foreground font-mono truncate"
                        >
                          ↳ {uri}
                        </p>
                      ))}
                    </div>

                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {client.scopes.map((scope) => (
                        <span
                          key={scope}
                          className="px-2 py-0.5 rounded-md bg-muted/60 text-[10px] font-medium text-muted-foreground border border-border/40"
                        >
                          {scope}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 self-end md:self-start">
                    {client.clientType === 'CONFIDENTIAL' && (
                      <button
                        onClick={() => handleRotate(client)}
                        disabled={busyId === client.id}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold text-foreground bg-muted/40 hover:bg-muted border border-border/60 transition-colors cursor-pointer flex items-center gap-1"
                        title="Régénérer le secret client"
                      >
                        {busyId === client.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <KeyRound className="w-3 h-3 text-primary" />
                        )}
                        Régénérer le secret
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(client)}
                      disabled={busyId === client.id}
                      className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors cursor-pointer"
                      title="Supprimer cette application"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Secret reveal modal */}
      {revealed && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border shadow-xl rounded-2xl p-6 md:p-8 max-w-xl w-full space-y-5 text-foreground">
            <div className="space-y-2">
              <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-primary" />
                Client Secret généré
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Copiez ce secret dès maintenant. Pour des raisons de sécurité, nous ne pourrons plus
                jamais vous le réafficher — vous pourrez uniquement le régénérer.
              </p>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                  Client ID
                </span>
                <code className="block bg-muted/50 border border-border rounded-xl p-3 font-mono text-xs break-all">
                  {revealed.clientId}
                </code>
              </div>
              <div className="space-y-1">
                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                  Client Secret
                </span>
                <div className="flex items-center gap-2 bg-muted/50 border border-border rounded-xl p-3">
                  <code className="flex-1 font-mono text-xs break-all select-all">
                    {revealed.clientSecret}
                  </code>
                  <button
                    onClick={() => copy(revealed.clientSecret)}
                    className="bg-primary hover:bg-primary/90 text-primary-foreground p-2 rounded-lg transition-colors shrink-0 cursor-pointer"
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3.5 rounded-xl bg-highlight/10 border border-highlight/20 text-xs text-highlight">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <p className="leading-relaxed text-[11px]">
                Stockez ce secret côté serveur uniquement (variables d'environnement). Ne l'exposez
                jamais dans du code client public.
              </p>
            </div>

            <button
              onClick={() => {
                setRevealed(null);
                setCopied(false);
              }}
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs py-3 rounded-xl transition-colors cursor-pointer shadow-xs"
            >
              J'ai sauvegardé mon secret
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
