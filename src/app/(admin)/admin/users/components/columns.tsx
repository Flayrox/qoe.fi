"use client"

import { ColumnDef } from "@tanstack/react-table"
import { MoreHorizontal, ShieldCheck, ShieldAlert, Ban, Unlock } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { toggleUserCertification, toggleUserShadowban, suspendUser, unsuspendUser } from "../../actions"

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
          <span className="font-semibold text-zinc-100">{user.name || "Sans Nom"}</span>
          <span className="text-xs text-zinc-500 font-mono">{user.email}</span>
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
        <span className="px-2.5 py-1 bg-zinc-800 text-zinc-300 rounded-lg text-[10px] uppercase font-bold tracking-wider">
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
        <span className="text-xs font-mono text-zinc-400">{sub}.qoe.fi</span>
      ) : (
        <span className="text-xs text-zinc-600 italic">Non configuré</span>
      )
    }
  },
  {
    accessorKey: "status",
    header: "Statut",
    cell: ({ row }) => {
      const user = row.original
      if (user.isSuspended) return <span className="text-red-400 text-xs font-bold uppercase">Banni</span>
      if (user.isShadowbanned) return <span className="text-amber-400 text-xs font-bold uppercase">Shadowbanned</span>
      if (user.isCertified) return <span className="text-blue-400 text-xs font-bold uppercase">Certifié</span>
      return <span className="text-emerald-400 text-xs font-bold uppercase">Actif</span>
    }
  },
  {
    id: "actions",
    cell: ({ row }) => {
      const user = row.original

      return (
        <DropdownMenu>
          {/* @ts-expect-error React 19 Radix UI type mismatch */}
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800">
              <span className="sr-only">Ouvrir menu</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 bg-zinc-950 border-zinc-800 text-zinc-200">
            <DropdownMenuLabel>Actions de Modération</DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-zinc-800" />
            
            <DropdownMenuItem 
              onClick={() => toggleUserCertification(user.id, !user.isCertified)}
              className="cursor-pointer hover:bg-zinc-800 focus:bg-zinc-800"
            >
              <ShieldCheck className="mr-2 h-4 w-4" />
              {user.isCertified ? "Retirer Certification" : "Certifier Créateur"}
            </DropdownMenuItem>

            <DropdownMenuItem 
              onClick={() => toggleUserShadowban(user.id, !user.isShadowbanned)}
              className="cursor-pointer hover:bg-zinc-800 focus:bg-zinc-800 text-amber-500 focus:text-amber-500"
            >
              <ShieldAlert className="mr-2 h-4 w-4" />
              {user.isShadowbanned ? "Lever Shadowban" : "Appliquer Shadowban"}
            </DropdownMenuItem>

            <DropdownMenuSeparator className="bg-zinc-800" />

            <DropdownMenuItem 
              onClick={() => {
                if (user.isSuspended) {
                  unsuspendUser(user.id)
                } else {
                  const reason = prompt("Raison du bannissement :")
                  if (reason) suspendUser(user.id, reason)
                }
              }}
              className="cursor-pointer hover:bg-red-950 focus:bg-red-950 text-red-500 focus:text-red-500"
            >
              {user.isSuspended ? (
                <><Unlock className="mr-2 h-4 w-4" /> Débannir le compte</>
              ) : (
                <><Ban className="mr-2 h-4 w-4" /> Bannir (Supabase Auth)</>
              )}
            </DropdownMenuItem>

          </DropdownMenuContent>
        </DropdownMenu>
      )
    },
  },
]
