/* ============================================================
   TOKO KITA — service-worker.js
   Progressive Web App — Manajemen Keuangan UMKM
   ============================================================ */

'use strict';

// ============================================================
// KONFIGURASI CACHE
// ============================================================

const CACHE_NAME    = 'tokokita-cache-v1';
const OFFLINE_PAGE  = './index.html';

/** Daftar file yang di-cache saat instalasi */
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  /* CDN — Bootstrap CSS */
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css',
  /* CDN — Bootstrap Icons */
  'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css',
  /* CDN — Bootstrap JS */
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js',
  /* CDN — Google Fonts (opsional, mungkin gagal saat offline) */
  'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700&family=Nunito:wght@400;500;600;700&display=swap',
];

// ============================================================
// INSTALL — Cache semua aset penting
// ============================================================

self.addEventListener('install', event => {
  console.log('[SW] Installing TOKO KITA Service Worker...');

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Caching app shell...');
        // addAll() gagal total jika salah satu URL gagal,
        // pakai loop agar aset CDN yang gagal tidak menghentikan proses
        return Promise.allSettled(
          ASSETS_TO_CACHE.map(url => cache.add(url).catch(err => console.warn('[SW] Failed to cache:', url, err)))
        );
      })
      .then(() => {
        console.log('[SW] Install complete.');
        self.skipWaiting(); // aktifkan SW baru segera
      })
  );
});

// ============================================================
// ACTIVATE — Hapus cache lama
// ============================================================

self.addEventListener('activate', event => {
  console.log('[SW] Activating TOKO KITA Service Worker...');

  event.waitUntil(
    caches.keys()
      .then(cacheNames =>
        Promise.all(
          cacheNames
            .filter(name => name !== CACHE_NAME)
            .map(name => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        )
      )
      .then(() => {
        console.log('[SW] Activation complete.');
        self.clients.claim(); // kontrol semua tab yang terbuka
      })
  );
});

// ============================================================
// FETCH — Strategi: Cache-First, fallback ke Network
// ============================================================

self.addEventListener('fetch', event => {
  // Abaikan request non-GET dan request Chrome DevTools
  if (event.request.method !== 'GET') return;
  if (event.request.url.startsWith('chrome-extension://')) return;

  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {

        // 1. Ada di cache → langsung pakai
        if (cachedResponse) {
          return cachedResponse;
        }

        // 2. Tidak ada di cache → ambil dari network, lalu simpan
        return fetch(event.request.clone())
          .then(networkResponse => {
            // Hanya cache response yang valid (status 200, bukan opaque)
            if (
              networkResponse &&
              networkResponse.status === 200 &&
              networkResponse.type !== 'opaque'
            ) {
              const responseToCache = networkResponse.clone();
              caches.open(CACHE_NAME)
                .then(cache => cache.put(event.request, responseToCache));
            }
            return networkResponse;
          })
          .catch(() => {
            // 3. Offline & tidak ada di cache → tampilkan halaman offline
            console.warn('[SW] Network request failed, serving offline page.');
            return caches.match(OFFLINE_PAGE);
          });

      })
  );
});

// ============================================================
// BACKGROUND SYNC (opsional — siap untuk future use)
// ============================================================

self.addEventListener('sync', event => {
  if (event.tag === 'sync-data') {
    console.log('[SW] Background sync triggered.');
    // Implementasi sinkronisasi data ke server jika dibutuhkan
  }
});

// ============================================================
// PUSH NOTIFICATION (opsional — siap untuk future use)
// ============================================================

self.addEventListener('push', event => {
  if (!event.data) return;
  const data = event.data.json();
  const options = {
    body: data.body || 'Ada notifikasi baru dari TOKO KITA.',
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    vibrate: [100, 50, 100],
    data: { url: data.url || './' },
  };
  event.waitUntil(
    self.registration.showNotification(data.title || 'TOKO KITA', options)
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data?.url || './')
  );
});