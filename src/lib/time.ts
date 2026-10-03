/** Convert a stated local window to UTC with Intl's IANA zone rules, including DST. */
export function zonedToUtc(
  date: string,
  time: string,
  timezone: string,
): string | null {
  const target = Date.parse(`${date}T${time}:00Z`);
  if (!Number.isFinite(target)) return null;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  let instant = target;
  for (let i = 0; i < 4; i++) {
    const parts = Object.fromEntries(
      formatter.formatToParts(new Date(instant)).map((p) => [p.type, p.value]),
    );
    const rendered = Date.parse(
      `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`,
    );
    const adjustment = target - rendered;
    if (adjustment === 0) {
      // A repeated local hour is ambiguous; don't silently choose one offset.
      const sameLocal = (n: number) =>
        formatter.format(new Date(n)) === formatter.format(new Date(instant));
      if (sameLocal(instant - 3600000) || sameLocal(instant + 3600000))
        return null;
      return new Date(instant).toISOString().replace(".000Z", "Z");
    }
    instant += adjustment;
  }
  return null;
}
