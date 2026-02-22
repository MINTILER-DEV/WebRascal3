import { WebrascalController } from "./controller/controller";
import { loadAndHook } from "./client/entry";
import { WebrascalServiceWorker } from "./worker/index";

export function $webrascalLoadController() {
  return { WebrascalController };
}

export function $webrascalLoadClient() {
  return { loadAndHook };
}

export function $webrascalLoadWorker() {
  return { WebrascalServiceWorker };
}

Object.assign(globalThis as Record<string, unknown>, {
  $webrascalLoadController,
  $webrascalLoadClient,
  $webrascalLoadWorker
});