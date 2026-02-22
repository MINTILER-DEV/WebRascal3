import type { WebrascalClient } from "../client";

export default function hookStorage(client: WebrascalClient, selfRef: typeof globalThis): void {
  const prefix = `${client.url.host}@`;

  function wrap(storage: Storage): Storage {
    return new Proxy(storage, {
      get(target, prop, receiver) {
        if (prop === "getItem") {
          return (key: string) => target.getItem(prefix + key);
        }
        if (prop === "setItem") {
          return (key: string, value: string) => target.setItem(prefix + key, value);
        }
        if (prop === "removeItem") {
          return (key: string) => target.removeItem(prefix + key);
        }
        return Reflect.get(target, prop, receiver);
      }
    }) as unknown as Storage;
  }

  Object.defineProperty(selfRef, "localStorage", {
    configurable: true,
    get: () => wrap(client.natives.store["localStorage"] as Storage)
  });

  Object.defineProperty(selfRef, "sessionStorage", {
    configurable: true,
    get: () => wrap(client.natives.store["sessionStorage"] as Storage)
  });
}