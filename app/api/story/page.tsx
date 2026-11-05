

import type { Metadata } from 'next';
import { prisma } from '@/lib/db';
import { StoryClient } from './StoryClient';

export const metadata: Metadata = {
  title: 'August 26 — The Story',
  description:
    'The Rasuwa GLOF of 2026, the relief response, and why transparency matters.',
};

export default async function StoryPage() {
  const [contributions, snapshots] = await Promise.all([
    prisma.reliefContribution.findMany({ orderBy: { nprMillion: 'desc' } }),
    prisma.fundSnapshot.findMany({ orderBy: { daysAfterEvent: 'asc' } }),
  ]);

  return <StoryClient contributions={contributions} snapshots={snapshots} />;
}
