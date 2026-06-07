# 🌅 Dawn Patrol

**Know before you go.** A personal surf coach: a go / no-go decision layer on top of the forecast.

Build Night #3 — Vibe Coding Club

## The pitch

Surf forecasting is excellent at delivering the numbers. The hard part is left to the surfer:

- **The same forecast means different things to different people.** A 10ft day is a dream for a pro and a hazard for a beginner — but they read the identical forecast.
- **Numbers aren't a decision.** Swell height, period, direction, wind, tide — interpreting all of it into "should *I* paddle out right now?" is the real work.

**Dawn Patrol does that interpretation for you — personalized to you, for free.**

You tell it your skill level, your board, your home break, and the biggest wave you're
comfortable on. It pulls live ocean data and gives you a straight call: **GO SURF**,
**MARGINAL**, or **NOT WORTH IT** — with the *why* in plain English and your best window of the day.

## What makes it different

| | Typical forecast | Dawn Patrol |
|---|---|---|
| Output | Raw numbers | A personal go / no-go |
| Skill-aware | Same for everyone | Tuned to you (beginner ≠ pro) |
| Local break knowledge | Generic | Per-spot, baked in |

The killer demo: **identical 10ft clean conditions → an advanced surfer gets GO SURF (100/100),
an intermediate gets NOT WORTH IT ("over your skill ceiling").** Same ocean, different answer.
That's the whole product.

## Features

- **Personal go/no-go** — GO SURF / MARGINAL / NOT WORTH IT, scored for *you*.
- **7-day outlook** — a tappable week strip showing each day's best score and wave height, so you can decide whether to surf now or wait for a better day.
- **Tide-aware** — factors low/mid/high tide (and rising/falling) against each break's preference.
- **Water temp + wetsuit call** — live sea-surface temp with a wetsuit recommendation (e.g. "4/3 mm fullsuit").
- **Use my location → ranked nearby spots** — finds the real breaks around you and ranks them by a blend of live conditions (for your skill) and proximity, so you see the best bet first. Falls back to a spot at your exact coordinates if you're outside the curated coverage.
- **Add my spot** — save any custom break. Its facing is auto-estimated from the live prevailing swell direction (no third-party spot database needed), so the wind analysis still works.
- **Share this call** — one tap copies a clean summary to send to your surf crew.

## How it works

- **Live data:** [Open-Meteo](https://open-meteo.com) Marine + Weather APIs (free, no key, CORS).
- **Local knowledge layer:** each spot has ideal swell direction, size range, ideal tide,
  who it suits, and which wind blows offshore — the stuff a local would actually tell you.
- **Personal scoring engine:** combines wave period, swell angle, wind, and tide into a quality
  score, then scales it by how well the size fits *your* skill and comfort.
- 100% client-side. No backend, no build step, no accounts.

## Run locally

```bash
cd swellmate
python3 -m http.server 8778
# open http://localhost:8778
```

## Deploy (Netlify Drop — no account setup needed)

1. Go to **https://app.netlify.com/drop**
2. Drag the **`swellmate` folder** (or `dawn-patrol-deploy.zip`) onto the page.
3. Netlify gives you an instant public URL (e.g. `https://dawn-patrol-xyz.netlify.app`).
4. Optional: sign in to rename the site / keep it permanent.

Everything is static — no env vars, no build command. It just works.

## Stack

Vanilla HTML/CSS/JS. Zero dependencies. Files:

- `js/spots.js` — surf spots + local knowledge (facing, ideal swell/size/tide)
- `js/forecast.js` — Open-Meteo fetch, "next session" logic, facing estimation
- `js/coach.js` — the personalized scoring engine (the brains)
- `js/app.js` — UI wiring, geolocation, custom spots, multi-day outlook, share
