// The Coach: turns raw forecast numbers into a PERSONALIZED go / no-go.
// Same ocean, different answer depending on who's asking. This is the whole point.

// How wind direction (where it blows FROM) hits a beach that faces `facing`.
// Offshore (clean) ~ facing+180. Onshore (messy) ~ facing. Cross is in between.
function windQuality(windDir, facing) {
  if (windDir == null) return { kind: "unknown", factor: 0.85 };
  const offshore = (facing + 180) % 360;
  let diff = Math.abs(((windDir - offshore + 540) % 360) - 180); // 0 = perfectly offshore, 180 = onshore
  if (diff <= 50) return { kind: "offshore", factor: 1.0 };
  if (diff <= 110) return { kind: "cross-shore", factor: 0.8 };
  return { kind: "onshore", factor: 0.55 };
}

// How well the swell is lined up with the angle the spot wants.
function swellDirQuality(swellDir, idealDir) {
  if (swellDir == null) return 0.9;
  const diff = Math.abs(((swellDir - idealDir + 540) % 360) - 180);
  if (diff <= 25) return 1.0;
  if (diff <= 55) return 0.85;
  if (diff <= 90) return 0.65;
  return 0.45;
}

// Period drives power & organization. Short period = weak windswell, long = clean groundswell.
function periodQuality(p) {
  if (p == null) return 0.7;
  if (p >= 13) return 1.0;
  if (p >= 10) return 0.9;
  if (p >= 8) return 0.75;
  if (p >= 6) return 0.55;
  return 0.35;
}

// ---- Tide ----
// Classify each hour's tide as low/mid/high (relative to the day's own range) and
// rising/falling. Mutates the passed hours. No-op if the spot has no sea-level data.
const TIDE_INDEX = { low: 0, mid: 1, high: 2 };

function annotateTide(hours) {
  const levels = hours.map(h => h.tideM).filter(v => v != null);
  if (levels.length < 3) return; // no usable tide data
  const min = Math.min(...levels), max = Math.max(...levels), range = max - min || 1;
  hours.forEach((h, i) => {
    if (h.tideM == null) return;
    const norm = (h.tideM - min) / range;
    h.tideState = norm < 0.34 ? "low" : norm > 0.66 ? "high" : "mid";
    const prev = hours[i - 1]?.tideM, next = hours[i + 1]?.tideM;
    if (prev != null && next != null) h.tideDir = next - prev >= 0 ? "rising" : "falling";
  });
}

// How well the current tide suits this break. Neutral (1.0) if the spot has no preference.
function tideFactor(tideState, idealTide) {
  if (!idealTide || idealTide === "any" || !tideState) return 1.0;
  const diff = Math.abs(TIDE_INDEX[idealTide] - TIDE_INDEX[tideState]);
  return diff === 0 ? 1.0 : diff === 1 ? 0.88 : 0.74;
}

// ---- Water temp -> wetsuit call ----
function wetsuitFor(seaTempC) {
  if (seaTempC == null) return null;
  const f = Math.round(seaTempC * 9 / 5 + 32);
  let suit;
  if (seaTempC >= 24) suit = "Boardshorts / swimsuit";
  else if (seaTempC >= 21) suit = "Springsuit or 2 mm top";
  else if (seaTempC >= 18) suit = "3/2 mm fullsuit";
  else if (seaTempC >= 14) suit = "4/3 mm fullsuit";
  else if (seaTempC >= 10) suit = "5/4 mm + boots";
  else suit = "5/4/3 + boots, gloves & hood";
  return { suit, c: Math.round(seaTempC), f };
}

// ---- Skill (rated 1–5) ----
// 1 = first-timer, 3 = solid intermediate, 5 = expert/charger.
const SKILL_CEILING = { 1: 3, 2: 4.5, 3: 7, 4: 11, 5: 20 }; // biggest face (ft) they should be on
const SKILL_FLOOR   = { 1: 0.8, 2: 1, 3: 1.5, 4: 2, 5: 2.5 }; // below this it's not worth it for them

function skillTier(level) {
  return level <= 2 ? "beginner" : level === 3 ? "intermediate" : "advanced";
}

