import Link from "next/link";
import { ArrowUpRight, Footprints, Sprout } from "lucide-react";
export function Header() {
  return (
    <header className="site-header">
      <div className="shell header-inner">
        <Link href="/" className="brand" aria-label="WorthGoing home">
          <span className="brand-icon">
            <Footprints size={21} strokeWidth={2.3} />
          </span>
          WorthGoing<span className="brand-dot">.</span>
        </Link>
        <nav aria-label="Main navigation">
          <Link href="/#how-it-works">
            How it works <ArrowUpRight size={14} />
          </Link>
          <span className="demo-pill">
            <span />
            Ticketmaster search
          </span>
        </nav>
      </div>
    </header>
  );
}
export function Footer() {
  return (
    <footer className="site-footer">
      <div className="shell footer-inner">
        <span>
          <Sprout size={17} />
          Less scrolling. Better going.
        </span>
        <span>Clear sources. Honest trade-offs.</span>
      </div>
    </footer>
  );
}
