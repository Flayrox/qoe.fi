// =====================================================================
// 🖥️ Server Component — apps/dashboard/src/app/(creator)/analytics/page.tsx
// =====================================================================

import { redirect } from 'next/navigation';
import { getCreatorAnalyticsData, AnalyticsResponseData } from './actions';
import { AnalyticsDashboardClient } from './AnalyticsDashboardClient';

export default async function AnalyticsPage() {
  const result = await getCreatorAnalyticsData('30d');

  if (result.error === 'Non autorisé') {
    redirect('/login');
  }

  const initialData: AnalyticsResponseData = result.data || {
    configured: false,
    websiteId: '',
    period: '30d',
    stats: null,
    timeseries: [],
    topPages: [],
    referrers: [],
    devices: [],
    browsers: [],
    countries: [],
    articleTitlesMap: {},
  };

  return <AnalyticsDashboardClient initialData={initialData} />;
}
