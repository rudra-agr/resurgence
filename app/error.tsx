'use client';

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="wrap page narrow" role="alert">
      <p className="kicker">Something went wrong</p>
      <h1 className="page-title">This page hit a problem</h1>
      <p className="page-lead">Try again. If it keeps happening, reload the page.</p>
      <button onClick={reset}>Try again</button>
    </div>
  );
}