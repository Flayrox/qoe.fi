'use client';

import { ColumnDef } from '@tanstack/react-table';
import { MoreHorizontal, ShieldCheck, ShieldAlert, Ban, Unlock, Activity } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuGroup,
} from '@qoe/ui/ui/dropdown-menu';
import {
  toggleUserCertificationAction as toggleUserCertification,
  toggleUserShadowbanAction as toggleUserShadowban,
  suspendUserAction as suspendUser,
  unsuspendUserAction as unsuspendUser,
} from '@qoe/api-client/actions/admin';

export type AdminUser = {
  id: string;
  name: string | null;
  email: string;
  role: string;
  isCertified: boolean;
  isShadowbanned: boolean;
  isSuspended: boolean;
  createdAt: Date;
  subdomain: string | null;
};

export const columns: ColumnDef<AdminUser>[] = [
  {
    accessorKey: 'email',
    header: 'Utilisateur',
    cell: ({ row }) => {
      const user = row.original;
      return (
        <div className="flex flex-col">
          <span className="font-semibold text-foreground">{user.name || 'Sans Nom'}</span>
          <span className="text-xs text-muted-foreground font-mono">{user.email}</span>
        </div>
      );
    },
  },
  {
    accessorKey: 'role',
    header: 'Rôle',
    cell: ({ row }) => {
      const role = row.getValue('role') as string;
      return (
        <span className="px-2.5 py-1 bg-muted text-muted-foreground rounded-lg text-[10px] uppercase font-bold tracking-wider">
          {role}
        </span>
      );
    },
  },
  {
    accessorKey: 'subdomain',
    header: 'Domaine',
    cell: ({ row }) => {
      const sub = row.getValue('subdomain') as string | null;
      return sub ? (
        <span className="text-xs font-mono text-muted-foreground font-medium">{sub}.qoe.fi</span>
      ) : (
        <span className="text-xs text-muted-foreground italic">Non configuré</span>
      );
    },
  },
  {
    accessorKey: 'status',
    header: 'Statut',
    cell: ({ row }) => {
      const user = row.original;
      if (user.isSuspended)
        return (
          <span className="text-destructive text-[10px] font-bold uppercase tracking-wider bg-destructive/10 px-2 py-1 rounded-md">
            Banni
          </span>
        );
      if (user.isShadowbanned)
        return (
          <span className="text-highlight text-[10px] font-bold uppercase tracking-wider bg-highlight/10 px-2 py-1 rounded-md">
            Shadowbanned
          </span>
        );
      if (user.isCertified)
        return (
          <span className="text-neural-blue text-[10px] font-bold uppercase tracking-wider bg-neural-blue/10 px-2 py-1 rounded-md">
            Certifié
          </span>
        );
      return (
        <span className="text-success text-[10px] font-bold uppercase tracking-wider bg-success/10 px-2 py-1 rounded-md">
          Actif
        </span>
      );
    },
  },
  {
    id: 'actions',
    cell: ({ row }) => {
      const user = row.original;

      return (
        <DropdownMenu>
          <DropdownMenuTrigger className="h-8 w-8 inline-flex items-center justify-center rounded-xl p-0 text-muted-foreground hover:text-foreground hover:bg-secondary focus:outline-none transition-colors">
            <span className="sr-only">Ouvrir menu</span>
            <MoreHorizontal className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-56 bg-white border-border text-muted-foreground shadow-xl rounded-2xl p-1"
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-2 py-1.5">
                Actions de Modération
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-border" />

              <DropdownMenuItem
                onClick={() => (window.location.href = `/admin/users/${user.id}`)}
                className="cursor-pointer hover:bg-muted focus:bg-muted rounded-xl px-3 py-2 text-sm font-medium"
              >
                <Activity className="mr-2 h-4 w-4 opacity-70" />
                Creator Intelligence
              </DropdownMenuItem>

              <DropdownMenuItem
                onClick={() =>
                  toggleUserCertification({ userId: user.id, isCertified: !user.isCertified })
                }
                className="cursor-pointer hover:bg-muted focus:bg-muted rounded-xl px-3 py-2 text-sm font-medium"
              >
                <ShieldCheck className="mr-2 h-4 w-4 opacity-70" />
                {user.isCertified ? 'Retirer Certification' : 'Certifier Créateur'}
              </DropdownMenuItem>

              <DropdownMenuItem
                onClick={() =>
                  toggleUserShadowban({ userId: user.id, isShadowbanned: !user.isShadowbanned })
                }
                className="cursor-pointer hover:bg-highlight/10 focus:bg-highlight/10 text-highlight focus:text-highlight rounded-xl px-3 py-2 text-sm font-medium"
              >
                <ShieldAlert className="mr-2 h-4 w-4 opacity-70" />
                {user.isShadowbanned ? 'Lever Shadowban' : 'Appliquer Shadowban'}
              </DropdownMenuItem>

              <DropdownMenuSeparator className="bg-border" />

              <DropdownMenuItem
                onClick={() => {
                  if (user.isSuspended) {
                    unsuspendUser(user.id);
                  } else {
                    const reason = prompt('Raison du bannissement :');
                    if (reason) suspendUser({ userId: user.id, reason });
                  }
                }}

                className="cursor-pointer hover:bg-destructive/10 focus:bg-destructive/10 text-destructive focus:text-destructive rounded-xl px-3 py-2 text-sm font-medium"
              >
                {user.isSuspended ? (
                  <>
                    <Unlock className="mr-2 h-4 w-4 opacity-70" /> Débannir le compte
                  </>
                ) : (
                  <>
                    <Ban className="mr-2 h-4 w-4 opacity-70" /> Bannir (Supabase Auth)
                  </>
                )}
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  },
];
