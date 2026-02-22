import type { URLMeta } from "../../types";
import { rewriteUrl } from "./url";

const CSS_URL_RE = /url\(([^)]+)\)/gi;

export function rewriteCss(css: string, meta: URLMeta): string {
  return css.replace(CSS_URL_RE, (_full, raw) => {
    const cleaned = raw.trim().replace(/^['"]|['"]$/g, "");
    return `url("${rewriteUrl(cleaned, meta)}")`;
  });
}