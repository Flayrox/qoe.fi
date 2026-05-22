import { prisma } from "@/lib/db"
import { DataTable } from "./components/data-table"
import { columns, AdminUser } from "./components/columns"
import { Users } from "lucide-react"

export default async function AdminUsers() {
  // Fetch all users for moderation
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isCertified: true,
      isShadowbanned: true,
      isSuspended: true,
      createdAt: true,
      subdomain: true,
    }
  })

  return (
    <div className="max-w-6xl mx-auto space-y-8 font-sans">
      <div className="flex items-center gap-3 mb-8">
        <div className="p-3 bg-neutral-100 border border-neutral-200/60 rounded-[28px] text-neutral-900 shadow-sm">
          <Users className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Utilisateurs & Modération</h1>
          <p className="text-neutral-500 mt-1 text-sm">Gérez tous les comptes, bannissements, et certifications.</p>
        </div>
      </div>

      <DataTable columns={columns} data={users as AdminUser[]} />
    </div>
  )
}
