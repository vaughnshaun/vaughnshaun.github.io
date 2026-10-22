const CACHE_PREFIX = "sinhala-path-";
const CACHE_NAME = `${CACHE_PREFIX}v55`;
const PRECACHE_MANIFEST = "./precache-assets.json";

self.addEventListener("install", (event) => {
  event.waitUntil(
    fetch(PRECACHE_MANIFEST, { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error(`Pre-cache manifest request failed with ${response.status}`);
        return response.json();
      })
      .then((assets) => {
        if (!Array.isArray(assets) || !assets.length) throw new Error("Pre-cache manifest is empty or invalid");
        return caches.open(CACHE_NAME).then((cache) => cache.addAll(assets));
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const requestUrl = new URL(event.request.url);
  const scopeUrl = new URL(self.registration.scope);
  if (requestUrl.origin !== scopeUrl.origin || !requestUrl.pathname.startsWith(scopeUrl.pathname)) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone)));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        if (event.request.mode === "navigate") return caches.match("./index.html");
        return Response.error();
      })
  );
});
