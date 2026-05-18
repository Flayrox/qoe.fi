import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { getDictionary } from "@/lib/i18n";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  const user = authUser
    ? await prisma.user.findUnique({
        where: { id: authUser.id },
        include: { articles: true },
      })
    : null;

  const dict = await getDictionary();
  const userName = user?.name || "Creator";
  const articleCount = user?.articles.length || 0;
  const welcomeText = dict.dashboard.welcome
    .replace("{name}", userName)
    .replace("{count}", String(articleCount));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{dict.dashboard.overview}</h1>
        <p className="text-muted-foreground mt-2">
          {welcomeText}
        </p>
      </div>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Metric Cards Placeholders */}
        <div className="rounded-xl border border-border/50 bg-card p-6 shadow-sm">
          <div className="flex flex-row items-center justify-between space-y-0 pb-2">
            <h3 className="tracking-tight text-sm font-medium">{dict.dashboard.metric_subscribers}</h3>
          </div>
          <div className="text-2xl font-bold">1,240</div>
          <p className="text-xs text-muted-foreground">+20.1% {dict.dashboard.compare_month}</p>
        </div>
        <div className="rounded-xl border border-border/50 bg-card p-6 shadow-sm">
          <div className="flex flex-row items-center justify-between space-y-0 pb-2">
            <h3 className="tracking-tight text-sm font-medium">{dict.dashboard.metric_mrr}</h3>
          </div>
          <div className="text-2xl font-bold">€4,500</div>
          <p className="text-xs text-muted-foreground">+15% {dict.dashboard.compare_month}</p>
        </div>
        <div className="rounded-xl border border-border/50 bg-card p-6 shadow-sm">
          <div className="flex flex-row items-center justify-between space-y-0 pb-2">
            <h3 className="tracking-tight text-sm font-medium">{dict.dashboard.metric_read_time}</h3>
          </div>
          <div className="text-2xl font-bold">4m 12s</div>
          <p className="text-xs text-muted-foreground">+2s {dict.dashboard.compare_week}</p>
        </div>
        <div className="rounded-xl border border-border/50 bg-card p-6 shadow-sm">
          <div className="flex flex-row items-center justify-between space-y-0 pb-2">
            <h3 className="tracking-tight text-sm font-medium">{dict.dashboard.metric_open_rate}</h3>
          </div>
          <div className="text-2xl font-bold">58.3%</div>
          <p className="text-xs text-muted-foreground">+5.4% {dict.dashboard.compare_newsletter}</p>
        </div>
      </div>
      
      {/* Empty State / Content Area Placeholder */}
      <div className="rounded-xl border border-border/50 border-dashed min-h-[400px] flex items-center justify-center text-muted-foreground">
        {dict.dashboard.analytics_placeholder}
      </div>
    </div>
  )
}
