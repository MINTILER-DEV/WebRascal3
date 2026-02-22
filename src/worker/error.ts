export type RefraktErrorPageInput = {
  code: string;
  title: string;
  summary: string;
  status?: number;
  method?: string;
  requestUrl?: string;
  realUrl?: string;
  destination?: string;
  details?: Record<string, unknown>;
  tips?: string[];
};

export function renderErrorPage(input: string | RefraktErrorPageInput): string {
  const page = normalizeInput(input);
  const diagnostics = buildDiagnostics(page);
  const tips = page.tips.length > 0 ? page.tips : defaultTips(page.code);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Refrakt Proxy Error</title>
    <style>
      :root {
        --bg-1: #091028;
        --bg-2: #13254f;
        --ink: #ecf2ff;
        --ink-dim: #a8b8d8;
        --glass: rgba(255, 255, 255, 0.08);
        --glass-strong: rgba(255, 255, 255, 0.13);
        --edge: rgba(255, 255, 255, 0.22);
        --accent: #65f0ff;
        --danger: #ff7c9a;
        --shadow: 0 24px 60px rgba(2, 10, 33, 0.48);
      }
      * { box-sizing: border-box; }
      html, body { margin: 0; min-height: 100%; }
      body {
        font-family: "Sora", "Segoe UI", sans-serif;
        color: var(--ink);
        background:
          radial-gradient(80rem 45rem at 15% -20%, #2f4f96 0%, transparent 62%),
          radial-gradient(70rem 40rem at 105% 110%, #125188 0%, transparent 56%),
          linear-gradient(140deg, var(--bg-1) 0%, var(--bg-2) 100%);
        padding: clamp(16px, 2vw, 28px);
      }
      .shell {
        max-width: 1200px;
        margin: 0 auto;
      }
      .code-chip {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 14px;
        padding: 9px 14px;
        border: 1px solid var(--edge);
        border-radius: 999px;
        background: var(--glass);
        color: var(--ink);
        font-family: "JetBrains Mono", "Cascadia Code", monospace;
        font-size: 12px;
        letter-spacing: 0.1em;
        text-transform: uppercase;
      }
      .code-chip strong {
        color: var(--danger);
        letter-spacing: 0.06em;
      }
      .hero {
        margin-bottom: 18px;
      }
      h1 {
        margin: 0;
        font-size: clamp(26px, 4vw, 38px);
        line-height: 1.05;
      }
      .summary {
        margin: 10px 0 0;
        max-width: 78ch;
        color: var(--ink-dim);
      }
      .grid {
        display: grid;
        grid-template-columns: 1.35fr 1fr;
        gap: 16px;
      }
      .card {
        border: 1px solid var(--edge);
        border-radius: 18px;
        background: linear-gradient(170deg, var(--glass-strong), rgba(255, 255, 255, 0.03));
        box-shadow: var(--shadow);
        backdrop-filter: blur(14px);
        -webkit-backdrop-filter: blur(14px);
      }
      .card h2 {
        margin: 0;
        font-size: 13px;
        font-weight: 700;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: var(--ink-dim);
      }
      .diagnostics {
        padding: 16px;
      }
      pre {
        margin: 12px 0 0;
        padding: 14px;
        border-radius: 12px;
        border: 1px solid rgba(255, 255, 255, 0.16);
        background: rgba(1, 8, 24, 0.72);
        color: #d7eeff;
        font-family: "JetBrains Mono", "Cascadia Code", monospace;
        font-size: 12px;
        line-height: 1.45;
        overflow: auto;
      }
      .tips {
        padding: 16px;
      }
      .tips ol {
        margin: 12px 0 0;
        padding-left: 20px;
      }
      .tips li {
        margin: 8px 0;
        color: var(--ink-dim);
      }
      .tips li b {
        color: var(--ink);
      }
      @media (max-width: 900px) {
        .grid { grid-template-columns: 1fr; }
      }
    </style>
  </head>
  <body>
    <main class="shell">
      <div class="hero">
        <div class="code-chip">Error Code <strong>${escapeHtml(page.code)}</strong></div>
        <h1>${escapeHtml(page.title)}</h1>
        <p class="summary">${escapeHtml(page.summary)}</p>
      </div>
      <section class="grid">
        <article class="card diagnostics">
          <h2>Diagnostic Payload</h2>
          <pre><code>${escapeHtml(JSON.stringify(diagnostics, null, 2))}</code></pre>
        </article>
        <aside class="card tips">
          <h2>Recovery Tips</h2>
          <ol>
            ${tips.map((tip) => `<li>${escapeHtml(tip)}</li>`).join("")}
          </ol>
        </aside>
      </section>
    </main>
  </body>
</html>`;
}

function normalizeInput(input: string | RefraktErrorPageInput): Required<RefraktErrorPageInput> {
  if (typeof input === "string") {
    return {
      code: "RFK-0000",
      title: "Unhandled Proxy Failure",
      summary: input,
      status: 500,
      method: "",
      requestUrl: "",
      realUrl: "",
      destination: "",
      details: {},
      tips: []
    };
  }

  return {
    code: input.code || "RFK-0000",
    title: input.title || "Proxy Error",
    summary: input.summary || "The proxy failed while processing this request.",
    status: input.status ?? 500,
    method: input.method || "",
    requestUrl: input.requestUrl || "",
    realUrl: input.realUrl || "",
    destination: input.destination || "",
    details: input.details || {},
    tips: input.tips || []
  };
}

function buildDiagnostics(page: Required<RefraktErrorPageInput>): Record<string, unknown> {
  return {
    code: page.code,
    status: page.status,
    method: page.method || undefined,
    requestUrl: page.requestUrl || undefined,
    realUrl: page.realUrl || undefined,
    destination: page.destination || undefined,
    generatedAt: new Date().toISOString(),
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
    details: page.details
  };
}

function defaultTips(code: string): string[] {
  if (code.startsWith("RFK-NET")) {
    return [
      "Confirm your dev proxy server is running on the same origin as this page.",
      "Check outbound connectivity and TLS from the dev server process.",
      "Inspect the server console for upstream error details."
    ];
  }
  if (code.startsWith("RFK-SAFE")) {
    return [
      "Only route encoded proxied URLs through the worker prefix path.",
      "Avoid navigating the proxied frame directly to this app origin.",
      "Verify URL encoding/decoding logic for prefixed routes."
    ];
  }
  return [
    "Rebuild the bundles and hard-refresh the page.",
    "Unregister stale service workers and reload.",
    "Capture the full diagnostic payload and share it for debugging."
  ];
}

function escapeHtml(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
