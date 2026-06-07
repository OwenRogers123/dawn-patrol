// Loads the SAME scoring brain the browser uses (spots/forecast/coach) into Node,
// so alerts are computed with the identical personal logic. No duplicated rules.
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ctx = vm.createContext({ console, Math, Date, JSON, Promise, fetch, URL, setTimeout });
for (const f of ["js/spots.js", "js/forecast.js", "js/coach.js"]) {
  vm.runInContext(fs.readFileSync(path.join(root, f), "utf8"), ctx, { filename: f });
}
const get = n => vm.runInContext(n, ctx);

export const SPOTS = get("SPOTS");
export const coach = get("coach");
export const nextSession = get("nextSession");
export const fetchForecast = get("fetchForecast");
export const shouldAlert = get("shouldAlert");
const fmtHour = get("fmtHour");

function haversineKm(a, b) {
  const R = 6371, toRad = d => d * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lon - a.lon);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function windowStrOf(r) {
  if (!r.window) return "";
  return r.window.start.time === r.window.end.time
    ? fmtHour(r.window.start.date)
    : `${fmtHour(r.window.start.date)}–${fmtHour(r.window.end.date)}`;
}

// For a subscriber's location + profile, score the nearby breaks' next session.
// Returns [{ name, score, when, windowStr }] — exactly what shouldAlert() expects.
export async function evaluateNearby(lat, lon, profile, { radiusKm = 190, max = 6 } = {}) {
  const candidates = SPOTS
    .map(s => ({ s, km: haversineKm({ lat, lon }, s) }))
    .filter(c => c.km <= radiusKm)
    .sort((a, b) => a.km - b.km)
    .slice(0, max);

  const out = [];
  for (const c of candidates) {
    try {
      const { hours } = await fetchForecast(c.s.lat, c.s.lon);
      const sess = nextSession(hours);
      const r = coach((sess.length ? sess : hours.slice(0, 14)).map(h => ({ ...h })), profile, c.s);
      if (r.empty) continue;
      out.push({ name: c.s.name, score: r.peak.score, when: (r.heading || "soon").toLowerCase(), windowStr: windowStrOf(r) });
    } catch (_) { /* skip a spot that fails to fetch */ }
  }
  return out;
}
