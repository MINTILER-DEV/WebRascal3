export function renderErrorPage(error: string): string {
  return `<!doctype html>
<html>
  <head><meta charset="utf-8"><title>Refrakt Error</title></head>
  <body>
    <h1>Proxy Error</h1>
    <pre>${escapeHtml(error)}</pre>
  </body>
</html>`;
}

function escapeHtml(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}