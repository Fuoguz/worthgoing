/** Fictional HTTP fixtures; never fetched from the live API. */
export function ticketmasterEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: "fixture-concert-1",
    name: "Fixture Quartet",
    type: "event",
    url: "https://www.ticketmaster.co.uk/event/fixture-only",
    description: "<p>A fictional test concert.</p>",
    dates: {
      start: {
        localDate: "2099-07-01",
        localTime: "19:00:00",
        dateTime: "2099-07-01T18:00:00Z",
        dateTBD: false,
        dateTBA: false,
        timeTBA: false,
        noSpecificTime: false,
      },
      end: {
        localDate: "2099-07-01",
        localTime: "21:00:00",
        dateTime: "2099-07-01T20:00:00Z",
        approximate: false,
      },
      timezone: "Europe/London",
      status: { code: "onsale" },
    },
    _embedded: {
      venues: [
        {
          name: "Fixture Hall",
          city: { name: "London" },
          location: { latitude: "51.52", longitude: "-0.10" },
        },
      ],
    },
    classifications: [
      {
        segment: { name: "Music" },
        genre: { name: "Jazz" },
        subGenre: { name: "Contemporary Jazz" },
      },
    ],
    priceRanges: [{ min: 20, max: 35, currency: "GBP" }],
    images: [
      {
        url: "https://s1.ticketm.net/dam/fixture-only.jpg",
        ratio: "16_9",
        width: 640,
        height: 420,
        fallback: false,
      },
    ],
    ...overrides,
  };
}
export const ticketmasterResponse = (
  events: unknown[] = [ticketmasterEvent()],
) => ({ _embedded: { events }, page: { totalElements: events.length } });
