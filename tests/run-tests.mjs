// Dawn Patrol — test suite for the pure logic (scoring engine, forecast helpers, spot data).
// No browser needed: we load the real source files into a vm sandbox and assert against them.
// Run: node tests/run-tests.mjs

import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ctx = vm.createContext({ console, Math, Date, JSON });

// Load source files in dependency order. fetch() is only referenced inside functions,
// so these load fine in Node without a browser.
for (const f of ["js/spots.js", "js/forecast.js", "js/coach.js"]) {
  vm.runInContext(fs.readFileSync(path.join(root, f), "utf8"), ctx, { filename: f });
}

// Pull the things we want to test out of the sandbox by evaluating their names.
const get = (name) => vm.runInContext(name, ctx);
const SPOTS = get("SPOTS");
const metersToFeet = get("metersToFeet");
const kmhToMph = get("kmhToMph");
const circularMeanDeg = get("circularMeanDeg");
const estimateFacing = get("estimateFacing");
const nextSession = get("nextSession");
const periodQuality = get("periodQuality");
const windQuality = get("windQuality");
const swellDirQuality = get("swellDirQuality");
const shouldAlert = get("shouldAlert");
const sizeFit = get("sizeFit");
const boardFactor = get("boardFactor");
const tideFactor = get("tideFactor");
const wetsuitFor = get("wetsuitFor");
const skillTier = get("skillTier");
const verdictFor = get("verdictFor");
const bestWindow = get("bestWindow");
const compareSurfers = get("compareSurfers");
const relDay = get("relDay");
const coach = get("coach");

// ---- tiny test harness ----
let pass = 0, fail = 0;
const fails = [];
function ok(name, cond, detail = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; fails.push(name); console.log(`  ✗ ${name}  ${detail}`); }
}
const approx = (a, b, eps = 0.02) => Math.abs(a - b) <= eps;
function group(title) { console.log(`\n${title}`); }

// Build a synthetic hour with sensible defaults.
function hour(o = {}) {
  return Object.assign({
    time: "2026-06-01T08:00", date: new Date("2026-06-01T08:00"),
    waveFt: 4, periodS: 12, swellDir: 270,
    windMph: 5, windDir: 90, tideM: 1.0, seaTempC: 16
  }, o);
}

// ---------------------------------------------------------------------------
group("Unit conversions");
ok("metersToFeet(1) ≈ 3.281", approx(metersToFeet(1), 3.28084, 0.001));
ok("metersToFeet(null) === null", metersToFeet(null) === null);
ok("kmhToMph(1.609344) ≈ 1.0", approx(kmhToMph(1.609344), 1.0, 0.001));
ok("kmhToMph(16.09344) ≈ 10 mph", approx(kmhToMph(16.09344), 10, 0.001));

group("circularMeanDeg / estimateFacing (wrap-around)");
ok("mean([350,10]) ≈ 0/360", (() => { const m = circularMeanDeg([350, 10]); return approx(m, 0, 0.5) || approx(m, 360, 0.5); })());
ok("mean([90,90,90]) === 90", approx(circularMeanDeg([90, 90, 90]), 90, 0.5));
ok("estimateFacing of W swell ≈ 270", approx(estimateFacing([hour({ swellDir: 268 }), hour({ swellDir: 272 })]), 270, 1));

group("periodQuality");
ok("14s is top-tier (1.0)", periodQuality(14) === 1.0);
ok("5s is weak windswell (≤0.4)", periodQuality(5) <= 0.4);
ok("longer period scores higher", periodQuality(15) > periodQuality(7));

group("windQuality (facing 270 → offshore from the east)");
ok("wind from 90 (E) is offshore", windQuality(90, 270).kind === "offshore");
ok("wind from 270 (W) is onshore", windQuality(270, 270).kind === "onshore");
ok("offshore factor > onshore factor", windQuality(90, 270).factor > windQuality(270, 270).factor);

group("swellDirQuality");
ok("aligned swell = 1.0", swellDirQuality(270, 270) === 1.0);
ok("opposite swell is penalized", swellDirQuality(90, 270) < 0.6);

