import type { WebrascalClient } from "../client";

const REALM_SYMBOL = Symbol.for("webrascal.realm");

export default function hookPostMessage(client: WebrascalClient): void {
  const setRealmName = (self as unknown as { __WEBRASCAL_CONFIG__?: { globals?: { setrealmfn?: string } } }).__WEBRASCAL_CONFIG__?.globals?.setrealmfn || "$webrascal$setrealm";

  (globalThis as unknown as Record<string, unknown>)[setRealmName] = function setRealm(pollutant: object) {
    (pollutant as Record<symbol, unknown>)[REALM_SYMBOL] = Function;
    return this;
  };

  client.Proxy("window.postMessage", {
    apply(ctx) {
      const payload = {
        $webrascal$messagetype: "wrapped",
        $webrascal$origin: client.url.origin,
        $webrascal$data: ctx.args[0]
      };
      ctx.args[0] = payload;
    }
  });

  client.Proxy("EventTarget.prototype.dispatchEvent", {
    apply(ctx) {
      const ev = ctx.args[0];
      if (ev instanceof MessageEvent) {
        const data = ev.data as Record<string, unknown>;
        if (data && data.$webrascal$messagetype === "wrapped") {
          Object.defineProperties(ev, {
            data: { configurable: true, value: data.$webrascal$data },
            origin: { configurable: true, value: data.$webrascal$origin }
          });
        }
      }
    }
  });
}