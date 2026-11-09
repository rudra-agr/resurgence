import type { Metadata } from 'next';
import StudioLoader from './StudioLoader';

export const metadata: Metadata = { title: 'Studio', robots: { index: false } };

export default function StudioPage() {
  return <StudioLoader />;
}
