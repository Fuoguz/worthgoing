# WorthGoing

A local decision engine for whether an activity is worth your time, budget and travel effort. Next.js App Router, TypeScript, Tailwind CSS and localStorage. Ticketmaster is the only live activity source; deAPI BGE-M3 supplies semantic Interest Fit with the original tag matcher as fallback. No authentication, database or LLM.

Semantic matching uses the native deAPI asynchronous batch endpoint. The 2/10/14/25/51-text capacity checks and eight live London/New York desktop/mobile searches passed. The earlier OpenAI-compatible gateway was rejected because its measured 10-text/minute limit did not support the 50-candidate pool. See [the native validation report](docs/NATIVE-DEAPI-VALIDATION.md) and [the original calibration record](docs/DEAPI-INTEGRATION.md).

## Run locally

Requires Node.js 24+. Install dependencies and create the private environment file:

```powershell
npm ci
Copy-Item .env.example .env.local
```

Set `TICKETMASTER_API_KEY` and `DEAPI_API_KEY` in `.env.local`, then run `npm run dev`. Missing deAPI configuration uses the original tag matcher. Open http://localhost:3000. Do not overwrite an existing configured `.env.local` with the example. For a production preview, run `npm run build` followed by `npm run start`.

Both keys stay on the server. `.env.local` is ignored by Git; `.env.example` contains two empty keys only. Never use a `NEXT_PUBLIC_` key. Persistent Turbopack filesystem caches are disabled because they can retain environment-file contents.

Dev/start enable Node's environment-proxy support. If your network requires an existing proxy, set `HTTPS_PROXY`, `HTTP_PROXY` and `NO_PROXY` in the private environment file; exclude localhost and 127.0.0.1. No proxy is required on networks that reach Ticketmaster directly. This does not change system proxy settings.

## Data flow

Preferences → same-origin `POST /api/activities` → server-only `TicketmasterProvider` → defensive normalization → unified `Activity[]` → server-side semantic Interest Fit (or original tag matcher) → existing deterministic scoring → top five results. Only interests and actual public Ticketmaster metadata are sent to deAPI; no vectors or credentials are returned to the browser.

The server submits one native batch of uncached, deduplicated texts to `POST https://api.deapi.ai/api/v2/embeddings` with `return_result_in_response: true`, then polls `GET /api/v2/jobs/{request_id}`. Actual success status is `done`; `data.result` contains a JSON-encoded ordered vector matrix. Polling is bounded to 20 checks and 60 seconds, with a three-second interval. The five-minute memory cache remains. Failed jobs, rate limits, malformed vectors or timeouts use the original keyword fallback without removing Ticketmaster activities.

Search sends city, country code when known, a city-local time window converted to UTC when its timezone is known, size 50, sort by date and `source=ticketmaster`. For unknown/ambiguous timezone, the official `localStartDateTime` range is used. No deprecated `latlong`, guessed country, geocoding, budget filter or AI matching. A single page of up to 50 candidates is scored; it is not an exhaustive ranking of every available event.

London and New York have explicit timezone, budget-currency and approximate city-center coordinate mappings. Original London demo neighborhoods retain their center coordinates. Other cities can be searched, but unknown origin coordinates produce unavailable travel estimates. Currency mismatches are not converted.

Live cards show returned facts, timing status, original canonical URL, source, score, verdict, why, trade-off and breakdown. Missing price, venue, coordinates, description, duration and timing stay null/unavailable. Ticketmaster images are used when supplied, with loading/failure placeholders. Repeated titles at different performance times are distinct events; duplicate IDs or identical URL/date/time/venue occurrences are removed.

## Decision rules

The existing weighted engine remains deterministic:

`round(Interest Fit × .35 + Time Fit × .20 + Budget Fit × .15 + Travel Fit × .15 + Evidence Confidence × .15)`

- Interest Fit uses deAPI BGE-M3 cosine with measured piecewise anchors `(0.40, 0), (0.60, 50), (0.75, 90), (1.00, 100)`; interpolate, round and clamp. The original tag matcher handles any deAPI failure and all Mock data. Crowd/noise/outdoor penalties remain unchanged. Unknown facts are not invented.
- Confirmed start within the window, with incomplete duration/end/travel: Time Fit is at most 50. Unconfirmed/approximate start or missing timezone: 0. Fully known trips retain the existing full-trip time checks.
- Complete same-currency prices use the upper listed price for fit. Minimum price over budget is a hard blocker. Unknown/incomplete/incomparable price uses neutral Budget Fit 50; it is neither free nor assumed over budget.
- Travel Fit retains the distance formula; missing distance uses neutral 50. Haversine distance is approximate straight-line distance from a known center. Travel minutes are `ceil(km × 8 + 5)` each way, explicitly an estimate, not a route.
- Evidence Confidence is field completeness: URL 20, confirmed date 15, start time 10, confirmed timing/timezone 10, venue 10, city 5, coordinates 10, complete price/currency 10, classification 10. This is not a guarantee of availability or truth.

Existing score/verdict thresholds and hard constraints remain. Incomplete planning checks prevent “Worth a trip”; a high numerical score can still mean “Go if nearby” or “Skip”. If none earns a dedicated trip, the page says **“Nothing looks worth a dedicated trip right now.”**

## Live and mock boundaries

Live search is preferred. Missing key, request failure, eight-second timeout, malformed response, no results or unusable records are handled without crashing. Development can fall back to the existing London `MockProvider`, with a prominent **Mock data** label and reason. Unsupported mock locations remain empty. Production never silently replaces failed live searches with demo events: it shows an error/retry or genuine empty state. Live and mock events are never mixed in one response.

Mock plans, dates, prices and qualitative tags remain fictional test/demo data; venue websites are reference links, not verified event booking links. localStorage preference flow, verdict filters and existing loading/error/empty states remain.

## Validation

```powershell
npm run lint
npm run test
npm run build
npx playwright install chromium
npm run test:e2e
node scripts/security-check.mjs
```

Automated Ticketmaster tests use mock HTTP responses, never live requests. Browser tests cover desktop Chromium and an iPhone-sized Chromium viewport, not physical iPhone/Safari. Original scoring and browser scenarios are preserved. `scripts/manual-live-check.mjs` is a separate, explicit live verification script, excluded from all automated suites. Its chosen future date must be updated for later runs.

See [the implementation and validation report](docs/TICKETMASTER-INTEGRATION.md) and [recorded live queries](docs/live-query-validation.json). The highest-priority next issue is real price coverage: the verified sample lacked every price range, so budget suitability remains uncertain. No next-stage integration has been started.
