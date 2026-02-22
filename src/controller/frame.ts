import { WEBRASCALCLIENT, WEBRASCALFRAME } from "../symbols";
import type { WebrascalController } from "./controller";
import type { WebrascalClient } from "../client/client";

export class WebrascalFrame extends EventTarget {
  readonly frame: HTMLIFrameElement;
  readonly controller: WebrascalController;

  constructor(controller: WebrascalController, frame: HTMLIFrameElement) {
    super();
    this.controller = controller;
    this.frame = frame;
    if (!this.frame.name) {
      this.frame.name = crypto.randomUUID();
    }
    (this.frame as unknown as Record<symbol, unknown>)[WEBRASCALFRAME] = this;
  }

  get client(): WebrascalClient {
    const w = this.frame.contentWindow as unknown as Record<symbol, unknown>;
    return w[WEBRASCALCLIENT] as WebrascalClient;
  }

  get url(): URL {
    return this.client.url;
  }

  go(url: string | URL): void {
    this.frame.src = this.controller.encodeUrl(url);
  }

  back(): void {
    this.frame.contentWindow?.history.back();
  }

  forward(): void {
    this.frame.contentWindow?.history.forward();
  }

  reload(): void {
    this.frame.contentWindow?.location.reload();
  }
}