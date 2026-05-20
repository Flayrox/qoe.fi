"use client"

import { ColumnDef } from "@tanstack/react-table"
import { format } from "date-fns"
import { ArrowUpDown } from "lucide-react"
import { ClientActions } from "./ClientActions"

export type Subscriber = {
  id: string
  email: string
  status: "Free" | "Premium"
  isActive: boolean
  joinedAt: Date
  ltv: number
}

export const columns: ColumnDef<Subscriber>[] = [
  {
    accessorKey: "email",
    header: ({ column }) => {
      return (
        <button
          className="flex items-center gap-2 hover:text-foreground"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Email
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </button>
      )
    },
    cell: ({ row }) => <div className="font-medium">{row.getValue("email")}</div>,
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const status = row.getValue("status") as string
      return (
        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
          status === "Premium" ? "bg-amber-500/10 text-amber-500 border border-amber-500/20" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
        }`}>
          {status}
        </span>
      )
    },
  },
  {
    accessorKey: "isActive",
    header: "State",
    cell: ({ row }) => {
      const isActive = row.getValue("isActive") as boolean
      return (
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="text-sm text-muted-foreground">{isActive ? 'Subscribed' : 'Unsubscribed'}</span>
        </div>
      )
    },
  },
  {
    accessorKey: "ltv",
    header: () => <div className="text-right">Lifetime Value</div>,
    cell: ({ row }) => {
      const amount = parseFloat(row.getValue("ltv"))
      const formatted = new Intl.NumberFormat("en-IE", {
        style: "currency",
        currency: "EUR",
      }).format(amount)
 
      return <div className="text-right font-medium">{formatted}</div>
    },
  },
  {
    accessorKey: "joinedAt",
    header: "Joined",
    cell: ({ row }) => {
      return <div className="text-muted-foreground text-sm">{format(row.getValue("joinedAt"), "MMM d, yyyy")}</div>
    },
  },
  {
    id: "actions",
    cell: ({ row }) => {
      const subscriber = row.original
      return <ClientActions email={subscriber.email} />
    },
  },
]
