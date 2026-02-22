import type { WebrascalClient } from "../client";

export default function hookWorker(client: WebrascalClient): void {
  client.Proxy("Worker", {
    construct(target, args, newTarget) {
      return Reflect.construct(target, args, newTarget as Function);
    }
  });
}