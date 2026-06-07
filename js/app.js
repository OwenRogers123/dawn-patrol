// Wires the UI: profile -> fetch -> coach -> render.
// Supports preset spots, user-added custom spots, geolocation, and a 7-day outlook.

const $ = sel => document.querySelector(sel);

const profile = {
  spotId: SPOTS[0].id,
  skillLevel: 3,      // 1–5
  board: "funboard",
  maxFt: 6
};

// Google Maps driving directions to a spot (opens from the user's current location).
function mapsUrl(spot) {
  return `https://www.google.com/maps/dir/?api=1&destination=${spot.lat},${spot.lon}`;
}

let customSpots = loadCustomSpots();
let newSpotDraft = { lat: null, lon: null, type: "beach" };

// Results state so day-chips can re-render without refetching.
const state = { spot: null, days: [], rawHours: [], cache: {} };

function allSpots() { return [...SPOTS, ...customSpots]; }
function getSpotAny(id) { return allSpots().find(s => s.id === id); }

// ---------- Spot search + selection ----------
const spotSearch = $("#spotSearch");
const spotResults = $("#spotResults");

// Commit a spot as the chosen one: profile + show it IN the search bar + note.
let currentSpotLabel = "";
function setSpot(id) {
  const s = getSpotAny(id);
  if (!s) return;
  profile.spotId = id;
  currentSpotLabel = `${s.name} — ${s.region}`;
  spotSearch.value = currentSpotLabel;
  updateSpotNote();
  hideSpotResults();
}
function updateSpotNote() {
  const s = getSpotAny(profile.spotId);
  $("#spotNote").textContent = s ? `📍 ${s.note}` : "";
}
function hideSpotResults() { spotResults.classList.add("hidden"); spotResults.innerHTML = ""; }

// Filter all spots (custom first) by name/region and render the results dropdown.
function renderSpotResults(query) {
  const q = query.trim().toLowerCase();
  if (!q) { hideSpotResults(); return; }
  const matches = allSpots()
    .filter(s => (s.name + " " + s.region).toLowerCase().includes(q))
    .slice(0, 8);

  spotResults.innerHTML = "";
  if (!matches.length) {
    spotResults.innerHTML = `<div class="result-empty">No breaks match “${query}”. Try a nearby town, or add your own spot.</div>`;
  } else {
    matches.forEach(s => {
      const item = document.createElement("div");
      item.className = "result-item";
      item.innerHTML = `<div class="ri-name">${s.name}${s.custom ? " ⭐" : ""}</div><div class="ri-meta">${s.region}</div>`;
      item.addEventListener("mousedown", e => { e.preventDefault(); state.nearby = null; setSpot(s.id); });
      spotResults.appendChild(item);
    });
  }
  spotResults.classList.remove("hidden");
}

spotSearch.addEventListener("input", () => renderSpotResults(spotSearch.value));
spotSearch.addEventListener("focus", () => spotSearch.select());  // select-all so typing replaces
// On blur, if they typed something but didn't pick a spot, snap back to the committed one.
spotSearch.addEventListener("blur", () => setTimeout(() => {
  hideSpotResults();
  if (spotSearch.value.trim() !== currentSpotLabel) spotSearch.value = currentSpotLabel;
}, 150));

// The 🔍 icon clears the bar and lets you search a different break.
$("#spotSearchIcon").addEventListener("click", () => {
  spotSearch.value = "";
  hideSpotResults();
  spotSearch.focus();
});

// ---------- Segmented controls ----------
function wireSegmented(id, onPick) {
  const group = document.getElementById(id);
  group.addEventListener("click", e => {
    const btn = e.target.closest("button");
    if (!btn) return;
    group.querySelectorAll("button").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    onPick(btn.dataset.val);
  });
}
// The locate button stays locked until the surfer has actually set their profile,
// so "best breaks near you" is genuinely personalized rather than ranked on defaults.
const touched = { skill: false, board: false, maxFt: false };
function profileReady() { return touched.skill && touched.board && touched.maxFt; }
function updateLocateGate() {
  const ready = profileReady();
  $("#geoBtn").classList.toggle("is-disabled", !ready);
  $("#locateHint").classList.toggle("hidden", ready);
}

