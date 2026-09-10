const CACHE_NAME = 'mercado-facil-v17';
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/print.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-512-maskable.png',
  '/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Pré-cache por asset (não addAll atômico): um arquivo com 404 temporário
      // não derruba a instalação inteira. Assets com hash Vite são imutáveis;
      // os demais são revalidados no fetch.
      return Promise.allSettled(
        CORE_ASSETS.map((asset) =>
          cache.add(asset).catch((err) => {
            console.warn('[SW] Falha ao cachear', asset, err);
          })
        )
      );
    }).catch((err) => {
      console.warn('[SW] Falha ao abrir cache no install:', err);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

function isAssetRequest(request) {
  return /\.(js|css|png|jpg|jpeg|webp|svg|woff2?|json)$/i.test(new URL(request.url).pathname);
}

function isHtml(response) {
  const type = String(response.headers.get('content-type') || '');
  return type.includes('text/html');
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Fontes Google (Inter): cache-first mesmo cross-origin — o app instalado
  // não repete o download a cada abertura e funciona offline. Respostas
  // opacas (cross-origin) são guardadas sem inspeção e devolvidas direto.
  if (/^https:\/\/fonts\.(googleapis|gstatic)\.com$/.test(url.origin)) {
    event.respondWith(
      caches.match(event.request).then((cached) =>
        cached ||
        fetch(event.request).then((response) => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone).catch(() => {}));
          }
          return response;
        }).catch(() => cached || Response.error())
      )
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  // Navegação: sempre rede primeiro; cache apenas como fallback offline.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() =>
          caches.match(event.request.url).then((cached) =>
            cached || caches.match('/index.html').then((idx) => idx || caches.match('/'))
          )
        )
    );
    return;
  }

  // Assets hasheados (js/css/img): serve cache imediato e revalida em segundo plano.
  if (isAssetRequest(event.request)) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        const network = fetch(event.request)
          .then((response) => {
            // Nunca tratar index.html (fallback SPA) como se fosse o asset.
            if (response && response.status === 200 && response.type === 'basic' && !isHtml(response)) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
              return response;
            }
            return cached || response;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  // Demais recursos: cache-first com atualização de fundo.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => undefined);
      return cached || network.then((r) => r || Response.error());
    })
  );
});
