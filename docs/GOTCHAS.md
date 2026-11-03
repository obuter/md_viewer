# Gotchas

Things that broke once, or would break quietly if changed.

- **`data-line` on every preview block.** `render.js` puts the source line on each block.
  Scroll sync and outline jumps depend on it. Front matter is replaced by blank lines, not
  removed, so the line numbers after it stay right.
- **DOMPurify runs with `SANITIZE_DOM: false`.** With the default, it drops heading ids that
  match a document property (`title`, `images`, `links`…), which breaks the outline and
  `[text](#heading)` links.
- **The outline passes copies of headings.** Look headings up by `id`, never with
  `indexOf(heading)`.
- **No secure context on the LAN.** The app is served over plain http, so
  `navigator.clipboard` doesn't exist there. Copy falls back to `execCommand('copy')`.
  Test copy on `http://10.0.1.11:8031`, not only on localhost.
- **CSP: scripts from self only.** nginx sends `script-src 'self'`, so `index.html` must not
  get inline `<script>` blocks. Styles may be inline (KaTeX and Mermaid need it).
- **Mermaid needs a concrete `fontFamily`.** With `inherit` it measures labels in one font
  and draws them in the monospace font of the `<pre>`, which clips the text.
- **Print uses light diagrams.** `exportPdf()` sets `printing` so diagrams re-render in the
  light theme before `window.print()`; ⌘P is routed through it too. The browser's own
  File → Print skips that step, so diagrams print in the current theme.
- **Scroll sync at the top.** When one pane is at the very top, the other is pinned to 0;
  interpolating would leave the preview 36 px down, past its padding.
