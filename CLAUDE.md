# md_viewer

Browser markdown editor/viewer: heading outline, Editor / Split / Preview views, Export PDF
through the print dialog. Static site, no backend. Deploy follows
`~/dev/dotclaude/HOMELAB_APPS.md`.

## Layout

- `site/` is the whole app, served as-is (no build step). `index.html` loads the libraries
  as classic `<script>` globals, then `app.js` (ES module), which imports `render.js`,
  `outline.js` and `scroll-sync.js`.
- `site/vendor/` holds pinned third-party files written by `scripts/fetch-vendor.sh`. Never
  edit them by hand: change the version in the script, re-run it, commit the result.
- Mermaid (~3.5 MB) is not in `index.html`; `render.js` injects it when a doc has a diagram.

## Data

- No server state. The current doc, view, theme and outline toggle live in the visitor's
  localStorage under `md-viewer:*`.

## Must keep working

Read `docs/GOTCHAS.md` before changing rendering, scroll sync, copy or print.

## Run / deploy

- Local: `python3 -m http.server 8031 --directory site`, then http://localhost:8031.
- Deploy: `./deploy.sh` → debian13 `/home/can/md_viewer`, container `md-viewer`,
  port 8031 → 8080 (nginx-unprivileged).
- Verify: docker connector `ps` and `logs md-viewer`, then open http://10.0.1.11:8031.
