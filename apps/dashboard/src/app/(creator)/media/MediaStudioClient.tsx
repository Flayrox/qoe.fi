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
  Sparkles,
  ArrowRight,
  Rocket,
} from 'lucide-react';
import { toast } from 'sonner';
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
  };
  members: Array<{
    id: string;
    role: string;
    permissions: string[];
    status: string;
    joinedAt: string;
    user: { id: string; name: string | null; username: string | null; logoUrl: string | null };
  }>;
}

const ROLE_META: Record<
  string,
  { label: string; color: string; icon: React.ComponentType<{ className?: string }> }
> = {
  owner: {
    label: 'Propriétaire',
    color: 'text-primary bg-primary/10 border-primary/20',
    icon: Crown,
  },
  editor: {
    label: 'Éditeur',
    color: 'text-highlight bg-highlight/10 border-highlight/20',
    icon: ShieldCheck,
  },
  writer: {
    label: 'Rédacteur',
    color: 'text-foreground bg-muted/60 border-border/30',
    icon: PenLine,
  },
  viewer: {
    label: 'Lecteur',
    color: 'text-muted-foreground bg-muted/30 border-border/30',
    icon: Eye,
  },
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

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-8 text-foreground font-sans">
      {/* ─────────────────────────── CREATE FLOW ─────────────────────────── */}
      {showCreate || medias.length === 0 ? (
        <div className="mx-auto max-w-4xl">
          <div className="mb-8 text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold mb-4">
              <Rocket className="w-3.5 h-3.5" />
              Lancement en 3 minutes
            </div>
            <h1 className="text-3xl md:text-5xl font-bold tracking-tight mb-3">
              Créez votre{' '}
              <span className="bg-gradient-to-r from-primary to-highlight bg-clip-text text-transparent">
                Média
              </span>
            </h1>
            <p className="text-muted-foreground text-base max-w-xl mx-auto">
              Un journal, une revue, un collectif. Invitez une équipe de créateurs, définissez des
              rôles et lancez votre sous-domaine.
            </p>
          </div>

          <div className="bg-card border border-border/40 rounded-3xl shadow-sm overflow-hidden">
            {/* Banner */}
            <div className="h-24 bg-gradient-to-br from-primary/15 via-card to-card relative overflow-hidden">
              <div className="absolute -top-16 -right-10 w-56 h-56 rounded-full bg-primary/10 blur-3xl" />
              <div className="absolute bottom-3 left-6 flex items-center gap-3">
                <div className="w-14 h-14 rounded-2xl bg-card border border-border/40 shadow-sm flex items-center justify-center text-primary overflow-hidden">
                  {createLogo ? (
                    <Image
                      src={createLogo}
                      alt=""
                      width={56}
                      height={56}
                      className="object-cover w-full h-full"
                    />
                  ) : (
                    <Building2 className="w-6 h-6" />
                  )}
                </div>
                <div>
                  <p className="font-bold text-lg leading-tight">{createName || 'Votre Média'}</p>
                  <p className="text-xs text-muted-foreground">
                    {createSlug ? `${createSlug}.qoe.fi` : 'votre-sous-domaine.qoe.fi'}
                  </p>
                </div>
              </div>
            </div>

            <div className="p-6 md:p-8 space-y-6">
              <div className="grid md:grid-cols-2 gap-5">
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-muted-foreground">
                    Nom du Média
                  </label>
                  <input
                    value={createName}
                    onChange={(e) => setCreateName(e.target.value)}
                    placeholder="Ex: La Gazette de la Souveraineté"
                    className="w-full px-4 py-3 bg-muted/20 border border-border/30 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition-shadow"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-muted-foreground">
                    Permalien
                  </label>
                  <div className="flex items-center gap-2 px-4 py-3 bg-muted/20 border border-border/30 rounded-xl focus-within:ring-2 focus-within:ring-primary/40 transition-shadow">
                    <span className="text-sm text-muted-foreground whitespace-nowrap">qoe.fi/</span>
                    <input
                      value={createSlug}
                      onChange={(e) => setCreateSlug(e.target.value)}
                      placeholder="gazette-souverainete"
                      className="w-full bg-transparent text-sm focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-muted-foreground">
                  Bio / Présentation
                </label>
                <textarea
                  value={createBio}
                  onChange={(e) => setCreateBio(e.target.value)}
                  rows={3}
                  placeholder="Décrivez la ligne éditoriale du média..."
                  className="w-full px-4 py-3 bg-muted/20 border border-border/30 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition-shadow resize-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-muted-foreground">Logo</label>
                <ImageUploader
                  value={createLogo}
                  onChange={setCreateLogo}
                  upload={(file) =>
                    uploadImageToRoute(file, '/api/articles/upload', IMAGE_FOLDERS.avatars)
                  }
                  aspect={1}
                  shape="circle"
                  maxDimension={512}
                />
              </div>

              <button
                onClick={handleCreate}
                disabled={creating}
                className="w-full py-4 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:opacity-90 active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 shadow-sm"
              >
                {creating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Créer le Média & mon espace de travail
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      ) : loadingDetail && !detail ? (
        <div className="flex items-center justify-center py-32 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Chargement du studio...
        </div>
      ) : detail ? (
        <div className="space-y-6">
          {/* ── Workspace chips ── */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mr-1">
              Espaces :
            </span>
            {medias.map((m) => {
              const roleMeta = ROLE_META[m.role] || ROLE_META.writer;
              const RoleIcon = roleMeta.icon;
              const active = selectedMediaId === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => {
                    setSelectedMediaId(m.id);
                    setTab('members');
                  }}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold transition-all cursor-pointer',
                    active
                      ? 'bg-card border-primary/40 shadow-sm text-foreground'
                      : 'bg-transparent border-border/30 text-muted-foreground hover:bg-card hover:text-foreground'
                  )}
                >
                  {m.logoUrl ? (
                    <Image
                      src={m.logoUrl}
                      alt=""
                      width={18}
                      height={18}
                      className="rounded-md object-cover"
                    />
                  ) : (
                    <Building2 className="w-3.5 h-3.5" />
                  )}
                  <span>{m.name}</span>
                  <RoleIcon className={cn('w-3 h-3', roleMeta.color.split(' ')[0])} />
                </button>
              );
            })}
            <button
              onClick={() => router.push('/media?create=1')}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-dashed border-border/40 text-xs font-semibold text-muted-foreground hover:text-primary hover:border-primary/40 transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Nouveau
            </button>
          </div>

          {/* ── Hero card ── */}
          <div className="relative overflow-hidden bg-card border border-border/40 rounded-3xl shadow-sm">
            <div className="h-28 bg-gradient-to-br from-primary/15 via-card to-card relative">
              {detail.publication.headerImageUrl && (
                <Image
                  src={detail.publication.headerImageUrl}
                  alt=""
                  fill
                  className="object-cover opacity-40"
                />
              )}
              <div className="absolute -bottom-10 left-8 w-44 h-44 bg-primary/10 blur-3xl rounded-full" />
            </div>
            <div className="px-6 md:px-8 pb-6 -mt-10 relative">
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div className="flex items-end gap-4">
                  <div className="w-20 h-20 rounded-2xl bg-card border border-border/40 shadow-sm ring-4 ring-background overflow-hidden shrink-0">
                    {detail.publication.logoUrl ? (
                      <Image
                        src={detail.publication.logoUrl}
                        alt=""
                        width={80}
                        height={80}
                        className="object-cover w-full h-full"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-primary">
                        <Building2 className="w-8 h-8" />
                      </div>
                    )}
                  </div>
                  <div className="pb-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-2xl font-bold tracking-tight">
                        {detail.publication.name}
                      </h2>
                      {isOwner && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 text-[10px] font-bold">
                          <Crown className="w-3 h-3" /> Owner
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                      <Globe className="w-3.5 h-3.5" />
                      <span className="font-medium text-foreground/80">
                        {detail.publication.subdomain
                          ? `${detail.publication.subdomain}.qoe.fi`
                          : `qoe.fi/${detail.publication.slug}`}
                      </span>
                      <span className="text-border">•</span>
                      <span className="capitalize">{ROLE_META[myRole || 'writer']?.label}</span>
                    </div>
                  </div>
                </div>
              </div>

              {detail.publication.bio && (
                <p className="text-sm text-muted-foreground mt-4 max-w-2xl leading-relaxed">
                  {detail.publication.bio}
                </p>
              )}

              {/* Stats */}
              <div className="flex flex-wrap gap-3 mt-6">
                <StatChip
                  icon={<Users className="w-3.5 h-3.5" />}
                  label="Membres"
                  value={detail.members.length}
                />
                <StatChip
                  icon={<Mail className="w-3.5 h-3.5" />}
                  label="Invitations en cours"
                  value={0}
                />
                <StatChip icon={<PenLine className="w-3.5 h-3.5" />} label="Articles" value={0} />
              </div>
            </div>
          </div>

          {/* ── Tabs (segmented) ── */}
          <div className="flex gap-1 p-1 rounded-2xl bg-muted/30 border border-border/30 w-fit">
            {(
              [
                { key: 'members', label: 'Membres', icon: Users },
                { key: 'invites', label: 'Invitations', icon: Mail },
                { key: 'settings', label: 'Réglages', icon: Settings },
              ] as const
            ).map((tabItem) => (
              <button
                key={tabItem.key}
                onClick={() => setTab(tabItem.key)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer',
                  tab === tabItem.key
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <tabItem.icon className="w-3.5 h-3.5" />
                {tabItem.label}
              </button>
            ))}
          </div>

          {/* ── Members ── */}
          {tab === 'members' && (
            <div className="grid gap-3">
              {detail.members.map((member) => {
                const roleMeta = ROLE_META[member.role] || ROLE_META.writer;
                const RoleIcon = roleMeta.icon;
                const perms = effectivePerms(member);
                return (
                  <div
                    key={member.id}
                    className="group bg-card border border-border/40 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center gap-4 hover:border-border/70 transition-colors"
                  >
                    {member.user.logoUrl ? (
                      <div className="w-11 h-11 rounded-full overflow-hidden border border-border/40 shrink-0">
                        <Image
                          src={member.user.logoUrl}
                          alt=""
                          width={44}
                          height={44}
                          className="object-cover w-full h-full"
                        />
                      </div>
                    ) : (
                      <div className="w-11 h-11 rounded-full bg-gradient-to-br from-primary/15 to-muted flex items-center justify-center text-xs font-bold shrink-0">
                        {(member.user.name || member.user.username || '?')
                          .slice(0, 2)
                          .toUpperCase()}
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">
                          {member.user.name || member.user.username || 'Inconnu'}
                        </span>
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border',
                            roleMeta.color
                          )}
                        >
                          <RoleIcon className="w-3 h-3" />
                          {roleMeta.label}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {perms.slice(0, 4).map((perm) => (
                          <span
                            key={perm}
                            className="px-2 py-0.5 rounded-md bg-muted/50 border border-border/20 text-[10px] text-muted-foreground"
                          >
                            {PERMISSION_LABELS[perm] || perm}
                          </span>
                        ))}
                        {perms.length > 4 && (
                          <span className="px-2 py-0.5 rounded-md text-[10px] text-muted-foreground">
                            +{perms.length - 4}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 sm:ml-auto">
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
                            className="text-xs font-semibold bg-muted/30 border border-border/30 rounded-lg px-2.5 py-2 cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary/50"
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
                            className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors cursor-pointer"
                            title="Retirer du Média"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}

              {!canManageMembers && (
                <p className="text-xs text-muted-foreground bg-muted/20 border border-border/30 rounded-xl p-3">
                  Vous êtes{' '}
                  <strong className="capitalize">{ROLE_META[myRole || 'writer']?.label}</strong> de
                  ce Média — seuls les propriétaires et éditeurs peuvent gérer l'équipe.
                </p>
              )}
            </div>
          )}

          {/* ── Invites ── */}
          {tab === 'invites' && (
            <div className="space-y-6">
              {canManageMembers && (
                <div className="bg-card border border-border/40 rounded-3xl p-6 md:p-8 shadow-sm">
                  <h3 className="text-lg font-bold tracking-tight">Inviter un créateur</h3>
                  <p className="text-sm text-muted-foreground mt-1 mb-6">
                    Il recevra une notification et pourra rejoindre le Média en un clic.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="flex-1 relative">
                      <Mail className="w-4 h-4 text-muted-foreground absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        placeholder="email@createur.com"
                        type="email"
                        className="w-full pl-10 pr-4 py-3 bg-muted/20 border border-border/30 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition-shadow"
                      />
                    </div>
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value)}
                      className="px-4 py-3 bg-muted/20 border border-border/30 rounded-xl text-sm font-semibold cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/40"
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
                      onClick={handleInvite}
                      disabled={inviting}
                      className="px-6 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 shadow-sm"
                    >
                      {inviting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <UserPlus className="w-4 h-4" />
                      )}
                      Inviter
                    </button>
                  </div>
                </div>
              )}

              {/* Role explainer */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                  <Shield className="w-3.5 h-3.5" /> Ce que chaque rôle peut faire
                </h4>
                <div className="grid md:grid-cols-3 gap-3">
                  {Object.entries(ROLE_DEFAULT_PERMS)
                    .filter(([r]) => r !== MEDIA_ROLES.OWNER)
                    .map(([role, perms]) => {
                      const meta = ROLE_META[role];
                      const Icon = meta.icon;
                      return (
                        <div
                          key={role}
                          className="rounded-2xl bg-card border border-border/40 p-4 hover:border-border/70 transition-colors"
                        >
                          <div className="flex items-center gap-2 mb-3">
                            <span
                              className={cn(
                                'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold border',
                                meta.color
                              )}
                            >
                              <Icon className="w-3 h-3" />
                              {meta.label}
                            </span>
                          </div>
                          <ul className="space-y-1.5">
                            {perms.map((p) => (
                              <li
                                key={p}
                                className="text-[11px] text-muted-foreground flex items-start gap-1.5"
                              >
                                <Check className="w-3 h-3 text-success mt-0.5 shrink-0" />
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
                  <Shield className="w-3 h-3 inline" /> dans la liste des membres) pour un contrôle
                  granulaire complet.
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
      ) : (
        <div className="bg-card border border-border/40 rounded-3xl p-16 text-center">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-5">
            <Building2 className="w-6 h-6" />
          </div>
          <h3 className="text-xl font-bold tracking-tight">Aucun Média</h3>
          <p className="text-sm text-muted-foreground mt-1 mb-6 max-w-sm mx-auto">
            Créez votre premier média pour inviter une équipe et lancer votre sous-domaine.
          </p>
          <button
            onClick={() => router.push('/media?create=1')}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold cursor-pointer hover:opacity-90 transition-all"
          >
            <Plus className="w-4 h-4" />
            Créer un Média
          </button>
        </div>
      )}
    </div>
  );
}

function StatChip({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-muted/30 border border-border/30">
      <span className="text-primary">{icon}</span>
      <span className="text-sm font-bold">{value}</span>
      <span className="text-[11px] text-muted-foreground">{label}</span>
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
        className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-muted/30 border border-border/30 text-[10px] font-semibold hover:bg-muted/50 transition-colors cursor-pointer"
      >
        <Shield className="w-3 h-3" /> Permissions
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 z-20 w-64 rounded-2xl bg-card border border-border/40 shadow-xl p-3 space-y-1 animate-in fade-in slide-in-from-top-2">
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
    'w-full px-4 py-2.5 bg-muted/20 border border-border/30 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition-shadow';
  const labelCls = 'block text-xs font-semibold text-muted-foreground mb-1.5';

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="bg-card border border-border/40 rounded-3xl p-6 md:p-8 shadow-sm">
      <h3 className="font-bold tracking-tight mb-5">{title}</h3>
      {children}
    </div>
  );

  return (
    <div className="space-y-6">
      <Section title="Identité & Marque">
        <div className="grid md:grid-cols-2 gap-5">
          <div>
            <label className={labelCls}>Nom du Média</label>
            <input
              className={inputCls}
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
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
          <div>
            <label className={labelCls}>Bio / Présentation</label>
            <textarea
              className={cn(inputCls, 'resize-none')}
              rows={3}
              value={form.bio ?? ''}
              onChange={(e) => set('bio', e.target.value)}
            />
          </div>
          <div className="space-y-5">
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
          </div>
        </div>
      </Section>

      <Section title="Domaine & Web">
        <div className="grid md:grid-cols-2 gap-5">
          <div>
            <label className={labelCls}>Sous-domaine</label>
            <div className="flex items-center gap-2">
              <input
                className={inputCls}
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
          <div>
            <label className={labelCls}>Texte de footer</label>
            <input
              className={inputCls}
              value={form.footerText ?? ''}
              onChange={(e) => set('footerText', e.target.value)}
            />
          </div>
        </div>
      </Section>

      <Section title="SEO & Indexation">
        <div className="grid md:grid-cols-2 gap-5">
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
              <span
                className={cn(
                  'rounded-full transition-colors relative shrink-0',
                  form.allowIndexing ? 'bg-success' : 'bg-muted'
                )}
                style={{ width: 40, height: 22 }}
              >
                <span
                  className={cn(
                    'absolute top-[2px] rounded-full bg-white transition-all',
                    form.allowIndexing ? 'left-[20px]' : 'left-[2px]'
                  )}
                  style={{ width: 18, height: 18 }}
                />
              </span>
              {form.allowIndexing ? 'Indexation Google autorisée' : 'Indexation Google désactivée'}
            </button>
          </div>
        </div>
      </Section>

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full py-4 rounded-2xl bg-primary text-primary-foreground font-bold text-sm hover:opacity-90 active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 shadow-sm"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
        Enregistrer les réglages
      </button>
    </div>
  );
}
