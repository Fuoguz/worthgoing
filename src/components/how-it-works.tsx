import { Compass, Scale, Sofa } from "lucide-react";
import { WEIGHTS } from "@/lib/types";
export function HowItWorks() {
  return (
    <section id="how-it-works" className="how-section shell">
      <div className="section-label">A LITTLE MORE INTENTION</div>
      <h2>Your free time deserves a good plan.</h2>
      <div className="how-grid">
        <div>
          <span className="how-icon">
            <Compass size={23} />
          </span>
          <h3>Start with your kind of day</h3>
          <p>
            Tell us what you like and what you have to spare. Time, money, and
            travel all count.
          </p>
        </div>
        <div>
          <span className="how-icon">
            <Scale size={23} />
          </span>
          <h3>See the whole trade-off</h3>
          <p>
            A clear score, an honest reason, and the catch. No endless feed to
            figure out.
          </p>
        </div>
        <div>
          <span className="how-icon">
            <Sofa size={23} />
          </span>
          <h3>Staying in is an answer, too</h3>
          <p>
            If nothing earns a dedicated trip, we’ll say so. Your afternoon
            doesn’t need filling.
          </p>
        </div>
      </div>
      <details className="method-details">
        <summary>What goes into a WorthGoing Score?</summary>
        <div className="method-content">
          <p>
            Five weighted components, one repeatable calculation. The total is
            rounded to a whole number.
          </p>
          <div className="weight-list">
            {Object.entries(WEIGHTS).map(([name, weight]) => (
              <span key={name}>
                {name}
                <strong>{weight}%</strong>
              </span>
            ))}
          </div>
          <p>
            “Worth a trip” needs 75+, an interest-fit score of at least 60,
            source confidence of at least 60, and every hard limit met. “Go if
            nearby” needs 50+ and no known hard limit exceeded. Otherwise, skip.
            Dislikes lower Interest Fit. Time includes estimated return travel.
          </p>
          <p>
            Unknown budget and travel receive 50/100, not a claim of fit. A
            confirmed start with an unknown full-trip duration receives at most
            50/100 for Time Fit; unconfirmed timing receives 0. Incomplete
            planning checks prevent “Worth a trip”. Evidence Confidence measures
            field completeness, not guaranteed availability. Travel uses
            straight-line distance and an 8 min/km + 5 min estimate each way.
            Your budget covers the activity; transport, optional extras and
            unlisted fees are excluded. Prices retain their source currency; no
            conversion is performed. Times use the event timezone. Mock fallback
            is always labeled.
          </p>
        </div>
      </details>
    </section>
  );
}
