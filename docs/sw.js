const VERSION = "dev";
// VERSION is stamped at deploy with a hash of the app files (fip-calendar-stamp-sw), so every
// release changes this file's bytes: that is the only way the browser notices an update.
//
// Network first: fip.it data must never be served stale while online.
// The cache only answers when the network fails, e.g. no signal inside the gym.
const CACHE = `cus-basket-${VERSION}`;
const SHELL = [
  "./",
  "index.html",
  "styles.css",
  "update.js",
  "update-rules.js",
  "result-rules.js",
  "notice-rules.js",
  "page-rules.js",
  "view-rules.js",
  "tables-view.js",
  "games-view.js",
  "boxscore-rules.js",
  "scorer-rules.js",
  "boxscores.js",
  "cus-stats-rules.js",
  "cus-stats.js",
  "logo-cus.png",
  "manifest.webmanifest",
  "icons/icon-192.png",
];

self.addEventListener("install", (event) => {
  // cache: "reload" bypasses the HTTP cache, which could still hold the previous release
  const requests = SHELL.map((url) => new Request(url, { cache: "reload" }));
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(requests)));
  // no skipWaiting here: a new version waits until the user accepts it from the page
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== location.origin) return;
  event.respondWith(
    // revalidate: the HTTP cache (GitHub Pages sends max-age=600) could mix two releases
    fetch(request, { cache: "no-cache" })
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE).then((cache) => cache.put(request, copy)));
        }
        return response;
      })
      // offline and never cached: a network error, which the page reports as a connection problem
      .catch(() => caches.match(request).then((cached) => cached || Response.error())),
  );
});
