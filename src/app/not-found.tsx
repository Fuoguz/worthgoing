import Link from "next/link";
export default function NotFound() {
  return (
    <main className="shell results-main">
      <div className="empty-state">
        <span className="section-label">404 · A WRONG TURN</span>
        <h1>Let’s find a better plan.</h1>
        <p>This page isn’t here, but your next afternoon could be.</p>
        <Link href="/" className="button-primary">
          Back to WorthGoing
        </Link>
      </div>
    </main>
  );
}
