import { WEBRASCALCLIENT } from "../symbols";
import type { WebrascalConfig } from "../types";
import { loadCodecs, setConfig } from "../shared";
import { WebrascalClient } from "./client";
import { UrlChangeEvent, WebrascalContextEvent } from "./events";
import { WebrascalServiceWorkerRuntime } from "./swruntime";

export function loadAndHook(config: WebrascalConfig): void {
  const globalRef = globalThis as unknown as Record<symbol, unknown> & { COOKIE?: string };
  if (globalRef[WEBRASCALCLIENT]) {
    return;
  }

  setConfig(config);
  loadCodecs();

  const client = new WebrascalClient(globalThis);

  if (!globalThis.name) {
    globalThis.name = crypto.randomUUID();
  }

  if (typeof globalRef.COOKIE === "string") {
    client.loadcookies(globalRef.COOKIE);
  }

  client.hook();

  if (typeof WorkerGlobalScope !== "undefined" && globalThis instanceof WorkerGlobalScope) {
    new WebrascalServiceWorkerRuntime(client).hook();
  }

  globalThis.dispatchEvent(new WebrascalContextEvent());
  globalThis.dispatchEvent(new UrlChangeEvent(client.url));
}