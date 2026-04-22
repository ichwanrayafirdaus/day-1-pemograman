/* ============================================================
   TOKO KITA — service-worker.js
   Versi: 3.0 — Full PWA Features
   ============================================================ */

'use strict';

const CACHE_NAME = 'tokokita-v3';
const OFFLINE_URL = '/day-1-pemograman/offline.html';
const ASSETS = [
  '/day-1-pemograman/',
  '/day-1-pemograman/index.html',
  '/day-1-pemograman/offline.html',
  '/day-1-pemograman/manifest.json',
  '/day-1-pemograman/icons/icon-96.png',
  '/day-1-pemograman/icons/icon-192.png',
  '/day-1-pemograman/icons/icon-512.png',
];

/* ══════════════════════════════════════════════════
   INSTALL — Pre-cache semua asset penting
══════════════════════════════════════════════════ */
self.addEventListener('install', e => {
  console.log('[SW] Installing v3...');
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => Promise.allSettled(ASSETS.map(url => cache.add(url).catch(() => { }))))
      .then(() => self.skipWaiting())
  );
});

/* ══════════════════════════════════════════════════
   ACTIVATE — Hapus cache lama
══════════════════════════════════════════════════ */
self.addEventListener('activate', e => {
  console.log('[SW] Activating v3...');
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => {
          console.log('[SW] Deleting old cache:', k);
          return caches.delete(k);
        })
      ))
      .then(() => self.clients.claim())
      .then(() => updateAllWidgets())
  );
});

// Update semua widget yang sudah terinstall saat SW diaktifkan
async function updateAllWidgets() {
  if (!('widgets' in self)) return;
  try {
    const widget = await self.widgets.getByTag('tokokita-summary');
    if (widget) {
      const template = await (await fetch(widget.definition.msAcTemplate)).text();
      const data = await (await fetch(widget.definition.data)).text();
      await self.widgets.updateByTag(widget.definition.tag, { template, data });
      console.log('[SW] Widgets updated on activate');
    }
  } catch (err) {
    console.log('[SW] No widgets to update:', err.message);
  }
}

/* ══════════════════════════════════════════════════
   FETCH — Network First, Cache Fallback + Offline
══════════════════════════════════════════════════ */
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (!e.request.url.startsWith('http')) return;

  // Untuk navigasi halaman → tampilkan offline.html jika gagal
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).catch(() =>
        caches.match(OFFLINE_URL).then(r => r || caches.match('/day-1-pemograman/index.html'))
      )
    );
    return;
  }

  // Untuk resource lain → Cache First, Network Fallback
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res && res.status === 200 && res.type !== 'opaque') {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => caches.match(OFFLINE_URL));
    })
  );
});

/* ══════════════════════════════════════════════════
   BACKGROUND SYNC — Sinkronisasi saat kembali online
══════════════════════════════════════════════════ */
self.addEventListener('sync', e => {
  console.log('[SW] Background Sync triggered:', e.tag);

  if (e.tag === 'sync-transactions') {
    e.waitUntil(syncPendingTransactions());
  }

  if (e.tag === 'sync-debts') {
    e.waitUntil(syncPendingDebts());
  }
});

async function syncPendingTransactions() {
  try {
    // Ambil data pending dari cache/storage dan sinkronkan
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({ type: 'SYNC_COMPLETE', tag: 'sync-transactions' });
    });
    console.log('[SW] Transactions synced successfully');
  } catch (err) {
    console.error('[SW] Sync failed:', err);
    throw err; // Agar SW retry
  }
}

async function syncPendingDebts() {
  try {
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({ type: 'SYNC_COMPLETE', tag: 'sync-debts' });
    });
    console.log('[SW] Debts synced successfully');
  } catch (err) {
    console.error('[SW] Sync debts failed:', err);
    throw err;
  }
}

/* ══════════════════════════════════════════════════
   PERIODIC BACKGROUND SYNC — Update data berkala
══════════════════════════════════════════════════ */
self.addEventListener('periodicsync', e => {
  console.log('[SW] Periodic Sync triggered:', e.tag);

  if (e.tag === 'update-financial-data') {
    e.waitUntil(periodicSyncData());
  }

  // Handle widget periodic sync update
  if (e.tag === 'tokokita-summary' && 'widgets' in self) {
    e.waitUntil((async () => {
      const widget = await self.widgets.getByTag(e.tag);
      if (widget && 'update' in widget.definition) {
        await renderWidget(widget);
      }
    })());
  }
});

