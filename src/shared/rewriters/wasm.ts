import type { URLMeta } from "../../types";

type RewriterOutput = {
  js: Uint8Array;
  map: Uint8Array;
  rascaltag: string;
  errors: string[];
};

type RewriterLike = {
  rewrite_js: (js: string, base: string, url: string, module: boolean) => RewriterOutput;
};

type RewriterCtor = new (config: unknown) => RewriterLike;

const pool: Array<{ rewriter: RewriterLike; inUse: boolean }> = [];

class PassThroughRewriter implements RewriterLike {
  rewrite_js(js: string): RewriterOutput {
    return {
      js: new TextEncoder().encode(js),
      map: new Uint8Array(),
      rascaltag: "fallback",
      errors: []
    };
  }
}

function build(meta: URLMeta): RewriterLike {
  const globalObj = self as Record<string, unknown>;
  const ctor = globalObj.WebrascalWasmRewriter as RewriterCtor | undefined;
  if (!ctor) {
    return new PassThroughRewriter();
  }

  const cfg = (self as { __WEBRASCAL_CONFIG__?: unknown }).__WEBRASCAL_CONFIG__ ?? {
    prefix: "/webrascal/",
    codec: {
      encode: (value: string) => value,
      decode: (value: string) => value
    }
  };

  void meta;
  try {
    return new ctor(cfg);
  } catch (err) {
    console.warn("[webrascal] wasm rewriter unavailable, falling back to pass-through:", err);
    return new PassThroughRewriter();
  }
}

export function getRewriter(meta: URLMeta): [RewriterLike, () => void] {
  const free = pool.find((entry) => !entry.inUse);
  if (free) {
    free.inUse = true;
    return [free.rewriter, () => { free.inUse = false; }];
  }

  const entry = { rewriter: build(meta), inUse: true };
  pool.push(entry);
  return [entry.rewriter, () => { entry.inUse = false; }];
}
