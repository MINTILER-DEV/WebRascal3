import type { URLMeta } from "../types";
import { rewriteCss, rewriteHeaders, rewriteHtml, rewriteJs, rewriteWorkers, unrewriteUrl, rewriteUrl } from "../shared/rewriters";
import { cleanExpiredTrackers, getMostRestrictiveSite, initializeTracker, storeReferrerPolicy, updateTracker } from "../shared/security/forceReferrer";
import type { WebrascalServiceWorker } from "./index";
import { renderErrorPage } from "./error";

export async function handleFetch(sw: WebrascalServiceWorker, event: FetchEvent): Promise<Response> {
  const request = event.request;
  const requestUrl = new URL(request.url);

  if (requestUrl.pathname.endsWith(".wasm") && requestUrl.pathname.includes("webrascal")) {
    const fetched = await fetch(request);
    const buffer = await fetched.arrayBuffer();
    const b64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
    return new Response(`self.WASM = Uint8Array.from(atob("${b64}"), c => c.charCodeAt(0));`, {
      headers: { "content-type": "application/javascript" }
    });
  }

  const realUrl = unrewriteUrl(request.url);
  if (realUrl.startsWith(self.location.origin)) {
    return new Response(renderErrorPage("Blocked same-origin escape"), {
      status: 400,
      headers: { "content-type": "text/html" }
    });
  }

  const meta: URLMeta = { base: new URL(realUrl) };
  const headers = new Headers(request.headers);

  try {
    const referrer = request.referrer || "";
    const initialSite = "cross-site";
    await initializeTracker(realUrl, referrer, initialSite);
    const mostRestrictive = await getMostRestrictiveSite(realUrl, initialSite);
    headers.set("sec-fetch-site", mostRestrictive);
  } catch {
    // ignore tracker failures
  }

  const cookies = sw.cookieStore.getCookies(new URL(realUrl));
  if (cookies) {
    headers.set("cookie", cookies);
  }

  let upstream: Response;
  try {
    upstream = await sw.client.fetch(realUrl, {
      method: request.method,
      headers,
      body: request.body,
      redirect: "manual"
    });
  } catch (err) {
    return new Response(renderErrorPage(String(err)), {
      status: 502,
      headers: { "content-type": "text/html" }
    });
  }

  const rewrittenHeaders = rewriteHeaders(upstream.headers, meta);

  const locationHeader = upstream.headers.get("location");
  if (locationHeader) {
    rewrittenHeaders.set("location", rewriteUrl(locationHeader, meta));
    await updateTracker(realUrl, locationHeader, upstream.headers.get("referrer-policy") || "");
  }

  const setCookies = upstream.headers.get("set-cookie");
  if (setCookies) {
    sw.cookieStore.setCookies([setCookies], new URL(realUrl));
  }

  const referrerPolicy = upstream.headers.get("referrer-policy");
  if (referrerPolicy) {
    await storeReferrerPolicy(realUrl, referrerPolicy, request.referrer);
  }

  const contentType = upstream.headers.get("content-type") || "";
  const destination = request.destination;

  let bodyBytes = new Uint8Array(await upstream.arrayBuffer());
  if ((destination === "document" || destination === "iframe") && contentType.includes("text/html")) {
    bodyBytes = new TextEncoder().encode(rewriteHtml(new TextDecoder().decode(bodyBytes), meta, true));
  } else if (destination === "script") {
    bodyBytes = new TextEncoder().encode(rewriteJs(bodyBytes, realUrl, meta, requestUrl.searchParams.get("type") === "module"));
  } else if (destination === "style") {
    bodyBytes = new TextEncoder().encode(rewriteCss(new TextDecoder().decode(bodyBytes), meta));
  } else if (destination === "worker" || destination === "sharedworker") {
    bodyBytes = rewriteWorkers(bodyBytes, destination as "worker" | "sharedworker", realUrl, meta);
  }

  await cleanExpiredTrackers();

  return new Response(bodyBytes, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: rewrittenHeaders
  });
}