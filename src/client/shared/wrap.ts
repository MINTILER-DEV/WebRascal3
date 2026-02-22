import type { WebrascalClient } from "../../client";
import { config, flagEnabled } from "../../shared";
import { indirectEval } from "./eval";
import { WEBRASCALCLIENT } from "../../symbols";

const UNSAFE_GLOBALS = new Set(["location", "parent", "top", "eval"]);

export function createWrapFn(client: WebrascalClient, selfRef: typeof globalThis): (identifier: unknown, strict: boolean) => unknown {
  const isWindow = typeof Window !== "undefined" && selfRef instanceof Window;

  return function wrapFn(identifier: unknown, strict: boolean): unknown {
    if (identifier === selfRef.location) {
      return client.locationProxy;
    }
    if (identifier === selfRef.eval) {
      return indirectEval.bind(client, strict);
    }

    if (isWindow) {
      if (identifier === selfRef.parent) {
        const parentRef = selfRef.parent as unknown as Record<symbol, unknown>;
        return parentRef[WEBRASCALCLIENT] ? selfRef.parent : selfRef;
      }
      if (identifier === selfRef.top) {
        let current = selfRef;
        while (current.parent !== current) {
          const parentRef = current.parent as unknown as Record<symbol, unknown>;
          if (!parentRef[WEBRASCALCLIENT]) {
            break;
          }
          current = current.parent;
        }
        return current;
      }
    }

    if (strict && flagEnabled("strictRewrites", client.url)) {
      return identifier;
    }
    return identifier;
  };
}

export default function hookWrap(client: WebrascalClient, selfRef: typeof globalThis): void {
  const globals = config.globals;
  const wrapFn = createWrapFn(client, selfRef);

  Reflect.set(selfRef, globals.wrapfn, wrapFn);

  Reflect.set(selfRef, globals.wrappropertyfn, (prop: string) => {
    if (UNSAFE_GLOBALS.has(prop)) {
      return `${globals.wrappropertybase}${prop}`;
    }
    return prop;
  });

  Reflect.set(selfRef, globals.cleanrestfn, (_obj: unknown) => {
    return undefined;
  });

  Reflect.set(selfRef, globals.trysetfn, (lhs: unknown, _op: string, rhs: string) => {
    if (lhs instanceof Location) {
      client.locationProxy.href = rhs;
      return true;
    }
    return false;
  });

  Reflect.set(selfRef, "$rascalitize", (value: unknown) => value);

  for (const unsafeName of UNSAFE_GLOBALS) {
    const trapName = `${globals.wrappropertybase}${unsafeName}`;
    if (Object.prototype.hasOwnProperty.call(Object.prototype, trapName)) {
      continue;
    }
    Object.defineProperty(Object.prototype, trapName, {
      configurable: true,
      enumerable: false,
      get() {
        return wrapFn((this as Record<string, unknown>)[unsafeName], unsafeName === "eval");
      },
      set(value: unknown) {
        (this as Record<string, unknown>)[unsafeName] = value;
      }
    });
  }
}

export const order = -100;
