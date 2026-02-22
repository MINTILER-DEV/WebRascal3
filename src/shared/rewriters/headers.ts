import type { URLMeta } from "../../types";

export function rewriteHeaders(headers: Headers, _meta: URLMeta): Headers {
  const out = new Headers(headers);
  out.delete("content-security-policy");
  out.delete("content-security-policy-report-only");
  out.delete("cross-origin-resource-policy");
  out.delete("x-frame-options");
  return out;
}