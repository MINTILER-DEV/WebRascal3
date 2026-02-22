import type { URLMeta } from "../../types";
import { getRewriter } from "./wasm";

export function rewriteJs(input: string | Uint8Array, base: string, meta: URLMeta, module = false): string {
  const source = typeof input === "string" ? input : new TextDecoder().decode(input);
  const [rewriter, release] = getRewriter(meta);
  try {
    const out = rewriter.rewrite_js(source, base, base, module);
    return new TextDecoder().decode(out.js);
  } catch {
    return source;
  } finally {
    release();
  }
}