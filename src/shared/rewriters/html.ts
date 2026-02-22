import type { URLMeta } from "../../types";
import { rewriteJs } from "./js";
import { rewriteCss } from "./css";
import { rewriteUrl } from "./url";

export function rewriteHtml(input: string, meta: URLMeta, fromTop = false): string {
  let out = input;

  out = out.replace(/\s(src|href)=(["'])(.*?)\2/gi, (_m, attr, q, value) => {
    return ` ${attr}=${q}${rewriteUrl(value, meta)}${q}`;
  });

  out = out.replace(/<script([^>]*)>([\s\S]*?)<\/script>/gi, (full, attrs, body) => {
    if (/\bsrc\s*=/.test(attrs)) {
      return full;
    }
    const rewritten = rewriteJs(body, meta.base.toString(), meta, /type=["']module["']/.test(attrs));
    return `<script${attrs}>${rewritten}</script>`;
  });

  out = out.replace(/<style([^>]*)>([\s\S]*?)<\/style>/gi, (_full, attrs, body) => {
    return `<style${attrs}>${rewriteCss(body, meta)}</style>`;
  });

  if (fromTop) {
    const bootstrap = `<script src="${rewriteUrl(configuredFile("wasm"), meta)}"></script><script src="${rewriteUrl(configuredFile("all"), meta)}"></script><script>self.$webrascalLoadClient().loadAndHook(self.__WEBRASCAL_CONFIG__);</script>`;
    if (/<head[^>]*>/i.test(out)) {
      out = out.replace(/<head[^>]*>/i, (h) => `${h}${bootstrap}`);
    } else {
      out = `${bootstrap}${out}`;
    }
  }

  return out;
}

function configuredFile(key: "wasm" | "all"): string {
  const cfg = (self as { __WEBRASCAL_CONFIG__?: { files?: Record<string, string> } }).__WEBRASCAL_CONFIG__;
  if (cfg?.files?.[key]) {
    return cfg.files[key];
  }
  return key === "wasm" ? "/dist/webrascal.wasm.js" : "/dist/webrascal.all.js";
}