import type { Metadata } from 'next';
import OperationsLoader from './OperationsLoader';

export const metadata: Metadata = { title: 'Operations', robots: { index: false } };

// /admin/operations is already guarded by app/admin/layout.tsx (non-admins go to /staff).
// The API routes under /api/admin/operations check the ADMIN role again on their own.
export default function OperationsPage() {
  return <OperationsLoader />;
}
