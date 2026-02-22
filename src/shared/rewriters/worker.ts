import type { URLMeta } from "../../types";
import { rewriteJs } from "./js";

export function rewriteWorkers(input: Uint8Array, type: "worker" | "sharedworker", url: string, meta: URLMeta): Uint8Array {
  const source = new TextDecoder().decode(input);
  const bootstrap = type === "worker"
    ? `importScripts("${self.location.origin}/dist/webrascal.all.js");self.$webrascalLoadClient().loadAndHook(self.__WEBRASCAL_CONFIG__);\n`
    : `import "${self.location.origin}/dist/webrascal.all.js";self.$webrascalLoadClient().loadAndHook(self.__WEBRASCAL_CONFIG__);\n`;
  const rewritten = rewriteJs(source, url, meta, false);
  return new TextEncoder().encode(bootstrap + rewritten);
}