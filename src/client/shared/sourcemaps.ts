import type { WebrascalClient } from "../client";
import { config } from "../../shared";

export default function hookSourceMaps(client: WebrascalClient): void {
  const pushFn = config.globals.pushsourcemapfn;
  Reflect.set(globalThis, pushFn, (tag: string, map: Uint8Array) => {
    client.box.sourcemaps.set(tag, map);
  });

  client.Proxy("Function.prototype.toString", {
    apply(ctx) {
      const value = ctx.call() as string;
      const match = value.match(/\/\*rascaltag\s+\d+\s+([^*]+)\*\//);
      if (!match) {
        return ctx.return(value);
      }
      const tag = match[1].trim();
      if (!client.box.sourcemaps.has(tag)) {
        return ctx.return(value);
      }
      return ctx.return(value.replace(/\/\*rascaltag[^*]+\*\//, ""));
    }
  });
}