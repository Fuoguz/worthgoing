"use client";
import { ArrowDown, ArrowUpRight, Check, Sparkles } from "lucide-react";
import { PreferenceForm } from "@/components/preference-form";
import { Illustration } from "@/components/illustration";
import { HowItWorks } from "@/components/how-it-works";
import { usePreferences } from "@/components/preferences-context";
export default function Home() {
  const { preferences, ready } = usePreferences();
  return (
    <main>
      <section className="hero shell">
        <div className="hero-copy">
          <div className="eyebrow">
            <span />
            LESS FOMO. MORE WORTH IT.
          </div>
          <h1>
            What’s worth
            <br />
            leaving <span>home</span> for?
          </h1>
          <p>
            A good afternoon. A little adventure. Something that actually fits
            your life. Let’s find it.
          </p>
          <a href="#find-a-plan" className="hero-link">
            Make your free time count <ArrowDown size={16} />
          </a>
        </div>
        <div className="hero-art">
          <div className="scene-frame">
            <Illustration hero />
            <span className="art-caption">
              A change of scenery, on your terms.
            </span>
          </div>
          <div className="floating-verdict">
            <span className="floating-icon">
              <Check size={18} />
            </span>
            <div>
              <strong>Worth a trip</strong>
              <span>A little less guesswork.</span>
            </div>
            <ArrowUpRight size={18} />
          </div>
          <span className="hero-spark">
            <Sparkles size={33} strokeWidth={1.4} />
          </span>
        </div>
      </section>
      <section
        className="shell form-section"
        aria-label="Your activity preferences"
      >
        {ready ? (
          <PreferenceForm initial={preferences} />
        ) : (
          <div
            className="form-skeleton skeleton"
            aria-label="Loading saved preferences"
          />
        )}
      </section>
      <HowItWorks />
    </main>
  );
}
