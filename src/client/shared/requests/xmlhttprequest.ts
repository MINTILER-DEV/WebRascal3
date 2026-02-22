import type { WebrascalClient } from "../../client";
import { rewriteUrl } from "../../../shared/rewriters/url";

export default function hookXHR(client: WebrascalClient): void {
  client.Proxy("XMLHttpRequest.prototype.open", {
    apply(ctx) {
      if (ctx.args.length > 1 && typeof ctx.args[1] === "string") {
        ctx.args[1] = rewriteUrl(ctx.args[1], client.meta);
      }
    }
  });
}