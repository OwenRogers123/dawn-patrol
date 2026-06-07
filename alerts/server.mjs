// Dawn Patrol — local alerts server (Option C demo).
// Receives push subscriptions and sends real Web Push notifications.
// Run: npm run alerts   (then enable alerts in the app and hit "Send me a test alert")
//
// Upgrade path to always-on (Option A): replace this file with a Supabase edge function
// + a scheduled cron that calls the same evaluateNearby()/shouldAlert() from shared.mjs.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import webpush from "web-push";
import { evaluateNearby, shouldAlert } from "./shared.mjs";

const dir = path.dirname(fileURLToPath(import.meta.url));
const PORT = 8788;

const vapid = JSON.parse(fs.readFileSync(path.join(dir, "vapid.json"), "utf8"));
webpush.setVapidDetails("mailto:dawnpatrol@example.com", vapid.publicKey, vapid.privateKey);

const SUBS = path.join(dir, "subs.json");
const loadSubs = () => { try { return JSON.parse(fs.readFileSync(SUBS, "utf8")); } catch { return []; } };
const saveSubs = s => fs.writeFileSync(SUBS, JSON.stringify(s, null, 2));

function reply(res, code, obj) {
  res.writeHead(code, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
  });
  res.end(JSON.stringify(obj));
}
const readBody = req => new Promise(r => {
  let d = ""; req.on("data", c => d += c); req.on("end", () => { try { r(JSON.parse(d || "{}")); } catch { r({}); } });
});

async function pushTo(sub, payload) {
  try { await webpush.sendNotification(sub, JSON.stringify(payload)); return true; }
  catch (e) { console.warn("push failed:", e.statusCode || e.message); return false; }
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") return reply(res, 204, {});
  const url = new URL(req.url, "http://localhost");
  try {
    // Public VAPID key for the browser to subscribe with.
    if (req.method === "GET" && url.pathname === "/vapid") {
      return reply(res, 200, { publicKey: vapid.publicKey });
    }

    // Store a push subscription + the surfer's location, profile, and threshold.
    if (req.method === "POST" && url.pathname === "/subscribe") {
      const b = await readBody(req);
      if (!b.subscription?.endpoint) return reply(res, 400, { error: "missing subscription" });
      const subs = loadSubs().filter(s => s.subscription.endpoint !== b.subscription.endpoint);
      subs.push({ subscription: b.subscription, lat: b.lat, lon: b.lon, profile: b.profile, threshold: b.threshold ?? 70, created: new Date().toISOString() });
      saveSubs(subs);
      console.log(`+ subscriber (${subs.length} total) near ${b.lat?.toFixed?.(2)},${b.lon?.toFixed?.(2)} threshold ${b.threshold}`);
      return reply(res, 200, { ok: true, subscribers: subs.length });
    }

    // Immediate sample push — for live demos.
    if (req.method === "POST" && url.pathname === "/test") {
      const b = await readBody(req);
      const subs = loadSubs();
      const targets = b.endpoint ? subs.filter(s => s.subscription.endpoint === b.endpoint) : subs;
      let sent = 0;
      for (const s of targets) {
        if (await pushTo(s.subscription, { title: "🌅 Dawn Patrol — test alert", body: "This is what a dawn alert looks like. Surf's calling. 🏄", url: "./" })) sent++;
      }
      return reply(res, 200, { sent });
    }

    // The real thing: evaluate every subscriber's nearby breaks and push if any fires.
    if (req.method === "POST" && url.pathname === "/send") {
      const subs = loadSubs();
      let checked = 0, sent = 0; const details = [];
      for (const s of subs) {
        checked++;
        const nearby = await evaluateNearby(s.lat, s.lon, s.profile);
        const alert = shouldAlert(nearby, s.threshold ?? 70);
        if (alert && await pushTo(s.subscription, { title: alert.title, body: alert.body, url: "./" })) {
          sent++; details.push(alert.title);
        }
      }
      console.log(`/send → checked ${checked}, sent ${sent}`);
      return reply(res, 200, { checked, sent, details });
    }

    if (url.pathname === "/") return reply(res, 200, { service: "dawn-patrol-alerts", subscribers: loadSubs().length });
    reply(res, 404, { error: "not found" });
  } catch (e) {
    reply(res, 500, { error: String(e) });
  }
});

server.listen(PORT, () => {
  console.log(`\n🔔 Dawn Patrol alerts server → http://localhost:${PORT}`);
  console.log(`   GET /vapid · POST /subscribe · POST /test · POST /send`);
  console.log(`   Enable alerts in the app, then "Send me a test alert" to demo.\n`);
});
