const C = 'facturix-v1';
self.addEventListener('install', e => e.waitUntil(
  caches.open(C).then(c => c.add('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2')).catch(() => {}).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(clients.claim()));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.hostname.endsWith('supabase.co')) return;
  if (u.origin !== location.origin && !u.hostname.includes('jsdelivr')) return;
  e.respondWith(fetch(e.request).then(r => { const k = r.clone(); caches.open(C).then(c => c.put(e.request, k)); return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true })));
});
