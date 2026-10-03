"use client";
import Image from "next/image";
import { useState } from "react";
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  Clock3,
  MapPin,
  Minus,
  Route,
  Scale,
  Ticket,
  X,
} from "lucide-react";
import { formatDate, formatTime } from "@/lib/preferences";
import type { ScoredActivity, Verdict } from "@/lib/types";
import { Illustration } from "./illustration";
import { money } from "@/lib/location";
export const verdictClass = (verdict: Verdict) =>
  verdict === "Worth a trip"
    ? "worth"
    : verdict === "Go if nearby"
      ? "nearby"
      : "skip";
export function VerdictBadge({ verdict }: { verdict: Verdict }) {
  const Icon =
    verdict === "Worth a trip" ? Check : verdict === "Go if nearby" ? Minus : X;
  return (
    <span className={`verdict-badge ${verdictClass(verdict)}`}>
      <Icon size={13} strokeWidth={2.8} />
      {verdict}
    </span>
  );
}
export function ActivityCard({
  activity: a,
  featured = false,
  rank,
}: {
  activity: ScoredActivity;
  featured?: boolean;
  rank: number;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  return (
    <article
      className={`activity-card ${featured ? "featured" : ""}`}
      aria-label={a.title}
    >
      <div className="card-art">
        {a.source.isMock ? (
          <Illustration kind={a.illustration ?? "canal"} />
        ) : a.image && !imageFailed ? (
          <>
            {!imageLoaded && (
              <div className="image-unavailable image-loading">
                <Ticket size={32} />
                <span>Image loading</span>
              </div>
            )}
            <Image
              src={a.image.url}
              alt={a.title}
              width={640}
              height={420}
              unoptimized
              className="live-event-image"
              onError={() => setImageFailed(true)}
              onLoad={() => setImageLoaded(true)}
            />
          </>
        ) : (
          <div className="image-unavailable">
            <Ticket size={32} />
            <span>Image unavailable</span>
          </div>
        )}
        <span className="category-tag">
          {a.source.isMock ? "Mock data" : "Live data"} ·{" "}
          {a.interests[0] ?? "Classification unavailable"}
        </span>
        {a.image && !a.source.isMock && imageLoaded && !imageFailed && (
          <span className="image-credit">
            {a.image.fallback
              ? "Ticketmaster generic image"
              : "Ticketmaster image"}
            {a.image.attribution ? ` · ${a.image.attribution}` : ""}
          </span>
        )}
        {featured && (
          <span className="top-pick">
            <span />
            YOUR BEST FIT
          </span>
        )}
      </div>
      <div className="card-content">
        <div className="card-verdict-row">
          <VerdictBadge verdict={a.verdict} />
          <div
            className={`score-number ${verdictClass(a.verdict)}`}
            aria-label={`WorthGoing Score ${a.score} out of 100`}
          >
            <strong>{a.score}</strong>
            <span>/100</span>
          </div>
        </div>
        <div className="card-title">
          <span className="card-rank">0{rank}</span>
          <h2>{a.title}</h2>
        </div>
        <p className="activity-description">
          {a.description ?? "Description unavailable from Ticketmaster."}
        </p>
        <div className="activity-facts">
          <span>
            <Clock3 size={14} />
            {a.date ? formatDate(a.date) : "Date unavailable"}
            {a.dateStatus && a.dateStatus !== "confirmed"
              ? ` (Date ${a.dateStatus})`
              : ""}{" "}
            · {a.startTime ? formatTime(a.startTime) : "Start time unavailable"}
            {a.timeStatus && a.timeStatus !== "confirmed"
              ? ` (Time ${a.timeStatus})`
              : ""}
            {a.endTime
              ? `–${formatTime(a.endTime)}${a.endTimeStatus === "approximate" ? " (end approximate)" : ""}`
              : " · End time unavailable"}
            {a.timezone
              ? ` · ${a.timezone}`
              : a.source.isMock
                ? ""
                : " · Timezone unavailable"}
          </span>
          <span>
            <MapPin size={14} />
            {a.venue ?? "Venue unavailable"}
            {a.source.isMock ? "" : ` · ${a.city ?? "City unavailable"}`}
          </span>
          <div>
            <span>
              <Route size={14} />
              {a.distanceKm == null
                ? "Distance unavailable"
                : `${a.distanceKm} km · straight-line estimate`}
              {a.travelMinutesOneWay != null
                ? ` · ~${a.travelMinutesOneWay} min each way (estimated)`
                : " · Travel time unavailable"}
            </span>
            <span>
              <Ticket size={14} />
              {priceLabel(a)}
            </span>
          </div>
        </div>
        {!a.source.isMock && (
          <p className="unknown-facts">
            {a.durationMinutes == null
              ? "Duration unavailable"
              : `Duration: ${a.durationMinutes} min`}{" "}
            · Crowd / noise / indoor-outdoor information unavailable
            {a.eventStatus ? ` · Status: ${a.eventStatus}` : ""}
          </p>
        )}
        <div className="decision-reasons">
          <div>
            <span className="reason-label">
              <Check size={13} />
              WHY
            </span>
            <p>{a.why}</p>
          </div>
          <div>
            <span className="reason-label trade">
              <Scale size={13} />
              TRADE-OFF
            </span>
            <p>{a.tradeOff}</p>
          </div>
        </div>
        <details className="score-details">
          <summary>
            Behind the {a.score}
            <span>
              Score breakdown <ChevronDown size={14} />
            </span>
          </summary>
          <div className="breakdown-content">
            <p className="breakdown-intro">
              The weighted total stays visible. A hard limit can still make the
              verdict “Skip”.
            </p>
            {a.breakdown.map((item) => (
              <div className="breakdown-item" key={item.category}>
                <div>
                  <strong>{item.category}</strong>
                  <span>
                    {item.weight}% weight · {item.score}/100
                  </span>
                </div>
                <div className="score-track">
                  <span style={{ width: `${item.score}%` }} />
                </div>
                <p>{item.explanation}</p>
              </div>
            ))}
            <p className="score-formula">
              {a.breakdown
                .map((item) => `${item.score} × ${item.weight}%`)
                .join(" + ")}{" "}
              = <strong>{a.score}</strong> (rounded)
            </p>
            {a.blockers.length > 0 && (
              <div className="blocker-note">
                <strong>Hard limits exceeded</strong>
                {a.blockers.map((blocker) => (
                  <p key={blocker}>{blocker}</p>
                ))}
              </div>
            )}
            {a.uncertainties.length > 0 && (
              <div className="blocker-note">
                <strong>Planning information unavailable / uncertain</strong>
                {a.uncertainties.map((issue) => (
                  <p key={issue}>{issue}</p>
                ))}
              </div>
            )}
          </div>
        </details>
        <div className="card-source">
          <span>
            {a.source.isMock ? "Mock data · Sample plan" : "Live data · Source"}
            : {a.source.name}
          </span>
          {a.source.url ? (
            <a
              href={a.source.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={
                a.source.isMock
                  ? `Check ${a.source.name} venue website`
                  : "Open original Ticketmaster event"
              }
            >
              {a.source.isMock ? "Venue website" : "Original event"}{" "}
              <ArrowUpRight size={13} />
            </a>
          ) : (
            <span>Source link unavailable</span>
          )}
        </div>
      </div>
    </article>
  );
}

function priceLabel(a: ScoredActivity): string {
  if (a.source.isMock)
    return a.price === 0 ? "Free (mock)" : `£${a.price} estimated (mock)`;
  if (a.priceMin == null && a.priceMax == null) return "Price unavailable";
  if (!a.currency) return "Price currency unavailable";
  if (a.priceMin != null && a.priceMax != null)
    return a.priceMin === a.priceMax
      ? `${money(a.priceMin, a.currency)} listed`
      : `${money(a.priceMin, a.currency)}–${money(a.priceMax, a.currency)} listed`;
  return `${a.priceMin != null ? "From " + money(a.priceMin, a.currency) : "Up to " + money(a.priceMax!, a.currency)} · incomplete range`;
}
