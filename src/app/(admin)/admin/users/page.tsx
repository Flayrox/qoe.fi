import { prisma } from "@/lib/db"
import { DataTable } from "./components/data-table"
import { columns, AdminUser } from "./components/columns"

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
    <div className="p-8 max-w-6xl mx-auto space-y-8 font-sans">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Utilisateurs & Modération</h1>
        <p className="text-zinc-400 mt-1 text-sm">Gérez tous les comptes, bannissements, et certifications depuis le Tribunal.</p>
      </div>

      <DataTable columns={columns} data={users as AdminUser[]} />
    </div>
  )
}