// ---- Board ----
// Each board has a happy wave-size range (ft) and a small-wave "glide" factor
// (how well it still works under that range). Longboards glide in nothing; guns don't.
const BOARDS = {
  softtop:    { label: "Soft-top",   range: [0.5, 4],  smallGlide: 1.0 },
  longboard:  { label: "Longboard",  range: [0.5, 6],  smallGlide: 1.0 },
  fish:       { label: "Fish",       range: [1, 6],    smallGlide: 0.9 },
  funboard:   { label: "Funboard",   range: [1, 7],    smallGlide: 0.75 },
  shortboard: { label: "Shortboard", range: [2.5, 12], smallGlide: 0.4 },
  stepup:     { label: "Step-up",    range: [5, 16],   smallGlide: 0.25 },
  gun:        { label: "Gun",        range: [8, 25],   smallGlide: 0.15 }
};
function boardInfo(id) { return BOARDS[id] || BOARDS.funboard; }

// How well the board suits the wave size. 1.0 in its happy range, penalized outside it.
function boardFactor(waveFt, boardId) {
  if (waveFt == null) return 1.0;
  const b = boardInfo(boardId);
  const [min, max] = b.range;
  if (waveFt >= min && waveFt <= max) return 1.0;
  if (waveFt < min) {                                  // too small/weak for this board
    const t = Math.max(0, waveFt / min);               // 1 at min → 0 when tiny
    return Math.max(0.4, b.smallGlide + (1 - b.smallGlide) * t);
  }
  const over = (waveFt - max) / max;                   // past the board's ceiling
  return Math.max(0.45, 1 - over * 0.6);
}

// The personal bit: does this wave SIZE fit the surfer's skill & comfort?
// Returns {factor, verdict} where verdict is 'flat' | 'small' | 'good' | 'big' | 'over'.
function sizeFit(waveFt, profile, spot) {
  if (waveFt == null) return { factor: 0.5, verdict: "unknown" };

  const lvl = profile.skillLevel || 3;
  const skillCeiling = SKILL_CEILING[lvl];                 // skill = the hard ceiling
  const comfort = profile.maxFt || skillCeiling;          // comfort = a soft preference
  const floor = SKILL_FLOOR[lvl];

  if (waveFt < floor) return { factor: 0.15, verdict: "flat" };
  if (waveFt < spot.idealSize[0]) return { factor: 0.55, verdict: "small" };
  if (waveFt > skillCeiling) return { factor: 0.2, verdict: "over" };   // truly beyond their skill

  // Within their skill range: base fit comes from the spot's ideal size window.
  let factor = waveFt > spot.idealSize[1] ? 0.7 : 1.0;
  let verdict = waveFt > spot.idealSize[1] ? "big" : "good";

  // Comfort is now a GENTLE modifier (much less weight than before, no hard cliff):
  // a few % per foot over your stated comfort, floored so it never tanks the score.
  if (waveFt > comfort) {
    factor *= Math.max(0.7, 1 - 0.06 * (waveFt - comfort));
    verdict = "beyondComfort";
  }
  return { factor, verdict };
}

// Score a single hour for THIS surfer at THIS spot. 0–100.
function scoreHour(h, profile, spot) {
  const size = sizeFit(h.waveFt, profile, spot);
  const wind = windQuality(h.windDir, spot.facing);
  const dir = swellDirQuality(h.swellDir, spot.idealSwellDir);
  const period = periodQuality(h.periodS);

  const tide = tideFactor(h.tideState, spot.idealTide);
  const board = boardFactor(h.waveFt, profile.board);

  // Quality of the wave itself (0–1), then scaled by how well it fits the person, tide & board.
  const waveQuality = (0.45 * period) + (0.30 * dir) + (0.25 * wind.factor);
  const score = Math.round(100 * waveQuality * size.factor * tide * board);

  return {
    ...h,
    score: Math.max(0, Math.min(100, score)),
    size, wind, dirFactor: dir, periodFactor: period, tideFactorVal: tide, boardFactorVal: board
  };
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// How a given date reads relative to now: today / tomorrow / weekday name.
function relDay(date) {
  const now = new Date();
  const startOf = d => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOf(date) - startOf(now)) / 86400000);
  if (diffDays <= 0) return { isToday: true, when: "today", heading: "Today", short: "Today" };
  if (diffDays === 1) return { isToday: false, when: "tomorrow", heading: "Tomorrow", short: "Tomorrow" };
  const name = WEEKDAYS[date.getDay()];
  return { isToday: false, when: name, heading: name, short: name.slice(0, 3) };
}