wireSegmented("skill", v => { profile.skillLevel = +v; updateSkillLabel(); touched.skill = true; updateLocateGate(); });
wireSegmented("board", v => { profile.board = v; touched.board = true; updateLocateGate(); });
wireSegmented("newSpotType", v => newSpotDraft.type = v);

function updateSkillLabel() {
  const lvl = profile.skillLevel || 3;
  $("#skillLabel").textContent = `${lvl} · ${cap(skillTier(lvl))}`;
}

// ---------- Comfort slider ----------
const maxFt = $("#maxFt");
maxFt.addEventListener("input", () => {
  profile.maxFt = +maxFt.value;
  $("#maxFtLabel").textContent = `${maxFt.value} ft${maxFt.value >= 20 ? "+" : ""}`;
  touched.maxFt = true;
  updateLocateGate();
});

// ---------- Geolocation ----------
function getCoords() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("Geolocation isn't supported on this device."));
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => reject(new Error("Couldn't get your location. Allow location access and try again.")),
      { timeout: 10000, maximumAge: 600000 }
    );
  });
}

function haversineKm(a, b) {
  const R = 6371, toRad = d => d * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lon - a.lon);
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// Main "Use my location": discover nearby real spots and rank them for THIS surfer.
$("#geoBtn").addEventListener("click", async () => {
  // Locked until skill + board + wave size are set — guide them to what's missing.
  if (!profileReady()) {
    const target = !touched.skill ? "#skill" : !touched.board ? "#board" : "#maxFt";
    const field = $(target).closest(".field");
    field.scrollIntoView({ behavior: "smooth", block: "center" });
    field.classList.remove("flash");
    void field.offsetWidth;            // restart the animation
    field.classList.add("flash");
    return;
  }
  $("#geoBtn").textContent = "Locating…";
  removeError();
  try {
    const coords = await getCoords();
    $("#geoBtn").textContent = "Reading the ocean…";
    $("#loader").classList.remove("hidden");
    const { spots, fallback } = await discoverNearby(coords);

    if (fallback || !spots.length) {
      // No known breaks within range — build a spot at the exact coords and go straight to a call.
      const spot = await buildSpotFromCoords("Current spot", "My location", coords, "beach");
      customSpots.push(spot);
      saveCustomSpots();
      state.nearby = null;
      setSpot(spot.id);
      await run();
    } else {
      // Recommend the best + closest break immediately; the spot-name menu lets them
      // flip through the next-best nearby options from the results screen.
      state.nearby = spots;
      state.nearbyCenter = coords;
      selectNearbySpot(spots[0].spot.id);
    }
  } catch (err) {
    showError(err.message);
  } finally {
    $("#loader").classList.add("hidden");
    $("#geoBtn").textContent = "📍 Use my location";
  }
});

// Rank nearby curated breaks by a blend of live conditions (for this surfer) and proximity.
async function discoverNearby(coords) {
  const RADIUS_KM = 190;
  const MAX_FETCH = 6;
  const candidates = SPOTS
    .map(s => ({ spot: s, km: haversineKm(coords, s) }))
    .filter(c => c.km <= RADIUS_KM)
    .sort((a, b) => a.km - b.km)
    .slice(0, MAX_FETCH);

  if (!candidates.length) return { spots: [], fallback: true };

  const scored = await Promise.all(candidates.map(async c => {
    try {
      const { hours } = await fetchForecast(c.spot.lat, c.spot.lon);
      const session = nextSession(hours);
      const result = coach(session.length ? session : hours.slice(0, 14), profile, c.spot);
      if (result.empty) return null;
      state.cache[c.spot.id] = hours; // reuse on tap, no refetch
      const proximity = Math.max(0, 100 - (c.km / RADIUS_KM) * 100);
      const rank = 0.65 * result.peak.score + 0.35 * proximity;
      return { spot: c.spot, km: c.km, result, rank };
    } catch (_) { return null; }
  }));

  const spots = scored.filter(Boolean).sort((a, b) => b.rank - a.rank);
  return { spots, fallback: false };
}

