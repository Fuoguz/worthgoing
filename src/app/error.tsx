"use client";
import Link from "next/link";
import { CircleAlert, RefreshCw } from "lucide-react";
export default function ErrorPage({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <main className="shell results-main">
      <div className="empty-state" role="alert">
        <CircleAlert size={34} />
        <h1>A small detour.</h1>
        <p>
          Something interrupted this page. Try again or start with your
          preferences.
        </p>
        <div className="state-actions">
          <button className="button-primary" onClick={reset}>
            <RefreshCw size={16} />
            Try again
          </button>
          <Link href="/" className="button-secondary">
            Start again
          </Link>
        </div>
      </div>
    </main>
  );
}
