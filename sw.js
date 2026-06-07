// Dawn Patrol service worker — makes the app installable & usable offline.
// Bump CACHE (and the ?v= asset versions) together on each release.
const CACHE = "dawn-patrol-v19";

const SHELL = [
  "./", "./index.html",
  "./css/styles.css?v=19",
  "./js/spots.js?v=19", "./js/forecast.js?v=19", "./js/coach.js?v=19", "./js/app.js?v=19", "./js/alerts.js?v=19",
  "./manifest.webmanifest",
  "./icons/icon-192.png", "./icons/icon-512.png", "./icons/apple-touch-icon.png"
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ---- Push notifications (Dawn Patrol Alerts) ----
self.addEventListener("push", e => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch (_) {}
  const title = data.title || "🌅 Dawn Patrol";
  e.waitUntil(self.registration.showNotification(title, {
    body: data.body || "A break near you is firing.",
    icon: "./icons/icon-192.png",
    badge: "./icons/icon-192.png",
    data: { url: data.url || "./" }
  }));
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.url) || "./";
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(wins => {
      for (const w of wins) { if ("focus" in w) return w.focus(); }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Forecast APIs: network-first, fall back to the last cached response (offline at the beach).
  if (url.hostname.includes("open-meteo.com")) {
    e.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
        return res;
      }).catch(() => caches.match(req))
    );
    return;
  }

  // Don't intercept the local alerts server — let it talk directly.
  if (url.port === "8788") return;

  // App shell (same origin): cache-first, then network (and cache it for next time).
  if (url.origin === location.origin) {
    e.respondWith(
      caches.match(req).then(hit =>
        hit || fetch(req).then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
          return res;
        }).catch(() => hit)
      )
    );
  }
});
