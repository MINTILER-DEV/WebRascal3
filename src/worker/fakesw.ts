export class FakeServiceWorker {
  origin: string;
  connected: boolean;

  constructor(origin: string) {
    this.origin = origin;
    this.connected = true;
  }

  async handle(request: Request): Promise<Response | null> {
    void request;
    return null;
  }
}