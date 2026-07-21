/**
 * Tichu Counter service worker.
 *
 * Replaces the deprecated AppCache mechanism (manifest.appcache), which
 * modern browsers have mostly stopped honoring anyway.
 *
 * IMPORTANT: bump CACHE_NAME any time index.html, round-scores.html,
 * main.css, or script.js change. That version bump is what tells
 * returning visitors "there's a new version, throw out the old cache" —
 * forgetting it is exactly the kind of stuck-on-stale-files bug the old
 * AppCache setup caused.
 */
const CACHE_NAME = "tichu-counter-v9";

// Core files needed to load and run the app offline. Chart.js and the
// datalabels plugin are loaded from a CDN and are handled generically
// by the stale-while-revalidate logic below, not precached here.
const APP_SHELL = [
  "./",
  "./index.html",
  "./round-scores.html",
  "./sessions.html",
  "./players.html",
  "./main.css",
  "./manifest.json",
  "./js/jquery-2.2.3.min.js",
  "./js/materialize.min.js",
  "./js/storage.js",
  "./js/players-storage.js",
  "./js/script.js",
  "./js/round-scores.js",
  "./js/sessions.js",
  "./js/players.js",
  "./dragon-icon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  // Activate this version immediately rather than waiting for all open
  // tabs to close.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  // Only handle simple GET requests; let everything else pass through
  // untouched.
  if (request.method !== "GET") return;

  const isHtmlRequest =
    request.mode === "navigate" ||
    (request.headers.get("accept") || "").includes("text/html");

  if (isHtmlRequest) {
    // Network-first: always try to get the latest page when online;
    // only fall back to the cached copy when the network fails.
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match("./index.html")))
    );
    return;
  }

  // Everything else (CSS, JS, icons, CDN scripts): stale-while-revalidate.
  // Serve instantly from cache if available, and refresh the cache copy
  // in the background for next time.
  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});
