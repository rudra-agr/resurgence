import type { Metadata } from 'next';
import AnalyticsClient from './AnalyticsClient';

export const metadata: Metadata = { title: 'Analytics', robots: { index: false } };

export default function AnalyticsPage() {
  return <AnalyticsClient />;
}
