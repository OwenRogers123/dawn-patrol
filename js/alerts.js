// Dawn Patrol Alerts — client side. Subscribes to push and registers with the local
// alerts server. Reuses globals from app.js (profile, state, getSpotAny).
const ALERTS_API = `${location.protocol}//${location.hostname}:8788`;
// The push demo needs the local alerts server. On a hosted/shared link there's no server,
// so present alerts as "coming soon" rather than a button that fails.
const IS_LOCAL = ["localhost", "127.0.0.1"].includes(location.hostname);

const aThresh = document.querySelector("#alertThresh");
const aThreshLabel = document.querySelector("#alertThreshLabel");
if (aThresh) aThresh.addEventListener("input", () => { aThreshLabel.textContent = aThresh.value; });

function aStatus(html, ok = true) {
  const el = document.querySelector("#alertStatus");
  el.innerHTML = html;
  el.classList.remove("hidden");
  el.classList.toggle("err", !ok);
}

// VAPID public key (base64url) → Uint8Array for PushManager.
function urlB64ToUint8(base64) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

const enableBtn = document.querySelector("#alertEnableBtn");

// Hosted/shared build: show alerts as a coming-soon teaser (no local server to reach).
if (enableBtn && !IS_LOCAL) {
  enableBtn.textContent = "🔔 Dawn alerts — coming soon";
  enableBtn.addEventListener("click", () => {
    aStatus("🔔 Dawn alerts (a morning push when your spots fire) are in the works. Everything else here is fully live — give the surf call a try!");
  });
}

if (enableBtn && IS_LOCAL) enableBtn.addEventListener("click", async () => {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return aStatus("⚠️ This browser doesn't support push notifications.", false);
  }
  enableBtn.textContent = "Enabling…";
  try {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") {
      enableBtn.textContent = "🔔 Turn on dawn alerts";
      return aStatus("🔕 Notifications are blocked. Allow them in your browser settings, then try again.", false);
    }

    const reg = await navigator.serviceWorker.ready;
    const { publicKey } = await fetch(`${ALERTS_API}/vapid`).then(r => r.json());
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8(publicKey) });
    }

    const center = state.spot || getSpotAny(profile.spotId) || { lat: 36.96, lon: -121.97, region: "you" };
    await fetch(`${ALERTS_API}/subscribe`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscription: sub, lat: center.lat, lon: center.lon, profile, threshold: +aThresh.value })
    });

    enableBtn.textContent = "🔔 Alerts on";
    aStatus(`✅ Alerts on! We'll ping you when a break near <strong>${center.region || center.name || "you"}</strong> hits ${aThresh.value}+. ` +
            `<button type="button" id="alertTestBtn" class="link-btn">Send me a test alert →</button>`);
    document.querySelector("#alertTestBtn").addEventListener("click", async () => {
      const btn = document.querySelector("#alertTestBtn");
      btn.textContent = "Sending…";
      try {
        const r = await fetch(`${ALERTS_API}/test`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint })
        }).then(r => r.json());
        btn.textContent = r.sent ? "Sent! Check your notifications 🔔" : "Hmm, nothing sent — is the server running?";
      } catch (_) { btn.textContent = "Failed — is the alerts server running?"; }
    });
  } catch (e) {
    enableBtn.textContent = "🔔 Turn on dawn alerts";
    aStatus(`⚠️ Couldn't enable alerts. Make sure the alerts server is running (<code>npm run alerts</code>). <small>${e.message}</small>`, false);
  }
});
