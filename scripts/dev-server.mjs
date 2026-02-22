import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { access, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.PORT || 8080);
const PROJECT_ROOT = fileURLToPath(new URL("..", import.meta.url));
const PROXY_PATH = "/__refrakt_proxy__";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8"
};

createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || `localhost:${PORT}`}`);

    if (url.pathname === PROXY_PATH) {
      await handleProxy(req, res, url);
      return;
    }

    await handleStatic(req, res, url);
  } catch (err) {
    res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    res.end(`Internal server error\n${String(err)}`);
  }
}).listen(PORT, () => {
  console.log(`[refrakt] dev server listening on http://localhost:${PORT}`);
});

async function handleProxy(req, res, url) {
  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders());
    res.end();
    return;
  }

  const targetRaw = url.searchParams.get("url") || req.headers["x-webrascal-target"];
  const target = Array.isArray(targetRaw) ? targetRaw[0] : targetRaw;
  if (!target) {
    res.writeHead(400, { "content-type": "text/plain; charset=utf-8", ...corsHeaders() });
    res.end("Missing target URL");
    return;
  }

  let parsed;
  try {
    parsed = new URL(target);
  } catch {
    res.writeHead(400, { "content-type": "text/plain; charset=utf-8", ...corsHeaders() });
    res.end("Invalid target URL");
    return;
  }

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (!value) continue;
    const lower = key.toLowerCase();
    if (["host", "connection", "content-length"].includes(lower)) continue;
    if (Array.isArray(value)) {
      headers.set(key, value.join(", "));
    } else {
      headers.set(key, value);
    }
  }

  const method = req.method || "GET";
  const body = method === "GET" || method === "HEAD" ? undefined : await readBody(req);

  let upstream;
  try {
    upstream = await fetch(parsed, { method, headers, body, redirect: "manual" });
  } catch (err) {
    res.writeHead(502, { "content-type": "text/plain; charset=utf-8", ...corsHeaders() });
    res.end(`Upstream fetch failed: ${String(err)}`);
    return;
  }

  const outHeaders = Object.fromEntries(upstream.headers.entries());
  delete outHeaders["content-length"];
  outHeaders["access-control-allow-origin"] = "*";
  outHeaders["access-control-allow-methods"] = "GET,POST,PUT,PATCH,DELETE,HEAD,OPTIONS";
  outHeaders["access-control-allow-headers"] = "*";

  const data = Buffer.from(await upstream.arrayBuffer());
  res.writeHead(upstream.status, outHeaders);
  res.end(data);
}

async function handleStatic(_req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/demo/index.html";
  if (pathname === "/demo") pathname = "/demo/index.html";

  const filePath = resolvePublicPath(pathname);
  if (!filePath) {
    res.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return;
  }

  let fileStat;
  try {
    await access(filePath);
    fileStat = await stat(filePath);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  const finalPath = fileStat.isDirectory() ? join(filePath, "index.html") : filePath;
  const contentType = MIME[extname(finalPath).toLowerCase()] || "application/octet-stream";
  res.writeHead(200, { "content-type": contentType });
  createReadStream(finalPath).pipe(res);
}

function resolvePublicPath(pathname) {
  const candidate = normalize(join(PROJECT_ROOT, pathname.replace(/^\/+/, "")));
  if (!candidate.startsWith(PROJECT_ROOT)) {
    return null;
  }
  return candidate;
}

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,HEAD,OPTIONS",
    "access-control-allow-headers": "*"
  };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}
