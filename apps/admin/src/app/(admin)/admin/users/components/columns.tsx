"use client"

import { ColumnDef } from "@tanstack/react-table"
import { MoreHorizontal, ShieldCheck, ShieldAlert, Ban, Unlock, Activity } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuGroup,
} from "@qoe/ui/ui/dropdown-menu"
import {
  toggleUserCertificationAction as toggleUserCertification,
  toggleUserShadowbanAction as toggleUserShadowban,
  suspendUserAction as suspendUser,
  unsuspendUserAction as unsuspendUser
} from "@qoe/api-client/actions/admin"


export type AdminUser = {
  id: string
  name: string | null
  email: string
  role: string
  isCertified: boolean
  isShadowbanned: boolean
  isSuspended: boolean
  createdAt: Date
  subdomain: string | null
}

export const columns: ColumnDef<AdminUser>[] = [
  {
    accessorKey: "email",
    header: "Utilisateur",
    cell: ({ row }) => {
      const user = row.original
      return (
        <div className="flex flex-col">
          <span className="font-semibold text-neutral-900">{user.name || "Sans Nom"}</span>
          <span className="text-xs text-neutral-500 font-mono">{user.email}</span>
        </div>
      )
    },
  },
  {
    accessorKey: "role",
    header: "Rôle",
    cell: ({ row }) => {
      const role = row.getValue("role") as string
      return (
        <span className="px-2.5 py-1 bg-neutral-100 text-neutral-600 rounded-lg text-[10px] uppercase font-bold tracking-wider">
          {role}
        </span>
      )
    }
  },
  {
    accessorKey: "subdomain",
    header: "Domaine",
    cell: ({ row }) => {
      const sub = row.getValue("subdomain") as string | null
      return sub ? (
        <span className="text-xs font-mono text-neutral-600 font-medium">{sub}.qoe.fi</span>
      ) : (
        <span className="text-xs text-neutral-400 italic">Non configuré</span>
      )
    }
  },
  {
    accessorKey: "status",
    header: "Statut",
    cell: ({ row }) => {
      const user = row.original
      if (user.isSuspended) return <span className="text-red-500 text-[10px] font-bold uppercase tracking-wider bg-red-50 px-2 py-1 rounded-md">Banni</span>
      if (user.isShadowbanned) return <span className="text-amber-600 text-[10px] font-bold uppercase tracking-wider bg-amber-50 px-2 py-1 rounded-md">Shadowbanned</span>
      if (user.isCertified) return <span className="text-blue-600 text-[10px] font-bold uppercase tracking-wider bg-blue-50 px-2 py-1 rounded-md">Certifié</span>
      return <span className="text-emerald-600 text-[10px] font-bold uppercase tracking-wider bg-emerald-50 px-2 py-1 rounded-md">Actif</span>
    }
  },
  {
    id: "actions",
    cell: ({ row }) => {
      const user = row.original

      return (
        <DropdownMenu>
          <DropdownMenuTrigger className="h-8 w-8 inline-flex items-center justify-center rounded-xl p-0 text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 focus:outline-none transition-colors">
            <span className="sr-only">Ouvrir menu</span>
            <MoreHorizontal className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 bg-white border-neutral-200 text-neutral-700 shadow-xl rounded-2xl p-1">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-xs font-bold uppercase tracking-wider text-neutral-400 px-2 py-1.5">
                Actions de Modération
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-neutral-100" />
              
              <DropdownMenuItem 
                onClick={() => window.location.href = `/admin/users/${user.id}`}
                className="cursor-pointer hover:bg-neutral-50 focus:bg-neutral-50 rounded-xl px-3 py-2 text-sm font-medium"
              >
                <Activity className="mr-2 h-4 w-4 opacity-70" />
                Creator Intelligence
              </DropdownMenuItem>

              <DropdownMenuItem 
                onClick={() => toggleUserCertification({ userId: user.id, isCertified: !user.isCertified })}
                className="cursor-pointer hover:bg-neutral-50 focus:bg-neutral-50 rounded-xl px-3 py-2 text-sm font-medium"
              >
                <ShieldCheck className="mr-2 h-4 w-4 opacity-70" />
                {user.isCertified ? "Retirer Certification" : "Certifier Créateur"}
              </DropdownMenuItem>

              <DropdownMenuItem 
                onClick={() => toggleUserShadowban({ userId: user.id, isShadowbanned: !user.isShadowbanned })}
                className="cursor-pointer hover:bg-amber-50 focus:bg-amber-50 text-amber-600 focus:text-amber-700 rounded-xl px-3 py-2 text-sm font-medium"
              >
                <ShieldAlert className="mr-2 h-4 w-4 opacity-70" />
                {user.isShadowbanned ? "Lever Shadowban" : "Appliquer Shadowban"}
              </DropdownMenuItem>

              <DropdownMenuSeparator className="bg-neutral-100" />

              <DropdownMenuItem 
                onClick={() => {
                  if (user.isSuspended) {
                    unsuspendUser(user.id)
                  } else {
                    const reason = prompt("Raison du bannissement :")
                    if (reason) suspendUser({ userId: user.id, reason })
                  }
                }}

                className="cursor-pointer hover:bg-red-50 focus:bg-red-50 text-red-600 focus:text-red-700 rounded-xl px-3 py-2 text-sm font-medium"
              >
                {user.isSuspended ? (
                  <><Unlock className="mr-2 h-4 w-4 opacity-70" /> Débannir le compte</>
                ) : (
                  <><Ban className="mr-2 h-4 w-4 opacity-70" /> Bannir (Supabase Auth)</>
                )}
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      )
    },
  },
]