function renderNearby(spots, coords) {
  $("#onboarding").classList.add("hidden");
  $("#results").classList.add("hidden");
  $("#resetBtn").classList.add("hidden");
  $("#nearby").classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });

  const tier = skillTier(profile.skillLevel || 3);
  $("#nearbySub").textContent =
    `Ranked for a level ${profile.skillLevel || 3} (${tier}) on a ${boardInfo(profile.board).label.toLowerCase()} — best conditions + closest to you.`;

  const list = $("#nearbyList");
  list.innerHTML = "";
  spots.forEach((item, i) => {
    const { spot, km, result } = item;
    const peak = result.peak;
    const tone = result.verdict.tone;
    const miles = Math.round(km * 0.621);
    const w = Math.round(peak.waveFt * 10) / 10;
    const windStr = peak.windMph != null ? `${Math.round(peak.windMph)}mph ${peak.wind.kind}` : "";

    const card = document.createElement("div");
    card.className = "spot-card";
    card.innerHTML =
      `<div class="sc-rank">${i + 1}</div>` +
      `<div class="sc-score ${tone}"><span class="n">${peak.score}</span><span class="l">score</span></div>` +
      `<div class="sc-body">` +
        `<div class="sc-name">${spot.name}</div>` +
        `<div class="sc-meta">${spot.region} · ${miles} mi away · ${result.verdict.label}</div>` +
        `<div class="sc-cond">${w}ft @ ${Math.round(peak.periodS)}s${windStr ? " · " + windStr : ""}</div>` +
        `<a class="sc-directions" href="${mapsUrl(spot)}" target="_blank" rel="noopener">🧭 Directions</a>` +
      `</div>` +
      `<div class="sc-arrow">›</div>`;
    // tapping the card opens the spot; tapping Directions opens Maps without navigating away
    card.addEventListener("click", () => selectNearbySpot(spot.id));
    card.querySelector(".sc-directions").addEventListener("click", e => e.stopPropagation());
    list.appendChild(card);
  });
}

function selectNearbySpot(spotId) {
  setSpot(spotId);
  localStorage.setItem("dawnpatrol_profile", JSON.stringify(profile));
  $("#nearby").classList.add("hidden");
  run();
}

// ---------- Spot-name menu on the results screen (switch between nearby breaks) ----------
function closeSpotMenu() {
  $("#spotMenu").classList.add("hidden");
  $("#spotMenuBtn").classList.remove("open");
}

function buildMenuList() {
  const items = [];
  const cur = state.spot;
  if (cur) items.push({
    id: cur.id, name: cur.name, region: cur.region, km: null,
    score: state.lastResult?.peak?.score, tone: state.lastResult?.verdict?.tone, current: true
  });
  (state.nearby || []).forEach(n => {
    if (n.spot.id === cur?.id) return;
    items.push({ id: n.spot.id, name: n.spot.name, region: n.spot.region, km: n.km, score: n.result.peak.score, tone: n.result.verdict.tone, current: false });
  });
  return items;
}

function renderSpotMenu(list) {
  const menu = $("#spotMenu");
  menu.innerHTML = `<div class="spot-menu-title">Best breaks near you</div>`;
  list.forEach(it => {
    const tone = it.tone || (it.score >= 62 ? "go" : it.score >= 40 ? "maybe" : "no");
    const miles = it.km != null ? `${Math.round(it.km * 0.621)} mi away` : "";
    const el = document.createElement("div");
    el.className = "spot-opt" + (it.current ? " current" : "");
    el.innerHTML =
      `<div class="so-score ${tone}">${it.score ?? "–"}</div>` +
      `<div class="so-body"><div class="so-name">${it.name}</div><div class="so-meta">${it.region}${miles ? " · " + miles : ""}</div></div>` +
      (it.current ? `<div class="so-tag">Current</div>` : "");
    el.addEventListener("click", () => switchSpot(it.id));
    menu.appendChild(el);
  });
  if (list.length <= 1) {
    menu.insertAdjacentHTML("beforeend", `<div class="spot-menu-empty">No other known breaks within ~120 mi.</div>`);
  }
}

