import type { WebrascalClient } from "../client";

export default function hookProtocol(client: WebrascalClient): void {
  Object.defineProperty(Location.prototype, "protocol", {
    configurable: true,
    get() {
      return client.url.protocol;
    }
  });
}