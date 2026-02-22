import type { WebrascalClient } from "../client";
import { rewriteUrl } from "../../shared/rewriters/url";
import { UrlChangeEvent } from "../events";

export default function hookHistory(client: WebrascalClient): void {
  for (const name of ["pushState", "replaceState"] as const) {
    client.Proxy(`History.prototype.${name}`, {
      apply(ctx) {
        if (ctx.args.length > 2 && typeof ctx.args[2] === "string") {
          ctx.args[2] = rewriteUrl(ctx.args[2], client.meta);
        }
        const ret = ctx.call();
        if (globalThis.top === globalThis) {
          globalThis.dispatchEvent(new UrlChangeEvent(client.url));
        }
        return ctx.return(ret);
      }
    });
  }
}