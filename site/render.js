// render.js — markdown text → safe HTML, plus the list of headings for the outline.
//
// Libraries come from <script> tags in index.html as globals:
// markdownit, markdownitFootnote, markdownitTaskLists, texmath, katex, DOMPurify, hljs.
// Mermaid is loaded on demand by renderDiagrams().

const md = window.markdownit({
  html: true,        // allow raw HTML in documents (sanitized below)
  linkify: true,     // bare URLs become links
  typographer: true, // smart quotes, dashes
  highlight: highlightCode,
});
md.use(window.markdownitFootnote);
md.use(window.markdownitTaskLists, { enabled: false });
md.use(window.texmath, { engine: window.katex, delimiters: 'dollars', katexOptions: { throwOnError: false } });
md.use(wikilinks);
md.use(callouts);
md.use(headingIds);
md.use(sourceLines);
md.renderer.rules.fence = renderFence;

// ---------- Public API ----------

/**
 * Render a markdown document.
 * Returns { html, headings } where headings = [{ level, text, id, line }].
 */
export function renderMarkdown(text) {
  const { frontmatter, body } = splitFrontmatter(text);
  const env = { headings: [] };
  let html = md.render(body, env);
  if (frontmatter) html = renderFrontmatter(frontmatter) + html;
  html = window.DOMPurify.sanitize(html, {
    ADD_TAGS: ['eq', 'eqn'], // texmath's wrappers around KaTeX output
    // Keep heading ids like "title" or "images": DOMPurify would drop them as possible
    // DOM clobbering, which would break the outline and [text](#heading) links.
    SANITIZE_DOM: false,
  });
  return { html, headings: env.headings };
}

/** Same id rule as the headings, used for [[#Heading]] links. */
export function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s+/g, '-');
}

// ---------- Code blocks ----------

function highlightCode(code, lang) {
  const hljs = window.hljs;
  if (lang && hljs.getLanguage(lang)) {
    try {
      return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
    } catch { /* fall through to plain text */ }
  }
  return md.utils.escapeHtml(code);
}

// Fenced code: a header with the language and a copy button. ```mermaid becomes a diagram.
function renderFence(tokens, idx, options) {
  const token = tokens[idx];
  const lang = token.info.trim().split(/\s+/)[0].toLowerCase();
  const line = token.map ? token.map[0] : '';
  const esc = md.utils.escapeHtml;

  if (lang === 'mermaid') {
    return `<pre class="mermaid" data-line="${line}">${esc(token.content)}</pre>\n`;
  }
  const code = options.highlight(token.content, lang);
  return `<div class="code-block" data-line="${line}">` +
    `<div class="code-head"><span class="code-lang">${esc(lang)}</span>` +
    `<button class="copy-code" type="button">Copy</button></div>` +
    `<pre><code class="hljs${lang ? ' language-' + esc(lang) : ''}">${code}</code></pre></div>\n`;
}

// ---------- Plugins ----------

// Put data-line="<source line>" on block elements, so the editor and preview can scroll together.
function sourceLines(mdi) {
  mdi.core.ruler.push('source_lines', (state) => {
    for (const token of state.tokens) {
      if (token.map && token.block && token.nesting >= 0) {
        token.attrSet('data-line', String(token.map[0]));
      }
    }
  });
}

// Give every heading an id and collect them for the outline.
function headingIds(mdi) {
  mdi.core.ruler.push('heading_ids', (state) => {
    const used = {};
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type !== 'heading_open') continue;
      const inline = tokens[i + 1];
      const text = inline.children
        .filter((t) => t.type === 'text' || t.type === 'code_inline' || t.type === 'wikilink')
        .map((t) => (t.type === 'wikilink' ? wikiLabel(t.meta) : t.content))
        .join('')
        .trim();
      let id = slugify(text) || 'section';
      if (used[id]) id += '-' + ++used[id];
      else used[id] = 1;
      tokens[i].attrSet('id', id);
      state.env.headings.push({
        level: Number(tokens[i].tag.slice(1)),
        text,
        id,
        line: tokens[i].map[0],
      });
    }
  });
}

