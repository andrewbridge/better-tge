// %VERSION% is substituted at deploy time with the commit SHA.
const CACHE_NAME = "better-tge-%VERSION%";

const APP_SHELL_FILES = [
  "./",
  "./index.html",
  "./index.mjs",
  "./manifest.webmanifest",
  "./deps/vue.mjs",
  "./deps/goober.mjs",
  "./components/App.mjs",
  "./components/ArtistCard.mjs",
  "./components/ArtistGrid.mjs",
  "./components/ArtistModal.mjs",
  "./components/Filters.mjs",
  "./components/Header.mjs",
  "./components/ModeBar.mjs",
  "./components/RecommendPanel.mjs",
  "./components/SettingsModal.mjs",
  "./components/TracksSection.mjs",
  "./components/VenueBar.mjs",
  "./services/ai.mjs",
  "./services/festival.mjs",
  "./services/filtering.mjs",
  "./services/settings.mjs",
  "./services/shortlist.mjs",
  "./services/data/festival-data.mjs",
  "./services/data/lifecycle.mjs",
  "./utilities/focus-trap.mjs",
  "./utilities/format.mjs",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-180.png",
  "./icons/icon-maskable.png",
];

const SHELL_URLS = new Set(
  APP_SHELL_FILES.map((p) => new URL(p, self.registration.scope).href)
);

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const requests = APP_SHELL_FILES.map(
        (p) => new Request(new URL(p, self.registration.scope), { cache: "reload" })
      );
      await cache.addAll(requests);
      self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith("better-tge-") && k !== CACHE_NAME && k !== "better-tge-data")
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  if (!SHELL_URLS.has(req.url)) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(req);
      if (cached) {
        // refresh in background, don't block response
        event.waitUntil(
          fetch(req)
            .then((res) => {
              if (res && res.ok) cache.put(req, res.clone());
            })
            .catch(() => {})
        );
        return cached;
      }
      try {
        const res = await fetch(req);
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      } catch (err) {
        // network failed and nothing cached; let it bubble
        throw err;
      }
    })()
  );
});
