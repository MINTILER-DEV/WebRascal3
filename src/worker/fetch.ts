import type { URLMeta } from "../types";
import { rewriteCss, rewriteHeaders, rewriteHtml, rewriteJs, rewriteWorkers, unrewriteUrl, rewriteUrl } from "../shared/rewriters";
import { cleanExpiredTrackers, getMostRestrictiveSite, initializeTracker, storeReferrerPolicy, updateTracker } from "../shared/security/forceReferrer";
import type { WebrascalServiceWorker } from "./index";
import { renderErrorPage, type RefraktErrorPageInput } from "./error";

export async function handleFetch(sw: WebrascalServiceWorker, event: FetchEvent): Promise<Response> {
  const request = event.request;

  try {
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
      return errorResponse(400, {
        code: "RFK-SAFE-1001",
        title: "Blocked Same-Origin Escape",
        summary: "A proxied route tried to resolve to the app origin, which is blocked by policy.",
        status: 400,
        method: request.method,
        requestUrl: request.url,
        realUrl,
        destination: request.destination,
        details: {
          workerOrigin: self.location.origin,
          prefix: sw.config.prefix,
          note: "This guard prevents proxied pages from escaping the proxy boundary."
        },
        tips: [
          "Ensure the iframe navigates through controller.encodeUrl().",
          "Verify codec encode/decode output is stable for the requested target URL.",
          "Do not feed same-origin app routes into /webrascal/ URLs."
        ]
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
      return errorResponse(502, {
        code: "RFK-NET-2001",
        title: "Upstream Fetch Failed",
        summary: "The worker could not reach the target URL through the configured transport.",
        status: 502,
        method: request.method,
        requestUrl: request.url,
        realUrl,
        destination: request.destination,
        details: {
          error: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
          transport: "default client via same-origin dev proxy endpoint"
        },
        tips: [
          "Start the custom dev server (`npm run serve`) instead of a static server.",
          "Check that the host process can reach the target over HTTPS.",
          "Inspect the dev server terminal for low-level network errors."
        ]
      });
    }

    if (upstream.status >= 500) {
      const contentType = upstream.headers.get("content-type") || "";
      const payload = contentType.includes("text/")
        ? (await upstream.text()).slice(0, 4000)
        : `<binary payload ${upstream.status}>`;

      return errorResponse(502, {
        code: "RFK-NET-2002",
        title: "Proxy Upstream Returned Server Error",
        summary: "The transport endpoint returned a 5xx response while fetching the target URL.",
        status: upstream.status,
        method: request.method,
        requestUrl: request.url,
        realUrl,
        destination: request.destination,
        details: {
          upstreamStatus: upstream.status,
          upstreamStatusText: upstream.statusText,
          upstreamContentType: contentType,
          upstreamBodyPreview: payload
        },
        tips: [
          "Verify the proxy endpoint (`/__refrakt_proxy__`) is healthy.",
          "If using HTTPS targets, check certificate and DNS reachability from Node.",
          "Retry with a simpler target URL to isolate transport vs rewrite issues."
        ]
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
  } catch (err) {
    return errorResponse(500, {
      code: "RFK-CORE-5000",
      title: "Unhandled Worker Pipeline Error",
      summary: "The fetch rewrite pipeline threw unexpectedly while handling this proxied request.",
      status: 500,
      method: request.method,
      requestUrl: request.url,
      destination: request.destination,
      details: {
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined
      },
      tips: [
        "Check worker bundle version and rebuild to clear stale caches.",
        "Open the full diagnostic payload and inspect the failing stage.",
        "If this is reproducible, report the error code and request URL."
      ]
    });
  }
}

function errorResponse(status: number, payload: RefraktErrorPageInput): Response {
  return new Response(renderErrorPage(payload), {
    status,
    headers: { "content-type": "text/html; charset=utf-8" }
  });
}
