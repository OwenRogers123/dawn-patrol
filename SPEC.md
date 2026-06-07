# Dawn Patrol — Product & Technical Specification

> **Know before you go.** A personalized surf coach that answers one question: *should **you** paddle out?*

**Status:** MVP in active development (build-night origin)
**Last updated:** 2026-06-01
**Author:** Owen Rogers

---

## 1. Vision

Surfline owns surf forecasting but shows everyone the **same numbers behind a paywall**. A 10 ft day is a dream for a pro and a hazard for a beginner — yet they see the identical forecast, and neither gets a straight answer to the only question that matters: *should I paddle out right now?*

**Dawn Patrol** translates raw ocean data into a **personal go / no-go** call, tuned to the individual surfer's skill, board, and comfort, enriched with **local break knowledge** — and it's **free**.

### Positioning vs. Surfline
| | Surfline | Dawn Patrol |
|---|---|---|
| Output | Raw numbers | A personal decision (GO / MARGINAL / NO) |
| Skill-aware | ❌ same for everyone | ✅ rated 1–5, plus board & comfort |
| Local knowledge | Generic | Per-spot (facing, ideal swell/size/tide) |
| Price | $8–10/mo | Free & open |

**Moat:** not data we hoard, but the *personalization layer* + *curated local-knowledge database* + *community spots* — and being genuinely free.

---

## 2. Target users

1. **The decider** — busy surfer who just wants "yes/no, and when." Primary.
2. **The improver** — beginner/intermediate unsure what's safe for them.
3. **The traveler** — wants the best nearby break in an unfamiliar area.

---

## 3. Product principles

1. **One clear answer first.** The verdict and best window lead; detail is secondary.
2. **Personal, not generic.** Every number is filtered through *this* surfer.
3. **Honest about uncertainty.** Show confidence; never fake precision (e.g., auto-estimated spot facing is labeled as such).
4. **Stoke-optimistic, safety-aware.** Lean toward GO on borderline *quality* calls, but always warn on *hazard* (see §7).
5. **Free and open.** No paywalls; open-source; self-hostable.

---

## 4. Decisions locked in this spec

| Area | Decision |
|---|---|
| Data sources | **Open-Meteo** (primary, global) **+ free NOAA buoys & tide stations** where available (US). No paid keys. |
| Scoring bias | **Stoke-optimistic** on borderline quality calls. |
| Dangerous days | **Warn but allow** — compute the score, attach a prominent hazard warning when beyond the surfer's ceiling. |
| Profiles | **Local-first, optional account + cloud sync.** |
| Spot database | **Hybrid:** curated (verified) + user-submitted (community) + OSM/crowdsource auto-import, with a trust/quality tier. |
| Resilience | **PWA, offline-capable**, cache last forecast with a "stale" badge. |
| Alerts | **Web push + email/SMS morning digest** ("dawn patrol report"). |
| AI narrative | **Hybrid:** deterministic rule-based core + **optional LLM (Groq free tier)** rephrasing, template fallback. |
| Platform | **Responsive web app / PWA** first. |
| Units | **Feet, °F, mph** (with future locale toggle). |
| Business model | **Fully free / open-source.** |
| Frontend stack | **Vanilla JS now**, documented Svelte/React migration path later. |
| Backend | **Supabase** (auth, Postgres, edge functions, cron). |

---

## 5. Core feature set

### 5.1 MVP (shipping)
- **Profile**: skill rating **1–5** (with Beginner/Intermediate/Advanced label), **board** (soft-top, longboard, fish, funboard, shortboard, step-up, gun), **max comfortable wave height**, **home break**.
- **The Call**: GO SURF / MARGINAL / NOT WORTH IT, with a **0–100 personal score** (circular gauge), plain-English **why**, and the **best window** of the day.
- **7-day outlook**: tappable day strip; re-renders the full call per day.
- **Hour-by-hour timeline** with the peak hour highlighted.
- **Water temp + wetsuit recommendation.**
- **Use my location → ranked nearby spots**: discovers real curated breaks within range, ranks by `0.65 × conditions + 0.35 × proximity`, shows distance + live conditions, **Google Maps directions link** per spot. Falls back to an ad-hoc spot at exact coordinates outside coverage.
- **Add my spot**: custom break, facing auto-estimated from prevailing swell.
- **Share this call**: copy/Web-Share a clean summary.

