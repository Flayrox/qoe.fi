'use client';

import React, { useEffect, useState, useTransition } from 'react';
import { ChevronsUpDown, Check, Plus, Loader2, MailOpen } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { t } from '@lingui/core/macro';
import { toast } from '@qoe/ui/toast';
import { SafeAvatar } from '@qoe/ui';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@qoe/ui/ui/dropdown-menu';
import {
  acceptMediaInviteAction,
  getUserWorkspacesAction,
  listPendingMediaInvitesAction,
  type PendingMediaInvite,
  type WorkspaceInfo as Workspace,
} from '@/app/(creator)/media/actions';
import { attemptWithStepUp } from '@/lib/authz-feedback';
import {
  parseWorkspaceCookie,
  serializeWorkspaceCookie,
  WORKSPACE_COOKIE,
} from '@qoe/sdk/workspace';

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const row = document.cookie.split('; ').find((item) => item.startsWith(`${name}=`));
  return row ? row.slice(name.length + 1) : null;
}

function writeCookie(ws: Pick<Workspace, 'type' | 'id'>) {
  if (typeof document === 'undefined') return;
  document.cookie = `${WORKSPACE_COOKIE}=${serializeWorkspaceCookie({
    type: ws.type,
    id: ws.id,
  })}; path=/; max-age=2592000; samesite=lax`;
}

