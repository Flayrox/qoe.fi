import { loadHomeFeedData } from '@/lib/home-feed-data';
import { FeedDashboard } from './FeedDashboard';

export default async function ReaderHomePage() {
  const feedProps = await loadHomeFeedData();
  return <FeedDashboard {...feedProps} />;
}
