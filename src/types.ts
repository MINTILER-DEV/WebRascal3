export interface WebrascalFlags {
  serviceworkers: boolean;
  syncxhr: boolean;
  strictRewrites: boolean;
  rewriterLogs: boolean;
  captureErrors: boolean;
  cleanErrors: boolean;
  rascalitize: boolean;
  sourcemaps: boolean;
  destructureRewrites: boolean;
  interceptDownloads: boolean;
  allowInvalidJs: boolean;
  allowFailedIntercepts: boolean;
}

export interface WebrascalConfig {
  prefix: string;
  globals: {
    wrapfn: string;
    wrappropertybase: string;
    wrappropertyfn: string;
    cleanrestfn: string;
    importfn: string;
    rewritefn: string;
    metafn: string;
    setrealmfn: string;
    pushsourcemapfn: string;
    trysetfn: string;
    templocid: string;
    tempunusedid: string;
  };
  files: {
    wasm: string;
    all: string;
    sync: string;
  };
  flags: WebrascalFlags;
  siteFlags: Record<string, Partial<WebrascalFlags>>;
  codec: {
    encode: string;
    decode: string;
  };
}

export interface WebrascalInitConfig extends Partial<WebrascalConfig> {
  codec?: {
    encode?: string;
    decode?: string;
  };
}

export interface URLMeta {
  base: URL;
  topFrame?: string;
  parentFrame?: string;
  type?: string;
}

export interface ProxyCtx<TArgs extends unknown[] = unknown[], TRet = unknown> {
  fn: (...args: TArgs) => TRet;
  thisValue: unknown;
  args: TArgs;
  earlyReturn: boolean;
  returnValue: TRet | undefined;
  return(value: TRet): TRet;
  call(): TRet;
}

export interface HookModule {
  order?: number;
  enabled?: (client: unknown) => boolean;
  disabled?: (client: unknown, selfRef: typeof globalThis) => void;
  default: (client: unknown, selfRef: typeof globalThis) => void;
}

export type MessageW2C =
  | { webrascal$type: "download"; url: string; filename?: string }
  | { webrascal$type: "cookieSync"; cookies: string }
  | { webrascal$type: "loadConfig"; config: WebrascalConfig };

export type MessageC2W =
  | { ok: true }
  | { ok: false; error: string };