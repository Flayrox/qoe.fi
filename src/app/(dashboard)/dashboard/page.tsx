import { prisma } from "@/lib/db";

export default async function DashboardPage() {
  const user = await prisma.user.findFirst({
    include: { articles: true },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Overview</h1>
        <p className="text-muted-foreground mt-2">
          Welcome back to your creator dashboard, {user?.name || "Creator"}. You have {user?.articles.length || 0} articles.
        </p>
      </div>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Metric Cards Placeholders */}
        <div className="rounded-xl border border-border/50 bg-card p-6 shadow-sm">
          <div className="flex flex-row items-center justify-between space-y-0 pb-2">
            <h3 className="tracking-tight text-sm font-medium">Total Subscribers</h3>
          </div>
          <div className="text-2xl font-bold">1,240</div>
          <p className="text-xs text-muted-foreground">+20.1% from last month</p>
        </div>
        <div className="rounded-xl border border-border/50 bg-card p-6 shadow-sm">
          <div className="flex flex-row items-center justify-between space-y-0 pb-2">
            <h3 className="tracking-tight text-sm font-medium">MRR</h3>
          </div>
          <div className="text-2xl font-bold">€4,500</div>
          <p className="text-xs text-muted-foreground">+15% from last month</p>
        </div>
        <div className="rounded-xl border border-border/50 bg-card p-6 shadow-sm">
          <div className="flex flex-row items-center justify-between space-y-0 pb-2">
            <h3 className="tracking-tight text-sm font-medium">Avg Read Time</h3>
          </div>
          <div className="text-2xl font-bold">4m 12s</div>
          <p className="text-xs text-muted-foreground">+2s from last week</p>
        </div>
        <div className="rounded-xl border border-border/50 bg-card p-6 shadow-sm">
          <div className="flex flex-row items-center justify-between space-y-0 pb-2">
            <h3 className="tracking-tight text-sm font-medium">Open Rate</h3>
          </div>
          <div className="text-2xl font-bold">58.3%</div>
          <p className="text-xs text-muted-foreground">+5.4% from last newsletter</p>
        </div>
      </div>
      
      {/* Empty State / Content Area Placeholder */}
      <div className="rounded-xl border border-border/50 border-dashed min-h-[400px] flex items-center justify-center text-muted-foreground">
        Analytics chart will appear here.
      </div>
    </div>
  )
}