async function openSpotMenu() {
  const menu = $("#spotMenu");
  $("#spotMenuBtn").classList.add("open");
  // If we don't have a ranked nearby list yet (e.g. they searched a spot), compute one
  // around the current spot so the menu always shows real "next best options."
  if (!state.nearby || !state.nearby.length) {
    menu.innerHTML = `<div class="spot-menu-empty">Finding spots near here…</div>`;
    menu.classList.remove("hidden");
    try {
      const c = state.spot;
      const { spots } = await discoverNearby({ lat: c.lat, lon: c.lon });
      state.nearby = spots;
    } catch (_) {}
  }
  renderSpotMenu(buildMenuList());
  menu.classList.remove("hidden");
}

function switchSpot(id) {
  closeSpotMenu();
  if (id === profile.spotId) return;
  setSpot(id);
  localStorage.setItem("dawnpatrol_profile", JSON.stringify(profile));
  run();
}

$("#spotMenuBtn").addEventListener("click", e => {
  e.stopPropagation();
  if ($("#spotMenu").classList.contains("hidden")) openSpotMenu();
  else closeSpotMenu();
});
document.addEventListener("click", e => {
  if (!e.target.closest("#spotMenu") && !e.target.closest("#spotMenuBtn")) closeSpotMenu();
});

$("#nearbyBack").addEventListener("click", () => {
  $("#nearby").classList.add("hidden");
  $("#onboarding").classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
});

// ---------- Add custom spot ----------
$("#addSpotBtn").addEventListener("click", () => {
  $("#addSpotForm").classList.toggle("hidden");
});
$("#cancelSpotBtn").addEventListener("click", () => {
  $("#addSpotForm").classList.add("hidden");
  newSpotDraft = { lat: null, lon: null, type: "beach" };
  $("#newSpotCoords").textContent = "No location set yet.";
  $("#newSpotName").value = "";
});
$("#newSpotGeo").addEventListener("click", async () => {
  $("#newSpotGeo").textContent = "Locating…";
  try {
    const coords = await getCoords();
    newSpotDraft.lat = coords.lat;
    newSpotDraft.lon = coords.lon;
    $("#newSpotCoords").textContent =
      `📍 ${coords.lat.toFixed(3)}, ${coords.lon.toFixed(3)} — facing will be auto-estimated from the swell.`;
  } catch (err) {
    $("#newSpotCoords").textContent = "⚠️ " + err.message;
  } finally {
    $("#newSpotGeo").textContent = "📍 Use my current location";
  }
});
$("#saveSpotBtn").addEventListener("click", async () => {
  const name = $("#newSpotName").value.trim();
  if (!name) { $("#newSpotCoords").textContent = "⚠️ Give your spot a name first."; return; }
  if (newSpotDraft.lat == null) { $("#newSpotCoords").textContent = "⚠️ Set a location first."; return; }
  $("#saveSpotBtn").textContent = "Reading swell…";
  try {
    const spot = await buildSpotFromCoords(name, "My spots", newSpotDraft, newSpotDraft.type);
    customSpots.push(spot);
    saveCustomSpots();
    setSpot(spot.id);
    $("#addSpotForm").classList.add("hidden");
    $("#newSpotName").value = "";
    newSpotDraft = { lat: null, lon: null, type: "beach" };
    $("#newSpotCoords").textContent = "No location set yet.";
  } catch (err) {
    $("#newSpotCoords").textContent = "⚠️ " + err.message;
  } finally {
    $("#saveSpotBtn").textContent = "Save spot";
  }
});

// Build a spot object from coords, auto-estimating `facing` from live swell direction.
async function buildSpotFromCoords(name, region, coords, type) {
  const { hours } = await fetchForecast(coords.lat, coords.lon);
  const facing = estimateFacing(hours) ?? 270;
  const sizeByType = { beach: [2, 8], point: [2, 8], reef: [3, 12] };
  return {
    id: "custom-" + name.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + Math.round(coords.lat * 100),
    name, region,
    lat: coords.lat, lon: coords.lon,
    facing, idealSwellDir: facing, idealSize: sizeByType[type] || [2, 8],
    idealTide: "any",
    level: "intermediate", type,
    custom: true,
    note: `Your spot — facing ~${Math.round(facing)}° (auto-estimated from the prevailing swell).`
  };
}

