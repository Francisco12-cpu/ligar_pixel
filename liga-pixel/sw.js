/* ==========================================================================
   SW.JS — Service Worker
   Guarda uma cópia de todos os arquivos do jogo no dispositivo na primeira
   vez que ele abre (com internet). Depois disso, a batalha local (solo ou
   2 jogadores no mesmo aparelho) funciona mesmo sem internet nenhuma —
   inclusive fontes, sprites e as bibliotecas externas do modo online.

   Se você adicionar/trocar arquivos do jogo, incremente o CACHE_VERSION pra
   forçar todo mundo a baixar a versão nova (sem isso, quem já instalou fica
   preso na cópia antiga guardada no aparelho).
   ========================================================================== */

const CACHE_VERSION = 'v2';
const APP_CACHE = `liga-pixel-${CACHE_VERSION}`;
const RUNTIME_CACHE = `liga-pixel-runtime-${CACHE_VERSION}`;

// Arquivos do próprio jogo (mesma origem) — essenciais, sempre pré-cacheados.
const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './manifest.json',
  './lib/smogon-calc-engine.js',
  './js/pokemon-data.js',
  './js/battle-engine.js',
  './js/ui.js',
  './js/main.js',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== APP_CACHE && k !== RUNTIME_CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // POST/etc (não deveria haver nenhuma aqui) passam direto

  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    // Arquivos do jogo: cache primeiro (garante que abre instantâneo e
    // offline), com atualização em segundo plano quando há rede.
    event.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req).then((res) => {
          if (res && res.ok) caches.open(APP_CACHE).then((c) => c.put(req, res.clone()));
          return res;
        }).catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  // Recursos de terceiros (sprites do PokeAPI/GitHub, fontes do Google,
  // qrcode.min.js, jsQR.js): cacheia sob demanda a primeira vez que é usado,
  // depois serve do cache instantaneamente (inclusive offline). Isso cobre
  // as sprites dos Pokémon que você já usou antes, mesmo sem internet.
  event.respondWith(
    caches.open(RUNTIME_CACHE).then((cache) =>
      cache.match(req).then((cached) => {
        const network = fetch(req).then((res) => {
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        }).catch(() => cached);
        return cached || network;
      })
    )
  );
});
