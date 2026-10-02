// PromptPulse service worker: offline app shell, push notifications, background refresh.
const VERSION = 'pp-v1.2.0';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/css/style.css',
  './assets/js/app.js',
  './assets/js/content.js',
  './assets/js/daily.js',
  './assets/js/promptcheck.js',
  './assets/js/sound.js',
  './assets/js/store.js',
  './assets/js/config.js',
  './assets/icons/logo.svg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/badge-96.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== 'pp-meta').map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // let cross-origin requests (news APIs, images) pass through

  // News data: network first so it's always fresh, cache as offline fallback.
  if (url.pathname.endsWith('/data/news.json')) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req)),
    );
    return;
  }

  // App shell: stale-while-revalidate.
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached || caches.match('./index.html'));
      return cached || network;
    }),
  );
});

// ---- Push notifications (sent daily by GitHub Actions) ----
self.addEventListener('push', (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch { data = { body: e.data?.text() }; }
  e.waitUntil(showBriefing(data));
});

function showBriefing(data = {}) {
  return self.registration.showNotification(data.title || '⚡ Your AI briefing is ready', {
    body: data.body || 'Fresh AI news, a new prompting lesson and today\'s keywords are waiting.',
    icon: './assets/icons/icon-192.png',
    badge: './assets/icons/badge-96.png',
    image: data.image,
    tag: data.tag || 'pp-daily',
    renotify: true,
    vibrate: [120, 60, 120],
    data: { url: data.url || './#/home' },
    actions: [
      { action: 'news', title: '📰 Read news' },
      { action: 'learn', title: '🎓 Today\'s lesson' },
    ],
  });
}

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const base = e.notification.data?.url || './#/home';
  const target = e.action === 'news' ? './#/news' : e.action === 'learn' ? './#/learn' : base;
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if ('focus' in w) {
          w.navigate(new URL(target, self.registration.scope).href).catch(() => {});
          return w.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});

// ---- Fallback: Periodic Background Sync (installed app on Android/Chrome) ----
// If server push isn't configured, the installed app can still wake up roughly daily
// and show the briefing locally.
self.addEventListener('periodicsync', (e) => {
  if (e.tag !== 'pp-daily') return;
  e.waitUntil((async () => {
    const meta = await caches.open('pp-meta');
    const prefsUrl = new URL('__prefs', self.registration.scope).href;
    const prefsRes = await meta.match(prefsUrl);
    const prefs = prefsRes ? await prefsRes.json() : {};
    if (!prefs.localDaily) return;
    const today = new Date().toISOString().slice(0, 10);
    if (prefs.lastLocal === today || new Date().getHours() < (prefs.hour ?? 8)) return;
    let body;
    try {
      const news = await (await fetch('./data/news.json', { cache: 'no-store' })).json();
      if (news.items?.[0]) body = `📰 ${news.items[0].title} (+${news.items.length - 1} more)`;
    } catch { /* offline */ }
    await showBriefing({ body, tag: `daily-${today}` });
    await meta.put(prefsUrl, new Response(JSON.stringify({ ...prefs, lastLocal: today })));
  })());
});
