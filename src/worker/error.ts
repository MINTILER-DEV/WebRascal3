export type NetErrorPageInput = {
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

export function renderErrorPage(summary: string, code = "WRK-0000", title = "WebRascal Proxy Error"): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <style>
      :root {
        --bg: #0c1018;
        --panel: #131a27;
        --edge: #2a3346;
        --ink: #e9efff;
        --dim: #9da9c4;
        --accent: #7ec0ff;
      }
      * { box-sizing: border-box; }
      html, body { margin: 0; min-height: 100%; }
      body {
        font-family: "Segoe UI", system-ui, sans-serif;
        background: var(--bg);
        color: var(--ink);
        display: grid;
        place-items: center;
        padding: 24px;
      }
      .card {
        width: min(760px, 100%);
        background: var(--panel);
        border: 1px solid var(--edge);
        border-radius: 14px;
        padding: 18px;
      }
      .code {
        display: inline-block;
        border-radius: 999px;
        border: 1px solid var(--edge);
        padding: 4px 10px;
        color: var(--accent);
        font: 600 12px ui-monospace, SFMono-Regular, Menlo, monospace;
      }
      h1 { margin: 10px 0 8px; font-size: 24px; }
      p { margin: 0; color: var(--dim); }
    </style>
  </head>
  <body>
    <main class="card">
      <span class="code">${escapeHtml(code)}</span>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(summary)}</p>
    </main>
  </body>
</html>`;
}

export function renderNetErrorPage(input: NetErrorPageInput): string {
  const payload = {
    code: input.code,
    status: input.status ?? 502,
    method: input.method || "",
    requestUrl: input.requestUrl || "",
    realUrl: input.realUrl || "",
    destination: input.destination || "",
    generatedAt: new Date().toISOString(),
    details: input.details || {}
  };

  const tips = input.tips?.length
    ? input.tips
    : [
      "Run `npm run serve` and confirm the dev proxy endpoint is reachable.",
      "Check network and TLS reachability from the Node server process.",
      "Inspect the server terminal logs for upstream transport failures."
    ];

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(input.title)}</title>
    <style>
      :root {
        --bg: #0c1018;
        --panel: #131a27;
        --edge: #2a3346;
        --ink: #e9efff;
        --dim: #9da9c4;
        --accent: #ff9b7e;
      }
      * { box-sizing: border-box; }
      html, body { margin: 0; min-height: 100%; }
      body {
        font-family: "Segoe UI", system-ui, sans-serif;
        background: var(--bg);
        color: var(--ink);
        padding: 18px;
      }
      .wrap {
        max-width: 1080px;
        margin: 0 auto;
      }
      .top {
        margin-bottom: 12px;
        border: 1px solid var(--edge);
        border-radius: 14px;
        background: var(--panel);
        padding: 14px;
      }
      .code {
        display: inline-block;
        border-radius: 999px;
        border: 1px solid var(--edge);
        padding: 4px 10px;
        color: var(--accent);
        font: 600 12px ui-monospace, SFMono-Regular, Menlo, monospace;
      }
      h1 { margin: 10px 0 8px; font-size: 22px; }
      p { margin: 0; color: var(--dim); }
      .grid {
        display: grid;
        grid-template-columns: 1.25fr 1fr;
        gap: 12px;
      }
      .panel {
        border: 1px solid var(--edge);
        border-radius: 14px;
        background: var(--panel);
        padding: 14px;
      }
      h2 {
        margin: 0 0 8px;
        color: var(--dim);
        font-size: 12px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      pre {
        margin: 0;
        border-radius: 10px;
        border: 1px solid var(--edge);
        background: #0a0e16;
        padding: 12px;
        color: #d9e9ff;
        font: 12px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace;
        white-space: pre-wrap;
        word-break: break-word;
      }
      ol { margin: 0; padding-left: 20px; }
      li { margin: 8px 0; color: var(--dim); }
      @media (max-width: 900px) {
        .grid { grid-template-columns: 1fr; }
      }
    </style>
  </head>
  <body>
    <main class="wrap">
      <section class="top">
        <span class="code">${escapeHtml(input.code)}</span>
        <h1>${escapeHtml(input.title)}</h1>
        <p>${escapeHtml(input.summary)}</p>
      </section>
      <section class="grid">
        <article class="panel">
          <h2>Diagnostics</h2>
          <pre><code>${escapeHtml(JSON.stringify(payload, null, 2))}</code></pre>
        </article>
        <aside class="panel">
          <h2>Tips</h2>
          <ol>${tips.map((tip) => `<li>${escapeHtml(tip)}</li>`).join("")}</ol>
        </aside>
      </section>
    </main>
  </body>
</html>`;
}

function escapeHtml(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
