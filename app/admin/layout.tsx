import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { getSessionUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Server-side guard for everything under /admin. The API routes check the role again on their own.
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  if (!user || user.role !== 'ADMIN') redirect('/staff');
  return <>{children}</>;
}