group("sizeFit — skill 1–5 personalization (THE differentiator)");
const spotOB = SPOTS.find(s => s.id === "ocean-beach-sf");
ok("10ft is 'good' for an expert (L5, comfort 20)", sizeFit(10, { skillLevel: 5, maxFt: 20 }, spotOB).verdict === "good");
ok("10ft is 'over' for a beginner (L1)", sizeFit(10, { skillLevel: 1, maxFt: 4 }, spotOB).verdict === "over");
ok("expert factor >> beginner factor on 10ft",
  sizeFit(10, { skillLevel: 5, maxFt: 20 }, spotOB).factor > sizeFit(10, { skillLevel: 1, maxFt: 4 }, spotOB).factor);
ok("1ft is 'flat' for intermediate", sizeFit(1, { skillLevel: 3, maxFt: 8 }, spotOB).verdict === "flat");

group("sizeFit — comfort (maxFt) is now a SOFT factor, not a hard cap");
const beyond = sizeFit(10, { skillLevel: 5, maxFt: 4 }, spotOB);   // expert, but flagged comfy only to 4ft
ok("over-comfort no longer forces 'over'", beyond.verdict !== "over");
ok("over-comfort stays very rideable (factor > 0.5, was 0.2)", beyond.factor > 0.5);
ok("over-comfort still slightly penalized vs in-comfort", beyond.factor < sizeFit(10, { skillLevel: 5, maxFt: 20 }, spotOB).factor);
ok("comfort penalty is gentle (>= 0.7 floor)", beyond.factor >= 0.7 * 1.0 - 0.001);
ok("beyond skill ceiling is still a hard 'over' (L1 @ 10ft)", sizeFit(10, { skillLevel: 1, maxFt: 4 }, spotOB).verdict === "over");

group("boardFactor — board physics");
ok("longboard glides in 1ft (≈1.0)", boardFactor(1, "longboard") >= 0.95);
ok("shortboard struggles in 1ft (<0.75)", boardFactor(1, "shortboard") < 0.75);
ok("gun is wrong tool for 1ft (<0.5)", boardFactor(1, "gun") < 0.5);
ok("longboard out-performs shortboard in small surf", boardFactor(1, "longboard") > boardFactor(1, "shortboard"));
ok("shortboard is happy at 5ft (1.0)", boardFactor(5, "shortboard") === 1.0);
ok("funboard penalized when overhead-plus (12ft)", boardFactor(12, "funboard") < 1.0);

group("tideFactor");
ok("ideal tide match = 1.0", tideFactor("low", "low") === 1.0);
ok("opposite tide penalized (<0.8)", tideFactor("high", "low") < 0.8);
ok("'any' ideal tide is neutral", tideFactor("high", "any") === 1.0);
ok("missing tide state is neutral", tideFactor(null, "low") === 1.0);

group("wetsuitFor");
ok("15°C → 4/3 fullsuit", wetsuitFor(15).suit === "4/3 mm fullsuit");
ok("26°C → boardshorts", /boardshorts/i.test(wetsuitFor(26).suit));
ok("5°C → boots/gloves/hood", /hood/i.test(wetsuitFor(5).suit));
ok("converts to °F (15°C ≈ 59°F)", wetsuitFor(15).f === 59);
ok("null temp → null", wetsuitFor(null) === null);

group("skillTier + verdictFor (stoke-optimistic thresholds)");
ok("L1 → beginner", skillTier(1) === "beginner");
ok("L3 → intermediate", skillTier(3) === "intermediate");
ok("L5 → advanced", skillTier(5) === "advanced");
ok("62 → GO (lowered threshold)", verdictFor(62).tone === "go");
ok("61 → MARGINAL", verdictFor(61).tone === "maybe");
ok("39 → NOT WORTH IT", verdictFor(39).tone === "no");

group("bestWindow");
const win = bestWindow([
  hour({ time: "t1", date: new Date("2026-06-01T06:00"), score: 40 }),
  hour({ time: "t2", date: new Date("2026-06-01T07:00"), score: 85 }),
  hour({ time: "t3", date: new Date("2026-06-01T08:00"), score: 88 }),
  hour({ time: "t4", date: new Date("2026-06-01T09:00"), score: 42 })
].map(h => ({ ...h, score: h.score })));
ok("picks the high-scoring run", win && win.avg >= 80);