### 5.2 Near-term roadmap
- **Dawn Patrol Alerts**: notify when a saved spot crosses the user's "worth it" threshold (web push + pre-dawn email/SMS digest).
- **Accounts + sync** (Supabase auth): profile, saved spots, alert prefs across devices.
- **PWA install + offline** with cached last-known forecast.
- **NOAA buoy/tide enrichment** for US spots.
- **Optional LLM coaching voice** (Groq) over the rule-based reasons.
- **Community spot submissions** with moderation + trust tiers.

### 5.3 Later
- OSM bulk spot import; per-spot crowd/quality signals; multi-spot dashboards; tide-curve visualization; webcam embeds (where freely available); locale/unit toggle; native wrappers if push reliability demands.

---

## 6. The scoring engine (heart of the product)

Deterministic, testable, and fully offline. Per hour, for *this* surfer at *this* spot:

```
waveQuality = 0.45·period + 0.30·swellAngle + 0.25·wind     // 0–1, "is the wave good?"
score = 100 · waveQuality · sizeFit · tideFit · boardFit     // scaled by personal fit
```

**Factors**
- **period** — longer = cleaner/more powerful groundswell (≥13 s → 1.0; <6 s → 0.35).
- **swellAngle** — alignment of swell direction with the spot's `idealSwellDir`.
- **wind** — offshore (clean) 1.0 / cross 0.8 / onshore 0.55, computed from the spot's `facing`.
- **sizeFit** — does wave height fit the surfer? Driven by **skill (1–5)** ceiling/floor and the **comfort cap**; also flags `flat | small | good | big | over`.
- **tideFit** — current tide state (low/mid/high, derived from the day's range) vs. the spot's `idealTide`.
- **boardFit** — board's happy size range vs. wave size (longboards glide in small surf; guns need size).

**Skill model (1–5)**
| Level | Tier | Ceiling (ft) | Floor (ft) |
|---|---|---|---|
| 1 | Beginner | 3 | 0.8 |
| 2 | Beginner | 4.5 | 1.0 |
| 3 | Intermediate | 7 | 1.5 |
| 4 | Advanced | 11 | 2.0 |
| 5 | Advanced/Expert | 20 | 2.5 |

**Board model** — each board has a happy `range` (ft) and a `smallGlide` factor for under-range performance:
soft-top [0.5–4], longboard [0.5–6], fish [1–6], funboard [1–7], shortboard [2.5–12], step-up [5–16], gun [8–25].

**Verdict thresholds** (stoke-optimistic): GO ≥ 62, MARGINAL 40–61, else NOT WORTH IT. *(Tuned slightly lower than neutral to lean toward "go" on close calls.)*

**Best window** — the highest-scoring run of consecutive hours in the session.

> **Determinism is a hard requirement** — the scoring engine must never depend on the network or an LLM. This is what makes it testable (§12) and trustworthy.

---

## 7. Safety & liability

- **Warn but allow:** when wave size exceeds the surfer's skill ceiling or comfort cap, still show the score, but render a **prominent hazard banner** (e.g., "⚠️ Bigger than your comfort zone — strong currents and heavy hold-downs likely").
- **Hazard signals surfaced:** size over ceiling, very long period + size (power), strong wind, big tide swing.
- **Disclaimer (persistent, in footer + first-run):** *"Dawn Patrol is guidance, not a safety device. Conditions change fast. Know your limits, never surf alone, and make your own call."*
- Never present the app as authoritative for life-safety decisions.

---

## 8. Data sources

| Source | Use | Cost | Notes |
|---|---|---|---|
| **Open-Meteo Marine** | wave/swell height, period, direction; sea-level (tide proxy); SST | Free, no key | Global, CORS-enabled. Primary. |
| **Open-Meteo Forecast** | wind speed/direction, air temp | Free, no key | Paired by timestamp. |
| **NOAA NDBC buoys** | real buoy wave/wind readings | Free | US only; enrich/validate where a buoy is near a spot. |
| **NOAA CO-OPS tides** | true tide predictions | Free | US only; replaces the sea-level proxy where available. |

- **Facing estimation** for un-curated spots = circular mean of prevailing swell direction (honest approximation; labeled in UI). Production upgrade path: OSM coastline vectors.
- **No Surfline / no scraping** of competitor proprietary data — legal and strategic.

**Units:** display in **feet, °F, mph**; store internally in SI (m, °C, km/h) and convert at the edge.

---

## 9. Architecture

```
┌────────────────────────────────────────────────────────┐
│  PWA (vanilla JS now → Svelte/React later)               │
│  • scoring engine (coach.js) — pure, offline, tested     │
│  • forecast client (Open-Meteo direct)                    │
│  • service worker: cache shell + last forecast (offline)  │
│  • localStorage: profile, custom spots (local-first)      │
└───────────────┬──────────────────────────────────────────┘
                │ (only when signed in / for alerts / LLM)
┌───────────────▼──────────────────────────────────────────┐
│  Supabase                                                  │
│  • Auth (optional accounts)                                │
│  • Postgres: profiles, spots (curated/community), alerts   │
│  • Edge functions: NOAA enrichment, LLM proxy (Groq),      │
│    spot submission/moderation, notification dispatch       │
│  • Cron: pre-dawn alert evaluation + email/SMS/push        │
└────────────────────────────────────────────────────────────┘
```

**Local-first principle:** the core call works with zero backend (direct Open-Meteo + local profile). Backend is *progressive enhancement* for sync, alerts, community spots, and LLM polish.

### Current file structure (MVP)
- `index.html` — shell + screens (onboarding / nearby / results)
- `css/styles.css` — dawn-themed UI, animations, gauge
- `js/spots.js` — curated spot DB + local knowledge
- `js/forecast.js` — Open-Meteo fetch, session windowing, facing estimate, unit conversion
- `js/coach.js` — **scoring engine** (pure, tested)
- `js/app.js` — UI wiring, geolocation, nearby ranking, sharing
- `tests/` — Node test suite for the pure logic

---

## 10. Data model (Supabase / Postgres)

```sql
profiles (
  id uuid pk references auth.users,
  display_name text,
  skill_level int check (skill_level between 1 and 5),
  board text,            -- enum-ish: softtop|longboard|fish|funboard|shortboard|stepup|gun
  max_ft numeric,
  units jsonb default '{"size":"ft","temp":"F","wind":"mph"}',
  created_at timestamptz default now()
)

spots (
  id text pk,
  name text, region text,
  lat numeric, lon numeric,
  facing int, ideal_swell_dir int,
  ideal_size numeric[],  -- [min,max]
  ideal_tide text,       -- low|mid|high|any
  level text, type text, -- beach|point|reef
  note text,
  source text,           -- curated|community|osm
  trust int,             -- 0..100 (curated high, osm low)
  submitted_by uuid, approved bool default false
)

saved_spots ( user_id uuid, spot_id text, primary key (user_id, spot_id) )

alerts (
  id uuid pk, user_id uuid, spot_id text,
  min_score int default 65,
  channels text[],       -- ['push','email','sms']
  quiet_hours int4range,
  active bool default true
)
```

**Spot trust tiers:** `curated` (full metadata, verified) > `community` (user-submitted, auto-facing, moderated) > `osm` (bulk-imported, auto-estimated, lowest trust). UI badges the source; ranking can weight by trust.

---

## 11. Notifications ("Dawn Patrol Alerts")

- **Trigger:** nightly cron evaluates each active alert's spot for the next day; if peak personal score ≥ `min_score`, queue a notification.
- **Channels:** web push (where supported) **and** email/SMS digest before dawn — *"🌅 Pleasure Point hits 85 tomorrow, best 6–8 am. 4/3 fullsuit."*
- **Respect quiet hours**; one digest per morning, not per-spot spam.
- **Providers:** email via Supabase/Resend; SMS via Twilio (or email-to-SMS for MVP); push via Web Push API + VAPID.

---

## 12. AI narrative layer (optional, hybrid)

- **Core stays rule-based** (deterministic verdict + reasons).
- **Optional LLM polish:** an edge function proxies to **Groq (free tier, Llama)** to rewrite the reason bullets into a natural surf-coach paragraph. Input = structured factors; output = prose. **Never** lets the LLM change the verdict or score.
- **Fallback:** if the LLM/network is unavailable or slow (>1.5 s), use the template reasons. Cache by `(spotId, day, profileHash)`.
- **Guardrails:** no safety claims, no invented data; temperature low; output length-capped.

---

## 13. Offline & PWA

- Installable (manifest + icons); standalone display.
- Service worker caches the app shell + last successful forecast per viewed spot.
- Offline: show last-known call with a **"⏳ stale — last updated <time>"** badge; disable actions that need network.

---

## 14. Privacy

- Geolocation used only to find nearby spots; **never sent to third parties**; not stored without consent.
- Local-first by default; cloud only when the user opts into an account.
- No tracking/ads (free & open ethos).

---

## 15. Testing strategy

- **Unit tests (Node, no browser)** over the pure logic — the scoring engine is the crown jewel and must be covered:
  - unit conversions (m→ft, km/h→**mph**, °C→°F)
  - `periodQuality`, `windQuality`, `swellDirQuality`
  - `sizeFit` across skill 1–5 (incl. the **same-wave-different-verdict** case)
  - `boardFactor` (longboard vs. shortboard vs. gun in small surf)
  - `tideFactor`, `wetsuitFor`
  - `bestWindow`, `relDay`, `nextSession`, `estimateFacing`
  - end-to-end `coach()` on synthetic days (GO vs. NO)
  - spot-DB integrity (unique ids, valid ranges, required fields)
- **CI gate:** tests must pass before deploy.
- Manual/E2E: browser smoke test of each screen; geolocation flow on device.

---

## 16. Non-functional requirements

- **Performance:** first call < 2 s on 4G; gauge/animation 60 fps; respects `prefers-reduced-motion`.
- **Accessibility:** WCAG AA contrast, keyboard-operable, semantic labels.
- **Resilience:** graceful degradation when any data source fails.
- **Cost:** $0 infra at MVP (free tiers only).

---

## 17. Success metrics

- % of sessions reaching a verdict (activation).
- Repeat opens at dawn (habit) — the real signal for a "dawn patrol" tool.
- Alert opt-in rate; alert → app-open rate.
- Community spots submitted & approved.

---

## 18. Open questions / risks

1. **Facing accuracy** for non-curated spots (swell-mean approximation skews to the active swell window). Mitigate with OSM coastline data later.
2. **NOAA coverage** is US-only — global users stay on Open-Meteo.
3. **SMS cost** if it scales — may restrict SMS to opt-in/low volume; email + push first.
4. **Spot moderation load** as community submissions grow — need lightweight review tooling.
5. **Tide proxy** (sea-level) vs. true harmonic tide — replace with NOAA where possible.

---

## 19. Milestones

- **M0 — Build-night MVP (done/in progress):** profile (1–5 skill, 7 boards), personal call + gauge, 7-day outlook, water temp/wetsuit, nearby ranking + maps links, share, dawn UI. Units → ft/°F/mph. Test suite green.
- **M1 — PWA + offline:** manifest, service worker, stale-cache.
- **M2 — Accounts + sync:** Supabase auth, saved spots/profile.
- **M3 — Alerts:** nightly cron + email/push digest.
- **M4 — Enrichment + community:** NOAA buoys/tides, spot submissions + moderation, optional Groq narrative.
