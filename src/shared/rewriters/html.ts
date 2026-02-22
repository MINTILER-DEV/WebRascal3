import type { URLMeta } from "../../types";
import { config } from "../index";
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
    const runtimeConfig = config ?? fallbackConfig();
    const bootstrap = [
      `<script>self.__WEBRASCAL_CONFIG__=${inlineJson(runtimeConfig)};</script>`,
      `<script src="${configuredFile("wasm")}"></script>`,
      `<script src="${configuredFile("all")}"></script>`,
      `<script>if (self.$webrascalLoadClient) { self.$webrascalLoadClient().loadAndHook(self.__WEBRASCAL_CONFIG__); }</script>`
    ].join("");

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

function inlineJson(value: unknown): string {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

function fallbackConfig() {
  return {
    prefix: "/webrascal/",
    globals: {
      wrapfn: "$webrascal$wrap",
      wrappropertybase: "$webrascal__",
      wrappropertyfn: "$webrascal$prop",
      cleanrestfn: "$webrascal$clean",
      importfn: "$webrascal$import",
      rewritefn: "$webrascal$rewrite",
      metafn: "$webrascal$meta",
      setrealmfn: "$webrascal$setrealm",
      pushsourcemapfn: "$webrascal$pushsourcemap",
      trysetfn: "$webrascal$tryset",
      templocid: "$webrascal$temploc",
      tempunusedid: "$webrascal$tempunused"
    },
    files: {
      wasm: "/dist/webrascal.wasm.js",
      all: "/dist/webrascal.all.js",
      sync: "/dist/webrascal.controller.js"
    },
    flags: {
      serviceworkers: true,
      syncxhr: false,
      strictRewrites: true,
      rewriterLogs: false,
      captureErrors: false,
      cleanErrors: true,
      rascalitize: false,
      sourcemaps: true,
      destructureRewrites: true,
      interceptDownloads: true,
      allowInvalidJs: true,
      allowFailedIntercepts: true
    },
    siteFlags: {},
    codec: {
      encode: "(input) => btoa(input)",
      decode: "(input) => atob(input)"
    }
  };
}