// [[Note]], [[Note|alias]], [[#Heading]], ![[embed]] — styled like the wiki.
// There is no note library here, so only same-document [[#Heading]] links are clickable.
function wikilinks(mdi) {
  mdi.inline.ruler.before('link', 'wikilink', (state, silent) => {
    const src = state.src;
    const embed = src.charCodeAt(state.pos) === 0x21; // "!"
    const start = embed ? state.pos + 1 : state.pos;
    if (!src.startsWith('[[', start)) return false;
    const end = src.indexOf(']]', start + 2);
    if (end < 0) return false;
    const inner = src.slice(start + 2, end);
    if (!inner.trim() || /[\n[\]]/.test(inner)) return false;
    if (!silent) {
      const [target, alias] = inner.split('|');
      const token = state.push('wikilink', '', 0);
      token.meta = { target: target.trim(), alias: alias && alias.trim(), embed };
    }
    state.pos = end + 2;
    return true;
  });

  mdi.renderer.rules.wikilink = (tokens, idx) => {
    const { target, embed } = tokens[idx].meta;
    const label = md.utils.escapeHtml(wikiLabel(tokens[idx].meta));
    const title = md.utils.escapeHtml(target);
    if (target.startsWith('#') && !embed) {
      return `<a class="wikilink" href="#${slugify(target.slice(1))}">${label}</a>`;
    }
    return `<span class="wikilink${embed ? ' embed' : ''}" title="${title}">${label}</span>`;
  };
}

function wikiLabel({ target, alias }) {
  if (alias) return alias;
  return target.replace(/^#/, '').replace(/#/g, ' › ');
}

// Obsidian-style callouts:  > [!tip] Optional title   (add + or - after ] to make it foldable)
const CALLOUT_KIND = {
  note: 'note', info: 'note', todo: 'note', abstract: 'note', summary: 'note', tldr: 'note',
  tip: 'tip', hint: 'tip', important: 'tip', success: 'tip', check: 'tip', done: 'tip',
  warning: 'warning', caution: 'warning', attention: 'warning',
  danger: 'danger', error: 'danger', bug: 'danger', failure: 'danger', fail: 'danger', missing: 'danger',
  question: 'question', help: 'question', faq: 'question', example: 'question',
  quote: 'quote', cite: 'quote',
};

function callouts(mdi) {
  mdi.core.ruler.after('inline', 'callouts', (state) => {
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length; i++) {
      const open = tokens[i];
      if (open.type !== 'blockquote_open') continue;
      const inline = tokens[i + 2];
      if (tokens[i + 1]?.type !== 'paragraph_open' || inline?.type !== 'inline') continue;
      const m = inline.content.match(/^\[!([\w-]+)\]([+-]?)[ \t]*(.*)/);
      if (!m) continue;

      const meta = { type: m[1].toLowerCase(), fold: m[2], title: m[3].trim() };
      open.meta = meta;
      // the matching close is the next blockquote_close on the same nesting level
      const close = tokens.slice(i + 1).find((t) => t.type === 'blockquote_close' && t.level === open.level);
      close.meta = meta;

      // remove the "[!type] title" line from the first paragraph
      const br = inline.children.findIndex((t) => t.type === 'softbreak' || t.type === 'hardbreak');
      if (br === -1) tokens.splice(i + 1, 3); // the paragraph was only the marker line
      else inline.children = inline.children.slice(br + 1);
    }
  });

  mdi.renderer.rules.blockquote_open = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    if (!token.meta) return self.renderToken(tokens, idx, options);
    const { type, fold, title } = token.meta;
    const kind = CALLOUT_KIND[type] || 'note';
    const label = title ? md.renderInline(title) : type.charAt(0).toUpperCase() + type.slice(1);
    const line = token.map ? ` data-line="${token.map[0]}"` : '';
    if (fold) {
      return `<details class="callout callout-${kind}"${line}${fold === '+' ? ' open' : ''}>` +
        `<summary class="callout-title">${label}</summary><div class="callout-body">`;
    }
    return `<div class="callout callout-${kind}"${line}><div class="callout-title">${label}</div><div class="callout-body">`;
  };

  mdi.renderer.rules.blockquote_close = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    if (!token.meta) return self.renderToken(tokens, idx, options);
    return token.meta.fold ? '</div></details>' : '</div></div>';
  };
}

