import { WEBRASCALCLIENT, WEBRASCALSINGLETON } from "../symbols";
import type { ProxyCtx } from "../types";
import { CookieStore } from "../shared/cookie";
import { unrewriteUrl, rewriteUrl } from "../shared/rewriters/url";
import { NavigateEvent } from "./events";
import { createLocationProxy } from "./location";
import { SingletonBox } from "./singletonbox";

export class WebrascalClient {
  global: typeof globalThis;
  locationProxy: Location;
  box: SingletonBox;
  cookieStore: CookieStore;
  natives: {
    store: Record<string, unknown>;
  };
  descriptors: {
    store: Record<string, PropertyDescriptor | undefined>;
  };

  constructor(globalRef: typeof globalThis) {
    this.global = globalRef;
    this.box = inheritSingleton(globalRef);
    this.box.clients.push(this);
    this.cookieStore = new CookieStore();
    this.natives = {
      store: new Proxy(Object.create(null), {
        get: (target, prop: string) => {
          if (!(prop in target)) {
            target[prop] = lookupPath(this.global, prop);
          }
          return target[prop];
        }
      })
    };
    this.descriptors = {
      store: new Proxy(Object.create(null), {
        get: (target, prop: string) => {
          if (!(prop in target)) {
            const [obj, key] = lookupTarget(this.global, prop);
            target[prop] = Object.getOwnPropertyDescriptor(obj, key);
          }
          return target[prop];
        }
      })
    };
    this.locationProxy = createLocationProxy(this, this.global);
    (this.global as unknown as Record<symbol, unknown>)[WEBRASCALCLIENT] = this;
    this.box.globals.set(this.global, this);
    this.box.documents.set(this.global.document, this);
    this.box.locations.set(this.global.location, this);
  }

  hook(): void {
    const loaded: Array<{
      default?: (client: WebrascalClient, selfRef: typeof globalThis) => void;
      enabled?: (client: WebrascalClient) => boolean;
      disabled?: (client: WebrascalClient, selfRef: typeof globalThis) => void;
      order?: number;
    }> = [];

    const contexts = [
      import.meta.webpackContext("./dom", { recursive: false, regExp: /\.ts$/ }),
      import.meta.webpackContext("./shared", { recursive: true, regExp: /\.ts$/ }),
      import.meta.webpackContext("./worker", { recursive: true, regExp: /\.ts$/ })
    ];

    for (const ctx of contexts) {
      for (const key of ctx.keys()) {
        loaded.push(ctx(key));
      }
    }

    const modules = loaded.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    for (const mod of modules) {
      if (typeof mod.default !== "function") {
        continue;
      }
      if (mod.enabled && !mod.enabled(this)) {
        mod.disabled?.(this, this.global);
        continue;
      }
      mod.default(this, this.global);
    }
  }

  Proxy(name: string, handler: {
    apply?: (ctx: ProxyCtx) => unknown;
    construct?: (target: new (...args: unknown[]) => unknown, args: unknown[], newTarget: unknown) => unknown;
  }): void {
    const original = this.natives.store[name] as Function;
    const [targetObj, key] = lookupTarget(this.global, name);
    delete targetObj[key as keyof typeof targetObj];

    const proxied = new Proxy(original, {
      apply: (fn, thisValue, args: unknown[]) => {
        const ctx: ProxyCtx = {
          fn: fn as (...x: unknown[]) => unknown,
          thisValue,
          args,
          earlyReturn: false,
          returnValue: undefined,
          return(value) {
            this.earlyReturn = true;
            this.returnValue = value;
            return value;
          },
          call() {
            return Reflect.apply(fn, thisValue, args);
          }
        };

        if (handler.apply) {
          handler.apply(ctx);
        }
        if (ctx.earlyReturn) {
          return ctx.returnValue;
        }
        return Reflect.apply(fn, thisValue, args);
      },
      construct: (target, args, newTarget) => {
        if (handler.construct) {
          return handler.construct(target as new (...x: unknown[]) => unknown, args, newTarget);
        }
        return Reflect.construct(target as new (...x: unknown[]) => unknown, args, newTarget as Function);
      }
    });

    this.RawTrap(targetObj, key, {
      configurable: true,
      writable: true,
      value: proxied
    });
  }

  Trap(name: string, descriptor: PropertyDescriptor): void {
    const [targetObj, key] = lookupTarget(this.global, name);
    delete targetObj[key as keyof typeof targetObj];
    this.RawTrap(targetObj, key, descriptor);
  }

  RawProxy(target: object, prop: PropertyKey, handler: ProxyHandler<Function>): void {
    const original = Reflect.get(target, prop) as Function;
    Reflect.deleteProperty(target, prop);
    this.RawTrap(target, prop, {
      configurable: true,
      writable: true,
      value: new Proxy(original, handler)
    });
  }

  RawTrap(target: object, prop: PropertyKey, descriptor: PropertyDescriptor): void {
    const out: PropertyDescriptor = {
      configurable: true,
      enumerable: descriptor.enumerable ?? false
    };

    if (descriptor.get || descriptor.set) {
      out.get = descriptor.get;
      out.set = descriptor.set;
    } else {
      out.writable = descriptor.writable ?? true;
      out.value = descriptor.value;
    }

    Object.defineProperty(target, prop, out);
  }

  get url(): URL {
    return new URL(unrewriteUrl(this.global.location.href));
  }

  set url(value: URL) {
    const event = new NavigateEvent(value);
    this.global.dispatchEvent(event);
    if (event.defaultPrevented) {
      return;
    }
    this.global.location.href = rewriteUrl(value.toString(), { base: this.url });
  }

  get meta(): { base: URL } {
    return { base: this.url };
  }

  loadcookies(raw: string): void {
    void raw;
  }
}

function lookupPath(root: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    return (acc as Record<string, unknown>)[key];
  }, root);
}

function lookupTarget(root: unknown, path: string): [Record<string, unknown>, string] {
  const parts = path.split(".");
  const key = parts.pop() as string;
  const target = parts.reduce<Record<string, unknown>>((acc, part) => {
    return acc[part] as Record<string, unknown>;
  }, root as Record<string, unknown>);
  return [target, key];
}

function inheritSingleton(globalRef: typeof globalThis): SingletonBox {
  const current = globalRef as unknown as Record<symbol, unknown>;
  if (current[WEBRASCALSINGLETON]) {
    return current[WEBRASCALSINGLETON] as SingletonBox;
  }

  const parent = globalRef.parent as unknown as Record<symbol, unknown>;
  const topRef = globalRef.top as unknown as Record<symbol, unknown>;
  const inherited = (parent[WEBRASCALSINGLETON] || topRef[WEBRASCALSINGLETON]) as SingletonBox | undefined;
  const box = inherited ?? new SingletonBox();
  current[WEBRASCALSINGLETON] = box;
  return box;
}
