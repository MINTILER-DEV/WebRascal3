import type { WebrascalConfig, WebrascalFlags } from "../types";

export let config: WebrascalConfig;
export let codecEncode: (input: string) => string = (input) => input;
export let codecDecode: (input: string) => string = (input) => input;

export function setConfig(newConfig: WebrascalConfig): void {
  config = newConfig;
}

export function loadCodecs(): void {
  if (!config) {
    throw new Error("config must be set before loadCodecs()");
  }
  codecEncode = compileFunction(config.codec.encode, "encode");
  codecDecode = compileFunction(config.codec.decode, "decode");
}

export function flagEnabled(flag: keyof WebrascalFlags, url: URL): boolean {
  if (!config) {
    return false;
  }

  for (const [pattern, flags] of Object.entries(config.siteFlags || {})) {
    try {
      if (new RegExp(pattern, "i").test(url.href) && flag in flags) {
        return Boolean(flags[flag]);
      }
    } catch {
      continue;
    }
  }

  return Boolean(config.flags[flag]);
}

function compileFunction(source: string, label: string): (input: string) => string {
  try {
    return Function(`return (${source});`)() as (input: string) => string;
  } catch (err) {
    throw new Error(`failed to compile codec.${label}: ${String(err)}`);
  }
}