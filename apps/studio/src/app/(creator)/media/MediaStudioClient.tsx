'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Building2,
  Plus,
  Users,
  Mail,
  Settings,
  Trash2,
  Shield,
  ShieldCheck,
  Check,
  Loader2,
  UserPlus,
  Crown,
  PenLine,
  Eye,
  Globe,
  ArrowRight,
  FileText,
  Clock,
} from 'lucide-react';
import { toast } from '@qoe/ui/toast';
import { cn } from '@qoe/utils';
import { ImageUploader } from '@qoe/ui/ui/ImageUploader';
import { uploadImageToRoute, IMAGE_FOLDERS } from '@qoe/supabase/storage';
import {
  createMediaAction,
  getMediaByIdAction,
  inviteMediaMemberAction,
  updateMediaMemberRoleAction,
  updateMediaMemberPermissionsAction,
  removeMediaMemberAction,
  updateMediaSettingsAction,
} from './actions';
import { ALL_MEDIA_PERMISSIONS, MEDIA_ROLES } from '@qoe/auth/media';

interface MediaSummary {
  id: string;
  name: string;
  slug: string;
  subdomain: string | null;
  bio: string | null;
  logoUrl: string | null;
  role: string;
  membersCount: number;
  invitesCount: number;
}

interface MediaInvite {
  id: string;
  email: string;
  role: string;
  status: string;
  createdAt: string;
  expiresAt: string | null;
  inviter: { id: string; name: string | null; username: string | null };
}

interface MediaDetail {
  id: string;
  publication: {
    id: string;
    name: string;
    slug: string;
    subdomain: string | null;
    customDomain: string | null;
    bio: string | null;
    logoUrl: string | null;
    heroText: string | null;
    headerImageUrl: string | null;
    footerText: string | null;
    accentColor: string | null;
    themeMode: string | null;
    layoutStyle: string | null;
    seoTitle: string | null;
    seoDescription: string | null;
    allowIndexing: boolean;
    supportUrl: string | null;
    fontFamily: string | null;
    _count: { articles: number };
  };
  members: Array<{
    id: string;
    role: string;
    permissions: string[];
    status: string;
    joinedAt: string;
    user: { id: string; name: string | null; username: string | null; logoUrl: string | null };
  }>;
  invites: MediaInvite[];
}

const ROLE_META: Record<
  string,
  {
    label: string;
    color: string;
    icon: React.ComponentType<{ className?: string; strokeWidth?: number | string }>;
  }
> = {
  owner: { label: 'Propriétaire', color: 'text-primary', icon: Crown },
  editor: { label: 'Éditeur', color: 'text-highlight', icon: ShieldCheck },
  writer: { label: 'Rédacteur', color: 'text-foreground', icon: PenLine },
  viewer: { label: 'Lecteur', color: 'text-muted-foreground', icon: Eye },
};

const PERMISSION_LABELS: Record<string, string> = {
  'media:manage_members': 'Gérer les membres',
  'media:manage_settings': 'Design & SEO',
  'media:manage_billing': 'Monétisation',
  'media:manage_categories': 'Catégories',
  'media:manage_newsletter': 'Newsletter',
  'media:publish:any': 'Publier',
  'media:edit:any': 'Éditer tout',
  'media:delete:any': 'Supprimer',
  'media:review': 'Approbation',
  'media:view_analytics': 'Analytics',
  'media:create_articles': 'Écrire',
  'media:edit_own': 'Éditer ses écrits',
};

const ROLE_DEFAULT_PERMS: Record<string, string[]> = {
  owner: [...ALL_MEDIA_PERMISSIONS],
  editor: [
    'media:manage_categories',
    'media:manage_newsletter',
    'media:publish:any',
    'media:edit:any',
    'media:delete:any',
    'media:review',
    'media:view_analytics',
    'media:create_articles',
    'media:edit_own',
  ],
  writer: ['media:create_articles', 'media:edit_own'],
  viewer: ['media:view_analytics'],
};

