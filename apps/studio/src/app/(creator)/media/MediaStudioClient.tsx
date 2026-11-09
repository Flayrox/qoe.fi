'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { t } from '@lingui/core/macro';
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
  Key,
  Link2,
  Copy,
  Search,
  History,
  X,
} from 'lucide-react';
import { SafeAvatar } from '@qoe/ui';
import { Badge } from '@qoe/ui/badge';
import { Button } from '@qoe/ui/button';
import { Checkbox } from '@qoe/ui/checkbox';
import { Input, InputGroup, Textarea } from '@qoe/ui/input';
import { Switch } from '@qoe/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  TablePersonCell,
  sortRows,
  type SortDescriptorLike,
  type SortSpec,
} from '@qoe/ui/table';
import { Tab, TabList, Tabs } from '@qoe/ui/tabs';
import { searchArticleContributorsAction } from '@qoe/sdk/actions/articles';
import { serializeWorkspaceCookie, WORKSPACE_COOKIE } from '@qoe/sdk/workspace';
import { toast } from '@qoe/ui/toast';
import { Select } from '@qoe/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@qoe/ui/ui/popover';
import { cn } from '@qoe/utils';
import { STUDIO_PAGE_CLASS } from '@/components/studio-page';
import { attemptWithStepUp } from '@/lib/authz-feedback';
import { PendingInvites } from './PendingInvites';
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
  createMediaInviteLinkAction,
  listMediaInviteLinksAction,
  revokeMediaInviteLinkAction,
  listMediaAuditLogAction,
  type MediaInviteLinkDTO,
  type MediaAuditEntry,
} from './actions';
import { MediaApiKeysTab } from './MediaApiKeysTab';
import { ALL_MEDIA_PERMISSIONS, MEDIA_ROLES } from '@qoe/auth/media';

type CollaboratorResult = {
  id: string;
  name: string | null;
  username: string | null;
  logoUrl: string | null;
  isCertified?: boolean;
};

interface MediaSummary {
  id: string;
  name: string;
  slug: string;
  subdomain: string | null;
  bio: string | null;
  logoUrl: string | null;
  role: string;
  membersCount: number;
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
}

const ROLE_META: Record<
  string,
  {
    label: () => string;
    color: string;
    icon: React.ComponentType<{ className?: string; strokeWidth?: number | string }>;
  }
> = {
  owner: { label: () => t`Propriétaire`, color: 'text-primary', icon: Crown },
  editor: { label: () => t`Éditeur`, color: 'text-highlight', icon: ShieldCheck },
  writer: { label: () => t`Rédacteur`, color: 'text-foreground', icon: PenLine },
  viewer: { label: () => t`Lecteur`, color: 'text-muted-foreground', icon: Eye },
};

// Rôles qu'on peut attribuer : le propriétaire ne se donne pas, il se
// transfère (ou reste unique).
const ASSIGNABLE_ROLES = Object.keys(ROLE_META).filter((role) => role !== MEDIA_ROLES.OWNER);