// Tighter window: a clear single peak should collapse to one hour, and even a
// flat plateau must never sprawl into a 4+ hour range.
const winSharp = bestWindow([
  hour({ time: "a", date: new Date("2026-06-01T06:00"), score: 30 }),
  hour({ time: "b", date: new Date("2026-06-01T07:00"), score: 90 }),
  hour({ time: "c", date: new Date("2026-06-01T08:00"), score: 50 })
]);
ok("clear single peak collapses to one hour", winSharp.start.time === "b" && winSharp.start.time === winSharp.end.time);

const winWide = bestWindow(Array.from({ length: 8 }, (_, i) =>
  hour({ time: "w" + i, date: new Date(2026, 5, 1, 6 + i), score: 80 })));
ok("flat plateau never spans more than 3 hours of data", winWide.slice.length <= 3);
ok("flat plateau window span ≤ 2 hours", (winWide.end.date - winWide.start.date) <= 2 * 3600000);

// A genuine 2-hour plateau next to the peak should be kept (tight range, not single).
const winPair = bestWindow([
  hour({ time: "p0", date: new Date("2026-06-01T06:00"), score: 40 }),
  hour({ time: "p1", date: new Date("2026-06-01T07:00"), score: 88 }),
  hour({ time: "p2", date: new Date("2026-06-01T08:00"), score: 86 }),
  hour({ time: "p3", date: new Date("2026-06-01T09:00"), score: 50 })
]);
ok("keeps close neighbor (within 4 pts) as a tight range", winPair.start.time === "p1" && winPair.end.time === "p2");

group("compareSurfers — the 'same wave, different surfer' demo");
// A flat day and a big clean day. The demo should pick the big day and split the verdicts.
const flatDay = {
  date: new Date(2026, 5, 1),
  hours: Array.from({ length: 6 }, (_, i) => hour({ time: "flat" + i, date: new Date(2026, 5, 1, 7 + i), waveFt: 1, periodS: 6, swellDir: 270, windDir: 90, windMph: 5 }))
};
const bigDay = {
  date: new Date(2026, 5, 2),
  hours: Array.from({ length: 6 }, (_, i) => hour({ time: "big" + i, date: new Date(2026, 5, 2, 7 + i), waveFt: 8, periodS: 15, swellDir: 270, windDir: 90, windMph: 4 }))
};
const cmp = compareSurfers([flatDay, bigDay], spotOB);
ok("returns a comparison object", cmp && cmp.beginner && cmp.advanced);
ok("picks the high-contrast (big) day", cmp.date.getTime() === bigDay.date.getTime());
ok("advanced scores higher than beginner on the same wave", cmp.advanced.score > cmp.beginner.score);
ok("advanced gets GO, beginner does not", cmp.advanced.verdict.tone === "go" && cmp.beginner.verdict.tone !== "go");
ok("both verdicts describe the identical conditions", cmp.conditions && cmp.conditions.waveFt != null);
ok("empty input → null", compareSurfers([], spotOB) === null);

group("relDay");
ok("today is flagged isToday", relDay(new Date()).isToday === true);
ok("tomorrow labelled 'tomorrow'", relDay(new Date(Date.now() + 86400000)).when === "tomorrow");

group("coach() end-to-end — same wave, opposite calls");
const cleanBig = Array.from({ length: 6 }, (_, i) =>
  hour({ time: "h" + i, date: new Date(2026, 5, 1, 7 + i), waveFt: 8, periodS: 15, swellDir: 270, windDir: 90, windMph: 4 }));
