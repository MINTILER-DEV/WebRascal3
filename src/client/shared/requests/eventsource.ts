import type { WebrascalClient } from "../../client";
import { rewriteUrl } from "../../../shared/rewriters/url";

export default function hookEventSource(client: WebrascalClient): void {
  client.Proxy("EventSource", {
    construct(target, args, newTarget) {
      if (args.length > 0 && typeof args[0] === "string") {
        args[0] = rewriteUrl(args[0], client.meta);
      }
      return Reflect.construct(target, args, newTarget as Function);
    }
  });
}