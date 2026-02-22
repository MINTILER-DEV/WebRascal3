import { WEBRASCALCONTROLLER } from "../symbols";
import type { MessageW2C, WebrascalConfig, WebrascalInitConfig } from "../types";
import { loadCodecs, setConfig } from "../shared";
import { WebrascalFrame } from "./frame";

export class WebrascalGlobalDownloadEvent extends Event {
  readonly url: string;
  readonly filename?: string;

  constructor(url: string, filename?: string) {
    super("download");
    this.url = url;
    this.filename = filename;
  }
}

export class WebrascalController extends EventTarget {
  readonly [WEBRASCALCONTROLLER] = true;
  config: WebrascalConfig;

  constructor(config: Partial<WebrascalInitConfig> = {}) {
    super();
    this.config = mergeConfig(config);
  }

  async init(): Promise<void> {
    setConfig(this.config);
    loadCodecs();

    const db = await openDatabase();
    await saveConfig(db, this.config);

    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        webrascal$type: "loadConfig",
        config: this.config
      } satisfies MessageW2C);
    }

    navigator.serviceWorker.addEventListener("message", (ev) => {
      const data = ev.data as MessageW2C;
      if (data?.webrascal$type === "download") {
        this.dispatchEvent(new WebrascalGlobalDownloadEvent(data.url, data.filename));
      }
    });
  }

  createFrame(frame?: HTMLIFrameElement): WebrascalFrame {
    return new WebrascalFrame(this, frame ?? document.createElement("iframe"));
  }

  encodeUrl(url: string | URL): string {
    const value = typeof url === "string" ? url : url.toString();
    return `${this.config.prefix}${(Function(`return (${this.config.codec.encode})`)() as (input: string) => string)(value)}`;
  }

  decodeUrl(url: string | URL): string {
    const value = typeof url === "string" ? url : url.toString();
    const stripped = value.startsWith(this.config.prefix) ? value.slice(this.config.prefix.length) : value;
    return (Function(`return (${this.config.codec.decode})`)() as (input: string) => string)(stripped);
  }

  async modifyConfig(newconfig: Partial<WebrascalInitConfig>): Promise<void> {
    this.config = mergeConfig({ ...this.config, ...newconfig });
    await this.init();
  }
}

function mergeConfig(input: Partial<WebrascalInitConfig>): WebrascalConfig {
  const defaults: WebrascalConfig = {
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

  return {
    ...defaults,
    ...input,
    globals: { ...defaults.globals, ...(input.globals || {}) },
    files: { ...defaults.files, ...(input.files || {}) },
    flags: { ...defaults.flags, ...(input.flags || {}) },
    siteFlags: { ...defaults.siteFlags, ...(input.siteFlags || {}) },
    codec: {
      encode: input.codec?.encode || defaults.codec.encode,
      decode: input.codec?.decode || defaults.codec.decode
    }
  };
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("$webrascal", 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of ["config", "cookies", "redirectTrackers", "referrerPolicies", "publicSuffixList"]) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name);
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function saveConfig(db: IDBDatabase, config: WebrascalConfig): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["config"], "readwrite");
    const store = tx.objectStore("config");
    store.put(config, "runtime");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}