// =====================================================================
// 🖥️ Server Component — apps/studio/src/app/(creator)/analytics/page.tsx
// =====================================================================

import { redirect } from 'next/navigation';
import { getCreatorAnalyticsData, AnalyticsResponseData } from './actions';
import { getLanguage } from '@qoe/i18n/server';
import { AnalyticsDashboardClient } from './AnalyticsDashboardClient';

export default async function AnalyticsPage() {
  const [result, language] = await Promise.all([getCreatorAnalyticsData('30d'), getLanguage()]);

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
    productMetrics: {
      subscriberCount: 0,
      subscriberDelta7d: 0,
      totalBookmarks: 0,
      totalHighlights: 0,
      totalInteractions: 0,
      avgCompletionRate: null,
      readingQuality: {
        deepReadsRate: 0,
        skimsRate: 0,
        bouncesRate: 0,
      },
      trafficSources: {
        feed: 0,
        subdomain: 0,
        publicProfile: 0,
        direct: 0,
      },
      topCategories: [],
      topArticles: [],
    },
    audience: {
      creator: { declared: 0, gender: [], ageRange: [], countries: [], languages: [] },
      platform: { declared: 0, gender: [], ageRange: [], countries: [], languages: [] },
    },
    umamiAdvanced: { returning: null, hours: [] },
    provenance: { bySource: [], byHostname: [], byReferrer: [] },
    featureInterest: [],
  };

  return (
    <AnalyticsDashboardClient initialData={initialData} locale={language === 'en' ? 'en' : 'fr'} />
  );
}
