/* ============================================
 * Budget Tracker Service Worker
 * ============================================
 * GANTI VERSI DI SINI saat rilis update baru:
 * contoh: 'budget-tracker-v2' -> 'budget-tracker-v3'
 */
const CACHE_NAME = 'budget-tracker-v1.5';

// Daftar asset inti yang harus di-precache
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/app.js',
  '/js/sheets.js',
  '/js/ai.js',
  '/js/config.js',
  '/manifest.json',

  // Icon set
  '/assets/icons/favicon.svg',
  '/assets/icons/favicon.ico',
  '/assets/icons/favicon-16x16.png',
  '/assets/icons/favicon-32x32.png',
  '/assets/icons/apple-touch-icon.png',
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png',
  '/assets/icons/icon-maskable-192.png',
  '/assets/icons/icon-maskable-512.png'
];

/* =========================
 * INSTALL: pre-cache asset
 * ========================= */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
  // Aktifkan SW baru secepat mungkin
  self.skipWaiting();
});

/* ============================================
 * ACTIVATE: hapus cache lama (cache busting)
 * ============================================ */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheKeys) =>
      Promise.all(
        cacheKeys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
          return Promise.resolve();
        })
      )
    )
  );
  // Ambil kontrol semua tab/client tanpa menunggu reload manual
  self.clients.claim();
});

/* ============================================
 * FETCH STRATEGY
 * - Navigasi HTML: Network First -> fallback cache
 * - JS/CSS/Image/Icon/Manifest: Stale-While-Revalidate
 * ============================================ */
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Hanya handle GET
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Hanya cache request dari origin sendiri
  if (url.origin !== self.location.origin) return;

  // 1) Halaman / navigasi: selalu coba network dulu
  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req));
    return;
  }

  // 2) Asset statis: cepat dari cache, update di background
  if (
    req.destination === 'script' ||
    req.destination === 'style' ||
    req.destination === 'image' ||
    req.destination === 'font' ||
    req.destination === 'manifest' ||
    req.destination === 'worker'
  ) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  // 3) Fallback default: network first
  event.respondWith(networkFirst(req));
});

/* =========================
 * Helper: Network First
 * ========================= */
async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);

  try {
    const fresh = await fetch(request);

    // Simpan response valid ke cache
    if (fresh && fresh.status === 200) {
      cache.put(request, fresh.clone());
    }

    return fresh;
  } catch (err) {
    // Fallback ke cache request yang sama
    const cached = await cache.match(request);
    if (cached) return cached;

    // Untuk navigasi, fallback ke index.html agar SPA tetap jalan offline
    if (request.mode === 'navigate') {
      const appShell = await cache.match('/index.html');
      if (appShell) return appShell;
    }

    throw err;
  }
}

/* =================================
 * Helper: Stale-While-Revalidate
 * ================================= */
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  const networkFetch = fetch(request)
    .then((response) => {
      if (response && response.status === 200) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  // Jika ada cache, langsung pakai cache (cepat), sambil update di belakang
  if (cached) {
    eventSafeWait(networkFetch);
    return cached;
  }

  // Jika belum ada cache, tunggu network
  const fresh = await networkFetch;
  if (fresh) return fresh;

  // Fallback terakhir
  return caches.match('/index.html');
}

/* Utility supaya background update tidak meledak error */
function eventSafeWait(promise) {
  promise.catch(() => {});
}