const expert = coach(cleanBig.map(h => ({ ...h })), { skillLevel: 5, board: "shortboard", maxFt: 20 }, spotOB);
const newbie = coach(cleanBig.map(h => ({ ...h })), { skillLevel: 1, board: "softtop", maxFt: 4 }, spotOB);
ok("expert gets GO on clean 8ft", expert.verdict.tone === "go", `got ${expert.verdict.label} (${expert.peak.score})`);
ok("beginner does NOT get GO on 8ft", newbie.verdict.tone !== "go", `got ${newbie.verdict.label} (${newbie.peak.score})`);
ok("expert score > beginner score", expert.peak.score > newbie.peak.score);
ok("coach returns reasons", Array.isArray(expert.reasons) && expert.reasons.length > 0);
ok("coach returns a wetsuit rec", expert.wetsuit && typeof expert.wetsuit.suit === "string");
ok("empty hours → {empty:true}", coach([], { skillLevel: 3, board: "funboard", maxFt: 6 }, spotOB).empty === true);

group("Hazard warning — fires only when WELL over skill (≥1.4× ceiling)");
const bigForBeginner = Array.from({ length: 5 }, (_, i) =>
  hour({ time: "b" + i, date: new Date(2026, 5, 1, 8 + i), waveFt: 8, periodS: 14, swellDir: 270, windDir: 90 }));
const slightlyOver = Array.from({ length: 5 }, (_, i) =>
  hour({ time: "s" + i, date: new Date(2026, 5, 1, 8 + i), waveFt: 3.4, periodS: 12, swellDir: 270, windDir: 90 }));
ok("8ft for a beginner (L1, ceiling 3) triggers a hazard", !!coach(bigForBeginner, { skillLevel: 1, board: "softtop", maxFt: 4 }, spotOB).hazard);
ok("3.4ft for a beginner (only slightly over) does NOT", !coach(slightlyOver, { skillLevel: 1, board: "softtop", maxFt: 4 }, spotOB).hazard);
ok("8ft for an expert (L5) triggers no hazard", !coach(bigForBeginner, { skillLevel: 5, board: "shortboard", maxFt: 20 }, spotOB).hazard);

group("shouldAlert — 'any nearby spot fires' notification logic");
const nb = [
  { name: "Trestles", score: 84, when: "tomorrow", windowStr: "6–8am" },
  { name: "Pismo", score: 58, when: "tomorrow", windowStr: "7–9am" },
  { name: "Cayucos", score: 72, when: "tomorrow", windowStr: "dawn" }
];
ok("fires when something clears the threshold", !!shouldAlert(nb, 70));
ok("picks the highest-scoring spot for the title", /Trestles/.test(shouldAlert(nb, 70).title));
ok("counts the other firing spots", shouldAlert(nb, 70).count === 2);
ok("returns null when nothing clears the threshold", shouldAlert(nb, 90) === null);
ok("empty nearby → null", shouldAlert([], 70) === null);
ok("body includes the score and window", /84\/100/.test(shouldAlert(nb, 70).body) && /6–8am/.test(shouldAlert(nb, 70).body));

group("Spot database integrity");
ok("has a healthy number of spots (≥20)", SPOTS.length >= 20);
ok("all spot ids are unique", new Set(SPOTS.map(s => s.id)).size === SPOTS.length);
const reqFields = ["id", "name", "region", "lat", "lon", "facing", "idealSwellDir", "idealSize", "idealTide", "level", "type", "note"];
ok("every spot has all required fields", SPOTS.every(s => reqFields.every(f => s[f] != null)));
ok("every idealSize is [min<max]", SPOTS.every(s => Array.isArray(s.idealSize) && s.idealSize[0] < s.idealSize[1]));
ok("every facing in 0–360", SPOTS.every(s => s.facing >= 0 && s.facing <= 360));
ok("every idealTide is valid", SPOTS.every(s => ["low", "mid", "high", "any"].includes(s.idealTide)));
ok("every level is valid", SPOTS.every(s => ["beginner", "intermediate", "advanced"].includes(s.level)));
ok("Central Coast spots present (Pismo)", SPOTS.some(s => s.id === "pismo-pier"));

// ---------------------------------------------------------------------------
console.log(`\n${"=".repeat(48)}`);
console.log(`  RESULTS: ${pass} passed, ${fail} failed, ${pass + fail} total`);
if (fail) { console.log(`  FAILED: ${fails.join(", ")}`); console.log("=".repeat(48)); process.exit(1); }
console.log("  ALL TESTS PASSED ✅");
console.log("=".repeat(48));
