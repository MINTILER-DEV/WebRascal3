import { codecDecode, codecEncode, config } from "../index";
import type { URLMeta } from "../../types";
import { rewriteJs } from "./js";

const PASSTHROUGH_PROTOCOLS = new Set(["mailto:", "about:", "tel:"]);
const DEFAULT_PREFIX = "/webrascal/";

function prefix(): string {
  return config?.prefix || DEFAULT_PREFIX;
}

export function rewriteUrl(input: string | URL, meta: URLMeta): string {
  const raw = typeof input === "string" ? input : input.toString();
  if (!raw) {
    return raw;
  }

  if (raw.startsWith("javascript:")) {
    const payload = raw.slice("javascript:".length);
    const rewrittenJs = rewriteJs(payload, "javascript-url", meta, false);
    return `javascript:${rewrittenJs}`;
  }

  if (raw.startsWith("blob:") || raw.startsWith("data:")) {
    return `${location.origin}${prefix()}${raw}`;
  }

  let resolved: URL;
  try {
    resolved = new URL(raw, meta.base);
  } catch {
    return raw;
  }

  if (PASSTHROUGH_PROTOCOLS.has(resolved.protocol)) {
    return resolved.toString();
  }

  return `${prefix()}${codecEncode(resolved.toString())}`;
}

export function unrewriteUrl(input: string): string {
  if (!input) {
    return input;
  }

  if (input.startsWith("blob:") || input.startsWith("data:")) {
    const p = prefix();
    const idx = input.indexOf(p);
    if (idx >= 0) {
      return input.slice(idx + p.length);
    }
    return input;
  }

  if (input.startsWith(prefix())) {
    try {
      const p = prefix();
      return codecDecode(input.slice(p.length));
    } catch {
      return input;
    }
  }

  try {
    const url = new URL(input, location.href);
    if (url.pathname.startsWith(prefix())) {
      const p = prefix();
      return codecDecode(url.pathname.slice(p.length));
    }
  } catch {
    return input;
  }

  return input;
}
