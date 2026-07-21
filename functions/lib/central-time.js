// Shared US-Central date helper. Everything in the app that needs "what day
// is the puzzle" flows through here so the day flips at the same instant
// (midnight America/Chicago, which tracks CST/CDT automatically).
const TZ = "America/Chicago";

// Returns the current Central date as "YYYY-MM-DD" (en-CA formats that way).
export function centralDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
