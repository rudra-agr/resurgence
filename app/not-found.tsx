import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="wrap page narrow">
      <p className="kicker">404</p>
      <h1 className="page-title">We could not find that page</h1>
      <p className="page-lead">The link may be old, or the need may have been removed.</p>
      <Link className="btn" href="/needs">Browse needs</Link>
    </div>
  );
}