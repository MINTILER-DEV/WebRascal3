import type { WebrascalClient } from "../client";
import { rewriteJs } from "../../shared/rewriters/js";

export default function hookFunction(client: WebrascalClient): void {
  const ctorNames = ["Function", "AsyncFunction", "GeneratorFunction", "AsyncGeneratorFunction"];

  for (const name of ctorNames) {
    const ctor = (globalThis as unknown as Record<string, unknown>)[name] as Function | undefined;
    if (!ctor) {
      continue;
    }
    client.RawProxy(globalThis as unknown as object, name, {
      construct(target, args, newTarget) {
        if (args.length > 0) {
          const idx = args.length - 1;
          if (typeof args[idx] === "string") {
            args[idx] = rewriteJs(args[idx] as string, "(function ctor)", client.meta, false);
          }
        }
        return Reflect.construct(target as new (...x: unknown[]) => unknown, args, newTarget as Function);
      }
    });
  }
}