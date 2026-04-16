const TRIP_ID_RE = /^[a-f0-9]{32}$/;

export function isValidTripId(id: string): boolean {
  return TRIP_ID_RE.test(id);
}
