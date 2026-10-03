"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Check,
  MapPin,
  CalendarDays,
  Clock3,
  Wallet,
  Route,
  SlidersHorizontal,
  Leaf,
  Utensils,
  Palette,
  Music2,
  Film,
  ShoppingBag,
  Hammer,
} from "lucide-react";
import {
  defaultPreferences,
  localDate,
  validatePreferences,
} from "@/lib/preferences";
import { DISLIKES, INTERESTS, type Preferences } from "@/lib/types";
import { usePreferences } from "./preferences-context";
import { budgetCurrency, resolveSearchLocation } from "@/lib/location";
const interestIcons = [
  Palette,
  Utensils,
  Leaf,
  Music2,
  Film,
  ShoppingBag,
  Hammer,
];
export function PreferenceForm({ initial }: { initial: Preferences | null }) {
  const [p, setP] = useState<Preferences>(
    () => initial ?? defaultPreferences(),
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { save, storageWarning } = usePreferences();
  const router = useRouter();
  const currency = budgetCurrency(p);
  function update<K extends keyof Preferences>(key: K, value: Preferences[K]) {
    setP((old) => ({
      ...old,
      [key]: value,
      ...(key === "location" ? { budgetCurrency: undefined } : {}),
    }));
    setError(null);
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    const issue = validatePreferences(p);
    if (issue) {
      setError(issue);
      return;
    }
    setSubmitting(true);
    save({ ...p, location: p.location.trim(), budgetCurrency: currency });
    router.push("/results");
  }
  return (
    <form id="find-a-plan" className="preference-form" onSubmit={submit}>
      <div className="form-heading">
        <div>
          <span className="section-label">MAKE IT YOURS</span>
          <h2>What does your day look like?</h2>
        </div>
        <span className="form-note">
          <SlidersHorizontal size={15} />
          Your plans, your limits
        </span>
      </div>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="location">
            <MapPin size={16} />
            Starting from
          </label>
          <input
            id="location"
            name="location"
            value={p.location}
            onChange={(e) => update("location", e.target.value)}
            placeholder="e.g. Shoreditch, London"
            list="demo-locations"
            autoComplete="off"
            required
            maxLength={100}
          />
          <datalist id="demo-locations">
            <option value="Shoreditch, London" />
            <option value="Soho, London" />
            <option value="Hackney, London" />
            <option value="Camden, London" />
            <option value="Central London" />
            <option value="London" />
            <option value="New York" />
          </datalist>
          <span className="field-hint">
            Enter a city. London areas and New York are supported. Times are
            local to the event city.
          </span>
        </div>
        <div className="date-window">
          <div className="field">
            <label htmlFor="date">
              <CalendarDays size={16} />
              When
            </label>
            <input
              id="date"
              type="date"
              value={p.date}
              onChange={(e) => update("date", e.target.value)}
              min={localDate()}
              required
            />
          </div>
          <div className="field time-field">
            <label htmlFor="startTime">From</label>
            <input
              id="startTime"
              type="time"
              value={p.startTime}
              onChange={(e) => update("startTime", e.target.value)}
              required
            />
          </div>
          <div className="field time-field">
            <label htmlFor="endTime">Until</label>
            <input
              id="endTime"
              type="time"
              value={p.endTime}
              onChange={(e) => update("endTime", e.target.value)}
              required
            />
          </div>
        </div>
      </div>
      <div className="limits-grid">
        <div className="field">
          <label htmlFor="availableMinutes">
            <Clock3 size={16} />
            Time to spare{" "}
            <span className="value-label">{p.availableMinutes / 60} hours</span>
          </label>
          <select
            id="availableMinutes"
            value={p.availableMinutes}
            onChange={(e) => update("availableMinutes", Number(e.target.value))}
          >
            {[30, 60, 90, 120, 180, 240, 360, 480, 720].map((value) => (
              <option key={value} value={value}>
                {value < 60 ? "30 minutes" : `${value / 60} hours`} · including
                travel
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="maxBudget">
            <Wallet size={16} />
            Activity budget{" "}
            <span className="value-label">
              up to {currency} {Number.isNaN(p.maxBudget) ? "—" : p.maxBudget}
            </span>
          </label>
          <div className="unit-input">
            <span>{currency}</span>
            <input
              id="maxBudget"
              type="number"
              value={Number.isNaN(p.maxBudget) ? "" : p.maxBudget}
              onChange={(e) =>
                update(
                  "maxBudget",
                  e.target.value === "" ? NaN : Number(e.target.value),
                )
              }
              min="0"
              max="500"
              step="1"
              required
            />
          </div>
          <span className="field-hint">
            {resolveSearchLocation(p.location).currency
              ? "Currency follows this city. No exchange conversion."
              : "Budget in GBP; unknown event currency is not compared."}
          </span>
        </div>
        <div className="field">
          <label htmlFor="maxDistanceKm">
            <Route size={16} />
            Travel radius{" "}
            <span className="value-label">
              {Number.isNaN(p.maxDistanceKm) ? "—" : p.maxDistanceKm} km
            </span>
          </label>
          <div className="unit-input">
            <input
              id="maxDistanceKm"
              type="number"
              value={Number.isNaN(p.maxDistanceKm) ? "" : p.maxDistanceKm}
              onChange={(e) =>
                update(
                  "maxDistanceKm",
                  e.target.value === "" ? NaN : Number(e.target.value),
                )
              }
              min="0.5"
              max="50"
              step="0.5"
              required
            />
            <span>km</span>
          </div>
        </div>
      </div>
      <fieldset className="interest-field">
        <legend>What are you in the mood for?</legend>
        <div className="chip-list">
          {INTERESTS.map((interest, i) => {
            const Icon = interestIcons[i];
            const selected = p.interests.includes(interest);
            return (
              <button
                key={interest}
                type="button"
                className={`choice-chip ${selected ? "selected" : ""}`}
                aria-pressed={selected}
                onClick={() =>
                  update(
                    "interests",
                    selected
                      ? p.interests.filter((v) => v !== interest)
                      : [...p.interests, interest],
                  )
                }
              >
                <Icon size={16} />
                {interest}
                {selected && <Check size={13} />}
              </button>
            );
          })}
        </div>
      </fieldset>
      <div className="field interest-text-field">
        <label htmlFor="interestText">
          Describe your interests <span>Optional</span>
        </label>
        <textarea
          id="interestText"
          rows={2}
          maxLength={1000}
          value={p.interestText ?? ""}
          onChange={(e) => update("interestText", e.target.value)}
          placeholder="Architecture, live jazz… or 城市探索、艺术展览"
          aria-describedby="interest-text-hint"
        />
        <span id="interest-text-hint" className="field-hint">
          Use any language. Selected interests and this text are sent to deAPI
          for semantic matching.
        </span>
      </div>
      <fieldset className="dislike-field">
        <legend>
          Rather avoid? <span>Optional</span>
        </legend>
        <div className="chip-list">
          {DISLIKES.map((dislike) => (
            <button
              key={dislike}
              type="button"
              className={`avoid-chip ${p.dislikes.includes(dislike) ? "selected" : ""}`}
              aria-pressed={p.dislikes.includes(dislike)}
              onClick={() =>
                update(
                  "dislikes",
                  p.dislikes.includes(dislike)
                    ? p.dislikes.filter((v) => v !== dislike)
                    : [...p.dislikes, dislike],
                )
              }
            >
              {p.dislikes.includes(dislike) ? (
                <Check size={13} />
              ) : (
                <span className="empty-check" />
              )}
              {dislike}
            </button>
          ))}
        </div>
      </fieldset>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {storageWarning && (
        <p className="storage-warning" role="status">
          {storageWarning}
        </p>
      )}
      <div className="form-bottom">
        <p>
          Up to five considered options.
          <br />
          <span>And permission to skip them all.</span>
        </p>
        <button className="button-primary" disabled={submitting} type="submit">
          {submitting ? "Finding your options…" : "Find what’s worth it"}
          <ArrowRight size={18} />
        </button>
      </div>
    </form>
  );
}
