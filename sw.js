self.addEventListener("install", function(e) {
  console.log("[ServiceWorker] Install");
});
self.addEventListener("activate",  event => {
  event.waitUntil(self.clients.claim());
});