import type { WebrascalClient } from "../client";

export default function hookOrigin(client: WebrascalClient): void {
  const getters: Array<[object, string]> = [
    [globalThis, "origin"],
    [Document.prototype, "URL"],
    [Document.prototype, "documentURI"],
    [Document.prototype, "domain"]
  ];

  for (const [target, key] of getters) {
    Object.defineProperty(target, key, {
      configurable: true,
      get() {
        if (key === "domain") {
          return client.url.hostname;
        }
        return client.url.toString();
      }
    });
  }
}