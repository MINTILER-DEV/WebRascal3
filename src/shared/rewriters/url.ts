import { codecDecode, codecEncode, config } from "../index";
import type { URLMeta } from "../../types";
import { rewriteJs } from "./js";

const PASSTHROUGH_PROTOCOLS = new Set(["mailto:", "about:", "tel:"]);

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
    return `${location.origin}${config.prefix}${raw}`;
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

  return `${config.prefix}${codecEncode(resolved.toString())}`;
}

export function unrewriteUrl(input: string): string {
  if (!input) {
    return input;
  }

  if (input.startsWith("blob:") || input.startsWith("data:")) {
    const idx = input.indexOf(config.prefix);
    if (idx >= 0) {
      return input.slice(idx + config.prefix.length);
    }
    return input;
  }

  if (input.startsWith(config.prefix)) {
    try {
      return codecDecode(input.slice(config.prefix.length));
    } catch {
      return input;
    }
  }

  try {
    const url = new URL(input, location.href);
    if (url.pathname.startsWith(config.prefix)) {
      return codecDecode(url.pathname.slice(config.prefix.length));
    }
  } catch {
    return input;
  }

  return input;
}