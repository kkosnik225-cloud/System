const CACHE = "system-gracza-v2";
const FILES = ["./", "./index.html", "./manifest.json", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener("fetch", e => {
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match("./index.html")))
  );
});

/* ---------------- POWIADOMIENIA W TLE ---------------- */
const DB_NAME = "sys-notif", STORE = "cfg";
function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbSet(k, v) {
  const db = await idb();
  return new Promise((res, rej) => { const t = db.transaction(STORE, "readwrite"); t.objectStore(STORE).put(v, k); t.oncomplete = res; t.onerror = () => rej(t.error); });
}
async function idbGet(k) {
  const db = await idb();
  return new Promise((res, rej) => { const q = db.transaction(STORE, "readonly").objectStore(STORE).get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
}

function hm() { const d = new Date(); return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); }
function todayISO() { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }

self.addEventListener("message", e => {
  if (e.data?.type === "SYS_NOTIF_CONFIG") e.waitUntil(idbSet("config", e.data.payload));
});

async function checkReminders() {
  const c = await idbGet("config");
  if (!c || !c.enabled) return;
  const today = todayISO(), now = hm();
  const fired = (await idbGet("fired")) || {};
  Object.keys(fired).forEach(k => { if (!k.endsWith(today)) delete fired[k]; });
  const pageFired = c.fired || {};
  const stale = c.date !== today;
  const questsLeft = stale ? 1 : c.questsLeft;
  const logDone = stale ? false : c.logDone;
  const base = { icon: "icon-192.png", badge: "icon-192.png", data: { url: "./index.html" } };

  if (c.questOn && now >= c.questTime && !fired["q-" + today] && !pageFired["q-" + today] && questsLeft > 0) {
    await self.registration.showNotification("[SYSTEM] Misje Codzienne",
      { ...base, tag: "sys-quest", body: "Twoje misje czekają. Otwórz System i utrzymaj serię." });
    fired["q-" + today] = true;
  }
  if (c.logOn && now >= c.logTime && !fired["l-" + today] && !pageFired["l-" + today] && !logDone) {
    await self.registration.showNotification("[SYSTEM] Log Łowcy",
      { ...base, tag: "sys-log", body: "Z czego jesteś dziś dumny/a? Zapisz Log przed snem." });
    fired["l-" + today] = true;
  }
  await idbSet("fired", fired);
}

self.addEventListener("periodicsync", e => { if (e.tag === "sys-reminder") e.waitUntil(checkReminders()); });

self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    const win = list.find(w => "focus" in w);
    return win ? win.focus() : self.clients.openWindow(e.notification.data?.url || "./");
  }));
});