import type { WebrascalClient } from "../client";

export default function hookCookie(client: WebrascalClient): void {
  client.Trap("Document.prototype.cookie", {
    configurable: true,
    get() {
      return client.cookieStore.getCookies(client.url, true);
    },
    set(value: string) {
      client.cookieStore.setCookies([value], client.url);
      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          webrascal$type: "cookieSync",
          cookies: client.cookieStore.dump()
        });
      }
    }
  });
}