function loadCustomSpots() {
  try { return JSON.parse(localStorage.getItem("dawnpatrol_custom_spots")) || []; }
  catch (_) { return []; }
}
function saveCustomSpots() {
  localStorage.setItem("dawnpatrol_custom_spots", JSON.stringify(customSpots));
}

// ---------- Profile persistence ----------
function loadProfile() {
  try {
    const saved = JSON.parse(localStorage.getItem("dawnpatrol_profile"));
    if (!saved) return;
    Object.assign(profile, saved);
    // migrate any old string skill -> 1–5
    if (profile.skillLevel == null && saved.skill) {
      profile.skillLevel = { beginner: 2, intermediate: 3, advanced: 4 }[saved.skill] || 3;
    }
    if (profile.skillLevel == null) profile.skillLevel = 3;
    maxFt.value = profile.maxFt;
    $("#maxFtLabel").textContent = `${profile.maxFt} ft${profile.maxFt >= 20 ? "+" : ""}`;
    document.querySelectorAll('#skill button').forEach(b =>
      b.classList.toggle("active", +b.dataset.val === profile.skillLevel));
    document.querySelectorAll('#board button').forEach(b =>
      b.classList.toggle("active", b.dataset.val === profile.board));
    updateSkillLabel();
    // returning user already configured their profile — unlock the locate button
    touched.skill = touched.board = touched.maxFt = true;
  } catch (_) {}
}

loadProfile();
setSpot(getSpotAny(profile.spotId) ? profile.spotId : SPOTS[0].id);
updateLocateGate();

// ---------- PWA: register service worker (optional progressive enhancement) ----------
// Installing is a bonus — the app stays a normal website for anyone who never installs.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}

// ---------- Submit ----------
async function submitProfile() {
  if (run._busy) return;          // guard against double-fire
  run._busy = true;
  try {
    localStorage.setItem("dawnpatrol_profile", JSON.stringify(profile));
    await run();
  } finally {
    run._busy = false;
  }
}

// Form submit covers the Enter key; explicit button click covers every browser/automation
// path (some don't trigger implicit form submission).
$("#profileForm").addEventListener("submit", e => { e.preventDefault(); submitProfile(); });
$("#profileForm .primary-btn").addEventListener("click", e => { e.preventDefault(); submitProfile(); });

$("#resetBtn").addEventListener("click", () => {
  $("#results").classList.add("hidden");
  $("#onboarding").classList.remove("hidden");
  $("#resetBtn").classList.add("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
});

// Clicking the logo refreshes the page.
const logoEl = $("#logo");
logoEl.addEventListener("click", () => location.reload());
logoEl.addEventListener("keydown", e => {
  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); location.reload(); }
});

async function run() {
  const spot = getSpotAny(profile.spotId);
  $("#loader").classList.remove("hidden");
  removeError();
  try {
    const hours = state.cache[spot.id] || (await fetchForecast(spot.lat, spot.lon)).hours;
    state.cache[spot.id] = hours;
    state.offline = !navigator.onLine; // SW may have served this from cache while offline
    state.spot = spot;
    state.rawHours = hours;
    state.days = groupByDay(hours).map(d => ({
      ...d,
      summary: coach(dayHoursForCoach(d, false), profile, spot)
    }));

    // Default to the next surfable day (today's remaining hours, else tomorrow).
    const session = nextSession(hours);
    const defaultKey = session.length
      ? `${session[0].date.getFullYear()}-${session[0].date.getMonth()}-${session[0].date.getDate()}`
      : state.days[0]?.key;

    renderWeek(defaultKey);
    selectDay(defaultKey);
  } catch (err) {
    showError(err.message || "Couldn't load the forecast. Check your connection and try again.");
  } finally {
    $("#loader").classList.add("hidden");
  }
}

