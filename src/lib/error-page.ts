/**
 * The last-resort error page.
 *
 * Rendered when the app fails before React can. Plain HTML with inline styles
 * because at this point the stylesheet may be exactly what failed, and it
 * stays in the shop's own colours so a customer meeting it does not feel they
 * have landed somewhere else entirely.
 *
 * It says nothing about what went wrong: the detail belongs in the log, not
 * on a page a stranger can load.
 */
export function renderErrorPage(): string {
  return `<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <title>Taher Caps</title>
  </head>
  <body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#F4EFE6;color:#17130F;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;">
    <main style="max-width:32rem;padding:2rem;text-align:center;">
      <p style="font-size:.6875rem;letter-spacing:.18em;text-transform:uppercase;color:#756C62;margin:0 0 1.5rem;">Taher Caps</p>
      <h1 style="font-size:1.75rem;font-weight:600;margin:0 0 1rem;line-height:1.6;">حدث خطأ غير متوقع.</h1>
      <p style="color:#756C62;margin:0 0 2rem;line-height:1.9;">من فضلك حاول مرة أخرى بعد قليل.</p>
      <a href="/" style="display:inline-block;padding:.85rem 2rem;background:#7D252A;color:#FFFDF8;text-decoration:none;font-size:.75rem;letter-spacing:.14em;text-transform:uppercase;">Try again</a>
    </main>
  </body>
</html>`;
}
