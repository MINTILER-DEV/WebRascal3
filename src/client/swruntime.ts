import type { WebrascalClient } from "./client";

export class WebrascalServiceWorkerRuntime {
  constructor(private readonly client: WebrascalClient) {}

  hook(): void {
    void this.client;
  }
}