// For "today", prefer remaining daylight hours so we don't show a session that already passed.
function dayHoursForCoach(dayObj, preferRemaining) {
  const now = new Date();
  const isToday = relDay(dayObj.date).isToday;
  if (isToday) {
    const cutoff = new Date(now.getTime() - 60 * 60 * 1000);
    const remaining = dayObj.hours.filter(h => h.date >= cutoff);
    if (remaining.length >= 2) return remaining;
  }
  return dayObj.hours;
}

function showError(msg) {
  removeError();
  const box = document.createElement("div");
  box.className = "error-box";
  box.id = "errBox";
  box.textContent = "⚠️ " + msg;
  $("#profileForm").appendChild(box);
}
function removeError() { const e = $("#errBox"); if (e) e.remove(); }

// ---------- Render: week strip ----------
function renderWeek(selectedKey) {
  const strip = $("#weekStrip");
  strip.innerHTML = "";
  state.days.forEach(d => {
    const s = d.summary;
    const tone = s.empty ? "no" : s.verdict.tone;
    const score = s.empty ? "–" : s.peak.score;
    const wave = s.empty ? "" : `${Math.round(s.peak.waveFt * 10) / 10} ft`;
    const chip = document.createElement("div");
    chip.className = `day-chip ${tone}` + (d.key === selectedKey ? " selected" : "");
    chip.innerHTML =
      `<div class="d-name">${relDay(d.date).short}</div>` +
      `<div class="d-score">${score}</div>` +
      `<div class="d-wave">${wave}</div>` +
      `<div class="d-dot"></div>`;
    chip.addEventListener("click", () => { renderWeek(d.key); selectDay(d.key); });
    strip.appendChild(chip);
  });
}

function selectDay(key) {
  const day = state.days.find(d => d.key === key);
  if (!day) return;
  const result = coach(dayHoursForCoach(day, true), profile, state.spot);
  renderResults(result, state.spot);
}

// ---------- Render: main verdict + reasons + timeline ----------
function renderResults(result, spot) {
  $("#onboarding").classList.add("hidden");
  $("#results").classList.remove("hidden");
  $("#resetBtn").classList.remove("hidden");

  closeSpotMenu();
  const oldShareBox = $("#shareBox");
  if (oldShareBox) oldShareBox.remove(); // stale share text from a previous call
  $("#rSpotName").textContent = spot.name;
  $("#rSpotRegion").textContent = spot.region || "";

  if (result.empty) {
    $("#headline").textContent = "No forecast hours for this day.";
    return;
  }

  state.lastResult = result;
  const { verdict, peak, headline, reasons, scored } = result;

  $("#offlineBadge").classList.toggle("hidden", !state.offline);

  const badge = $("#verdictBadge");
  badge.textContent = verdict.label;
  badge.className = "verdict-badge " + verdict.tone;

  // Hazard banner (only present when it's well over the surfer's skill ceiling)
  const hz = $("#hazardBanner");
  if (result.hazard) { hz.textContent = result.hazard; hz.classList.remove("hidden"); }
  else hz.classList.add("hidden");

  $("#headline").textContent = headline;

  setGauge(peak.score, verdict.tone);
  animateNumber($("#scoreNum"), peak.score);

  const ul = $("#reasons");
  ul.innerHTML = "";
  reasons.forEach(r => {
    const li = document.createElement("li");
    li.textContent = r;
    ul.appendChild(li);
  });

  // Gear line: water temp + wetsuit
  const gear = $("#gearLine");
  gear.innerHTML = "";
  if (result.wetsuit) {
    gear.innerHTML =
      `<span>🌡️ Water ${result.wetsuit.f}°F / ${result.wetsuit.c}°C</span>` +
      `<span>🧥 ${result.wetsuit.suit}</span>`;
  }

  // Directions link to the spot
  let dl = document.getElementById("directionsLink");
  if (!dl) {
    dl = document.createElement("a");
    dl.id = "directionsLink";
    dl.className = "directions-link";
    dl.target = "_blank";
    dl.rel = "noopener";
    $(".verdict-actions").insertAdjacentElement("beforebegin", dl);
  }
  dl.href = mapsUrl(spot);
  dl.textContent = "🧭 Get directions";

  $("#timelineHeading").textContent = `${result.heading}, hour by hour`;
  renderTimeline(scored, peak, result.window);
}

