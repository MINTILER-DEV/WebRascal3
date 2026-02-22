declare const COMMITHASH: string;
declare const VERSION: string;
declare const REWRITERWASM: string;

interface ImportMeta {
  webpackContext(
    directory: string,
    options: { recursive: boolean; regExp: RegExp }
  ): {
    keys(): string[];
    (id: string): {
      default?: (client: unknown, selfRef: typeof globalThis) => void;
      enabled?: (client: unknown) => boolean;
      disabled?: (client: unknown, selfRef: typeof globalThis) => void;
      order?: number;
    };
  };
}