# Dawn Patrol Alerts — Design

**Date:** 2026-06-02
**Status:** Approved (Option 🅲 — local demo push, with upgrade path to Supabase cloud)

## Goal
Let a user "sign up" for alerts and get a **real push notification** when **any surf break near them is firing** (clears a personal score threshold) for the upcoming session. Must be **demoable live on a laptop today** with no cloud accounts, and structured to upgrade to always-on cloud delivery later.

## Behavior
- A **"🔔 Get dawn alerts"** card on the results screen.
- Tap → request notification permission → store the user's **location, profile (skill/board/comfort), and a score threshold** (default 70).
- A checker evaluates nearby breaks for the next session; if any clears the threshold, push:
  > 🌅 **Trestles is firing tomorrow** — 84/100 · best 6–8am · +2 more nearby
- Tapping the notification opens Dawn Patrol to the ranked nearby list.
- A **"Send me a test alert"** button fires an immediate sample push (for live demos).

## Architecture (Option 🅲)
- **PWA client** (`js/alerts.js`): sign-up card; requests permission; subscribes via `PushManager` using the VAPID public key fetched from the local server; POSTs `{subscription, lat, lon, profile, threshold}` to the server.
- **Service worker** (`sw.js`): add `push` (show notification) and `notificationclick` (focus/open app) handlers.
- **Local alerts server** (`alerts/server.mjs`, Node + `web-push`): endpoints
  - `GET /vapid` → `{publicKey}` (CORS-enabled)
  - `POST /subscribe` → append/update `alerts/subs.json`
  - `POST /send` → evaluate every subscriber's nearby spots and push real alerts
  - `POST /test` → send an immediate sample push to a subscriber (demo)
- **Shared brain** (`alerts/shared.mjs`): loads the exact `spots.js` / `forecast.js` / `coach.js` via `vm` (same pattern as the test suite) so alerts use the identical personal scoring — no duplicated rules.
- **Storage:** `alerts/subs.json` (gitignored). VAPID keys in `alerts/vapid.json` (private key gitignored).

## Data flow
subscribe → `POST /subscribe` (local server) → stored → run `POST /send` → for each sub: fetch nearby forecasts → score the next session for that person → `shouldAlert(nearby, threshold)` → if it fires, `web-push` to the device → SW shows notification → tap opens app.

## Key shared function (pure, tested)
`shouldAlert(nearby, threshold)` where `nearby = [{name, score, when, windowStr}]`:
- filter to spots with `score >= threshold`, sort desc;
- if none → `null`;
- else → `{ title, body, count }` for the notification.

## Where it works
- **Laptop:** app on `localhost` + local server → full end-to-end real notification. ✅ (the live demo)
- **Phone (closed-app):** requires the app on HTTPS + a reachable sender; that's the **Option 🅰️ upgrade** (swap `server.mjs` for a Supabase edge function + cron). Code is structured for a drop-in swap.

## Scope (YAGNI)
- **In:** web push, "any nearby fires," adjustable threshold, test-push button.
- **Out (future):** accounts/auth, email/SMS, quiet hours, multi-device sync.

## Testing
- Unit: `shouldAlert` (fires above threshold, picks best, counts others, returns null below) in `tests/run-tests.mjs`.
- Manual: subscribe in desktop Chrome → "Send test alert" → notification appears; `POST /send` with live data.
