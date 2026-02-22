import type { WebrascalClient } from "./client";
import { UrlChangeEvent } from "./events";

const URL_KEYS: Array<keyof URL> = [
  "protocol",
  "hash",
  "host",
  "hostname",
  "href",
  "origin",
  "pathname",
  "port",
  "search"
];

export function createLocationProxy(client: WebrascalClient, selfRef: typeof globalThis): Location {
  const fakeLocation = {} as Location;
  Object.setPrototypeOf(fakeLocation, Location.prototype);

  for (const key of URL_KEYS) {
    Object.defineProperty(fakeLocation, key, {
      configurable: true,
      enumerable: true,
      get() {
        const url = client.url as unknown as Record<string, unknown>;
        return url[key as string];
      },
      set(value: string) {
        if (key === "href") {
          client.url = new URL(value, client.url);
          return;
        }
        if (key === "hash") {
          selfRef.location.hash = value;
          selfRef.dispatchEvent(new UrlChangeEvent(client.url));
          return;
        }
        const next = new URL(client.url);
        (next as unknown as Record<string, unknown>)[key as string] = value;
        client.url = next;
      }
    });
  }

  Object.defineProperties(fakeLocation, {
    toString: {
      value: () => client.url.toString()
    },
    valueOf: {
      value: () => client.url.toString()
    },
    assign: {
      value: (url: string) => {
        client.url = new URL(url, client.url);
      }
    },
    reload: {
      value: () => selfRef.location.reload()
    },
    replace: {
      value: (url: string) => {
        client.url = new URL(url, client.url);
      }
    }
  });

  return fakeLocation;
}