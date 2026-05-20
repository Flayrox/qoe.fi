import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { AnalyticsDashboard } from "./AnalyticsDashboard"

export default async function AnalyticsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  // Mock data for the MVP - in Phase 5 this will connect to Umami API
  const mockRevenueData = [
    { name: "Jan", revenue: 120, subscribers: 40 },
    { name: "Feb", revenue: 250, subscribers: 65 },
    { name: "Mar", revenue: 380, subscribers: 110 },
    { name: "Apr", revenue: 490, subscribers: 150 },
    { name: "May", revenue: 750, subscribers: 210 },
    { name: "Jun", revenue: 1050, subscribers: 305 },
  ]

  const mockTimeData = [
    { name: "Mon", minutes: 1240 },
    { name: "Tue", minutes: 1450 },
    { name: "Wed", minutes: 1890 },
    { name: "Thu", minutes: 2100 },
    { name: "Fri", minutes: 1750 },
    { name: "Sat", minutes: 3200 },
    { name: "Sun", minutes: 3800 },
  ]

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between pb-6 border-b border-border">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight font-sans">Analytics & Health</h1>
          <p className="text-muted-foreground font-sans text-sm mt-1">
            Measure what matters: Time Well Spent and sustainable growth.
          </p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <div className="bg-card border rounded-xl p-6 shadow-sm">
          <h3 className="text-sm font-medium text-muted-foreground mb-2">Monthly Recurring Revenue (MRR)</h3>
          <div className="text-3xl font-bold">1,050.00 €</div>
          <p className="text-xs text-green-500 mt-2 font-medium">+40% from last month</p>
        </div>
        <div className="bg-card border rounded-xl p-6 shadow-sm">
          <h3 className="text-sm font-medium text-muted-foreground mb-2">Time Well Spent (This Week)</h3>
          <div className="text-3xl font-bold text-primary">257 hours</div>
          <p className="text-xs text-green-500 mt-2 font-medium">+12% from last week</p>
        </div>
        <div className="bg-card border rounded-xl p-6 shadow-sm">
          <h3 className="text-sm font-medium text-muted-foreground mb-2">Avg. Reading Time</h3>
          <div className="text-3xl font-bold">4m 12s</div>
          <p className="text-xs text-muted-foreground mt-2">per visitor</p>
        </div>
        <div className="bg-card border rounded-xl p-6 shadow-sm">
          <h3 className="text-sm font-medium text-muted-foreground mb-2">Premium Conversion</h3>
          <div className="text-3xl font-bold text-amber-500">8.4%</div>
          <p className="text-xs text-green-500 mt-2 font-medium">+1.2% from last month</p>
        </div>
      </div>

      <AnalyticsDashboard revenueData={mockRevenueData} timeData={mockTimeData} />
    </div>
  )
}
