"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CircleAlert,
  Clock3,
  MapPin,
  RefreshCw,
  SlidersHorizontal,
  Sofa,
  Sparkles,
} from "lucide-react";
import { usePreferences } from "@/components/preferences-context";
import { ActivityCard } from "@/components/activity-card";
import { HowItWorks } from "@/components/how-it-works";
import { activityProvider } from "@/lib/providers";
import { rankActivities, providedInterestMatcher } from "@/lib/scoring";
import { formatDate, formatTime, validatePreferences } from "@/lib/preferences";
import type { ScoredActivity, Verdict, SearchResult } from "@/lib/types";
import { budgetCurrency, resolveSearchLocation, money } from "@/lib/location";
type Filter = "All options" | Verdict;
type ResultState =
  | { status: "loading" }
  | { status: "success"; activities: ScoredActivity[]; search: SearchResult }
  | { status: "error"; message: string };
export default function Results() {
  const { preferences: p, ready, storageWarning } = usePreferences();
  const [state, setState] = useState<ResultState>({ status: "loading" });
  const [filter, setFilter] = useState<Filter>("All options");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!ready || !p) return;
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) setState({ status: "loading" });
    });
    const timer = setTimeout(async () => {
      try {
        const issue = validatePreferences(p);
        if (issue) throw new Error(issue);
        const search = await activityProvider.searchWithMetadata(
          p,
          controller.signal,
        );
        const ranked = await rankActivities(
          search.activities,
          p,
          providedInterestMatcher,
        );
        if (!controller.signal.aborted)
          setState({
            status: "success",
            activities: ranked.slice(0, 5),
            search,
          });
      } catch (error) {
        if (!controller.signal.aborted)
          setState({
            status: "error",
            message:
              error instanceof Error
                ? error.message
                : "We couldn’t load your options.",
          });
      }
    }, 450);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [ready, p, retry]);
  if (!ready)
    return (
      <main className="results-main shell">
        <ResultSkeleton />
      </main>
    );
  if (!p)
    return (
      <main className="shell results-main">
        <div className="empty-state">
          <Sparkles size={34} />
          <h1>Let’s start with your day.</h1>
          <p>A few preferences help us weigh what’s worth your time.</p>
          <Link href="/" className="button-primary">
            Find a plan <ArrowRight size={16} />
          </Link>
        </div>
      </main>
    );
  const activities = state.status === "success" ? state.activities : [];
  const worthCount = activities.filter(
    (a) => a.verdict === "Worth a trip",
  ).length;
  const visible =
    filter === "All options"
      ? activities
      : activities.filter((a) => a.verdict === filter);
  return (
    <main>
      <div className="results-main shell">
        <Link href="/" className="back-link">
          <ArrowLeft size={15} />
          Back to your day
        </Link>
        <div className="results-heading">
          <div>
            <span className="section-label">LESS SEARCHING. MORE LIVING.</span>
            <h1>A few ways to spend it well.</h1>
            <p>Considered for your day. Ranked by what matters to you.</p>
          </div>
          <Link href="/" className="button-secondary">
            <SlidersHorizontal size={15} />
            Edit preferences
          </Link>
        </div>
        <div className="search-summary">
          <span>
            <MapPin size={15} />
            {p.location}
          </span>
          <span>
            <CalendarDays size={15} />
            {formatDate(p.date)}
          </span>
          <span>
            <Clock3 size={15} />
            {formatTime(p.startTime)}–{formatTime(p.endTime)} ·{" "}
            {p.availableMinutes / 60}h free
          </span>
          <span>{money(p.maxBudget, budgetCurrency(p))} budget</span>
          <span>{p.maxDistanceKm} km max</span>
          <span>
            {resolveSearchLocation(p.location).timezone ??
              "Event-local timezone"}
          </span>
        </div>
        <div className="demo-notice">
          <CircleAlert size={16} />
          <p>
            <strong>
              {state.status === "success"
                ? state.search.dataMode === "live"
                  ? "Live data · Ticketmaster. "
                  : state.search.dataMode === "mock"
                    ? "Mock data · Demo fallback. "
                    : "Live search unavailable. "
                : "Searching Ticketmaster… "}
            </strong>
            {state.status === "success"
              ? state.search.message
              : "Only source-provided facts will be shown; unknown fields remain unknown."}
            {state.status === "success" &&
              state.search.dataMode === "live" &&
              ` ${state.search.diagnostics.rawCount} retrieved · ${state.search.diagnostics.normalizedCount} normalized · ${activities.length} shown. Prices and availability need checking at the original event link.`}
          </p>
        </div>
        {storageWarning && (
          <p className="storage-warning" role="status">
            {storageWarning}
          </p>
        )}
        {state.status === "loading" && <ResultSkeleton />}
        {state.status === "error" && (
          <div className="empty-state" role="alert">
            <CircleAlert size={34} />
            <h2>A small detour.</h2>
            <p>{state.message}</p>
            <div className="state-actions">
              <button
                className="button-primary"
                onClick={() => setRetry((n) => n + 1)}
              >
                <RefreshCw size={16} />
                Try again
              </button>
              <Link href="/" className="button-secondary">
                Edit your day
              </Link>
            </div>
          </div>
        )}
        {state.status === "success" && activities.length === 0 && (
          <div className="empty-state">
            <MapPin size={34} />
            <h2>
              {state.search.dataMode === "mock"
                ? "We haven’t explored here yet."
                : state.search.dataMode === "unavailable"
                  ? "Live search is temporarily unavailable."
                  : "Nothing looks worth a dedicated trip right now."}
            </h2>
            <p>
              {state.search.dataMode === "mock"
                ? "The demo fallback covers London areas only. Change the starting city to retry."
                : state.search.message}
            </p>
            <Link href="/" className="button-primary">
              Change location <ArrowRight size={16} />
            </Link>
            <button
              className="button-secondary"
              onClick={() => setRetry((n) => n + 1)}
            >
              <RefreshCw size={16} />
              Retry live search
            </button>
          </div>
        )}
        {state.status === "success" && activities.length > 0 && (
          <>
            {worthCount === 0 ? (
              <div className="recommendation-banner stay-in" role="status">
                <span className="recommendation-icon">
                  <Sofa size={28} />
                </span>
                <div>
                  <h2>Nothing looks worth a dedicated trip right now.</h2>
                  <p>
                    {activities.some((a) => a.verdict === "Go if nearby")
                      ? "A few options could work if you’re already nearby. Staying in is a good plan, too."
                      : "These plans exceed a limit, lack enough information, or score too low. Keeping your time is a valid choice."}
                  </p>
                </div>
              </div>
            ) : (
              <div className="recommendation-banner">
                <span className="recommendation-icon">
                  <Sparkles size={25} />
                </span>
                <div>
                  <h2>
                    {worthCount === 1
                      ? "One plan earns the trip."
                      : `${worthCount} plans earn the trip.`}
                  </h2>
                  <p>
                    Start with your best fit below. The reason and the catch are
                    always included.
                  </p>
                </div>
                <span className="recommendation-caption">
                  YOUR TIME, WELL SPENT
                </span>
              </div>
            )}
            <div className="results-toolbar">
              <div
                className="filter-list"
                role="group"
                aria-label="Filter by verdict"
              >
                {(
                  [
                    "All options",
                    "Worth a trip",
                    "Go if nearby",
                    "Skip",
                  ] as Filter[]
                ).map((item) => (
                  <button
                    type="button"
                    key={item}
                    aria-pressed={filter === item}
                    onClick={() => setFilter(item)}
                    className={filter === item ? "active" : ""}
                  >
                    {item}
                    <span>
                      {item === "All options"
                        ? activities.length
                        : activities.filter((a) => a.verdict === item).length}
                    </span>
                  </button>
                ))}
              </div>
              <span className="sort-note">Best fit first</span>
            </div>
            <div aria-live="polite" className="result-count">
              {visible.length} {visible.length === 1 ? "option" : "options"}{" "}
              shown
            </div>
            {visible.length ? (
              <div className="activity-grid">
                {visible.map((a, i) => (
                  <ActivityCard
                    key={a.id}
                    activity={a}
                    rank={activities.indexOf(a) + 1}
                    featured={
                      i === 0 &&
                      filter === "All options" &&
                      a.verdict === "Worth a trip"
                    }
                  />
                ))}
              </div>
            ) : (
              <div className="filter-empty">
                <p>No options have this verdict for your day.</p>
                <button
                  className="text-button"
                  onClick={() => setFilter("All options")}
                >
                  Show all options <ArrowRight size={15} />
                </button>
              </div>
            )}
            <div className="results-ending">
              <Sofa size={22} />
              <p>Good plans are optional. Your time is yours.</p>
              <Link href="/">
                Try a different kind of day <ArrowRight size={15} />
              </Link>
            </div>
          </>
        )}
      </div>
      <HowItWorks />
    </main>
  );
}
function ResultSkeleton() {
  return (
    <div
      className="results-loading"
      role="status"
      aria-label="Weighing your options"
    >
      <p>
        <span className="loading-dot" />
        Weighing your options…
      </p>
      <div className="skeleton-grid">
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton-card">
            <div className="skeleton skeleton-image" />
            <div className="skeleton-body">
              <div className="skeleton skeleton-line short" />
              <div className="skeleton skeleton-line" />
              <div className="skeleton skeleton-line" />
              <div className="skeleton skeleton-paragraph" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