// Alerts: decide whether to notify. ANY nearby spot at/above the threshold fires it.
// `nearby` = [{ name, score, when, windowStr }]. Returns {title, body, count} or null. Pure.
function shouldAlert(nearby, threshold) {
  const t = threshold == null ? 70 : threshold;
  const firing = (nearby || []).filter(s => s && typeof s.score === "number" && s.score >= t)
    .sort((a, b) => b.score - a.score);
  if (!firing.length) return null;
  const best = firing[0];
  const others = firing.length - 1;
  return {
    title: `🌅 ${best.name} is firing ${best.when || "soon"}`,
    body: `${best.score}/100${best.windowStr ? " · best " + best.windowStr : ""}` +
          (others ? ` · +${others} more nearby` : ""),
    count: firing.length
  };
}

// Stoke-optimistic: lean toward GO on borderline calls (thresholds nudged down).
function verdictFor(score) {
  if (score >= 62) return { label: "GO SURF", tone: "go" };
  if (score >= 40) return { label: "MARGINAL", tone: "maybe" };
  return { label: "NOT WORTH IT", tone: "no" };
}

// Find the tight "go now" window: the single best hour, plus immediate
// neighbors only if they're genuinely comparable (within 4 pts of the peak).
// Capped at a ~2-hour span so it answers "when exactly?" not "when-ish?".
function bestWindow(scoredHours) {
  if (!scoredHours.length) return null;

  // Anchor on the single highest-scoring hour.
  let peakIdx = 0;
  for (let i = 1; i < scoredHours.length; i++) {
    if (scoredHours[i].score > scoredHours[peakIdx].score) peakIdx = i;
  }
  const peakScore = scoredHours[peakIdx].score;
  const THRESHOLD = 4;   // a neighbor must be within 4 pts of the peak to count
  const MAX_SPAN = 3;    // at most 3 consecutive hours (~a 2-hour window)

  let lo = peakIdx, hi = peakIdx;
  while (hi - lo + 1 < MAX_SPAN) {
    const canLeft = lo > 0 && peakScore - scoredHours[lo - 1].score <= THRESHOLD;
    const canRight = hi < scoredHours.length - 1 && peakScore - scoredHours[hi + 1].score <= THRESHOLD;
    if (!canLeft && !canRight) break;
    // Grow toward the stronger-scoring neighbor first.
    if (canLeft && (!canRight || scoredHours[lo - 1].score >= scoredHours[hi + 1].score)) lo--;
    else hi++;
  }

  const slice = scoredHours.slice(lo, hi + 1);
  const avg = Math.round(slice.reduce((a, b) => a + b.score, 0) / slice.length);
  return { start: slice[0], end: slice[slice.length - 1], avg, slice };
}

// ---- "Same wave, different surfer" comparison ----------------------------
// Two opposite personas. Scored on the IDENTICAL forecast, they should reach
// opposite calls — that contrast is the whole product.
const COMPARE_PERSONAS = {
  beginner: { label: "Beginner", emoji: "🐣", skillLevel: 1, board: "softtop", maxFt: 4 },
  advanced: { label: "Advanced", emoji: "🏄", skillLevel: 5, board: "shortboard", maxFt: 20 }
};

const TONE_RANK = { no: 0, maybe: 1, go: 2 };

