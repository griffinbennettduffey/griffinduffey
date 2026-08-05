/* Cody × Yellowstone trip — offline cache */
const CACHE = "cy-trip-v3";
const ASSETS = ["/cowboymode"];

self.addEventListener("install", (e) => {
  /* Same-origin requests carry cookies by default, so this precache runs as the
     unlocked visitor and stores the itinerary itself, not the password gate. */
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

/* Network-first, cache fallback: you get fresh edits when online,
   and the saved copy when you're in Lamar with zero bars. */
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  if (new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        /* Never cache the 401 password gate — it would strand you offline
           looking at a login form instead of the itinerary. */
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
