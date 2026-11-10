import type { Metadata } from 'next';
import AnalyticsTabs from './AnalyticsTabs';

export const metadata: Metadata = { title: 'Analytics', robots: { index: false } };

// /admin/analytics shows Overview; ?tab=studio opens Studio.
export default function AnalyticsPage({ searchParams }: { searchParams: { tab?: string | string[] } }) {
  return <AnalyticsTabs initialTab={searchParams.tab === 'studio' ? 'studio' : 'overview'} />;
}
