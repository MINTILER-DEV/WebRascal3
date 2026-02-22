import type { WebrascalClient } from "./client";

export type SourceMaps = Map<string, Uint8Array>;

export class SingletonBox {
  clients: WebrascalClient[] = [];
  globals = new Map<typeof globalThis, WebrascalClient>();
  documents = new Map<Document, WebrascalClient>();
  locations = new Map<Location, WebrascalClient>();
  sourcemaps: SourceMaps = new Map();
}