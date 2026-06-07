// Pulls live ocean + weather data from Open-Meteo. Free, no API key, CORS-enabled.
// Marine API -> waves/swell. Forecast API -> wind & air temp.

const M_PER_FT = 0.3048;
const KMH_PER_MPH = 1.609344;

function metersToFeet(m) { return m == null ? null : m / M_PER_FT; }
function kmhToMph(k) { return k == null ? null : k / KMH_PER_MPH; }

async function fetchForecast(lat, lon) {
  const marineUrl = `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}` +
    `&hourly=wave_height,wave_period,wave_direction,swell_wave_height,swell_wave_period,swell_wave_direction,` +
    `sea_level_height_msl,sea_surface_temperature` +
    `&timezone=auto&forecast_days=7`;

  const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&hourly=wind_speed_10m,wind_direction_10m,temperature_2m` +
    `&timezone=auto&forecast_days=7`;

  const [marineRes, weatherRes] = await Promise.all([
    fetch(marineUrl),
    fetch(weatherUrl)
  ]);

  if (!marineRes.ok) throw new Error("Marine forecast unavailable for this spot.");
  if (!weatherRes.ok) throw new Error("Weather forecast unavailable for this spot.");

  const marine = await marineRes.json();
  const weather = await weatherRes.json();

  return mergeHourly(marine, weather);
}

// Combine the two API responses into one array of hourly snapshots, in spot-local time.
function mergeHourly(marine, weather) {
  const times = marine.hourly.time;
  const mh = marine.hourly;
  const wh = weather.hourly;

  // weather may have its own time array; build a lookup so indexes line up safely.
  const wIndex = {};
  wh.time.forEach((t, i) => { wIndex[t] = i; });

  const hours = times.map((t, i) => {
    const wi = wIndex[t];
    // prefer the dedicated groundswell numbers; fall back to combined sea state.
    const swellH = mh.swell_wave_height[i] ?? mh.wave_height[i];
    const swellP = mh.swell_wave_period[i] ?? mh.wave_period[i];
    const swellD = mh.swell_wave_direction[i] ?? mh.wave_direction[i];
    return {
      time: t,
      date: new Date(t),
      waveFt: metersToFeet(swellH),
      periodS: swellP,
      swellDir: swellD,
      windMph: wi != null ? kmhToMph(wh.wind_speed_10m[wi]) : null,
      windDir: wi != null ? wh.wind_direction_10m[wi] : null,
      airTempC: wi != null ? wh.temperature_2m[wi] : null,
      tideM: mh.sea_level_height_msl ? mh.sea_level_height_msl[i] : null,
      seaTempC: mh.sea_surface_temperature ? mh.sea_surface_temperature[i] : null
    };
  });

  return { hours, timezone: marine.timezone };
}

// The next real surfable window: today's remaining daylight (6am–7pm), or if the
// day is already done, tomorrow's daylight. Surf apps should never show a 3am "session".
function nextSession(hours) {
  const now = new Date();
  const cutoff = new Date(now.getTime() - 60 * 60 * 1000); // include the current hour

  const daylight = h => h.date.getHours() >= 6 && h.date.getHours() <= 19;
  const dayKey = d => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

  // remaining daylight hours today
  const todayKey = dayKey(now);
  let session = hours.filter(h => dayKey(h.date) === todayKey && daylight(h) && h.date >= cutoff);

  // if today's surf day is over, roll to the next day's daylight
  if (session.length < 2) {
    const future = hours.filter(h => h.date >= cutoff && daylight(h));
    if (future.length) {
      const nextKey = dayKey(future[0].date);
      session = future.filter(h => dayKey(h.date) === nextKey);
    }
  }
  return session;
}

// Group all forecast hours into per-day daylight buckets (for the multi-day outlook).
function groupByDay(hours) {
  const daylight = h => h.date.getHours() >= 6 && h.date.getHours() <= 19;
  const dayKey = d => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const map = new Map();
  hours.filter(daylight).forEach(h => {
    const k = dayKey(h.date);
    if (!map.has(k)) map.set(k, { key: k, date: h.date, hours: [] });
    map.get(k).hours.push(h);
  });
  return [...map.values()].slice(0, 7);
}

// Circular mean of compass bearings (degrees) — needed because directions wrap at 360.
function circularMeanDeg(degs) {
  const valid = degs.filter(d => d != null && !isNaN(d));
  if (!valid.length) return null;
  let x = 0, y = 0;
  valid.forEach(d => { const r = d * Math.PI / 180; x += Math.cos(r); y += Math.sin(r); });
  let mean = Math.atan2(y / valid.length, x / valid.length) * 180 / Math.PI;
  return (mean + 360) % 360;
}

// Auto-estimate which way a break faces: a beach receives swell from the direction it's
// open to, so the prevailing swell direction ≈ the facing. Derived from live data — no
// third-party spot database required.
function estimateFacing(hours) {
  return circularMeanDeg(hours.map(h => h.swellDir));
}
