'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import CoordinatorForm from '../CoordinatorForm';
import { useLedger } from '../Providers';

export default function PostPage() {
  const { me, meLoaded, refresh } = useLedger();
  const router = useRouter();
  return (
    <div className="wrap page narrow">
      <p className="kicker">Coordinators</p>
      <h1 className="page-title">Post a need</h1>
      {!meLoaded ? (
        <p className="note">Checking your session…</p>
      ) : me?.coordinatorId ? (
        <CoordinatorForm
          onPosted={async (id) => {
            await refresh();
            router.push(`/needs/${id}`);
          }}
        />
      ) : (
        <p className="note">
          Log in as a coordinator to post a need. <Link href="/staff">Staff login</Link>
        </p>
      )}
    </div>
  );
}