type StudioTab = 'members' | 'invites' | 'settings';

const TABS: Array<{
  key: StudioTab;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number | string }>;
}> = [
  { key: 'members', label: 'Membres', icon: Users },
  { key: 'invites', label: 'Invitations', icon: Mail },
  { key: 'settings', label: 'Réglages', icon: Settings },
];

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function QuietDot({ active }: { active?: boolean }) {
  return (
    <span
      className={cn(
        'inline-block h-1.5 w-1.5 rounded-full',
        active ? 'bg-success' : 'bg-muted-foreground/30'
      )}
    />
  );
}

export function MediaStudioClient({
  medias,
  activeMediaId,
}: {
  medias: MediaSummary[];
  activeMediaId: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const showCreate = searchParams.get('create') === '1';

  const [selectedMediaId, setSelectedMediaId] = useState<string | null>(activeMediaId);
  const [detail, setDetail] = useState<MediaDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [tab, setTab] = useState<StudioTab>('members');
  const [myRole, setMyRole] = useState<string | null>(null);

  const [createName, setCreateName] = useState('');
  const [createSlug, setCreateSlug] = useState('');
  const [createBio, setCreateBio] = useState('');
  const [createLogo, setCreateLogo] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('writer');
  const [inviting, setInviting] = useState(false);

  const canManageMembers = myRole === MEDIA_ROLES.OWNER || myRole === MEDIA_ROLES.EDITOR;

  const loadDetail = useCallback(async (mediaId: string) => {
    setLoadingDetail(true);
    const res = await getMediaByIdAction(mediaId);
    setLoadingDetail(false);
    if (res.success) {
      setDetail(res.media as unknown as MediaDetail);
      setMyRole(res.myRole ?? null);
    } else {
      toast.error(res.error || 'Erreur de chargement du Média');
    }
  }, []);

  useEffect(() => {
    if (selectedMediaId) {
      loadDetail(selectedMediaId);
    } else if (medias.length > 0 && !showCreate) {
      setSelectedMediaId(medias[0].id);
    }
  }, [selectedMediaId, medias, showCreate, loadDetail]);

  const handleCreate = async () => {
    if (!createName.trim() || !createSlug.trim()) {
      toast.error('Le nom et le permalien sont requis.');
      return;
    }
    setCreating(true);
    const res = await createMediaAction(
      createName,
      createSlug,
      createBio || undefined,
      createLogo || undefined
    );
    setCreating(false);
    if (res.success) {
      toast.success('Média créé avec succès !');
      document.cookie = `qoe_active_workspace=${encodeURIComponent(
        JSON.stringify({ type: 'MEDIA', id: res.media!.id })
      )}; path=/; max-age=2592000`;
      router.push('/media');
      router.refresh();
    } else {
      toast.error(res.error || 'Impossible de créer le Média.');
    }
  };

  const handleInvite = async () => {
    if (!detail) return;
    if (!inviteEmail.trim()) {
      toast.error("L'email de l'invité est requis.");
      return;
    }
    setInviting(true);
    const res = await inviteMediaMemberAction(detail.id, inviteEmail, inviteRole);
    setInviting(false);
    if (res.success) {
      toast.success(res.alreadyMember ? 'Rôle mis à jour.' : 'Invitation envoyée !');
      setInviteEmail('');
      loadDetail(detail.id);
    } else {
      toast.error(res.error || "Échec de l'invitation.");
    }
  };

  const handleRoleChange = async (memberUserId: string, role: string) => {
    if (!detail) return;
    const res = await updateMediaMemberRoleAction(detail.id, memberUserId, role);
    if (res.success) {
      toast.success('Rôle mis à jour.');
      loadDetail(detail.id);
    } else {
      toast.error(res.error || 'Erreur');
    }
  };

  const handlePermissionsChange = async (memberUserId: string, permission: string) => {
    if (!detail) return;
    const member = detail.members.find((m) => m.user.id === memberUserId);
    if (!member) return;
    const base = ROLE_DEFAULT_PERMS[member.role] || [];
    const perms = new Set(
      member.permissions && member.permissions.length > 0 ? member.permissions : base
    );
    if (perms.has(permission)) perms.delete(permission);
    else perms.add(permission);
    const res = await updateMediaMemberPermissionsAction(
      detail.id,
      memberUserId,
      Array.from(perms)
    );
    if (res.success) {
      toast.success('Permissions mises à jour.');
      loadDetail(detail.id);
    }
  };

  const handleRemoveMember = async (memberUserId: string, memberName: string) => {
    if (!detail) return;
    if (!window.confirm(`Retirer ${memberName} du Média ?`)) return;
    const res = await removeMediaMemberAction(detail.id, memberUserId);
    if (res.success) {
      toast.success('Membre retiré.');
      loadDetail(detail.id);
    } else {
      toast.error(res.error || 'Erreur');
    }
  };

  const effectivePerms = (member: MediaDetail['members'][number]) =>
    member.permissions && member.permissions.length > 0
      ? member.permissions
      : ROLE_DEFAULT_PERMS[member.role] || [];

  const isOwner = myRole === MEDIA_ROLES.OWNER;

  const inputCls =
    'w-full bg-transparent border-b border-border/40 text-sm py-2.5 placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary transition-colors';
  const labelCls = 'block text-xs font-semibold text-muted-foreground mb-0.5';

  /* ─────────────────────────── CREATE FLOW ─────────────────────────── */
  if (showCreate || medias.length === 0) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 md:py-24">
        <div className="mb-10">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground">
            Créez votre Média
          </h1>
          <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
            Un journal, une revue, un collectif. Invitez une équipe, définissez des rôles et lancez
            votre sous-domaine.
          </p>
        </div>

        <div className="flex items-center gap-5 mb-8">
          {createLogo ? (
            <Image
              src={createLogo}
              alt=""
              width={64}
              height={64}
              className="size-16 rounded-xl object-cover border border-border/40"
            />
          ) : (
            <div className="size-16 rounded-xl bg-card border border-border/40 flex items-center justify-center text-primary">
              <Building2 className="w-6 h-6" strokeWidth={1.5} />
            </div>
          )}
          <div className="min-w-0">
            <p className="font-bold text-lg tracking-tight truncate">
              {createName || 'Votre Média'}
            </p>
            <p className="text-xs text-muted-foreground">
              {createSlug ? `${createSlug}.qoe.fi` : 'votre-sous-domaine.qoe.fi'}
            </p>
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleCreate();
          }}
          className="space-y-6"
        >
          <div>
            <label className={labelCls}>Nom du Média</label>
            <input
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder="Ex: La Gazette de la Souveraineté"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Permalien</label>
            <div className="flex items-center border-b border-border/40 focus-within:border-primary transition-colors">
              <span className="text-sm text-muted-foreground">qoe.fi/</span>
              <input
                value={createSlug}
                onChange={(e) => setCreateSlug(e.target.value)}
                placeholder="gazette-souverainete"
                className="w-full bg-transparent text-sm py-2.5 focus:outline-none"
              />
            </div>
          </div>
          <div>
            <label className={labelCls}>Bio / Présentation</label>
            <textarea
              value={createBio}
              onChange={(e) => setCreateBio(e.target.value)}
              rows={2}
              placeholder="Décrivez la ligne éditoriale du média..."
              className={cn(inputCls, 'resize-none')}
            />
          </div>
          <div>
            <label className={labelCls}>Logo</label>
            <ImageUploader
              value={createLogo}
              onChange={setCreateLogo}
              upload={(file) =>
                uploadImageToRoute(file, '/api/articles/upload', IMAGE_FOLDERS.avatars)
              }
              aspect={1}
              shape="rounded"
              maxDimension={512}
            />
          </div>

          <button
            type="submit"
            disabled={creating}
            className="w-full py-3 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
          >
            {creating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                Créer le Média & mon espace de travail
                <ArrowRight className="w-4 h-4" strokeWidth={1.5} />
              </>
            )}
          </button>
        </form>
      </div>
    );
  }

  if (loadingDetail && !detail) {
    return (
      <div className="flex items-center justify-center py-32 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Chargement du studio...
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="py-24 text-center">
        <div className="size-14 rounded-xl bg-card border border-border/40 text-primary flex items-center justify-center mx-auto mb-5">
          <Building2 className="w-6 h-6" strokeWidth={1.5} />
        </div>
        <h3 className="text-xl font-bold tracking-tight">Aucun Média</h3>
        <p className="text-sm text-muted-foreground mt-1 mb-6 max-w-sm mx-auto">
          Créez votre premier média pour inviter une équipe et lancer votre sous-domaine.
        </p>
        <button
          onClick={() => router.push('/media?create=1')}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold cursor-pointer hover:opacity-90 transition-all"
        >
          <Plus className="w-4 h-4" strokeWidth={1.5} />
          Créer un Média
        </button>
      </div>
    );
  }

  const myRoleMeta = ROLE_META[myRole || 'writer'] || ROLE_META.writer;
  const MyRoleIcon = myRoleMeta.icon;
  const domain = detail.publication.subdomain
    ? `${detail.publication.subdomain}.qoe.fi`
    : `qoe.fi/${detail.publication.slug}`;

  return (
    <div className="mx-auto max-w-5xl px-4 md:px-6 py-6 text-foreground font-sans">
      {/* ── Hero ── */}
      <div className="mb-8">
        {detail.publication.headerImageUrl && (
          <div className="relative h-36 md:h-44 -mx-4 md:-mx-6 -mt-6 overflow-hidden rounded-b-2xl">
            <Image src={detail.publication.headerImageUrl} alt="" fill className="object-cover" />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent to-background" />
          </div>
        )}
        <div className={cn('flex items-start gap-4', detail.publication.headerImageUrl && 'mt-4')}>
          {detail.publication.logoUrl ? (
            <Image
              src={detail.publication.logoUrl}
              alt=""
              width={64}
              height={64}
              className="size-16 rounded-xl object-cover border border-border/40 shrink-0"
            />
          ) : (
            <div className="size-16 rounded-xl bg-card border border-border/40 flex items-center justify-center text-primary shrink-0">
              <Building2 className="w-7 h-7" strokeWidth={1.5} />
            </div>
          )}
          <div className="min-w-0 pt-0.5">
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight truncate">
              {detail.publication.name}
            </h1>
            <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
              <Globe className="w-3.5 h-3.5" strokeWidth={1.5} />
              <span className="font-medium text-foreground/80">{domain}</span>
              <span className="text-border">•</span>
              <span className={cn('flex items-center gap-1 font-medium', myRoleMeta.color)}>
                <MyRoleIcon className="w-3.5 h-3.5" strokeWidth={1.5} />
                {myRoleMeta.label}
              </span>
            </div>
            {detail.publication.bio && (
              <p className="text-sm text-muted-foreground mt-3 max-w-2xl leading-relaxed">
                {detail.publication.bio}
              </p>
            )}
          </div>
        </div>

        {/* Stats — hairline separated */}
        <div className="flex items-center gap-6 mt-6 text-sm">
          <span className="flex items-baseline gap-1.5">
            <span className="font-bold tabular-nums">{detail.members.length}</span>
            <span className="text-xs text-muted-foreground">membres</span>
          </span>
          <span className="h-3 w-px bg-border/60" />
          <span className="flex items-baseline gap-1.5">
            <span className="font-bold tabular-nums">{detail.invites.length}</span>
            <span className="text-xs text-muted-foreground">invitations en cours</span>
          </span>
          <span className="h-3 w-px bg-border/60" />
          <span className="flex items-baseline gap-1.5">
            <span className="font-bold tabular-nums">{detail.publication._count.articles}</span>
            <span className="text-xs text-muted-foreground">articles</span>
          </span>
        </div>
      </div>

      {/* ── Workspace switcher (subtle) ── */}
      <div className="flex items-center gap-1 mb-6 overflow-x-auto">
        {medias.map((m) => {
          const active = selectedMediaId === m.id;
          return (
            <button
              key={m.id}
              onClick={() => {
                setSelectedMediaId(m.id);
                setTab('members');
              }}
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors cursor-pointer',
                active
                  ? 'bg-muted/60 text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
              )}
            >
              <QuietDot active={active} />
              {m.logoUrl ? (
                <Image
                  src={m.logoUrl}
                  alt=""
                  width={16}
                  height={16}
                  className="rounded object-cover"
                />
              ) : (
                <Building2 className="w-3.5 h-3.5" strokeWidth={1.5} />
              )}
              <span>{m.name}</span>
            </button>
          );
        })}
        <button
          onClick={() => router.push('/media?create=1')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-primary transition-colors cursor-pointer whitespace-nowrap"
        >
          <Plus className="w-3.5 h-3.5" strokeWidth={1.5} />
          Nouveau
        </button>
      </div>

      {/* ── Tabs (clean segmented) ── */}
      <div className="flex items-center gap-1 border-b border-border/40 mb-6">
        {TABS.map((tabItem) => {
          const active = tab === tabItem.key;
          return (
            <button
              key={tabItem.key}
              onClick={() => setTab(tabItem.key)}
              className={cn(
                'flex items-center gap-2 px-3 py-2.5 -mb-px border-b-2 text-xs font-semibold transition-colors cursor-pointer',
                active
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              <tabItem.icon className="w-3.5 h-3.5" strokeWidth={1.5} />
              {tabItem.label}
              {tabItem.key === 'invites' && detail.invites.length > 0 && (
                <span className="text-[10px] font-bold text-primary">{detail.invites.length}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Members ── */}
      {tab === 'members' && (
        <div className="divide-y divide-border/30">
          {detail.members.map((member) => {
            const roleMeta = ROLE_META[member.role] || ROLE_META.writer;
            const RoleIcon = roleMeta.icon;
            const perms = effectivePerms(member);
            return (
              <div key={member.id} className="group flex items-center gap-3 py-3.5">
                {member.user.logoUrl ? (
                  <Image
                    src={member.user.logoUrl}
                    alt=""
                    width={36}
                    height={36}
                    className="size-9 rounded-full object-cover border border-border/40 shrink-0"
                  />
                ) : (
                  <div className="size-9 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground shrink-0">
                    {(member.user.name || member.user.username || '?').slice(0, 2).toUpperCase()}
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground truncate">
                      {member.user.name || member.user.username || 'Inconnu'}
                    </span>
                    <span
                      className={cn(
                        'flex items-center gap-1 text-[11px] font-medium',
                        roleMeta.color
                      )}
                    >
                      <RoleIcon className="w-3 h-3" strokeWidth={1.5} />
                      {roleMeta.label}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                    {perms.slice(0, 3).map((perm) => (
                      <span key={perm} className="text-[11px] text-muted-foreground">
                        {PERMISSION_LABELS[perm] || perm}
                      </span>
                    ))}
                    {perms.length > 3 && (
                      <span className="text-[11px] text-muted-foreground">+{perms.length - 3}</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  {isOwner && member.role !== MEDIA_ROLES.OWNER && (
                    <PermissionPopover
                      member={member}
                      perms={perms}
                      onToggle={handlePermissionsChange}
                    />
                  )}
                  {canManageMembers && member.role !== MEDIA_ROLES.OWNER && (
                    <>
                      <select
                        value={member.role}
                        onChange={(e) => handleRoleChange(member.user.id, e.target.value)}
                        className="text-xs font-medium bg-transparent border border-border/30 rounded-lg px-2 py-1.5 cursor-pointer focus:outline-none focus:border-primary/50"
                      >
                        {Object.keys(ROLE_META)
                          .filter((r) => r !== MEDIA_ROLES.OWNER)
                          .map((r) => (
                            <option key={r} value={r}>
                              {ROLE_META[r].label}
                            </option>
                          ))}
                      </select>
                      <button
                        onClick={() =>
                          handleRemoveMember(
                            member.user.id,
                            member.user.name || member.user.username || 'ce membre'
                          )
                        }
                        className="p-1.5 text-muted-foreground hover:text-destructive rounded-lg transition-colors cursor-pointer"
                        title="Retirer du Média"
                      >
                        <Trash2 className="w-4 h-4" strokeWidth={1.5} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}

          {!canManageMembers && (
            <p className="text-xs text-muted-foreground py-4">
              Vous êtes{' '}
              <strong className="capitalize">{ROLE_META[myRole || 'writer']?.label}</strong> de ce
              Média — seuls les propriétaires et éditeurs peuvent gérer l'équipe.
            </p>
          )}
        </div>
      )}

      {/* ── Invites ── */}
      {tab === 'invites' && (
        <div className="space-y-8">
          {canManageMembers && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleInvite();
              }}
              className="flex flex-col sm:flex-row gap-3"
            >
              <div className="flex-1 relative">
                <Mail
                  className="w-4 h-4 text-muted-foreground absolute left-0 top-1/2 -translate-y-1/2"
                  strokeWidth={1.5}
                />
                <input
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="email@createur.com"
                  type="email"
                  className="w-full pl-7 bg-transparent border-b border-border/40 text-sm py-2.5 placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary transition-colors"
                />
              </div>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
                className="px-3 py-2.5 bg-transparent border-b border-border/40 text-sm font-medium cursor-pointer focus:outline-none focus:border-primary transition-colors"
              >
                {Object.keys(ROLE_META)
                  .filter((r) => r !== MEDIA_ROLES.OWNER)
                  .map((r) => (
                    <option key={r} value={r}>
                      {ROLE_META[r].label}
                    </option>
                  ))}
              </select>
              <button
                type="submit"
                disabled={inviting}
                className="px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
              >
                {inviting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <UserPlus className="w-4 h-4" strokeWidth={1.5} />
                )}
                Inviter
              </button>
            </form>
          )}

          {/* Pending invites list */}
          {detail.invites.length > 0 && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
                Invitations en attente
              </p>
              <div className="divide-y divide-border/30">
                {detail.invites.map((invite) => {
                  const meta = ROLE_META[invite.role] || ROLE_META.writer;
                  const Icon = meta.icon;
                  return (
                    <div key={invite.id} className="flex items-center gap-3 py-3">
                      <div className="size-9 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground shrink-0">
                        <Mail className="w-4 h-4" strokeWidth={1.5} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{invite.email}</p>
                        <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3" strokeWidth={1.5} />
                          envoyée le {formatDate(invite.createdAt)} · expire le{' '}
                          {formatDate(invite.expiresAt)}
                        </p>
                      </div>
                      <span
                        className={cn(
                          'flex items-center gap-1 text-[11px] font-medium shrink-0',
                          meta.color
                        )}
                      >
                        <Icon className="w-3 h-3" strokeWidth={1.5} />
                        {meta.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Role explainer */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
              <Shield className="w-3.5 h-3.5" strokeWidth={1.5} /> Ce que chaque rôle peut faire
            </p>
            <div className="grid md:grid-cols-3 gap-px bg-border/30 border border-border/30 rounded-xl overflow-hidden">
              {Object.entries(ROLE_DEFAULT_PERMS)
                .filter(([r]) => r !== MEDIA_ROLES.OWNER)
                .map(([role, perms]) => {
                  const meta = ROLE_META[role];
                  const Icon = meta.icon;
                  return (
                    <div key={role} className="bg-card p-4">
                      <div
                        className={cn(
                          'flex items-center gap-1.5 text-xs font-bold mb-3',
                          meta.color
                        )}
                      >
                        <Icon className="w-3.5 h-3.5" strokeWidth={1.5} />
                        {meta.label}
                      </div>
                      <ul className="space-y-1.5">
                        {perms.map((p) => (
                          <li
                            key={p}
                            className="text-[11px] text-muted-foreground flex items-start gap-1.5"
                          >
                            <Check
                              className="w-3 h-3 text-success mt-0.5 shrink-0"
                              strokeWidth={1.5}
                            />
                            {PERMISSION_LABELS[p] || p}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
            </div>
            <p className="text-[11px] text-muted-foreground mt-4">
              Le propriétaire peut affiner les permissions de chaque membre (bouton{' '}
              <Shield className="w-3 h-3 inline" strokeWidth={1.5} /> dans la liste des membres)
              pour un contrôle granulaire complet.
            </p>
          </div>
        </div>
      )}

      {/* ── Settings ── */}
      {tab === 'settings' && (
        <MediaSettingsForm
          mediaId={detail.id}
          publication={detail.publication}
          onSaved={() => loadDetail(detail.id)}
        />
      )}
    </div>
  );
}

function PermissionPopover({
  member,
  perms,
  onToggle,
}: {
  member: MediaDetail['members'][number];
  perms: string[];
  onToggle: (memberUserId: string, permission: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors cursor-pointer"
      >
        <Shield className="w-3 h-3" strokeWidth={1.5} /> Permissions
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 z-20 w-64 rounded-xl bg-card border border-border/40 shadow-xl p-3 space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-1 pb-1">
              Permissions de {member.user.name || member.user.username}
            </p>
            {ALL_MEDIA_PERMISSIONS.map((perm) => (
              <label
                key={perm}
                className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-muted/40 text-[11px] font-medium cursor-pointer transition-colors"
              >
                <input
                  type="checkbox"
                  checked={perms.includes(perm)}
                  onChange={() => onToggle(member.user.id, perm)}
                  className="accent-[var(--primary)] cursor-pointer"
                />
                {PERMISSION_LABELS[perm] || perm}
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function MediaSettingsForm({
  mediaId,
  publication,
  onSaved,
}: {
  mediaId: string;
  publication: MediaDetail['publication'];
  onSaved: () => void;
}) {
  const [form, setForm] = useState({ ...publication });
  const [saving, setSaving] = useState(false);

  const set = (key: string, value: unknown) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    setSaving(true);
    const res = await updateMediaSettingsAction(mediaId, {
      name: form.name,
      bio: form.bio ?? null,
      logoUrl: form.logoUrl ?? null,
      subdomain: form.subdomain ?? null,
      customDomain: form.customDomain ?? null,
      heroText: form.heroText ?? null,
      headerImageUrl: form.headerImageUrl ?? null,
      footerText: form.footerText ?? null,
      accentColor: form.accentColor ?? null,
      themeMode: form.themeMode ?? null,
      layoutStyle: form.layoutStyle ?? null,
      seoTitle: form.seoTitle ?? null,
      seoDescription: form.seoDescription ?? null,
      allowIndexing: form.allowIndexing,
      fontFamily: form.fontFamily ?? null,
      supportUrl: form.supportUrl ?? null,
    });
    setSaving(false);
    if (res.success) {
      toast.success('Réglages du Média enregistrés !');
      onSaved();
    } else {
      toast.error(res.error || 'Erreur');
    }
  };

  const inputCls =
    'w-full bg-transparent border-b border-border/40 text-sm py-2.5 placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary transition-colors';
  const labelCls = 'block text-xs font-semibold text-muted-foreground mb-0.5';

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <section className="py-6 border-b border-border/30 last:border-b-0">
      <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-5">
        {title}
      </h3>
      {children}
    </section>
  );

  return (
    <div className="max-w-3xl">
      <Section title="Identité & Marque">
        <div className="grid md:grid-cols-2 gap-x-8 gap-y-6">
          <div>
            <label className={labelCls}>Nom du Média</label>
            <input
              className={inputCls}
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>Couleur d'accent</label>
            <input
              className={inputCls}
              value={form.accentColor ?? ''}
              onChange={(e) => set('accentColor', e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>Police</label>
            <select
              className={cn(inputCls, 'cursor-pointer')}
              value={form.fontFamily ?? 'sans'}
              onChange={(e) => set('fontFamily', e.target.value)}
            >
              <option value="sans">Inter (Sans-serif)</option>
              <option value="outfit">Outfit (Moderne)</option>
              <option value="space-grotesk">Space Grotesk (Tech)</option>
              <option value="serif">Playfair Display (Serif)</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Bio / Présentation</label>
            <textarea
              className={cn(inputCls, 'resize-none')}
              rows={2}
              value={form.bio ?? ''}
              onChange={(e) => set('bio', e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>Logo</label>
            <ImageUploader
              value={form.logoUrl}
              onChange={(url) => set('logoUrl', url)}
              upload={(file) =>
                uploadImageToRoute(file, '/api/articles/upload', IMAGE_FOLDERS.avatars)
              }
              aspect={1}
              shape="circle"
              maxDimension={512}
            />
          </div>
        </div>
      </Section>

      <Section title="Domaine & Web">
        <div className="grid md:grid-cols-2 gap-x-8 gap-y-6">
          <div>
            <label className={labelCls}>Sous-domaine</label>
            <div className="flex items-center border-b border-border/40 focus-within:border-primary transition-colors">
              <input
                className="w-full bg-transparent text-sm py-2.5 focus:outline-none"
                value={form.subdomain ?? ''}
                onChange={(e) => set('subdomain', e.target.value)}
                placeholder="mon-media"
              />
              <span className="text-xs text-muted-foreground whitespace-nowrap">.qoe.fi</span>
            </div>
          </div>
          <div>
            <label className={labelCls}>Domaine personnalisé</label>
            <input
              className={inputCls}
              value={form.customDomain ?? ''}
              onChange={(e) => set('customDomain', e.target.value)}
              placeholder="monmedia.com"
            />
          </div>
          <div>
            <label className={labelCls}>Texte de footer</label>
            <input
              className={inputCls}
              value={form.footerText ?? ''}
              onChange={(e) => set('footerText', e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>Image d'en-tête</label>
            <ImageUploader
              value={form.headerImageUrl}
              onChange={(url) => set('headerImageUrl', url)}
              upload={(file) =>
                uploadImageToRoute(file, '/api/articles/upload', IMAGE_FOLDERS.banners)
              }
              aspect={21 / 9}
              shape="banner"
            />
          </div>
        </div>
      </Section>

      <Section title="SEO & Indexation">
        <div className="grid md:grid-cols-2 gap-x-8 gap-y-6">
          <div>
            <label className={labelCls}>SEO Title</label>
            <input
              className={inputCls}
              value={form.seoTitle ?? ''}
              onChange={(e) => set('seoTitle', e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>SEO Description</label>
            <input
              className={inputCls}
              value={form.seoDescription ?? ''}
              onChange={(e) => set('seoDescription', e.target.value)}
            />
          </div>
          <div className="md:col-span-2">
            <label className={labelCls}>Hero Text (accroche de la page d'accueil)</label>
            <textarea
              className={cn(inputCls, 'resize-none')}
              rows={2}
              value={form.heroText ?? ''}
              onChange={(e) => set('heroText', e.target.value)}
            />
          </div>
          <div className="md:col-span-2">
            <button
              onClick={() => set('allowIndexing', !form.allowIndexing)}
              className="flex items-center gap-3 text-sm font-semibold cursor-pointer"
            >
              <QuietDot active={form.allowIndexing} />
              {form.allowIndexing ? 'Indexation Google autorisée' : 'Indexation Google désactivée'}
            </button>
          </div>
        </div>
      </Section>

      <button
        onClick={handleSave}
        disabled={saving}
        className="mt-8 px-6 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
      >
        {saving ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <FileText className="w-4 h-4" strokeWidth={1.5} />
        )}
        Enregistrer les réglages
      </button>
    </div>
  );
}