// Given the week's days (each {date, hours}) and a spot, find the single hour
// across the forecast where the two personas disagree most, and score that
// exact hour for both. Returns the demo payload, or null if no usable data.
function compareSurfers(daysHours, spot) {
  if (!daysHours || !daysHours.length) return null;

  let best = null;
  for (const day of daysHours) {
    if (!day.hours || !day.hours.length) continue;

    // Use the advanced surfer's best hour as the marquee "go" moment of the day.
    const advDay = coach(day.hours.map(h => ({ ...h })), { ...COMPARE_PERSONAS.advanced }, spot);
    if (advDay.empty) continue;
    const raw = day.hours.find(h => h.time === advDay.peak.time);
    if (!raw) continue;

    // Score that ONE hour for each persona — same wave, same moment.
    const adv = coach([{ ...raw }], { ...COMPARE_PERSONAS.advanced }, spot);
    const beg = coach([{ ...raw }], { ...COMPARE_PERSONAS.beginner }, spot);

    const verdictGap = Math.abs(TONE_RANK[adv.verdict.tone] - TONE_RANK[beg.verdict.tone]);
    const scoreGap = adv.peak.score - beg.peak.score;
    const divergence = verdictGap * 1000 + scoreGap; // prefer different verdicts, then bigger score gap

    if (!best || divergence > best.divergence) {
      best = {
        divergence,
        date: day.date,
        hour: adv.peak.date,
        conditions: {
          waveFt: Math.round(adv.peak.waveFt * 10) / 10,
          periodS: adv.peak.periodS != null ? Math.round(adv.peak.periodS) : null,
          windMph: adv.peak.windMph != null ? Math.round(adv.peak.windMph) : null,
          windKind: adv.peak.wind ? adv.peak.wind.kind : null
        },
        advanced: personaCall(COMPARE_PERSONAS.advanced, adv),
        beginner: personaCall(COMPARE_PERSONAS.beginner, beg)
      };
    }
  }
  return best;
}

// Compact per-persona result for the comparison card.
function personaCall(persona, result) {
  return {
    label: persona.label,
    emoji: persona.emoji,
    board: persona.board,
    score: result.peak.score,
    verdict: result.verdict,
    why: sizeVerdictLine(result.peak, persona)
  };
}

// One short, persona-specific line explaining the call (the size fit is the divider).
function sizeVerdictLine(peak, persona) {
  const w = Math.round(peak.waveFt * 10) / 10;
  switch (peak.size.verdict) {
    case "over": return `~${w}ft is over a ${persona.label.toLowerCase()}'s safe ceiling — sit it out.`;
    case "big": return `~${w}ft is a touch big but within reach.`;
    case "good": return `~${w}ft is right in the sweet spot.`;
    case "beyondComfort": return `~${w}ft is above marked comfort but within skill — go for it.`;
    case "small": return `~${w}ft is small but rideable.`;
    case "flat": return `~${w}ft — basically flat.`;
    default: return `~${w}ft.`;
  }
}

function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

function fmtHour(d) {
  let h = d.getHours();
  const ampm = h >= 12 ? "pm" : "am";
  h = h % 12; if (h === 0) h = 12;
  return `${h}${ampm}`;
}