// ---------- Front matter ----------

// Split "---\nkey: value\n---" off the top. The body keeps blank lines in its place,
// so source line numbers (used for scroll sync and outline jumps) stay correct.
function splitFrontmatter(text) {
  const m = text.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/);
  if (!m) return { frontmatter: null, body: text };
  const lines = m[0].split('\n').length - 1;
  return { frontmatter: m[1], body: '\n'.repeat(lines) + text.slice(m[0].length) };
}

// A light reading of simple YAML: "key: value" lines, "- item" lists, and [a, b] arrays.
function renderFrontmatter(yaml) {
  const rows = [];
  for (const raw of yaml.split(/\r?\n/)) {
    const item = raw.match(/^\s+-\s+(.*)$/);
    const pair = raw.match(/^([^\s#][^:]*):\s*(.*)$/);
    if (item && rows.length) rows[rows.length - 1].values.push(unquote(item[1]));
    else if (pair) {
      const value = pair[2].trim();
      const values = /^\[.*\]$/.test(value)
        ? value.slice(1, -1).split(',').map((v) => unquote(v.trim())).filter(Boolean)
        : value ? [unquote(value)] : [];
      rows.push({ key: pair[1].trim(), values });
    }
  }
  const esc = md.utils.escapeHtml;
  const body = rows
    .map((r) => `<tr><th>${esc(r.key)}</th><td>${r.values.map(esc).join(', ')}</td></tr>`)
    .join('');
  return `<details class="frontmatter" data-line="0"><summary>Properties</summary><table>${body}</table></details>\n`;
}

function unquote(s) {
  return s.replace(/^(["'])(.*)\1$/, '$2');
}

// ---------- Mermaid (loaded only when needed) ----------

let mermaidLoading = null;
let mermaidTheme = null;
let diagramCount = 0;
const diagramCache = new Map(); // "theme|source" → svg, so typing doesn't redraw every diagram

function loadMermaid() {
  if (!mermaidLoading) {
    mermaidLoading = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'vendor/mermaid/mermaid.min.js';
      script.onload = () => resolve(window.mermaid);
      script.onerror = () => reject(new Error('Could not load Mermaid'));
      document.head.appendChild(script);
    });
  }
  return mermaidLoading;
}

/** Draw every ```mermaid block inside `container`. `dark` picks the diagram theme. */
export async function renderDiagrams(container, dark) {
  const blocks = [...container.querySelectorAll('pre.mermaid:not(.rendered)')];
  if (!blocks.length) return;
  const theme = dark ? 'dark' : 'default';

  // fast path: diagrams we have already drawn
  const todo = [];
  for (const block of blocks) {
    const key = theme + '|' + block.textContent;
    if (diagramCache.has(key)) showDiagram(block, diagramCache.get(key));
    else todo.push({ block, key, source: block.textContent });
  }
  if (!todo.length) return;

  const mermaid = await loadMermaid();
  if (mermaidTheme !== theme) {
    // a concrete font, so labels are measured and drawn in the same one (no clipped text)
    const fontFamily = getComputedStyle(document.body).fontFamily;
    mermaid.initialize({ startOnLoad: false, theme, securityLevel: 'strict', fontFamily });
    mermaidTheme = theme;
  }
  for (const { block, key, source } of todo) {
    try {
      const { svg } = await mermaid.render('mermaid-' + ++diagramCount, source);
      diagramCache.set(key, svg);
      if (block.isConnected) showDiagram(block, svg);
    } catch (err) {
      block.classList.add('rendered');
      block.innerHTML = `<div class="mermaid-error">Mermaid: ${md.utils.escapeHtml(err.message || String(err))}</div>`;
    }
  }
}

function showDiagram(block, svg) {
  block.innerHTML = svg;
  block.classList.add('rendered');
}
