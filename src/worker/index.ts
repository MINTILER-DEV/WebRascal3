import type { MessageC2W, MessageW2C, WebrascalConfig } from "../types";
import { CookieStore } from "../shared/cookie";
import { loadCodecs, setConfig } from "../shared";
import { rewriteUrl, unrewriteUrl } from "../shared/rewriters/url";
import { handleFetch } from "./fetch";
import { FakeServiceWorker } from "./fakesw";

export type BareClientLike = {
  fetch(input: string, init?: RequestInit): Promise<Response>;
};

class DefaultBareClient implements BareClientLike {
  fetch(input: string, init?: RequestInit): Promise<Response> {
    return fetch(input, init);
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
    return url.pathname.startsWith(this.config.prefix) || request.destination === "document";
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
  if (sw.route(ev)) {
    ev.respondWith(sw.fetch(ev));
  }
});

export { rewriteUrl, unrewriteUrl };