// ---------- Share this call ----------
function buildShareText() {
  const r = state.lastResult, spot = state.spot;
  if (!r || r.empty) return "";
  const w = Math.round(r.peak.waveFt * 10) / 10;
  const windStr = r.peak.windMph != null ? `${Math.round(r.peak.windMph)}mph ${r.peak.wind.kind}` : "";
  const windowStr = r.window.start.time === r.window.end.time
    ? fmtHour(r.window.start.date)
    : `${fmtHour(r.window.start.date)}–${fmtHour(r.window.end.date)}`;
  return `🌅 Dawn Patrol — ${spot.name}, ${r.heading}\n` +
    `${r.verdict.label} (${r.peak.score}/100)\n` +
    `~${w}ft @ ${Math.round(r.peak.periodS)}s${windStr ? ", " + windStr : ""}. Best window ${windowStr}.\n` +
    `Know before you go.`;
}

$("#shareBtn").addEventListener("click", async () => {
  const text = buildShareText();
  if (!text) return;

  // Mobile: native share sheet, when available.
  if (navigator.share) {
    try { await navigator.share({ title: "Dawn Patrol", text }); return; }
    catch (e) {
      if (e && e.name === "AbortError") return; // user dismissed the sheet — not an error
      // otherwise fall through to the copy path
    }
  }

  // Desktop / no share API: copy to clipboard AND show the text so it's never silent.
  let copied = false;
  try { await navigator.clipboard.writeText(text); copied = true; } catch (_) { copied = false; }

  showShareBox(text);
  showToast(copied ? "✅ Copied to clipboard" : "Couldn't copy — select the text below");
});

// Persistent, selectable box under the Share button so the call is always grabbable.
function showShareBox(text) {
  let box = $("#shareBox");
  if (!box) {
    box = document.createElement("div");
    box.id = "shareBox";
    box.className = "share-box";
    box.innerHTML =
      `<textarea readonly rows="4" aria-label="Shareable surf call"></textarea>` +
      `<button type="button" class="share-box-close" aria-label="Close">✕</button>`;
    $(".verdict-actions").insertAdjacentElement("afterend", box);
    box.querySelector(".share-box-close").addEventListener("click", () => box.remove());
  }
  const ta = box.querySelector("textarea");
  ta.value = text;
  box.classList.remove("hidden");
  ta.focus();
  ta.select();
}

// Brief, clearly-visible confirmation toast (replaces the easy-to-miss button flip).
let toastTimer = null;
function showToast(msg) {
  let toast = $("#toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast";
    toast.className = "toast";
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2200);
}

// ---------- "Same wave, different surfer" comparison demo ----------
$("#compareBtn").addEventListener("click", () => {
  if (!state.days || !state.days.length || !state.spot) return;
  const cmp = compareSurfers(state.days.map(d => ({ date: d.date, hours: d.hours })), state.spot);
  if (!cmp) return;
  renderCompare(cmp, state.spot);
});

function renderCompare(cmp, spot) {
  const { heading } = relDay(cmp.date);
  const c = cmp.conditions;
  const windStr = c.windMph != null && c.windKind ? `, ${c.windMph}mph ${c.windKind}` : "";
  const conditions =
    `${spot.name} · ${heading} ${fmtHour(cmp.hour)} · ~${c.waveFt}ft` +
    (c.periodS != null ? ` @ ${c.periodS}s` : "") + windStr;

  const col = (p) => `
    <div class="compare-col">
      <div class="compare-persona">${p.emoji} ${p.label}<span class="compare-board">${p.board}</span></div>
      <div class="verdict-badge ${p.verdict.tone}">${p.verdict.label}</div>
      <div class="compare-score">${p.score}<small>/100</small></div>
      <div class="compare-why">${p.why}</div>
    </div>`;

  let overlay = $("#compareOverlay");
  if (overlay) overlay.remove();
  overlay = document.createElement("div");
  overlay.id = "compareOverlay";
  overlay.className = "compare-overlay";
  overlay.innerHTML = `
    <div class="compare-modal" role="dialog" aria-label="Same wave, different surfer">
      <button class="compare-close" aria-label="Close">✕</button>
      <h2 class="compare-title">Same wave. Same moment.<br>Two surfers.</h2>
      <p class="compare-conditions">${conditions}</p>
      <div class="compare-grid">
        ${col(cmp.advanced)}
        ${col(cmp.beginner)}
      </div>
      <p class="compare-caption">The forecast is identical. The right call isn't — that's the whole idea.</p>
    </div>`;
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.querySelector(".compare-close").addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  document.addEventListener("keydown", function esc(e) {
    if (e.key === "Escape") { close(); document.removeEventListener("keydown", esc); }
  });
  requestAnimationFrame(() => overlay.classList.add("show"));
}

