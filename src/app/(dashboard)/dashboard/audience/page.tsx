import { createClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/db"
import { redirect } from "next/navigation"
import { DataTable } from "./data-table"
import { columns } from "./columns"

export default async function AudiencePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  // Fetch subscribers for this creator
  const subscribers = await prisma.subscriber.findMany({
    where: { creatorId: user.id },
    orderBy: { createdAt: 'desc' }
  })

  // Format data for the table
  const data = subscribers.map(sub => ({
    id: sub.id,
    email: sub.email,
    status: sub.isPremium ? ("Premium" as const) : ("Free" as const),
    isActive: sub.isActive,
    joinedAt: sub.createdAt,
    ltv: sub.ltvCents / 100, // Convert cents to euros
  }))

  const premiumCount = subscribers.filter(s => s.isPremium && s.isActive).length
  const freeCount = subscribers.filter(s => !s.isPremium && s.isActive).length
  const totalRevenue = data.reduce((acc, curr) => acc + curr.ltv, 0)

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between pb-6 border-b border-border">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight font-sans">Audience & CRM</h1>
          <p className="text-muted-foreground font-sans text-sm mt-1">
            Manage your subscribers, analyze segments, and track lifetime value.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="bg-card border rounded-xl p-6 shadow-sm">
          <h3 className="text-sm font-medium text-muted-foreground mb-2">Total Active</h3>
          <div className="text-3xl font-bold">{freeCount + premiumCount}</div>
        </div>
        <div className="bg-card border rounded-xl p-6 shadow-sm">
          <h3 className="text-sm font-medium text-muted-foreground mb-2">Premium Members</h3>
          <div className="text-3xl font-bold text-amber-500">{premiumCount}</div>
        </div>
        <div className="bg-card border rounded-xl p-6 shadow-sm">
          <h3 className="text-sm font-medium text-muted-foreground mb-2">Total LTV</h3>
          <div className="text-3xl font-bold text-green-500">{totalRevenue.toFixed(2)} €</div>
        </div>
      </div>

      <div className="bg-card border rounded-xl shadow-sm overflow-hidden">
        <DataTable columns={columns} data={data} />
      </div>
    </div>
  )
}
