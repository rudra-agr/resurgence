import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import CoordinatorClient from './CoordinatorClient';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'My dashboard', robots: { index: false } };

// Coordinators only. Not logged in goes to the login page; admins have their own workspace.
// The API routes under /api/coordinator check the role again on their own.
export default async function CoordinatorPage() {
  const user = await getSessionUser();
  if (!user) redirect('/staff');
  if (user.role === 'ADMIN') redirect('/admin/analytics');
  return <CoordinatorClient />;
}