// Build the plain-English coach summary for the peak hour.
function buildReasons(peak, profile, spot) {
  const r = [];
  const w = Math.round(peak.waveFt * 10) / 10;
  const skillWord = skillTier(profile.skillLevel || 3);

  switch (peak.size.verdict) {
    case "flat": r.push(`🌊 It's basically flat (~${w} ft). Nothing to ride.`); break;
    case "small": r.push(`🌊 Small at ~${w} ft — under what ${spot.name} needs to really turn on, but rideable.`); break;
    case "good": r.push(`🌊 ~${w} ft — right in the sweet spot for a ${skillWord} surfer here.`); break;
    case "big": r.push(`🌊 ~${w} ft — a touch big for ${spot.name}, but within reach if you're feeling it.`); break;
    case "beyondComfort": r.push(`🌊 ~${w} ft — a bit above the size you marked comfy, but well within your skill. Heads up, but go for it.`); break;
    case "over": r.push(`⚠️ ~${w} ft — over your skill level for a safe session. Sit this one out, even if chargers are out.`); break;
    default: r.push(`🌊 ~${w} ft.`);
  }

  if (peak.periodS != null) {
    if (peak.periodFactor >= 0.9) r.push(`⏱️ Long ${Math.round(peak.periodS)}s period — clean, powerful groundswell.`);
    else if (peak.periodFactor <= 0.55) r.push(`⏱️ Short ${Math.round(peak.periodS)}s period — weak, gutless windswell.`);
    else r.push(`⏱️ ${Math.round(peak.periodS)}s period — moderate push.`);
  }

  if (peak.windMph != null) {
    const wk = Math.round(peak.windMph);
    if (peak.wind.kind === "offshore") r.push(`💨 ${wk} mph offshore — grooming the faces clean.`);
    else if (peak.wind.kind === "onshore") r.push(`💨 ${wk} mph onshore — bumpy and textured.`);
    else if (peak.wind.kind === "cross-shore") r.push(`💨 ${wk} mph cross-shore — a bit sidey.`);
  }

  if (peak.dirFactor >= 1.0) r.push(`🧭 Swell angle is lined up perfectly for this break.`);
  else if (peak.dirFactor <= 0.45) r.push(`🧭 Swell's coming from an awkward angle for ${spot.name}.`);

  if (peak.tideState && spot.idealTide && spot.idealTide !== "any") {
    const dir = peak.tideDir ? ` and ${peak.tideDir}` : "";
    if (peak.tideFactorVal >= 1.0) r.push(`🌗 ${cap(peak.tideState)} tide${dir} — exactly what ${spot.name} wants.`);
    else if (peak.tideFactorVal <= 0.74) r.push(`🌗 ${cap(peak.tideState)} tide${dir}, but ${spot.name} prefers ${spot.idealTide} — it'll be off.`);
    else r.push(`🌗 ${cap(peak.tideState)} tide${dir} — workable, though ${spot.idealTide} is better here.`);
  }

  if (peak.boardFactorVal != null && peak.boardFactorVal < 0.82 && peak.size.verdict !== "flat") {
    const b = boardInfo(profile.board);
    if (peak.waveFt < b.range[0]) r.push(`🛹 A bit small/gutless for your ${b.label.toLowerCase()} — you'd catch more on a longer board.`);
    else r.push(`🛹 On the big side for your ${b.label.toLowerCase()} — a step-up or gun would feel safer.`);
  }

  return r;
}

// Main entry: score today, pick the call, write the coaching note.
function coach(hours, profile, spot) {
  annotateTide(hours);
  const scored = hours.map(h => scoreHour(h, profile, spot));
  if (!scored.length) return { empty: true };

  const window = bestWindow(scored);
  const peak = scored.reduce((a, b) => (b.score > a.score ? b : a), scored[0]);
  const verdict = verdictFor(peak.score);
  const reasons = buildReasons(peak, profile, spot);

  // Relative day label for honest phrasing ("today" / "tomorrow" / "Saturday").
  const { isToday, when, heading } = relDay(peak.date);
  const windowStr = window.start.time === window.end.time
    ? `around ${fmtHour(window.start.date)}`
    : `${fmtHour(window.start.date)}–${fmtHour(window.end.date)}`;

  let headline;
  if (verdict.tone === "go") {
    headline = isToday
      ? `Yes — get out there. Best window ${windowStr}.`
      : `Worth it ${when}. Best window ${windowStr}.`;
  } else if (verdict.tone === "maybe") {
    headline = `Could be fun ${when} if you're keen. Your best shot is ${windowStr}.`;
  } else {
    headline = peak.size.verdict === "over"
      ? `Skip it — it's over your skill level ${when}.`
      : `Save your wax. Not worth the paddle ${when}.`;
  }

  // Water temp / wetsuit from the session average (steadier than a single hour).
  const seaTemps = scored.map(h => h.seaTempC).filter(v => v != null);
  const avgSea = seaTemps.length ? seaTemps.reduce((a, b) => a + b, 0) / seaTemps.length : null;
  const wetsuit = wetsuitFor(avgSea);

  // Hazard warning ONLY when it's *well* over the surfer's skill ceiling (not just a touch big).
  const skillCeiling = SKILL_CEILING[profile.skillLevel || 3];
  let hazard = null;
  if (peak.waveFt != null && peak.waveFt >= skillCeiling * 1.4) {
    const w = Math.round(peak.waveFt * 10) / 10;
    hazard = `Heads up: ~${w} ft is well above your level today — powerful, fast waves with strong currents and serious hold-downs. Best to sit this one out and watch from the beach.`;
  }

  return { empty: false, scored, peak, window, verdict, reasons, headline, isToday, heading, wetsuit, hazard };
}
