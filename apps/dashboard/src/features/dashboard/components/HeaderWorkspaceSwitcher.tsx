'use client';

import React, { useState, useEffect } from 'react';
import { ChevronDown, Check, Building2, User, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { getUserWorkspacesAction } from '@/app/(creator)/media/actions';
import type { WorkspaceInfo as Workspace } from '@/app/(creator)/media/actions';
import { t } from '@lingui/core/macro';

const WORKSPACE_COOKIE = 'qoe_active_workspace';

export function HeaderWorkspaceSwitcher() {
  const router = useRouter();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace | null>(null);
  const [isOpen, setIsOpen] = useState(false);

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
    setIsOpen(false);
    // Le dashboard entier (Home, Articles, Audience, Analytics, Réglages)
    // opère sur le workspace actif — on reste sur la même app, sans changer de compte.
    if (ws.type === 'MEDIA') {
      router.push('/');
    } else {
      router.push('/');
    }
  };

  if (!activeWorkspace) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-card/80 border border-border/40 hover:bg-muted/60 transition-all text-xs font-semibold cursor-pointer shadow-sm"
      >
        <div className="w-5 h-5 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
          {activeWorkspace.type === 'MEDIA' ? (
            <Building2 className="w-3 h-3" />
          ) : (
            <User className="w-3 h-3" />
          )}
        </div>
        <span className="truncate max-w-[130px] text-foreground font-medium">
          {activeWorkspace.name}
        </span>
        <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
      </button>

      {isOpen && (
        <div className="absolute left-0 mt-2 w-60 rounded-2xl bg-card border border-border/40 shadow-xl py-2 z-50 animate-in fade-in slide-in-from-top-2">
          <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Espaces de Travail
          </div>

          <div className="divide-y divide-border/20">
            {workspaces.map((ws) => (
              <button
                key={ws.id}
                onClick={() => handleSelect(ws)}
                className="w-full text-left px-3 py-2.5 text-xs flex items-center justify-between hover:bg-muted/50 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-5 h-5 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    {ws.type === 'MEDIA' ? (
                      <Building2 className="w-3 h-3" />
                    ) : (
                      <User className="w-3 h-3" />
                    )}
                  </div>
                  <div className="truncate">
                    <p className="font-semibold text-foreground truncate">{ws.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {ws.type === 'MEDIA' ? `Média (${ws.role || 'Membre'})` : 'Profil Personnel'}
                    </p>
                  </div>
                </div>
                {activeWorkspace.id === ws.id && (
                  <Check className="w-4 h-4 text-primary shrink-0" />
                )}
              </button>
            ))}
          </div>

          <div className="border-t border-border/20 mt-1 pt-1 px-1">
            <a
              href="/media?create=1"
              className="flex items-center gap-2 px-2.5 py-2 text-xs font-semibold text-primary hover:bg-primary/5 rounded-xl transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t`Créer un Média`}</span>
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
