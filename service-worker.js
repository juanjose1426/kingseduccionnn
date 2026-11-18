/* Solo guarda la interfaz estática; consultas autenticadas de Supabase siguen online. */
const VERSION='kingseduccion-atelier-v7-clean-20261118';
const STATIC=['./','./index.html','./tienda.html','./carrito.html','./test.html','./assets/css/style.css','./assets/css/theme-2026.css','./assets/css/admin-studio.css','./assets/css/luxury-navy-v4.css','./assets/css/atelier-v6.css','./assets/js/config.js','./assets/js/data.js','./assets/js/store-atelier-v7.js','./assets/js/app-atelier-v7.js','./assets/img/favicon.svg'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(VERSION).then(c=>c.addAll(STATIC)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==VERSION).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==self.location.origin)return;
 if(u.pathname.endsWith('/admin.html'))return; e.respondWith(fetch(e.request).then(res=>{if(res.ok&&u.pathname.match(/\.(html|css|js|png|svg)$/))caches.open(VERSION).then(c=>c.put(e.request,res.clone()));return res}).catch(()=>caches.match(e.request).then(r=>r||caches.match('./index.html'))))});