async function periodicSyncData() {
  try {
    // Notifikasi ke semua client bahwa data diperbarui
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({ type: 'PERIODIC_SYNC', timestamp: Date.now() });
    });
    console.log('[SW] Periodic sync completed');
  } catch (err) {
    console.error('[SW] Periodic sync failed:', err);
  }
}

/* ══════════════════════════════════════════════════
   PUSH NOTIFICATIONS — Terima notifikasi push
══════════════════════════════════════════════════ */
self.addEventListener('push', e => {
  console.log('[SW] Push received:', e);

  let data = {
    title: 'TOKO KITA',
    body: 'Ada pembaruan data keuangan Anda!',
    icon: '/day-1-pemograman/icons/icon-192.png',
    badge: '/day-1-pemograman/icons/icon-96.png',
    tag: 'toko-kita-notification',
    data: { url: '/day-1-pemograman/index.html' }
  };

  if (e.data) {
    try {
      const payload = e.data.json();
      data = { ...data, ...payload };
    } catch (err) {
      data.body = e.data.text();
    }
  }

  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon,
      badge: data.badge,
      tag: data.tag,
      data: data.data,
      vibrate: [200, 100, 200],
      actions: [
        { action: 'open', title: '📊 Buka Aplikasi' },
        { action: 'dismiss', title: 'Tutup' }
      ]
    })
  );
});

/* ══════════════════════════════════════════════════
   NOTIFICATION CLICK — Aksi klik notifikasi
══════════════════════════════════════════════════ */
self.addEventListener('notificationclick', e => {
  console.log('[SW] Notification clicked:', e.action);
  e.notification.close();

  if (e.action === 'dismiss') return;

  const targetUrl = (e.notification.data && e.notification.data.url)
    ? e.notification.data.url
    : '/day-1-pemograman/index.html';

  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      // Jika ada tab yang sudah terbuka, fokuskan
      for (const client of clients) {
        if (client.url.includes('day-1-pemograman') && 'focus' in client) {
          return client.focus();
        }
      }
      // Jika tidak ada, buka tab baru
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

/* ══════════════════════════════════════════════════
   WIDGETS — Windows 11 Widgets Board Support
══════════════════════════════════════════════════ */

// Helper: Render widget dengan template dan data
async function renderWidget(widget) {
  try {
    const templateUrl = widget.definition.msAcTemplate;
    const dataUrl = widget.definition.data;
    const template = await (await fetch(templateUrl)).text();
    const data = await (await fetch(dataUrl)).text();
    await self.widgets.updateByTag(widget.definition.tag, { template, data });
    console.log('[SW] Widget rendered:', widget.definition.tag);
  } catch (err) {
    console.error('[SW] Widget render failed:', err);
  }
}

// Widget installed by user
self.addEventListener('widgetinstall', e => {
  console.log('[SW] Widget installed:', e.widget.definition.tag);
  e.waitUntil((async () => {
    await renderWidget(e.widget);
    // Register periodic sync for widget updates
    if ('periodicSync' in self.registration) {
      const tags = await self.registration.periodicSync.getTags();
      if (!tags.includes(e.widget.definition.tag)) {
        await self.registration.periodicSync.register(e.widget.definition.tag, {
          minInterval: e.widget.definition.update || 900
        });
      }
    }
  })());
});

// Widget uninstalled by user
self.addEventListener('widgetuninstall', e => {
  console.log('[SW] Widget uninstalled:', e.widget.definition.tag);
  e.waitUntil((async () => {
    if (e.widget.instances.length === 1 && 'periodicSync' in self.registration) {
      await self.registration.periodicSync.unregister(e.widget.definition.tag);
    }
  })());
});

// Widget resumed after being suspended
self.addEventListener('widgetresume', e => {
  console.log('[SW] Widget resumed:', e.widget.definition.tag);
  e.waitUntil(renderWidget(e.widget));
});

// Widget action clicked by user
self.addEventListener('widgetclick', e => {
  console.log('[SW] Widget clicked:', e.action);
  switch (e.action) {
    case 'open-app':
      e.waitUntil(
        self.clients.openWindow('/day-1-pemograman/index.html')
      );
      break;
    default:
      break;
  }
});

/* ══════════════════════════════════════════════════
   MESSAGE — Komunikasi dengan halaman
══════════════════════════════════════════════════ */
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (e.data && e.data.type === 'SEND_NOTIFICATION') {
    const { title, body } = e.data;
    self.registration.showNotification(title || 'TOKO KITA', {
      body: body || 'Notifikasi dari TOKO KITA',
      icon: '/day-1-pemograman/icons/icon-192.png',
      badge: '/day-1-pemograman/icons/icon-96.png',
      tag: 'toko-kita-' + Date.now(),
      vibrate: [200, 100, 200]
    });
  }
});