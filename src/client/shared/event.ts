import type { WebrascalClient } from "../client";

export default function hookEvent(client: WebrascalClient): void {
  client.Proxy("EventTarget.prototype.addEventListener", {
    apply(ctx) {
      const [type, listener] = ctx.args;
      if (typeof listener !== "function") {
        return;
      }
      const wrapped = function (this: unknown, event: Event): unknown {
        return listener.call(this, event);
      };
      ctx.args = [type, wrapped, ctx.args[2]];
    }
  });
}