export function HeaderWorkspaceSwitcher() {
  const router = useRouter();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace | null>(null);
  const [pendingInvites, setPendingInvites] = useState<PendingMediaInvite[]>([]);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const [res, invites] = await Promise.all([
        getUserWorkspacesAction(),
        listPendingMediaInvitesAction(),
      ]);
      if (cancelled || !res.success) return;

      const all: Workspace[] = [res.personal, ...(res.medias || [])];
      setWorkspaces(all);
      setPendingInvites(invites.success ? invites.items : []);

      const saved = parseWorkspaceCookie(readCookie(WORKSPACE_COOKIE));
      const found = all.find((ws) => ws.id === saved?.id && ws.type === saved?.type);

      // Cookie média devenu inaccessible (membership révoquée, invitation
      // refusée…) : on le nettoie et on repart explicitement sur le perso.
      if (saved?.type === 'MEDIA' && !found) {
        setActiveWorkspace(res.personal);
        writeCookie(res.personal);
        startTransition(() => router.refresh());
        return;
      }

      setActiveWorkspace(found ?? res.personal);
    })();

    return () => {
      cancelled = true;
    };
  }, [router, startTransition]);

  const handleSelect = (ws: Workspace) => {
    const same = activeWorkspace?.id === ws.id && activeWorkspace?.type === ws.type;
    if (same) return;
    setActiveWorkspace(ws);
    writeCookie(ws);
    // On reste sur la section courante : le layout et la page sont re-rendus
    // avec le nouveau workspace (le cookie seul ne rafraîchit pas la sidebar).
    startTransition(() => router.refresh());
  };

  const acceptInvite = async (invite: PendingMediaInvite) => {
    setAcceptingId(invite.mediaId);
    try {
      const res = await attemptWithStepUp(() => acceptMediaInviteAction(invite.mediaId), {
        fallback: t`Échec de l'acceptation.`,
      });
      if (!res.success) return;

      toast.success(t`Invitation acceptée — espace média activé.`);
      setPendingInvites((prev) => prev.filter((item) => item.mediaId !== invite.mediaId));

      // L'invitation ne transporte ni le slug ni le logo : on recharge la
      // liste réelle pour éviter un workspace synthétique (slug vide) qui
      // resterait affiché jusqu'au prochain montage du composant.
      const refreshed = await getUserWorkspacesAction();
      let accepted: Workspace = {
        id: invite.mediaId,
        name: invite.mediaName,
        slug: '',
        logoUrl: null,
        type: 'MEDIA',
        role: invite.role,
      };
      if (refreshed.success) {
        const all = [refreshed.personal, ...(refreshed.medias || [])];
        setWorkspaces(all);
        accepted = all.find((ws) => ws.id === invite.mediaId && ws.type === 'MEDIA') ?? accepted;
      } else {
        setWorkspaces((prev) => [...prev, accepted]);
      }
      setActiveWorkspace(accepted);
      writeCookie(accepted);
      startTransition(() => router.refresh());
    } finally {
      setAcceptingId(null);
    }
  };

  if (!activeWorkspace) return null;

  const personalWorkspaces = workspaces.filter((ws) => ws.type === 'PERSONAL');
  const mediaWorkspaces = workspaces.filter((ws) => ws.type === 'MEDIA');

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t`Changer d’espace de travail`}
        disabled={isPending}
        className="group/ws inline-flex h-control-sm cursor-pointer items-center gap-2 rounded-control border border-border bg-card px-2.5 type-control-sm font-medium text-foreground transition-colors outline-none hover:bg-secondary/70 data-[pressed]:bg-secondary data-[focus-visible]:ring-2 data-[focus-visible]:ring-ring/60 disabled:opacity-70"
      >
        <SafeAvatar
          id={activeWorkspace.id}
          username={activeWorkspace.slug}
          src={activeWorkspace.logoUrl}
          name={activeWorkspace.name}
          size={20}
          type={activeWorkspace.type}
          className="shrink-0"
        />{' '}
        <span className="max-w-[140px] truncate">{activeWorkspace.name}</span>
        {pendingInvites.length > 0 && (
          <span
            aria-label={t`Invitations en attente`}
            className="inline-flex min-w-4 items-center justify-center rounded-full bg-highlight px-1 type-control-xs font-semibold leading-4 text-highlight-foreground"
          >
            {pendingInvites.length}
          </span>
        )}
        {isPending ? (
          <Loader2 className="ml-0.5 size-3.5 shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <ChevronsUpDown
            className="ml-0.5 size-3.5 shrink-0 text-muted-foreground transition-colors group-hover/ws:text-foreground"
            strokeWidth={1.5}
          />
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="start"
        side="bottom"
        sideOffset={6}
        aria-label={t`Espaces de travail`}
        className="w-64"
      >
        {pendingInvites.length > 0 && (
          <>
            <DropdownMenuGroup>
              <DropdownMenuLabel>
                {t`Invitations en attente`} ({pendingInvites.length})
              </DropdownMenuLabel>
              {pendingInvites.map((invite) => (
                <DropdownMenuItem
                  key={invite.mediaId}
                  isDisabled={acceptingId !== null}
                  onAction={() => void acceptInvite(invite)}
                  className="gap-2.5 py-1.5"
                >
                  <span className="flex size-[26px] shrink-0 items-center justify-center rounded-sm bg-highlight/10 text-highlight">
                    {acceptingId === invite.mediaId ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <MailOpen className="size-3.5" strokeWidth={1.75} />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate type-control-sm font-medium leading-tight text-foreground">
                      {invite.mediaName}
                    </span>
                    <span className="mt-0.5 block truncate type-control-xs leading-tight text-muted-foreground">
                      {t`Accepter · rôle ${invite.role}`}
                    </span>
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
          </>
        )}

        <DropdownMenuGroup>
          <DropdownMenuLabel>{t`Compte personnel`}</DropdownMenuLabel>
          {personalWorkspaces.map((ws) => (
            <DropdownMenuItem
              key={ws.id}
              onAction={() => handleSelect(ws)}
              className="gap-2.5 py-1.5"
            >
              <SafeAvatar
                id={ws.id}
                username={ws.slug}
                src={ws.logoUrl}
                name={ws.name}
                size={26}
                type={ws.type}
                className="shrink-0"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate type-control-sm font-medium leading-tight text-foreground">
                  {ws.name}
                </span>
                <span className="mt-0.5 block truncate type-control-xs leading-tight text-muted-foreground">
                  {ws.slug ? `@${ws.slug}` : t`Profil personnel`}
                </span>
              </span>
              {activeWorkspace.id === ws.id && (
                <Check className="ml-auto size-3.5 shrink-0 text-foreground" strokeWidth={2} />
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>

        {mediaWorkspaces.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>{t`Publications & médias`}</DropdownMenuLabel>
              {mediaWorkspaces.map((ws) => (
                <DropdownMenuItem
                  key={ws.id}
                  onAction={() => handleSelect(ws)}
                  className="gap-2.5 py-1.5"
                >
                  <SafeAvatar
                    id={ws.id}
                    username={ws.slug}
                    src={ws.logoUrl}
                    name={ws.name}
                    size={26}
                    type={ws.type}
                    className="shrink-0"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate type-control-sm font-medium leading-tight text-foreground">
                      {ws.name}
                    </span>
                    <span className="mt-0.5 block truncate type-control-xs leading-tight text-muted-foreground">
                      {ws.role || t`Membre`}
                    </span>
                  </span>
                  {activeWorkspace.id === ws.id && (
                    <Check className="ml-auto size-3.5 shrink-0 text-foreground" strokeWidth={2} />
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </>
        )}

        <DropdownMenuSeparator />

        <DropdownMenuItem href="/media?create=1">
          <Plus className="text-muted-foreground" strokeWidth={1.75} />
          <span className="flex-1 truncate font-medium">{t`Créer un média`}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
