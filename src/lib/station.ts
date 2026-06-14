/**
 * A stable per-machine identifier, generated once and kept in localStorage.
 *
 * Used to attribute ticket edit locks to a specific PC so a machine can always
 * reclaim and release its own lock (and so two windows on the same PC are not
 * treated as rival editors).
 */
const STATION_KEY = "userrepair.station.id";

function randomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback for any context without crypto.randomUUID.
  return `st-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
}

export function getStationId(): string {
  let id = localStorage.getItem(STATION_KEY);
  if (!id) {
    id = randomId();
    localStorage.setItem(STATION_KEY, id);
  }
  return id;
}
