const VERSION = "pb-17";
const FILES = ["./", "index.html", "kantoor.html", "jspdf.umd.min.js", "supabase.js", "config.js", "manifest.webmanifest", "icon-180.png", "icon-192.png", "icon-512.png", "logo-area.jpg"];
self.addEventListener("install", e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES.map(f => new Request(f, { cache: "reload" }))))); self.skipWaiting(); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin || e.request.method !== "GET") return;
  // eerst netwerk (nieuwste versie). Geen netwerk: meteen de bewaarde versie.
  // Traag netwerk: na 4 s de bewaarde versie; het netwerk werkt de cache op de achtergrond bij.
  const uitCache = () => caches.match(e.request, { ignoreSearch: true });
  // cache: "no-cache" = altijd bij GitHub navragen of er een nieuwere versie is (anders tot 10 min oud)
  const net = fetch(u.href, { cache: "no-cache", credentials: "same-origin" }).then(r => { if (r.ok) { const c = r.clone(); caches.open(VERSION).then(ca => ca.put(e.request, c)); } return r; });
  const offline = () => uitCache().then(r => r || caches.match("index.html"));
  const traag = new Promise(res => setTimeout(res, 4000)).then(uitCache).then(r => r || net);
  e.respondWith(Promise.race([net.catch(offline), traag.catch(offline)]));
});
