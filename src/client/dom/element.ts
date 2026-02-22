import type { WebrascalClient } from "../client";
import { htmlRules } from "../../shared/htmlRules";
import { rewriteHtml } from "../../shared/rewriters/html";
import { rewriteJs } from "../../shared/rewriters/js";
import { rewriteUrl, unrewriteUrl } from "../../shared/rewriters/url";
import { WEBRASCALCLIENT } from "../../symbols";

const rules = new Map(htmlRules.map((rule) => [rule.attr.toLowerCase(), rule]));

export default function hookElement(client: WebrascalClient): void {
  client.Proxy("Element.prototype.setAttribute", {
    apply(ctx) {
      const name = String(ctx.args[0]).toLowerCase();
      let value = String(ctx.args[1]);

      const rule = rules.get(name);
      if (rule) {
        const rewritten = rule.fn(value);
        if (rewritten === null) {
          (ctx.thisValue as Element).removeAttribute(name);
          return ctx.return(undefined);
        }
        value = rewritten;
      } else if (["src", "href", "action", "formaction", "poster", "data"].includes(name)) {
        value = rewriteUrl(value, client.meta);
      } else if (name.startsWith("on")) {
        value = rewriteJs(value, "(inline handler)", client.meta, false);
      }

      (ctx.thisValue as Element).setAttribute(`webrascal-attr-${name}`, String(ctx.args[1]));
      ctx.args = [name, value];
    }
  });

  client.Proxy("Element.prototype.getAttribute", {
    apply(ctx) {
      const name = String(ctx.args[0]).toLowerCase();
      if (name.startsWith("webrascal-attr")) {
        return ctx.return(null);
      }
      const original = (ctx.thisValue as Element).getAttribute(`webrascal-attr-${name}`);
      if (original !== null) {
        return ctx.return(original);
      }
    }
  });

  client.Trap("Element.prototype.innerHTML", {
    configurable: true,
    set(value: string) {
      const element = this as Element;
      const rewritten = element.tagName === "SCRIPT"
        ? rewriteJs(value, "(innerHTML script)", client.meta, false)
        : rewriteHtml(value, client.meta, false);
      client.descriptors.store["Element.prototype.innerHTML"]?.set?.call(element, rewritten);
    },
    get() {
      return client.descriptors.store["Element.prototype.innerHTML"]?.get?.call(this);
    }
  });

  for (const key of ["contentWindow", "contentDocument"] as const) {
    client.Trap(`HTMLIFrameElement.prototype.${key}`, {
      configurable: true,
      get() {
        const native = client.descriptors.store[`HTMLIFrameElement.prototype.${key}`]?.get?.call(this);
        const w = (this as HTMLIFrameElement).contentWindow as Record<symbol, unknown> | null;
        if (w && !w[WEBRASCALCLIENT]) {
          const Ctor = (client.constructor as new (g: typeof globalThis) => WebrascalClient);
          const childClient = new Ctor(w as unknown as typeof globalThis);
          childClient.hook();
        }
        return native;
      }
    });
  }

  for (const [name, ctor] of [
    ["href", HTMLAnchorElement],
    ["src", HTMLImageElement]
  ] as const) {
    const descriptor = Object.getOwnPropertyDescriptor(ctor.prototype, name);
    if (!descriptor?.get || !descriptor.set) {
      continue;
    }
    Object.defineProperty(ctor.prototype, name, {
      configurable: true,
      get() {
        return unrewriteUrl(descriptor.get?.call(this) as string);
      },
      set(value: string) {
        descriptor.set?.call(this, rewriteUrl(value, client.meta));
      }
    });
  }
}
