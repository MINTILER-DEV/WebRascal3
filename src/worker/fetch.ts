import type { URLMeta } from "../types";
import { rewriteCss, rewriteHeaders, rewriteHtml, rewriteJs, rewriteWorkers, unrewriteUrl, rewriteUrl } from "../shared/rewriters";
import { cleanExpiredTrackers, getMostRestrictiveSite, initializeTracker, storeReferrerPolicy, updateTracker } from "../shared/security/forceReferrer";
import type { WebrascalServiceWorker } from "./index";
import { renderErrorPage, renderNetErrorPage, type NetErrorPageInput } from "./error";

export async function handleFetch(sw: WebrascalServiceWorker, event: FetchEvent): Promise<Response> {
  const request = event.request;
  let stage = "start";
  let resolvedRealUrl = "";

  try {
    stage = "parse-request-url";
    const requestUrl = new URL(request.url);

    if (requestUrl.pathname.endsWith(".wasm") && requestUrl.pathname.includes("webrascal")) {
      const fetched = await fetch(request);
      const buffer = await fetched.arrayBuffer();
      const b64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
      return new Response(`self.WASM = Uint8Array.from(atob("${b64}"), c => c.charCodeAt(0));`, {
        headers: { "content-type": "application/javascript" }
      });
    }

    stage = "decode-proxied-url";
    const realUrl = unrewriteUrl(request.url);
    resolvedRealUrl = realUrl;
    if (realUrl.startsWith(self.location.origin)) {
      return simpleErrorResponse(
        400,
        "A proxied route resolved to the app origin and was blocked by policy.",
        "WRK-SAFE-1001",
        "Blocked Same-Origin Escape",
        request.destination
      );
    }

    stage = "prepare-upstream-request";
    const meta: URLMeta = { base: new URL(realUrl) };
    const headers = new Headers(request.headers);

    stage = "tracker";
    try {
      const referrer = request.referrer || "";
      const initialSite = "cross-site";
      await initializeTracker(realUrl, referrer, initialSite);
      const mostRestrictive = await getMostRestrictiveSite(realUrl, initialSite);
      headers.set("sec-fetch-site", mostRestrictive);
    } catch {
      // ignore tracker failures
    }

    stage = "attach-cookies";
    const cookies = sw.cookieStore.getCookies(new URL(realUrl));
    if (cookies) {
      headers.set("cookie", cookies);
    }

    stage = "upstream-fetch";
    let upstream: Response;
    try {
      upstream = await sw.client.fetch(realUrl, {
        method: request.method,
        headers,
        body: request.body,
        redirect: "manual"
      });
    } catch (err) {
      return netErrorResponse(502, {
        code: "WRK-NET-2001",
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
      }, request.destination);
    }

    stage = "upstream-error-status-check";
    if (upstream.status >= 500) {
      const contentType = upstream.headers.get("content-type") || "";
      const payload = await safeBodyPreview(upstream, contentType);

      return netErrorResponse(502, {
        code: "WRK-NET-2002",
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
      }, request.destination);
    }

    stage = "rewrite-headers";
    const rewrittenHeaders = rewriteHeaders(upstream.headers, meta);

    stage = "redirect-handling";
    const locationHeader = upstream.headers.get("location");
    if (locationHeader) {
      rewrittenHeaders.set("location", rewriteUrl(locationHeader, meta));
      await updateTracker(realUrl, locationHeader, upstream.headers.get("referrer-policy") || "");
    }

    stage = "cookie-sync";
    const setCookies = upstream.headers.get("set-cookie");
    if (setCookies) {
      sw.cookieStore.setCookies([setCookies], new URL(realUrl));
    }

    stage = "referrer-policy";
    const referrerPolicy = upstream.headers.get("referrer-policy");
    if (referrerPolicy) {
      await storeReferrerPolicy(realUrl, referrerPolicy, request.referrer);
    }

    stage = "rewrite-body";
    const contentType = upstream.headers.get("content-type") || "";
    const destination = request.destination;

    stage = "rewrite-body:read-upstream-buffer";
    let bodyBytes = new Uint8Array(await upstream.arrayBuffer());
    if ((destination === "document" || destination === "iframe") && contentType.includes("text/html")) {
      stage = "rewrite-body:decode-html-text";
      const html = new TextDecoder().decode(bodyBytes);
      stage = "rewrite-body:html";
      bodyBytes = new TextEncoder().encode(rewriteHtml(html, meta, true));
    } else if (destination === "script") {
      stage = "rewrite-body:js";
      bodyBytes = new TextEncoder().encode(rewriteJs(bodyBytes, realUrl, meta, requestUrl.searchParams.get("type") === "module"));
    } else if (destination === "style") {
      stage = "rewrite-body:decode-css-text";
      const css = new TextDecoder().decode(bodyBytes);
      stage = "rewrite-body:css";
      bodyBytes = new TextEncoder().encode(rewriteCss(css, meta));
    } else if (destination === "worker" || destination === "sharedworker") {
      stage = "rewrite-body:worker";
      bodyBytes = rewriteWorkers(bodyBytes, destination as "worker" | "sharedworker", realUrl, meta);
    }

    stage = "cleanup";
    await cleanExpiredTrackers();

    stage = "respond";
    const status = normalizeStatus(upstream.status);
    const statusText = status === upstream.status
      ? upstream.statusText
      : (status === 502 ? "Bad Gateway" : "");
    return new Response(bodyBytes, {
      status,
      statusText,
      headers: rewrittenHeaders
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const fetchLike = /fetch failed|failed to fetch/i.test(message);
    if (fetchLike) {
      return netErrorResponse(502, {
        code: "WRK-NET-2999",
        title: "Worker Fetch Pipeline Network Failure",
        summary: "A fetch-related exception was thrown during pipeline execution.",
        status: 502,
        method: request.method,
        requestUrl: request.url,
        realUrl: resolvedRealUrl,
        destination: request.destination,
        details: {
          stage,
          error: message,
          stack: err instanceof Error ? err.stack : undefined
        },
        tips: [
          "Re-check dev transport endpoint and TLS settings (`npm run serve:insecure` for local testing).",
          "Confirm no stale service worker version is active.",
          "Use the stage field to identify where the pipeline threw."
        ]
      }, request.destination);
    }
    return simpleErrorResponse(
      500,
      `The worker fetch pipeline failed unexpectedly at stage "${stage}". ${message}`,
      "WRK-CORE-5000",
      "Unhandled Worker Pipeline Error",
      request.destination
    );
  }
}

function simpleErrorResponse(
  status: number,
  summary: string,
  code: string,
  title: string,
  destination: RequestDestination
): Response {
  const responseStatus = toRenderableStatus(status, destination);
  return new Response(renderErrorPage(summary, code, title), {
    status: responseStatus,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "x-webrascal-error-code": code,
      "x-webrascal-error-status": String(status)
    }
  });
}

function netErrorResponse(status: number, payload: NetErrorPageInput, destination: RequestDestination): Response {
  const responseStatus = toRenderableStatus(status, destination);
  return new Response(renderNetErrorPage(payload), {
    status: responseStatus,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "x-webrascal-error-code": payload.code,
      "x-webrascal-error-status": String(status)
    }
  });
}

async function safeBodyPreview(response: Response, contentType: string): Promise<string> {
  try {
    if (contentType.includes("text/") || contentType.includes("json")) {
      return (await response.text()).slice(0, 4000);
    }
    return `<binary payload ${response.status}>`;
  } catch (err) {
    return `<failed to read upstream body: ${err instanceof Error ? err.message : String(err)}>`;
  }
}

function normalizeStatus(status: number): number {
  if (status >= 200 && status <= 599) {
    return status;
  }
  return 502;
}

function toRenderableStatus(status: number, destination: RequestDestination): number {
  if (destination === "document" || destination === "iframe") {
    return 200;
  }
  return status;
}
