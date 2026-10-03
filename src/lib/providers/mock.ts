import type { Activity, ActivityProvider, Preferences } from "../types";
import { evidenceConfidence } from "../evidence";

type MockActivity = Activity & {
  date: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  description: string;
  venue: string;
  distanceKm: number;
  travelMinutesOneWay: number;
  price: number;
  source: Activity["source"] & { url: string };
};

type Point = [number, number];
const ORIGINS: { names: string[]; point: Point }[] = [
  { names: ["shoreditch"], point: [51.5246, -0.0786] },
  { names: ["soho"], point: [51.5136, -0.1365] },
  { names: ["hackney"], point: [51.545, -0.0553] },
  { names: ["camden"], point: [51.539, -0.1426] },
  { names: ["london", "central london"], point: [51.5074, -0.1278] },
];

export function resolveOrigin(location: string): Point | null {
  const normalized = location.trim().toLowerCase();
  // Only use the supported neighborhood centers; don't pretend to geocode an address.
  return (
    ORIGINS.find((origin) =>
      origin.names.some(
        (name) => normalized === name || normalized === `${name}, london`,
      ),
    )?.point ?? null
  );
}

function distance(a: Point, b: Point): number {
  const radians = (n: number) => (n * Math.PI) / 180;
  const deltaLat = radians(b[0] - a[0]);
  const deltaLon = radians(b[1] - a[1]);
  const h =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(radians(a[0])) *
      Math.cos(radians(b[0])) *
      Math.sin(deltaLon / 2) ** 2;
  return Math.max(
    0.1,
    Math.round(6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)) * 10) / 10,
  );
}

const FIXTURES: (Omit<
  MockActivity,
  "date" | "distanceKm" | "travelMinutesOneWay"
> & { point: Point })[] = [
  {
    id: "canal-coffee",
    title: "A little canal-side wandering",
    description:
      "Slow down along Regent’s Canal, then find a waterside coffee at Towpath. No tickets, no rush.",
    startTime: "14:00",
    endTime: "15:30",
    durationMinutes: 90,
    venue: "Regent’s Canal · Haggerston",
    point: [51.536, -0.0758],
    price: 7,
    interests: ["Nature", "Food & drink"],
    crowd: "low",
    loud: false,
    outdoors: true,
    illustration: "canal",
    source: {
      name: "Towpath Café",
      url: "https://www.towpathlondon.com/",
      confidence: 0,
      note: "Sample walk and coffee plan. Opening hours, weather and menu are unverified.",
      isMock: true,
    },
    tradeOff:
      "Weather dependent. The £7 estimate covers a coffee and a small treat; travel costs are extra.",
  },
  {
    id: "barbican-art",
    title: "An afternoon with a different perspective",
    description:
      "A considered wander through contemporary art, followed by a pause in the Barbican’s generous public spaces.",
    startTime: "13:30",
    endTime: "15:00",
    durationMinutes: 90,
    venue: "Barbican Art Gallery · City of London",
    point: [51.5202, -0.0938],
    price: 18,
    interests: ["Art & culture"],
    crowd: "medium",
    loud: false,
    outdoors: false,
    illustration: "gallery",
    source: {
      name: "Barbican",
      url: "https://www.barbican.org.uk/whats-on",
      confidence: 0,
      note: "Illustrative exhibition slot and ticket price, not a confirmed current listing.",
      isMock: true,
    },
    tradeOff:
      "Paid entry, and the exhibition may be busier than the rest of the building. Booking is unverified.",
  },
  {
    id: "broadway-market",
    title: "Good bites, small discoveries",
    description:
      "Browse independent stalls and pick up lunch around Broadway Market. Leave a little room for something unexpected.",
    startTime: "12:30",
    endTime: "14:00",
    durationMinutes: 90,
    venue: "Broadway Market · London Fields",
    point: [51.5367, -0.0617],
    price: 14,
    interests: ["Food & drink", "Markets"],
    crowd: "high",
    loud: false,
    outdoors: true,
    illustration: "market",
    source: {
      name: "Broadway Market",
      url: "https://broadwaymarket.co.uk/",
      confidence: 0,
      note: "Sample market visit. Stall operation on your chosen date is not confirmed.",
      isMock: true,
    },
    tradeOff:
      "Expect crowds at lunch. £14 is a food allowance, and individual stall prices will vary.",
  },
  {
    id: "vortex-jazz",
    title: "An evening of up-close jazz",
    description:
      "Trade your headphones for a small room, a live trio, and the kind of music you can feel.",
    startTime: "19:30",
    endTime: "21:30",
    durationMinutes: 120,
    venue: "Vortex Jazz Club · Dalston",
    point: [51.5484, -0.0753],
    price: 24,
    interests: ["Live music", "Art & culture"],
    crowd: "medium",
    loud: true,
    outdoors: false,
    illustration: "jazz",
    source: {
      name: "Vortex Jazz Club",
      url: "https://www.vortexjazz.co.uk/",
      confidence: 0,
      note: "Fictional performance slot. Artist, availability and ticket price are sample data.",
      isMock: true,
    },
    tradeOff:
      "A late finish and a loud, intimate room. Drinks and booking fees are outside the £24 estimate.",
  },
  {
    id: "rooftop-film",
    title: "Movie night, with a skyline",
    description:
      "A familiar favourite on a rooftop screen. Settle into a deckchair as the city lights come on.",
    startTime: "19:00",
    endTime: "21:00",
    durationMinutes: 120,
    venue: "Roof East · Stratford",
    point: [51.5413, -0.0007],
    price: 22,
    interests: ["Film"],
    crowd: "medium",
    loud: false,
    outdoors: true,
    illustration: "cinema",
    source: {
      name: "Roof East",
      url: "https://www.roofeast.com/",
      confidence: 0,
      note: "Fictional rooftop screening. Seasonal opening, film, weather and availability are unverified.",
      isMock: true,
    },
    tradeOff:
      "A longer trip for a weather-dependent screening. Seasonal opening needs checking.",
  },
];

export const mockProvider = {
  id: "london-demo",
  async search(preferences: Preferences, signal?: AbortSignal) {
    const origin = resolveOrigin(preferences.location);
    if (signal?.aborted)
      throw new DOMException("Request aborted", "AbortError");
    if (!origin) return [];
    return FIXTURES.map(({ point, ...fixture }) => {
      const distanceKm = distance(origin, point);
      const activity = {
        ...fixture,
        date: preferences.date,
        distanceKm,
        travelMinutesOneWay: Math.ceil(distanceKm * 8 + 5),
        city: "London",
        latitude: point[0],
        longitude: point[1],
        timezone: "Europe/London",
        dateStatus: "confirmed" as const,
        timeStatus: "confirmed" as const,
        endTimeStatus: "confirmed" as const,
        priceMin: fixture.price,
        priceMax: fixture.price,
        currency: "GBP",
        classifications: [...fixture.interests],
        genres: [],
        distanceOrigin: "demo neighborhood center",
      };
      return {
        ...activity,
        source: {
          ...activity.source,
          confidence: evidenceConfidence(activity).score,
        },
      };
    });
  },
} satisfies ActivityProvider;
