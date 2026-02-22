import type { WebrascalClient } from "../../client";
import { rewriteUrl, unrewriteUrl } from "../../../shared/rewriters/url";

export default function hookFetch(client: WebrascalClient): void {
  client.Proxy("fetch", {
    apply(ctx) {
      if (ctx.args.length > 0 && typeof ctx.args[0] === "string") {
        ctx.args[0] = rewriteUrl(ctx.args[0], client.meta);
      }
    }
  });

  client.Proxy("Request", {
    construct(target, args, newTarget) {
      if (args.length > 0 && typeof args[0] === "string") {
        args[0] = rewriteUrl(args[0], client.meta);
      }
      return Reflect.construct(target, args, newTarget as Function);
    }
  });

  client.Trap("Response.prototype.url", {
    configurable: true,
    get() {
      const descriptor = client.descriptors.store["Response.prototype.url"];
      return unrewriteUrl(descriptor?.get?.call(this) ?? "");
    }
  });

  client.Trap("Request.prototype.url", {
    configurable: true,
    get() {
      const descriptor = client.descriptors.store["Request.prototype.url"];
      return unrewriteUrl(descriptor?.get?.call(this) ?? "");
    }
  });
}