const PERMISSION_LABELS: Record<string, () => string> = {
  'media:manage_members': () => t`Gérer les membres`,
  'media:manage_settings': () => t`Design & SEO`,
  'media:manage_billing': () => t`Monétisation`,
  'media:manage_categories': () => t`Catégories`,
  'media:manage_newsletter': () => t`Newsletter`,
  'media:publish:any': () => t`Publier`,
  'media:edit:any': () => t`Éditer tout`,
  'media:delete:any': () => t`Supprimer`,
  'media:review': () => t`Approbation`,
  'media:view_analytics': () => t`Analytics`,
  'media:create_articles': () => t`Écrire`,
  'media:edit_own': () => t`Éditer ses écrits`,
  'api_keys:manage': () => t`Gérer les clés API`,
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

type StudioTab = 'members' | 'invites' | 'api-keys' | 'activity' | 'settings';

const MEMBER_SORT: SortSpec<MediaDetail['members'][number]> = {
  member: {
    kind: 'text',
    value: (row) => row.user.name || row.user.username || '',
  },
  role: {
    kind: 'rank',
    rank: [MEDIA_ROLES.OWNER, 'editor', 'writer', 'viewer'],
    value: (row) => row.role,
  },
  joinedAt: {
    kind: 'date',
    value: (row) => (row.joinedAt ? new Date(row.joinedAt) : null),
  },
};

const INVITE_SORT: SortSpec<MediaInviteLinkDTO> = {
  role: {
    kind: 'rank',
    rank: ['editor', 'writer', 'viewer'],
    value: (row) => row.role,
  },
  status: {
    kind: 'rank',
    rank: ['Actif', 'Expiré', 'Épuisé', 'Révoqué'],
    value: (row) => {
      if (row.isRevoked) return 'Révoqué';
      if (row.expiresAt && new Date(row.expiresAt).getTime() < Date.now()) return 'Expiré';
      if (row.maxUses > 0 && row.usedCount >= row.maxUses) return 'Épuisé';
      return 'Actif';
    },
  },
  uses: {
    kind: 'number',
    value: (row) => row.usedCount,
  },
  expiresAt: {
    kind: 'date',
    value: (row) => (row.expiresAt ? new Date(row.expiresAt) : null),
  },
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

const AUDIT_CATEGORIES: Array<{ id: string; label: () => string }> = [
  { id: 'all', label: () => t`Tout` },
  { id: 'articles', label: () => t`Articles` },
  { id: 'team', label: () => t`Équipe` },
  { id: 'settings', label: () => t`Réglages` },
  { id: 'invitations', label: () => t`Invitations` },
  { id: 'api', label: () => t`Clés API` },
];

const AUDIT_FIELD_LABELS: Record<string, string> = {
  title: 'titre',
  slug: 'permalien',
  content: 'contenu',
  paywall: 'paywall',
  status: 'statut',
  category: 'catégorie',
  seo: 'SEO',
  image: 'image',
  options: 'options de lecture',
  name: 'nom',
  bio: 'bio',
  logoUrl: 'logo',
  subdomain: 'sous-domaine',
  customDomain: 'domaine',
  accentColor: 'couleur',
  heroText: 'accroche',
  headerImageUrl: 'bannière',
  footerText: 'pied de page',
  themeMode: 'thème',
  layoutStyle: 'mise en page',
  seoTitle: 'titre SEO',
  seoDescription: 'description SEO',
  allowIndexing: 'indexation',
  fontFamily: 'police',
  supportUrl: 'support',
};

function auditString(md: Record<string, unknown>, key: string): string {
  const value = md[key];
  return typeof value === 'string' ? value : '';
}

/** Traduit une entrée du journal média en phrase lisible (style Discord). */
function describeAuditEntry(entry: MediaAuditEntry): { summary: string; detail?: string } {
  const md = entry.metadata ?? {};
  const fields = Array.isArray(md.fields) ? md.fields.map(String) : [];
  const fieldLabels = fields.map((f) => AUDIT_FIELD_LABELS[f] ?? f).join(', ');
  const title = auditString(md, 'title');
  switch (entry.action) {
    case 'media.created':
      return { summary: 'a créé le Média' };
    case 'media.settings_updated':
      return { summary: 'a modifié les réglages du Média', detail: fieldLabels || undefined };
    case 'media.article_created':
      return { summary: `a créé l'article « ${title} »` };
    case 'media.article_updated':
      return { summary: `a modifié l'article « ${title} »`, detail: fieldLabels || undefined };
    case 'media.article_deleted':
      return { summary: `a supprimé l'article « ${title} »` };
    case 'media.article_published':
      return { summary: `a publié l'article « ${title} »` };
    case 'media.article_unpublished':
      return { summary: `a dépublié l'article « ${title} »` };
    case 'media.article_scheduled': {
      const at = auditString(md, 'scheduledAt');
      return {
        summary: `a programmé l'article « ${title} »`,
        detail: at ? formatDateTime(at) : undefined,
      };
    }
    case 'media.article_schedule_cancelled':
      return { summary: `a annulé la programmation de l'article « ${title} »` };
    case 'media.article_draft_discarded':
      return { summary: `a abandonné le brouillon de « ${title} »` };
    case 'media.article_approved': {
      const comment = auditString(md, 'comment');
      return { summary: `a approuvé l'article « ${title} »`, detail: comment || undefined };
    }
    case 'media.article_rejected': {
      const comment = auditString(md, 'comment');
      return { summary: `a rejeté l'article « ${title} »`, detail: comment || undefined };
    }
    case 'media.article_transferred_out': {
      const to = auditString(md, 'toPublicationName');
      return {
        summary: `a transféré l'article « ${title} »`,
        detail: to ? `vers ${to}` : undefined,
      };
    }
    case 'media.article_transferred_in': {
      const from = auditString(md, 'fromPublicationName');
      return {
        summary: `a reçu l'article « ${title} »`,
        detail: from ? `depuis ${from}` : undefined,
      };
    }
    case 'member.role_changed':
      return { summary: "a changé le rôle d'un membre", detail: auditString(md, 'role') };
    case 'member.permissions_changed':
      return { summary: "a modifié les permissions d'un membre" };
    case 'member.invited_pending':
      return { summary: `a invité @${auditString(md, 'username')}` };
    case 'member.invitation_accepted':
      return { summary: 'a rejoint le Média', detail: auditString(md, 'role') || undefined };
    case 'member.removed':
      return { summary: 'a retiré un membre du Média' };
    case 'media.invite_link_created':
      return { summary: "a généré un lien d'invitation" };
    case 'media.invite_link_revoked':
      return { summary: "a révoqué un lien d'invitation" };
    case 'api_key.created':
      return { summary: 'a créé une clé API' };
    case 'api_key.updated':
      return { summary: 'a modifié une clé API' };
    case 'api_key.rotated':
      return { summary: 'a régénéré une clé API' };
    case 'api_key.revoked':
      return { summary: 'a révoqué une clé API' };
    default:
      return { summary: entry.action };
  }
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
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
  const [canManageApiKeys, setCanManageApiKeys] = useState(false);
  const [canViewAudit, setCanViewAudit] = useState(false);
  const [auditEntries, setAuditEntries] = useState<MediaAuditEntry[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [auditCategory, setAuditCategory] = useState('all');
  const [auditQuery, setAuditQuery] = useState('');
  const [auditSearch, setAuditSearch] = useState('');
  const [auditTotal, setAuditTotal] = useState(0);
  const [loadingMoreAudit, setLoadingMoreAudit] = useState(false);

  const [createName, setCreateName] = useState('');
  const [createSlug, setCreateSlug] = useState('');
  const [createBio, setCreateBio] = useState('');
  const [createLogo, setCreateLogo] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [memberQuery, setMemberQuery] = useState('');
  const [memberResults, setMemberResults] = useState<CollaboratorResult[]>([]);
  const [searchingMembers, setSearchingMembers] = useState(false);
  const [selectedMember, setSelectedMember] = useState<CollaboratorResult | null>(null);
  const [inviteRole, setInviteRole] = useState('writer');
  const [inviting, setInviting] = useState(false);

  const [inviteLinks, setInviteLinks] = useState<MediaInviteLinkDTO[]>([]);
  const [loadingLinks, setLoadingLinks] = useState(false);
  const [linkRole, setLinkRole] = useState('writer');
  const [linkExpiresIn, setLinkExpiresIn] = useState(24);
  const [linkMaxUses, setLinkMaxUses] = useState(1);
  const [creatingLink, setCreatingLink] = useState(false);
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);

  const canManageMembers = myRole === MEDIA_ROLES.OWNER || myRole === MEDIA_ROLES.EDITOR;

  const loadDetail = useCallback(async (mediaId: string) => {
    setLoadingDetail(true);
    const res = await getMediaByIdAction(mediaId);
    setLoadingDetail(false);
    if (res.success) {
      setDetail(res.media as unknown as MediaDetail);
      setMyRole(res.myRole ?? null);
      setCanManageApiKeys(res.canManageApiKeys ?? false);
      setCanViewAudit(res.canViewAudit ?? false);
    } else {
      toast.error(res.error || t`Erreur de chargement du Média`);
    }
  }, []);

  useEffect(() => {
    if (selectedMediaId) {
      loadDetail(selectedMediaId);
    } else if (medias.length > 0 && !showCreate) {
      setSelectedMediaId(medias[0].id);
    }
  }, [selectedMediaId, medias, showCreate, loadDetail]);

  // Journal d'activité : recherche debouncée puis chargement filtré à
  // l'ouverture de l'onglet ou au changement de média/filtre.
  const auditMediaId = detail?.id;
  useEffect(() => {
    const timer = setTimeout(() => setAuditSearch(auditQuery.trim()), 350);
    return () => clearTimeout(timer);
  }, [auditQuery]);

  useEffect(() => {
    if (tab !== 'activity' || !auditMediaId) return;
    let cancelled = false;
    setLoadingAudit(true);
    listMediaAuditLogAction(auditMediaId, {
      category: auditCategory,
      query: auditSearch,
    }).then((res) => {
      if (cancelled) return;
      setLoadingAudit(false);
      if (res.success) {
        setAuditEntries(res.entries);
        setAuditTotal(res.total);
      } else {
        toast.error(res.error || t`Erreur de chargement du journal`);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [tab, auditMediaId, auditCategory, auditSearch]);

  const loadMoreAudit = async () => {
    if (!auditMediaId || loadingMoreAudit) return;
    setLoadingMoreAudit(true);
    const res = await listMediaAuditLogAction(auditMediaId, {
      category: auditCategory,
      query: auditSearch,
      offset: auditEntries.length,
    });
    setLoadingMoreAudit(false);
    if (res.success) {
      setAuditEntries((prev) => [...prev, ...res.entries]);
      setAuditTotal(res.total);
    } else {
      toast.error(res.error || t`Erreur de chargement du journal`);
    }
  };

  // Bascule explicite : la sélection ci-dessus ne sert qu'à gérer ce Média.
  // Ouvrir l'espace pose le cookie puis revient au studio pour que la sidebar,
  // les articles et les réglages opèrent sur cette publication.
  const openWorkspace = (mediaId: string) => {
    document.cookie = `${WORKSPACE_COOKIE}=${serializeWorkspaceCookie({
      type: 'MEDIA',
      id: mediaId,
    })}; path=/; max-age=2592000; samesite=lax`;
    router.push('/');
    router.refresh();
  };

  const handleCreate = async () => {
    if (!createName.trim() || !createSlug.trim()) {
      toast.error('Le nom et le permalien sont requis.');
      return;
    }
    setCreating(true);
    const res = await attemptWithStepUp(
      () =>
        createMediaAction(createName, createSlug, createBio || undefined, createLogo || undefined),
      { fallback: t`Impossible de créer le Média.` }
    );
    setCreating(false);
    if (res.success) {
      toast.success(t`Média créé.`);
      document.cookie = `${WORKSPACE_COOKIE}=${serializeWorkspaceCookie({
        type: 'MEDIA',
        id: res.media!.id,
      })}; path=/; max-age=2592000; samesite=lax`;
      router.push('/media');
      router.refresh();
    }
  };

  const handleInvite = async () => {
    if (!detail) return;
    if (!selectedMember?.username) {
      toast.error(t`Choisissez un créateur dans la liste pour l'ajouter à l'équipe.`);
      return;
    }
    const username = selectedMember.username;
    setInviting(true);
    const res = await attemptWithStepUp(
      () => inviteMediaMemberAction(detail.id, username, inviteRole),
      { fallback: t`Échec de l'ajout du collaborateur.` }
    );
    setInviting(false);
    if (res.success) {
      toast.success(
        res.alreadyMember
          ? t`Rôle mis à jour.`
          : t`@${username} est invité — il devra accepter avec une session vérifiée avant d'avoir des droits.`
      );
      setSelectedMember(null);
      setMemberQuery('');
      setMemberResults([]);
      loadDetail(detail.id);
    }
  };

  // Recherche par nom ou @username, en excluant les membres actuels du Média.
  const memberIds = useMemo(() => (detail?.members ?? []).map((m) => m.user.id), [detail]);

  useEffect(() => {
    const trimmed = memberQuery.trim();
    if (trimmed.length < 2 || selectedMember) {
      setMemberResults([]);
      setSearchingMembers(false);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setSearchingMembers(true);
      const res = await searchArticleContributorsAction({ query: trimmed, excludeIds: memberIds });
      if (cancelled) return;
      setSearchingMembers(false);
      setMemberResults(res.ok ? res.data : []);
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [memberQuery, memberIds, selectedMember]);

  const loadInviteLinks = useCallback(async (mediaId: string) => {
    setLoadingLinks(true);
    const res = await listMediaInviteLinksAction(mediaId);
    setLoadingLinks(false);
    if (res.success) {
      setInviteLinks(res.links);
    } else {
      toast.error(res.error || t`Impossible de charger les liens d'invitation.`);
    }
  }, []);

  const currentMediaId = detail?.id ?? null;

  useEffect(() => {
    if (tab === 'invites' && currentMediaId && canManageMembers) {
      loadInviteLinks(currentMediaId);
    }
  }, [tab, currentMediaId, canManageMembers, loadInviteLinks]);

  const inviteLinkUrl = (link: MediaInviteLinkDTO) =>
    `${window.location.origin}/media/join?token=${link.token}`;

  const copyInviteLink = async (link: MediaInviteLinkDTO) => {
    try {
      await navigator.clipboard.writeText(inviteLinkUrl(link));
      setCopiedLinkId(link.id);
      window.setTimeout(() => setCopiedLinkId(null), 2000);
      toast.success(t`Lien copié dans le presse-papiers.`);
    } catch {
      toast.error(t`Impossible de copier le lien.`);
    }
  };

  const [memberSort, setMemberSort] = useState<SortDescriptorLike>({
    column: 'role',
    direction: 'ascending',
  });
  const [inviteSort, setInviteSort] = useState<SortDescriptorLike>({
    column: 'status',
    direction: 'ascending',
  });

  const sortedMembers = useMemo(() => {
    if (!detail?.members) return [];
    return sortRows(detail.members, memberSort, MEMBER_SORT);
  }, [detail?.members, memberSort]);

  const sortedInviteLinks = useMemo(() => {
    return sortRows(inviteLinks, inviteSort, INVITE_SORT);
  }, [inviteLinks, inviteSort]);

  const linkStatus = (
    link: MediaInviteLinkDTO
  ): { label: string; tone: 'danger' | 'neutral' | 'success' } => {
    if (link.isRevoked) return { label: t`Révoqué`, tone: 'danger' };
    if (link.expiresAt && new Date(link.expiresAt).getTime() < Date.now())
      return { label: t`Expiré`, tone: 'neutral' };
    if (link.maxUses > 0 && link.usedCount >= link.maxUses)
      return { label: t`Épuisé`, tone: 'neutral' };
    return { label: t`Actif`, tone: 'success' };
  };

  const handleCreateInviteLink = async () => {
    if (!detail) return;
    setCreatingLink(true);
    const res = await attemptWithStepUp(
      () => createMediaInviteLinkAction(detail.id, linkRole, linkExpiresIn, linkMaxUses),
      { fallback: t`Échec de la création du lien.` }
    );
    setCreatingLink(false);
    if (res.success) {
      toast.success(t`Lien d'invitation généré.`);
      setInviteLinks((prev) => [res.link, ...prev]);
      void copyInviteLink(res.link);
    }
  };

  const handleRevokeInviteLink = async (linkId: string) => {
    if (!detail) return;
    const res = await attemptWithStepUp(() => revokeMediaInviteLinkAction(detail.id, linkId), {
      fallback: t`Échec de la révocation du lien.`,
    });
    if (res.success) {
      toast.success(t`Lien d'invitation révoqué.`);
      setInviteLinks((prev) => prev.filter((item) => item.id !== linkId));
    }
  };

  const handleRoleChange = async (memberUserId: string, role: string) => {
    if (!detail) return;
    const res = await attemptWithStepUp(
      () => updateMediaMemberRoleAction(detail.id, memberUserId, role),
      { fallback: t`Échec de la mise à jour du rôle.` }
    );
    if (res.success) {
      toast.success(t`Rôle mis à jour.`);
      loadDetail(detail.id);
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
    const res = await attemptWithStepUp(
      () => updateMediaMemberPermissionsAction(detail.id, memberUserId, Array.from(perms)),
      { fallback: t`Échec de la mise à jour des permissions.` }
    );
    if (res.success) {
      toast.success(t`Permissions mises à jour.`);
      loadDetail(detail.id);
    }
  };

  const handleRemoveMember = async (memberUserId: string, memberName: string) => {
    if (!detail) return;
    if (!window.confirm(`Retirer ${memberName} du Média ?`)) return;
    const res = await attemptWithStepUp(() => removeMediaMemberAction(detail.id, memberUserId), {
      fallback: t`Échec du retrait du membre.`,
    });
    if (res.success) {
      toast.success(t`Membre retiré.`);
      loadDetail(detail.id);
    }
  };

  const effectivePerms = (member: MediaDetail['members'][number]) =>
    member.permissions && member.permissions.length > 0
      ? member.permissions
      : ROLE_DEFAULT_PERMS[member.role] || [];

  const isOwner = myRole === MEDIA_ROLES.OWNER;

  const labelCls = 'block text-xs font-semibold text-muted-foreground mb-0.5';

  /* ─────────────────────────── CREATE FLOW ─────────────────────────── */
  if (showCreate || medias.length === 0) {
    return (
      <div className="mx-auto w-full max-w-md py-10">
        <div className="mb-10">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Créer un média</h1>
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
            <Input
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder={t`Nom du média`}
            />
          </div>
          <div>
            <label className={labelCls}>Permalien</label>
            <InputGroup left={<span className="text-xs">qoe.fi/</span>}>
              <Input
                value={createSlug}
                onChange={(e) => setCreateSlug(e.target.value)}
                placeholder="nom-du-media"
              />
            </InputGroup>
          </div>
          <div>
            <label className={labelCls}>Bio / Présentation</label>
            <Textarea
              value={createBio}
              onChange={(e) => setCreateBio(e.target.value)}
              rows={2}
              placeholder={t`Décrivez la ligne éditoriale du média...`}
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

          <Button type="submit" variant="solid" tone="brand" size="lg" block disabled={creating}>
            {creating ? (
              <Loader2 className="animate-spin" />
            ) : (
              <>
                Créer le Média & mon espace de travail
                <ArrowRight strokeWidth={1.5} />
              </>
            )}
          </Button>
        </form>
      </div>
    );
  }

  // En workspace PERSONAL aucun média n'est actif : la sélection démarre à
  // null puis s'initialise côté client. On affiche le chargement plutôt que
  // l'état vide « Aucun Média » pendant cette initialisation.
  if (!detail && (loadingDetail || selectedMediaId || medias.length > 0)) {
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
        <div className="mx-auto max-w-md mb-8">
          <PendingInvites />
        </div>
        <div className="size-14 rounded-xl bg-card border border-border/40 text-primary flex items-center justify-center mx-auto mb-5">
          <Building2 className="w-6 h-6" strokeWidth={1.5} />
        </div>
        <h3 className="text-xl font-bold tracking-tight">Aucun Média</h3>
        <p className="text-sm text-muted-foreground mt-1 mb-6 max-w-sm mx-auto">
          Créez votre premier média pour inviter une équipe et lancer votre sous-domaine.
        </p>
        <Button
          variant="solid"
          tone="brand"
          size="md"
          onClick={() => router.push('/media?create=1')}
        >
          <Plus strokeWidth={1.5} />
          Créer un Média
        </Button>
      </div>
    );
  }

  const myRoleMeta = ROLE_META[myRole || 'writer'] || ROLE_META.writer;
  const MyRoleIcon = myRoleMeta.icon;
  const domain = detail.publication.subdomain
    ? `${detail.publication.subdomain}.qoe.fi`
    : `qoe.fi/${detail.publication.slug}`;

  return (
    <div className={cn(STUDIO_PAGE_CLASS, 'pb-16 text-foreground')}>
      <div className="mb-6">
        <PendingInvites />
      </div>
      {/* ── Hero ── */}
      <div className="mb-8">
        {detail.publication.headerImageUrl && (
          <div className="relative mb-4 h-32 w-full overflow-hidden rounded-xl bg-muted/30 md:h-40">
            <Image src={detail.publication.headerImageUrl} alt="" fill className="object-cover" />
          </div>
        )}
        <div className="flex items-start gap-4">
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
            <h1 className="truncate text-2xl font-semibold tracking-tight">
              {detail.publication.name}
            </h1>
            <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
              <Globe className="w-3.5 h-3.5" strokeWidth={1.5} />
              <span className="font-medium text-foreground/80">{domain}</span>
              <span className="text-border">•</span>
              <span className={cn('flex items-center gap-1 font-medium', myRoleMeta.color)}>
                <MyRoleIcon className="w-3.5 h-3.5" strokeWidth={1.5} /> {myRoleMeta.label()}
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
            <Button
              key={m.id}
              variant={active ? 'soft' : 'ghost'}
              size="sm"
              onClick={() => {
                setSelectedMediaId(m.id);
                setTab('members');
              }}
              className="gap-2"
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
            </Button>
          );
        })}
        {selectedMediaId && selectedMediaId !== activeMediaId && (
          <Button
            variant="solid"
            tone="brand"
            size="sm"
            onClick={() => openWorkspace(selectedMediaId)}
            className="ml-auto"
          >
            <ArrowRight strokeWidth={1.5} />
            {t`Ouvrir cet espace`}
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={() => router.push('/media?create=1')}>
          <Plus strokeWidth={1.5} />
          Nouveau
        </Button>
      </div>

      {/* ── Tabs ── */}
      <Tabs
        variant="segmented"
        size="sm"
        value={tab}
        onValueChange={(val) => setTab(val as StudioTab)}
        className="mb-6"
      >
        <TabList aria-label={t`Sections du média`}>
          {[
            { key: 'members' as const, label: () => t`Membres`, icon: Users },
            { key: 'invites' as const, label: () => t`Invitations`, icon: Mail },
            ...(canManageApiKeys
              ? [{ key: 'api-keys' as const, label: () => t`Clés API`, icon: Key }]
              : []),
            ...(canViewAudit
              ? [{ key: 'activity' as const, label: () => t`Activité`, icon: History }]
              : []),
            { key: 'settings' as const, label: () => t`Réglages`, icon: Settings },
          ].map((tabItem) => (
            <Tab key={tabItem.key} id={tabItem.key}>
              <span className="inline-flex items-center gap-1.5">
                <tabItem.icon className="size-3.5" strokeWidth={1.5} />
                <span>{tabItem.label()}</span>
              </span>
            </Tab>
          ))}
        </TabList>
      </Tabs>

      {/* ── Members ── */}
      {tab === 'members' && (
        <div className="space-y-4">
          <div className="overflow-hidden rounded-xl border border-border/30 bg-card shadow-none">
            <Table
              aria-label={t`Membres du Média`}
              size="md"
              sortDescriptor={memberSort}
              onSortChange={setMemberSort}
            >
              <TableHeader>
                <TableColumn id="member" isRowHeader allowsSorting>
                  {t`Membre`}
                </TableColumn>
                <TableColumn id="role" allowsSorting>
                  {t`Rôle`}
                </TableColumn>
                <TableColumn id="permissions">{t`Permissions`}</TableColumn>
                <TableColumn id="joinedAt" allowsSorting>
                  {t`Date d'arrivée`}
                </TableColumn>
                {canManageMembers && <TableColumn className="text-right">{t`Actions`}</TableColumn>}
              </TableHeader>
              <TableBody items={sortedMembers}>
                {(member) => {
                  const roleMeta = ROLE_META[member.role] || ROLE_META.writer;
                  const RoleIcon = roleMeta.icon;
                  const perms = effectivePerms(member);
                  return (
                    <TableRow id={member.id}>
                      <TableCell>
                        <TablePersonCell
                          name={member.user.name || member.user.username || 'Inconnu'}
                          src={member.user.logoUrl}
                          meta={member.user.username ? `@${member.user.username}` : undefined}
                        />
                      </TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-chip text-xs font-medium',
                            roleMeta.color
                          )}
                        >
                          <RoleIcon className="w-3.5 h-3.5" strokeWidth={1.5} />
                          {roleMeta.label()}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <div className="flex flex-wrap gap-1">
                            {perms.slice(0, 2).map((perm) => (
                              <span
                                key={perm}
                                className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
                              >
                                {PERMISSION_LABELS[perm] ? PERMISSION_LABELS[perm]() : perm}
                              </span>
                            ))}
                            {perms.length > 2 && (
                              <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                                +{perms.length - 2}
                              </span>
                            )}
                          </div>
                          {isOwner && member.role !== MEDIA_ROLES.OWNER && (
                            <PermissionPopover
                              member={member}
                              perms={perms}
                              onToggle={handlePermissionsChange}
                            />
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs tabular-nums">
                        {formatDate(member.joinedAt)}
                      </TableCell>
                      {canManageMembers && (
                        <TableCell className="text-right">
                          {member.role !== MEDIA_ROLES.OWNER ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <Select
                                label={t`Rôle de ${member.user.name || member.user.username || t`ce membre`}`}
                                hideLabel
                                size="sm"
                                className="w-32"
                                value={member.role}
                                onValueChange={(role) => handleRoleChange(member.user.id, role)}
                                options={ASSIGNABLE_ROLES.map((role) => ({
                                  id: role,
                                  label: ROLE_META[role].label(),
                                }))}
                              />
                              <Button
                                variant="ghost"
                                tone="danger"
                                size="sm"
                                shape="icon"
                                onClick={() =>
                                  handleRemoveMember(
                                    member.user.id,
                                    member.user.name || member.user.username || 'ce membre'
                                  )
                                }
                                title={t`Retirer du Média`}
                                aria-label={t`Retirer du Média`}
                              >
                                <Trash2 strokeWidth={1.5} />
                              </Button>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">
                              {t`Créateur`}
                            </span>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                }}
              </TableBody>
            </Table>
          </div>

          {!canManageMembers && (
            <p className="text-xs text-muted-foreground py-4">
              Vous êtes{' '}
              <strong className="capitalize">{ROLE_META[myRole || 'writer']?.label()}</strong> de ce
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
              className="space-y-2"
            >
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1 relative">
                  {selectedMember ? (
                    <div className="flex items-center gap-2.5 rounded-lg bg-primary/5 px-3 py-2">
                      <SafeAvatar
                        src={selectedMember.logoUrl}
                        name={selectedMember.name}
                        username={selectedMember.username}
                        size={28}
                        shape="circle"
                        className="shrink-0"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-foreground">
                          {selectedMember.name || selectedMember.username}
                        </span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          @{selectedMember.username}
                        </span>
                      </span>
                      <Button
                        variant="ghost"
                        size="xs"
                        shape="icon"
                        onClick={() => {
                          setSelectedMember(null);
                          setMemberQuery('');
                        }}
                        aria-label={t`Retirer la sélection`}
                      >
                        <X strokeWidth={1.5} />
                      </Button>
                    </div>
                  ) : (
                    <InputGroup
                      left={<Search strokeWidth={1.5} />}
                      right={searchingMembers ? <Loader2 className="animate-spin" /> : undefined}
                    >
                      <Input
                        value={memberQuery}
                        onChange={(e) => setMemberQuery(e.target.value)}
                        placeholder={t`Rechercher un créateur (nom ou @username)`}
                        autoComplete="off"
                        spellCheck={false}
                      />
                    </InputGroup>
                  )}
                </div>
                <Select
                  label={t`Rôle à accorder`}
                  hideLabel
                  value={inviteRole}
                  onValueChange={setInviteRole}
                  options={ASSIGNABLE_ROLES.map((role) => ({
                    id: role,
                    label: ROLE_META[role].label(),
                  }))}
                />
                <Button
                  type="submit"
                  variant="solid"
                  tone="brand"
                  size="md"
                  disabled={inviting || !selectedMember}
                >
                  {inviting ? <Loader2 className="animate-spin" /> : <UserPlus strokeWidth={1.5} />}
                  Ajouter
                </Button>
              </div>

              {!selectedMember && memberResults.length > 0 && (
                <div className="overflow-hidden rounded-xl border border-border/50 bg-card shadow-lg divide-y divide-border/30">
                  {memberResults.map((person) => (
                    <Button
                      key={person.id}
                      variant="ghost"
                      block
                      onClick={() => {
                        setSelectedMember(person);
                        setMemberQuery('');
                        setMemberResults([]);
                      }}
                      className="h-auto justify-start gap-2.5 rounded-none p-2.5 text-left"
                    >
                      <SafeAvatar
                        src={person.logoUrl}
                        name={person.name}
                        username={person.username}
                        size={28}
                        shape="circle"
                        className="shrink-0"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-foreground">
                          {person.name || person.username || t`Créateur`}
                        </span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          @{person.username || person.id.slice(0, 8)}
                        </span>
                      </span>
                      <UserPlus className="w-4 h-4 text-primary shrink-0" strokeWidth={1.5} />
                    </Button>
                  ))}
                </div>
              )}

              {!selectedMember &&
                memberQuery.trim().length >= 2 &&
                !searchingMembers &&
                memberResults.length === 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    Aucun créateur trouvé — les membres actuels du Média sont exclus.
                  </p>
                )}
            </form>
          )}

          {/* Liens d'invitation d'équipe (sans email, rôle + durée + max d'utilisations) */}
          {canManageMembers && (
            <div className="rounded-xl border border-border/50 bg-card p-5 space-y-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <Link2 className="w-3.5 h-3.5" strokeWidth={1.5} /> Liens d'invitation d'équipe
                </p>
                <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed">
                  Partagez un lien : le rôle est accordé automatiquement, sans avoir besoin de
                  connaître une adresse email. Vous pouvez fixer la durée de validité et le nombre
                  d'utilisations.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className={labelCls}>Rôle accordé</label>
                  <Select
                    label={t`Rôle accordé`}
                    hideLabel
                    value={linkRole}
                    onValueChange={setLinkRole}
                    options={ASSIGNABLE_ROLES.map((role) => ({
                      id: role,
                      label: ROLE_META[role].label(),
                    }))}
                  />
                </div>
                <div>
                  <label className={labelCls}>Durée de validité</label>
                  <Select
                    label={t`Durée de validité`}
                    hideLabel
                    value={String(linkExpiresIn)}
                    onValueChange={(value) => setLinkExpiresIn(Number(value))}
                    options={[
                      { id: '24', label: t`24 heures` },
                      { id: '168', label: t`7 jours` },
                      { id: '720', label: t`30 jours` },
                      { id: '0', label: t`Permanent` },
                    ]}
                  />
                </div>
                <div>
                  <label className={labelCls}>Utilisations max</label>
                  <Select
                    label={t`Utilisations max`}
                    hideLabel
                    value={String(linkMaxUses)}
                    onValueChange={(value) => setLinkMaxUses(Number(value))}
                    options={[
                      { id: '1', label: t`1 seule fois` },
                      { id: '5', label: t`5 utilisations` },
                      { id: '10', label: t`10 utilisations` },
                      { id: '0', label: t`Illimité` },
                    ]}
                  />
                </div>
              </div>

              <Button
                variant="solid"
                tone="brand"
                size="md"
                block
                onClick={handleCreateInviteLink}
                disabled={creatingLink}
              >
                {creatingLink ? <Loader2 className="animate-spin" /> : <Link2 strokeWidth={1.5} />}
                Générer le lien d&apos;invitation
              </Button>

              <div className="pt-3 border-t border-border/30">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
                  Liens du Média
                </p>
                {loadingLinks ? (
                  <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Chargement des liens…
                  </div>
                ) : inviteLinks.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic py-2">
                    Aucun lien d'invitation généré pour ce Média.
                  </p>
                ) : (
                  <div className="overflow-hidden">
                    <Table
                      aria-label={t`Liens d'invitation`}
                      size="sm"
                      sortDescriptor={inviteSort}
                      onSortChange={setInviteSort}
                    >
                      <TableHeader>
                        <TableColumn id="role" isRowHeader allowsSorting>
                          {t`Rôle`}
                        </TableColumn>
                        <TableColumn id="status" allowsSorting>
                          {t`Statut`}
                        </TableColumn>
                        <TableColumn id="uses" allowsSorting>
                          {t`Utilisations`}
                        </TableColumn>
                        <TableColumn id="expiresAt" allowsSorting>
                          {t`Expiration`}
                        </TableColumn>
                        <TableColumn className="text-right">{t`Actions`}</TableColumn>
                      </TableHeader>
                      <TableBody items={sortedInviteLinks}>
                        {(link) => {
                          const status = linkStatus(link);
                          const meta = ROLE_META[link.role] || ROLE_META.writer;
                          const Icon = meta.icon;
                          const isExpired = status.label !== t`Actif`;
                          return (
                            <TableRow id={link.id}>
                              <TableCell>
                                <span
                                  className={cn(
                                    'inline-flex items-center gap-1.5 text-xs font-medium',
                                    meta.color
                                  )}
                                >
                                  <Icon className="w-3.5 h-3.5" strokeWidth={1.5} />
                                  {meta.label()}
                                </span>
                              </TableCell>
                              <TableCell>
                                <Badge variant="soft" dot tone={status.tone} size="xs">
                                  {status.label}
                                </Badge>
                              </TableCell>
                              <TableCell className="tabular-nums text-xs">
                                {link.usedCount} / {link.maxUses > 0 ? link.maxUses : '∞'}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground tabular-nums">
                                {link.expiresAt ? formatDate(link.expiresAt) : t`Permanent`}
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <Button
                                    variant="ghost"
                                    size="xs"
                                    onClick={() => copyInviteLink(link)}
                                    disabled={isExpired}
                                    title={t`Copier le lien`}
                                  >
                                    {copiedLinkId === link.id ? (
                                      <Check className="w-3.5 h-3.5 text-success" />
                                    ) : (
                                      <Copy className="w-3.5 h-3.5" />
                                    )}
                                    <span>{copiedLinkId === link.id ? t`Copié` : t`Copier`}</span>
                                  </Button>
                                  {!link.isRevoked && (
                                    <Button
                                      variant="ghost"
                                      tone="danger"
                                      size="xs"
                                      shape="icon"
                                      onClick={() => void handleRevokeInviteLink(link.id)}
                                      title={t`Révoquer le lien`}
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </Button>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        }}
                      </TableBody>
                    </Table>{' '}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Role explainer */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
              <Shield className="w-3.5 h-3.5" strokeWidth={1.5} /> Ce que chaque rôle peut faire
            </p>
            <div className="grid gap-6 border-t border-border/40 pt-5 md:grid-cols-3">
              {Object.entries(ROLE_DEFAULT_PERMS)
                .filter(([r]) => r !== MEDIA_ROLES.OWNER)
                .map(([role, perms]) => {
                  const meta = ROLE_META[role];
                  const Icon = meta.icon;
                  return (
                    <div key={role}>
                      <div
                        className={cn(
                          'flex items-center gap-1.5 text-xs font-bold mb-3',
                          meta.color
                        )}
                      >
                        <Icon className="w-3.5 h-3.5" strokeWidth={1.5} />
                        {meta.label()}
                      </div>
                      <ul className="space-y-1.5">
                        {perms.map((p) => (
                          <li
                            key={p}
                            className="text-[11px] text-muted-foreground flex items-start gap-1.5"
                          >
                            <Check
                              className="w-3 h-3 text-success-text mt-0.5 shrink-0"
                              strokeWidth={1.5}
                            />
                            {PERMISSION_LABELS[p] ? PERMISSION_LABELS[p]() : p}
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

      {/* ── API Keys ── */}
      {tab === 'api-keys' && canManageApiKeys && (
        <MediaApiKeysTab mediaId={detail.id} mediaName={detail.publication.name} />
      )}

      {/* ── Activité (journal du média) ── */}
      {tab === 'activity' && canViewAudit && (
        <div className="overflow-hidden rounded-xl border border-border/30 bg-card shadow-none">
          <div className="flex flex-col gap-3 border-b border-border/30 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-1">
              {AUDIT_CATEGORIES.map((category) => (
                <Button
                  key={category.id}
                  variant={auditCategory === category.id ? 'soft' : 'ghost'}
                  size="xs"
                  onClick={() => setAuditCategory(category.id)}
                >
                  {category.label()}
                </Button>
              ))}
            </div>
            <Input
              value={auditQuery}
              onChange={(e) => setAuditQuery(e.target.value)}
              placeholder={t`Rechercher un membre, une action…`}
              aria-label={t`Rechercher dans le journal`}
              className="sm:w-64"
            />
          </div>

          {loadingAudit ? (
            <div className="flex items-center justify-center gap-2 py-16 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Chargement du journal…
            </div>
          ) : auditEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <History className="h-6 w-6 text-muted-foreground/40 stroke-[1.5]" />
              <p className="text-xs text-muted-foreground">
                {auditQuery || auditCategory !== 'all'
                  ? t`Aucune activité ne correspond à ces filtres.`
                  : t`Aucune activité enregistrée pour ce Média.`}
              </p>
            </div>
          ) : (
            <>
              <ol className="divide-y divide-border/30">
                {auditEntries.map((entry) => {
                  const actorName = entry.actor?.name || entry.actor?.username || 'Membre supprimé';
                  const description = describeAuditEntry(entry);
                  return (
                    <li key={entry.id} className="flex gap-3 px-4 py-3">
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted/60 text-[10px] font-bold uppercase text-muted-foreground">
                        {actorName.slice(0, 2)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-foreground">
                          <span className="font-semibold">{actorName}</span>{' '}
                          <span className="text-muted-foreground">{description.summary}</span>
                        </p>
                        {description.detail && (
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {description.detail}
                          </p>
                        )}
                        <p className="mt-1 text-[11px] tabular-nums text-muted-foreground/70">
                          {formatDateTime(entry.createdAt)}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ol>
              <div className="flex items-center justify-between border-t border-border/30 px-4 py-3">
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {auditEntries.length} / {auditTotal}
                </span>
                {auditEntries.length < auditTotal && (
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => void loadMoreAudit()}
                    disabled={loadingMoreAudit}
                  >
                    {loadingMoreAudit && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    {t`Charger plus`}
                  </Button>
                )}
              </div>
            </>
          )}
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
  return (
    <Popover>
      <PopoverTrigger className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors cursor-pointer">
        <Shield className="w-3 h-3" strokeWidth={1.5} /> Permissions
      </PopoverTrigger>
      <PopoverContent
        align="end"
        aria-label={`Permissions de ${member.user.name || member.user.username || 'ce membre'}`}
        className="w-64 space-y-1 p-3"
      >
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-1 pb-1">
          Permissions de {member.user.name || member.user.username}
        </p>
        {ALL_MEDIA_PERMISSIONS.map((perm) => (
          <div key={perm} className="px-1.5 py-1 rounded-lg hover:bg-muted/40 transition-colors">
            <Checkbox
              size="sm"
              tone="brand"
              isSelected={perms.includes(perm)}
              onChange={() => onToggle(member.user.id, perm)}
              label={PERMISSION_LABELS[perm] ? PERMISSION_LABELS[perm]() : perm}
              className="w-full"
            />
          </div>
        ))}
      </PopoverContent>
    </Popover>
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
    const res = await attemptWithStepUp(
      () =>
        updateMediaSettingsAction(mediaId, {
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
        }),
      { fallback: t`Échec de l'enregistrement des réglages du Média.` }
    );
    setSaving(false);
    if (res.success) {
      toast.success(t`Réglages du Média enregistrés.`);
      onSaved();
    }
  };

  const labelCls = 'block text-xs font-semibold text-muted-foreground mb-1';

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
      <Section title={t`Identité & Marque`}>
        <div className="grid md:grid-cols-2 gap-x-8 gap-y-6">
          <div>
            <label className={labelCls}>Nom du Média</label>
            <Input value={form.name} onChange={(e) => set('name', e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Couleur d&apos;accent</label>
            <Input
              value={form.accentColor ?? ''}
              onChange={(e) => set('accentColor', e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>Police</label>
            <Select
              label={t`Police du média`}
              hideLabel
              value={form.fontFamily ?? 'sans'}
              onValueChange={(fontFamily) => set('fontFamily', fontFamily)}
              options={[
                { id: 'sans', label: 'Inter (Sans-serif)' },
                { id: 'outfit', label: 'Outfit (Moderne)' },
                { id: 'space-grotesk', label: 'Space Grotesk (Tech)' },
                { id: 'serif', label: 'Playfair Display (Serif)' },
              ]}
            />
          </div>
          <div>
            <label className={labelCls}>Bio / Présentation</label>
            <Textarea
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
            <InputGroup right={<span className="text-xs font-mono">.qoe.fi</span>}>
              <Input
                value={form.subdomain ?? ''}
                onChange={(e) => set('subdomain', e.target.value)}
                placeholder="mon-media"
              />
            </InputGroup>
          </div>
          <div>
            <label className={labelCls}>Domaine personnalisé</label>
            <Input
              value={form.customDomain ?? ''}
              onChange={(e) => set('customDomain', e.target.value)}
              placeholder="monmedia.com"
            />
          </div>
          <div>
            <label className={labelCls}>Texte de footer</label>
            <Input
              value={form.footerText ?? ''}
              onChange={(e) => set('footerText', e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>Image d&apos;en-tête</label>
            <ImageUploader
              value={form.headerImageUrl}
              onChange={(url) => set('headerImageUrl', url)}
              upload={(file) =>
                uploadImageToRoute(file, '/api/articles/upload', IMAGE_FOLDERS.banners)
              }
              aspect={21 / 9}
              shape="banner"
              maxDimension={1600}
            />
          </div>
        </div>
      </Section>

      <Section title="SEO & Indexation">
        <div className="grid md:grid-cols-2 gap-x-8 gap-y-6">
          <div>
            <label className={labelCls}>Titre SEO</label>
            <Input value={form.seoTitle ?? ''} onChange={(e) => set('seoTitle', e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Description SEO</label>
            <Input
              value={form.seoDescription ?? ''}
              onChange={(e) => set('seoDescription', e.target.value)}
            />
          </div>
          <div className="md:col-span-2">
            <label className={labelCls}>Accroche de la page d&apos;accueil</label>
            <Textarea
              rows={2}
              value={form.heroText ?? ''}
              onChange={(e) => set('heroText', e.target.value)}
            />
          </div>
          <div className="md:col-span-2">
            <Switch
              isSelected={form.allowIndexing}
              onChange={(checked) => set('allowIndexing', checked)}
              label={t`Autoriser l'indexation`}
              description={t`Si cette option est désactivée, les moteurs de recherche ne référencent pas le média.`}
            />
          </div>
        </div>
      </Section>

      <Button
        variant="solid"
        tone="brand"
        size="lg"
        onClick={handleSave}
        disabled={saving}
        className="mt-8"
      >
        {saving ? <Loader2 className="animate-spin" /> : <FileText strokeWidth={1.5} />}
        Enregistrer les réglages
      </Button>
    </div>
  );
}