function renderTimeline(scored, peak, window) {
  const tl = $("#timeline");
  tl.innerHTML = "";
  let detail = $("#barDetail");
  if (detail) detail.remove();

  // The single best hour glows green ("go then"); a genuine plateau tied within 1 pt of
  // the peak also greens, but it never floods the whole day. Everything else is neutral.
  const bestTimes = new Set([peak.time]);
  if (window && window.slice) {
    window.slice.filter(h => h.score >= peak.score - 1).forEach(h => bestTimes.add(h.time));
  }
  // Safety: if that somehow grabbed most of the day (flat conditions), keep only the peak.
  if (bestTimes.size > Math.max(2, Math.ceil(scored.length / 3))) {
    bestTimes.clear(); bestTimes.add(peak.time);
  }

  const step = scored.length > 14 ? 2 : 1;
  const shown = scored.filter((_, i) => i % step === 0);

  shown.forEach(h => {
    const tone = bestTimes.has(h.time) ? "go" : "idle";
    const wrap = document.createElement("div");
    wrap.className = "bar-wrap" + (h.time === peak.time ? " peak" : "");

    const bar = document.createElement("div");
    bar.className = "bar " + tone;
    requestAnimationFrame(() => { bar.style.height = Math.max(5, h.score) + "%"; });

    const time = document.createElement("div");
    time.className = "bar-time";
    time.textContent = fmtHour(h.date);

    wrap.appendChild(bar);
    wrap.appendChild(time);
    wrap.addEventListener("click", () => showBarDetail(h));
    tl.appendChild(wrap);
  });

  detail = document.createElement("div");
  detail.className = "bar-detail";
  detail.id = "barDetail";
  tl.parentElement.appendChild(detail);
}

function showBarDetail(h) {
  const d = $("#barDetail");
  const w = Math.round(h.waveFt * 10) / 10;
  d.innerHTML =
    `<strong>${fmtHour(h.date)} · score ${h.score}/100</strong><br>` +
    `${w} ft @ ${Math.round(h.periodS)}s · ` +
    `${h.windMph != null ? Math.round(h.windMph) + " mph " + h.wind.kind : "wind n/a"}`;
  d.classList.add("show");
}

// Drive the circular SVG gauge: fill the arc to `score`% and color it by verdict.
function setGauge(score, tone) {
  const arc = $("#gaugeArc");
  const CIRC = 2 * Math.PI * 52; // matches r=52 in the SVG
  // reset to empty first so the ring re-animates on every day switch
  arc.style.transition = "none";
  arc.style.strokeDashoffset = CIRC;
  const color = tone === "go" ? "var(--go)" : tone === "maybe" ? "var(--maybe)" : "var(--no)";
  arc.style.stroke = color;
  // next frame: animate to the target
  requestAnimationFrame(() => requestAnimationFrame(() => {
    arc.style.transition = "stroke-dashoffset 1.1s cubic-bezier(0.2,0.8,0.2,1), stroke 0.5s";
    arc.style.strokeDashoffset = CIRC * (1 - Math.max(0, Math.min(100, score)) / 100);
  }));
}

function animateNumber(el, target) {
  let cur = 0;
  const stepN = Math.max(1, Math.round(target / 24));
  const t = setInterval(() => {
    cur += stepN;
    if (cur >= target) { cur = target; clearInterval(t); }
    el.textContent = cur;
  }, 18);
}

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
