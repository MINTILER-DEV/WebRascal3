import type { WebrascalClient } from "../../client";
import { rewriteUrl, unrewriteUrl } from "../../../shared/rewriters/url";

type FakeWebSocketState = {
  inner: WebSocket;
};

const states = new WeakMap<WebSocket, FakeWebSocketState>();

export default function hookWebSocket(client: WebrascalClient): void {
  const NativeWebSocket = WebSocket;

  class ProxyWebSocket extends NativeWebSocket {
    constructor(url: string | URL, protocols?: string | string[]) {
      super(rewriteUrl(url.toString(), client.meta), protocols);
      states.set(this, { inner: this });
    }

    get url(): string {
      return unrewriteUrl(super.url);
    }
  }

  (globalThis as unknown as Record<string, unknown>).WebSocket = ProxyWebSocket as unknown as typeof WebSocket;
}