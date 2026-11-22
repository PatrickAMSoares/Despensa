// Service worker: guarda os arquivos do app para abrir rápido e funcionar sem internet.
// Ao publicar uma nova versão, aumente o número em CACHE.
const CACHE = 'despensa-v5-2';
const ARQUIVOS = [
  './', 'index.html', 'styles.css', 'app.js', 'store.js', 'nota.js', 'ocr.js', 'firebase-config.js', 'manifest.webmanifest',
  'vendor/barcode-detector.js', 'vendor/zxing_reader.wasm', 'vendor/firebase.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((nomes) => Promise.all(nomes.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

// Arquivos do próprio app: tenta a rede primeiro (pega atualizações) e cai no cache se estiver offline.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) { const copia = res.clone(); caches.open(CACHE).then((c) => c.put(req, copia)); }
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match('index.html')))
  );
});
