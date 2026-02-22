import type { MessageC2W, MessageW2C, WebrascalConfig } from "../types";
import { CookieStore } from "../shared/cookie";
import { loadCodecs, setConfig } from "../shared";
import { rewriteUrl, unrewriteUrl } from "../shared/rewriters/url";
import { handleFetch } from "./fetch";
import { FakeServiceWorker } from "./fakesw";
import { renderNetErrorPage } from "./error";

export type BareClientLike = {
  fetch(input: string, init?: RequestInit): Promise<Response>;
};

const DEV_PROXY_ENDPOINT = "/__refrakt_proxy__";

class DefaultBareClient implements BareClientLike {
  fetch(input: string, init?: RequestInit): Promise<Response> {
    const proxyUrl = `${DEV_PROXY_ENDPOINT}?url=${encodeURIComponent(input)}`;
    const headers = new Headers(init?.headers);
    headers.set("x-webrascal-target", input);
    return fetch(proxyUrl, {
      ...init,
      headers,
      redirect: init?.redirect ?? "manual"
    });
  }
}

export class WebrascalServiceWorker extends EventTarget {
  client: BareClientLike;
  config: WebrascalConfig;
  cookieStore: CookieStore;
  serviceWorkers: FakeServiceWorker[];

  constructor(client: BareClientLike = new DefaultBareClient()) {
    super();
    this.client = client;
    this.cookieStore = new CookieStore();
    this.serviceWorkers = [];
    this.config = {
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
      files: { wasm: "/dist/webrascal.wasm.js", all: "/dist/webrascal.all.js", sync: "/dist/webrascal.controller.js" },
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
    this.applySharedConfig(this.config);

    self.addEventListener("message", (ev: ExtendableMessageEvent) => {
      const data = ev.data as MessageW2C;
      if (data?.webrascal$type === "loadConfig") {
        this.config = data.config;
        this.applySharedConfig(this.config);
      }
      if (data?.webrascal$type === "cookieSync") {
        this.cookieStore.load(data.cookies);
      }
    });
  }

  route({ request }: FetchEvent): boolean {
    const url = new URL(request.url);
    return url.pathname.startsWith(this.config.prefix);
  }

  async fetch(event: FetchEvent): Promise<Response> {
    return handleFetch(this, event);
  }

  async loadConfig(): Promise<void> {
    return;
  }

  private applySharedConfig(config: WebrascalConfig): void {
    try {
      setConfig(config);
      loadCodecs();
    } catch (err) {
      // Keep SW alive with pass-through codecs when config payload is invalid.
      console.warn("[webrascal] failed to initialize shared config in worker:", err);
    }
  }

  async dispatch(client: Client, data: MessageW2C): Promise<MessageC2W> {
    const messageChannel = new MessageChannel();
    return new Promise((resolve) => {
      messageChannel.port1.onmessage = (ev) => {
        resolve(ev.data as MessageC2W);
      };
      client.postMessage(data, [messageChannel.port2]);
      setTimeout(() => resolve({ ok: true }), 250);
    });
  }
}

const sw = new WebrascalServiceWorker();
self.addEventListener("fetch", (ev: FetchEvent) => {
  const reqUrl = new URL(ev.request.url);
  const routed = sw.route(ev);
  const traceEnabled = Boolean(sw.config?.flags?.rewriterLogs);
  const maybeProxyPath = reqUrl.pathname.includes(sw.config.prefix) || reqUrl.pathname.includes("/webrascal/");

  if (traceEnabled || maybeProxyPath) {
    console.info("[webrascal][route] reached route check", {
      requestUrl: ev.request.url,
      pathname: reqUrl.pathname,
      mode: ev.request.mode,
      destination: ev.request.destination,
      prefix: sw.config.prefix,
      routed
    });
  }

  if (routed) {
    ev.respondWith(
      sw.fetch(ev).catch((err) => {
        if (traceEnabled || maybeProxyPath) {
          console.error("[webrascal][route] reached top-level fetch rejection", {
            requestUrl: ev.request.url,
            mode: ev.request.mode,
            destination: ev.request.destination,
            error: err instanceof Error ? err.message : String(err)
          });
        }
        const destination = ev.request.destination;
        const status = destination === "document" || destination === "iframe" || ev.request.mode === "navigate" ? 200 : 502;
        try {
          return new Response(
            renderNetErrorPage({
              code: "WRK-CORE-5999",
              title: "Unhandled Service Worker Fetch Rejection",
              summary: "The fetch event handler rejected before building a normal proxy response.",
              status: 502,
              method: ev.request.method,
              requestUrl: ev.request.url,
              destination,
              details: {
                checkpoint: "top-level-fetch-catch",
                error: err instanceof Error ? err.message : String(err),
                stack: err instanceof Error ? err.stack : undefined
              },
              tips: [
                "Rebuild and hard-reload to ensure the latest worker bundle is active.",
                "Use this payload to pinpoint failures that escaped pipeline-level catches.",
                "Check server and worker console logs around this request URL."
              ]
            }),
            {
              status,
              headers: {
                "content-type": "text/html; charset=utf-8",
                "x-webrascal-error-code": "WRK-CORE-5999",
                "x-webrascal-error-status": "502"
              }
            }
          );
        } catch (renderErr) {
          return new Response(
            renderHardFallbackPage({
              code: "WRK-CORE-5998",
              title: "Emergency Error Fallback",
              summary: "Primary error rendering failed, so WebRascal returned a minimal fallback page.",
              requestUrl: ev.request.url,
              method: ev.request.method,
              details: {
                originalError: err instanceof Error ? err.message : String(err),
                renderError: renderErr instanceof Error ? renderErr.message : String(renderErr)
              }
            }),
            {
              status,
              headers: {
                "content-type": "text/html; charset=utf-8",
                "x-webrascal-error-code": "WRK-CORE-5998",
                "x-webrascal-error-status": "502"
              }
            }
          );
        }
      })
    );
  }
});

export { rewriteUrl, unrewriteUrl };

function renderHardFallbackPage(input: {
  code: string;
  title: string;
  summary: string;
  requestUrl: string;
  method: string;
  details: Record<string, unknown>;
}): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(input.title)}</title>
    <style>
      :root { --bg:#0b0f16; --panel:#141a24; --edge:#2b3444; --ink:#e8eefb; --dim:#9ba8c2; }
      * { box-sizing: border-box; }
      html, body { margin: 0; min-height: 100%; }
      body { background: var(--bg); color: var(--ink); font-family: "Segoe UI", system-ui, sans-serif; padding: 16px; }
      main { max-width: 980px; margin: 0 auto; background: var(--panel); border: 1px solid var(--edge); border-radius: 14px; padding: 14px; }
      .code { display: inline-block; border: 1px solid var(--edge); border-radius: 999px; padding: 4px 10px; font: 600 12px ui-monospace, Menlo, monospace; color: #ffb09a; }
      h1 { margin: 10px 0 6px; font-size: 22px; }
      p { margin: 0 0 12px; color: var(--dim); }
      pre { margin: 0; border: 1px solid var(--edge); border-radius: 10px; background: #0a0e16; padding: 10px; font: 12px/1.45 ui-monospace, Menlo, monospace; white-space: pre-wrap; word-break: break-word; }
    </style>
  </head>
  <body>
    <main>
      <span class="code">${escapeHtml(input.code)}</span>
      <h1>${escapeHtml(input.title)}</h1>
      <p>${escapeHtml(input.summary)}</p>
      <pre>${escapeHtml(JSON.stringify({
        method: input.method,
        requestUrl: input.requestUrl,
        details: input.details,
        generatedAt: new Date().toISOString()
      }, null, 2))}</pre>
    </main>
  </body>
</html>`;
}

function escapeHtml(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
