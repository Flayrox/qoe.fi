'use client';

import React, { useState, useEffect } from 'react';
import { ChevronsUpDown, Check, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { getUserWorkspacesAction } from '@/app/(creator)/media/actions';
import type { WorkspaceInfo as Workspace } from '@/app/(creator)/media/actions';
import { t } from '@lingui/core/macro';
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

const WORKSPACE_COOKIE = 'qoe_active_workspace';

export function HeaderWorkspaceSwitcher() {
  const router = useRouter();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace | null>(null);

  useEffect(() => {
    getUserWorkspacesAction().then((res) => {
      if (res.success) {
        const all: Workspace[] = [res.personal, ...(res.medias || [])];
        setWorkspaces(all);

        // Charge le workspace actif depuis le cookie (ou défaut = personnel)
        const savedRaw = document.cookie
          .split('; ')
          .find((row) => row.startsWith(`${WORKSPACE_COOKIE}=`))
          ?.split('=')[1];
        let saved: { type?: string; id?: string } | null = null;
        try {
          saved = savedRaw ? JSON.parse(decodeURIComponent(savedRaw)) : null;
        } catch {
          saved = null;
        }

        const found = all.find((w) => w?.id === saved?.id && w.type === saved?.type);
        setActiveWorkspace(found || res.personal);
      }
    });
  }, []);

  const setActiveCookie = (ws: Workspace) => {
    const value = encodeURIComponent(JSON.stringify({ type: ws.type, id: ws.id }));
    document.cookie = `${WORKSPACE_COOKIE}=${value}; path=/; max-age=2592000`;
  };

  const handleSelect = (ws: Workspace) => {
    setActiveWorkspace(ws);
    setActiveCookie(ws);
    // Le dashboard entier (Home, Articles, Audience, Analytics, Réglages)
    // opère sur le workspace actif : on recharge la même app pour que les
    // données suivent, quel que soit le type d'espace.
    router.push('/');
  };

  if (!activeWorkspace) return null;

  const personalWorkspaces = workspaces.filter((ws) => ws.type === 'PERSONAL');
  const mediaWorkspaces = workspaces.filter((ws) => ws.type === 'MEDIA');

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t`Changer d’espace de travail`}
        className="group/ws inline-flex h-control-sm cursor-pointer items-center gap-2 rounded-control border border-border bg-card px-2.5 type-control-sm font-medium text-foreground transition-colors outline-none hover:bg-secondary/70 data-[pressed]:bg-secondary data-[focus-visible]:ring-2 data-[focus-visible]:ring-ring/60"
      >
        <SafeAvatar
          id={activeWorkspace.id}
          username={activeWorkspace.slug}
          src={activeWorkspace.logoUrl}
          name={activeWorkspace.name}
          size={20}
          type={activeWorkspace.type}
          className="shrink-0"
        />
        <span className="max-w-[140px] truncate">{activeWorkspace.name}</span>
        <ChevronsUpDown
          className="ml-0.5 size-3.5 shrink-0 text-muted-foreground transition-colors group-hover/ws:text-foreground"
          strokeWidth={1.5}
        />
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="start"
        side="bottom"
        sideOffset={6}
        aria-label={t`Espaces de travail`}
        className="w-64"
      >
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
