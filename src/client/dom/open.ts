import type { WebrascalClient } from "../client";

export default function hookOpen(client: WebrascalClient): void {
  client.Proxy("window.open", {
    apply(ctx) {
      if (typeof ctx.args[0] === "string") {
        ctx.args[0] = new URL(ctx.args[0], client.url).toString();
      }
    }
  });
}