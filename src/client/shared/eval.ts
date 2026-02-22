import type { WebrascalClient } from "../../client";
import { config } from "../../../shared";
import { rewriteJs } from "../../../shared/rewriters/js";

export function indirectEval(this: WebrascalClient, strict: boolean, js: unknown): unknown {
  if (typeof js !== "string") {
    return js;
  }

  const rewritten = rewriteJs(js, "(indirect eval proxy)", this.meta, false);
  if (strict && this.url.hostname.endsWith("accounts.google.com")) {
    return Function(`"use strict"; return eval(arguments[0]);`).call(this.global, rewritten);
  }

  const indirection = this.global.eval;
  return indirection(rewritten);
}

export default function hookEval(client: WebrascalClient, selfRef: typeof globalThis): void {
  const fn = config.globals.rewritefn;
  Reflect.set(selfRef, fn, (js: unknown) => {
    if (typeof js !== "string") {
      return js;
    }
    return rewriteJs(js, "(direct eval proxy)", client.meta, false);
  });
}

export const order = -90;