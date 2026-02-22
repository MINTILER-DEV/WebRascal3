import type { URLMeta } from "../../types";
import { getRewriter } from "./wasm";

export function rewriteJs(input: string | Uint8Array, base: string, meta: URLMeta, module = false): string {
  const source = typeof input === "string" ? input : new TextDecoder().decode(input);
  let rewriter: { rewrite_js: (js: string, inBase: string, url: string, isModule: boolean) => { js: Uint8Array } };
  let release = () => {};
  try {
    [rewriter, release] = getRewriter(meta);
  } catch (err) {
    console.warn("[webrascal] failed to acquire wasm rewriter, using pass-through:", err);
    return source;
  }

  try {
    const out = rewriter.rewrite_js(source, base, base, module);
    return new TextDecoder().decode(out.js);
  } catch {
    return source;
  } finally {
    release();
  }
}
