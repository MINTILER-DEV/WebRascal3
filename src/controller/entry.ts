import { WebrascalController } from "./controller";

export function $webrascalLoadController() {
  return { WebrascalController };
}

Object.assign(globalThis as Record<string, unknown>, {
  $webrascalLoadController
});
