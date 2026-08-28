/**
 * Service worker cua So Chi.
 *
 * QUY TAC QUAN TRONG NHAT: KHONG BAO GIO cache cau tra loi cua /api/.
 *
 * Day la so tien. Mot so du cu duoc hien lai tu cache trong khi nguoi dung
 * tuong la so hien tai la loi nguy hiem hon nhieu so voi viec app khong mo duoc
 * khi mat mang. Neu khong goi duoc may chu, app phai bao loi ro rang chu khong
 * duoc doan.
 *
 * Cache o day chi giu phan vo tinh: khung HTML, ma nguon giao dien, icon. Va
 * ngay ca voi phan vo cung uu tien mang truoc, chi dung ban cache khi mang
 * hong — de moi lan trien khai la nguoi dung nhan duoc ban moi, khong ket lai
 * ban cu.
 */

const VERSION = "so-chi-v3";
const VO_TINH = [
  "/",
  "/app.js",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(VERSION)
      .then((c) => c.addAll(VO_TINH))
      // Mot file tai hong khong duoc lam hong ca lan cai dat.
      .catch(() => null)
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // So lieu tai chinh: luon hoi may chu, khong bao gio lay tu cache.
  if (url.pathname.startsWith("/api/")) return;

  // Vo tinh: thu mang truoc, hong thi dung ban da luu.
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok) {
          const ban_sao = res.clone();
          caches.open(VERSION).then((c) => c.put(req, ban_sao)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req).then((c) => c || caches.match("/")))
  );
});
