// app.js — wires the editor, preview, outline and toolbar together.

import { renderMarkdown, renderDiagrams } from './render.js';
import { renderOutline, setActiveHeading } from './outline.js';
import { createScrollSync } from './scroll-sync.js';

const $ = (selector) => document.querySelector(selector);
const els = {
  main: $('#main'),
  name: $('#doc-name'),
  preview: $('#preview'),
  previewPane: $('#preview-pane'),
  outlineTree: $('#outline-tree'),
  stats: $('#stats'),
  fileInput: $('#file-input'),
  copyButton: $('#btn-copy'),
  copyMenu: $('#copy-menu'),
  drop: $('#drop-overlay'),
  toast: $('#toast'),
};
const narrow = matchMedia('(max-width: 800px)');
const systemDark = matchMedia('(prefers-color-scheme: dark)');

// ---------- Saved state (localStorage; everything still works if it's blocked) ----------

const store = {
  get(key, fallback) {
    try {
      const value = localStorage.getItem('md-viewer:' + key);
      return value === null ? fallback : JSON.parse(value);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem('md-viewer:' + key, JSON.stringify(value));
    } catch { /* private window or storage full: skip autosave */ }
  },
};

const state = {
  view: store.get('view', 'split'), // 'editor' | 'split' | 'preview'
  headings: [],
  headingEls: [],
  dirty: false,                     // changed since the last open / save / new
};

// ---------- Editor ----------

const cm = window.CodeMirror.fromTextArea($('#editor'), {
  mode: { name: 'yaml-frontmatter', base: { name: 'gfm', highlightFormatting: true } },
  lineWrapping: true,
  styleActiveLine: true,
  indentUnit: 2,
  tabSize: 2,
  indentWithTabs: false,
  extraKeys: {
    Enter: 'newlineAndIndentContinueMarkdownList',
    Tab: (editor) => editor.execCommand(editor.somethingSelected() ? 'indentMore' : 'insertSoftTab'),
    'Shift-Tab': 'indentLess',
  },
});

cm.on('changes', () => {
  state.dirty = true;
  scheduleRender();
  scheduleAutosave();
});

const sync = createScrollSync(cm, els.previewPane, () => currentView() === 'split');

// ---------- Rendering ----------

let renderTimer = 0;
function scheduleRender() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(render, 150);
}

/** Render the editor text into the preview and outline. Resolves once diagrams are drawn. */
function render() {
  clearTimeout(renderTimer);
  renderTimer = 0;
  const text = cm.getValue();
  const { html, headings } = renderMarkdown(text);

  els.preview.innerHTML = text.trim()
    ? html
    : '<p class="empty-hint">Start typing or paste text, or drop a .md file here.</p>';
  for (const a of els.preview.querySelectorAll('a[href^="http"]')) {
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
  }

  state.headings = headings;
  state.headingEls = headings.map((h) => els.preview.querySelector('#' + CSS.escape(h.id)));
  renderOutline(els.outlineTree, headings, jumpTo);
  updateStats(text);

  const diagrams = renderDiagrams(els.preview, isDark() && !printing)
    .catch((err) => toast(err.message))
    .then(() => sync.refresh());
  sync.refresh();
  updateActiveHeading();
  return diagrams;
}

function updateStats(text) {
  const words = (text.match(/\S+/g) || []).length;
  const minutes = Math.max(1, Math.round(words / 220));
  els.stats.textContent = words ? `${words.toLocaleString()} words · ${minutes} min read` : 'Empty document';
}

// ---------- Outline: jump to a heading, highlight the current one ----------

function jumpTo(heading) {
  sync.pause();
  const view = currentView();
  if (view !== 'preview') {
    cm.setCursor({ line: heading.line, ch: 0 });
    cm.scrollTo(null, cm.heightAtLine(heading.line, 'local'));
  }
  if (view !== 'editor') {
    const el = state.headingEls[state.headings.findIndex((h) => h.id === heading.id)];
    if (el) scrollPreviewTo(el);
  }
  document.body.classList.remove('outline-open');
  setActiveHeading(heading.id);
}

function scrollPreviewTo(el) {
  const pane = els.previewPane;
  pane.scrollTop += el.getBoundingClientRect().top - pane.getBoundingClientRect().top - 16;
}

let activeFrame = 0;
function updateActiveHeading() {
  cancelAnimationFrame(activeFrame);
  activeFrame = requestAnimationFrame(() => {
    if (!state.headings.length) return;
    let current = state.headings[0].id;
    if (currentView() === 'editor') {
      const line = cm.lineAtHeight(cm.getScrollInfo().top + 60, 'local');
      for (const h of state.headings) {
        if (h.line > line) break;
        current = h.id;
      }
    } else {
      const top = els.previewPane.getBoundingClientRect().top + 80;
      state.headingEls.forEach((el, i) => {
        if (el && el.getClientRects().length && el.getBoundingClientRect().top <= top) current = state.headings[i].id;
      });
    }
    setActiveHeading(current);
  });
}
cm.on('scroll', updateActiveHeading);
els.previewPane.addEventListener('scroll', updateActiveHeading, { passive: true });

// ---------- Views ----------

// On narrow screens there is no room for Split, so it shows the preview.
function currentView() {
  return state.view === 'split' && narrow.matches ? 'preview' : state.view;
}

function setView(view) {
  state.view = view;
  store.set('view', view);
  applyView();
}

function applyView() {
  const view = currentView();
  els.main.className = 'main view-' + view;
  for (const button of document.querySelectorAll('[data-view]')) {
    button.classList.toggle('active', button.dataset.view === view);
  }
  cm.refresh();
  sync.refresh();
  updateActiveHeading();
}

for (const button of document.querySelectorAll('[data-view]')) {
  button.addEventListener('click', () => setView(button.dataset.view));
}
narrow.addEventListener('change', applyView);

// ---------- Outline sidebar toggle ----------

if (store.get('outlineHidden', false)) document.body.classList.add('outline-hidden');

$('#btn-outline').addEventListener('click', () => {
  if (narrow.matches) {
    document.body.classList.toggle('outline-open'); // slide-in drawer on phones
  } else {
    store.set('outlineHidden', document.body.classList.toggle('outline-hidden'));
    cm.refresh();
  }
});
$('#outline-backdrop').addEventListener('click', () => document.body.classList.remove('outline-open'));

// ---------- Theme ----------

function isDark() {
  const theme = document.documentElement.dataset.theme;
  return theme ? theme === 'dark' : systemDark.matches;
}

const savedTheme = store.get('theme', null);
if (savedTheme) document.documentElement.dataset.theme = savedTheme;

$('#btn-theme').addEventListener('click', () => {
  const next = isDark() ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  store.set('theme', next);
  render(); // redraw diagrams in the new theme
});
systemDark.addEventListener('change', () => !document.documentElement.dataset.theme && render());

// ---------- Document: new, open, save, autosave ----------

function docName() {
  return (els.name.value.trim() || 'untitled').replace(/[\\/:*?"<>|]+/g, '-');
}

function updateTitle() {
  document.title = docName() + ' · md viewer';
}

function loadDocument(text, name) {
  els.name.value = name;
  cm.setValue(text);
  cm.clearHistory();
  cm.scrollTo(0, 0);
  els.previewPane.scrollTop = 0;
  state.dirty = false;
  updateTitle();
  render();
  autosave();
}

function confirmReplace() {
  if (!state.dirty || !cm.getValue().trim()) return true;
  return confirm('Replace the current document?\n\nIt has changes you haven\'t saved as a file.');
}

async function openFile(file) {
  if (file.size > 10 * 1024 * 1024) {
    toast('That file is over 10 MB, too big to open here');
    return;
  }
  loadDocument(await file.text(), file.name.replace(/\.(md|markdown|mdown|txt)$/i, ''));
  toast('Opened ' + file.name);
}

function chooseFile() {
  if (confirmReplace()) els.fileInput.click();
}

function saveFile() {
  const blob = new Blob([cm.getValue()], { type: 'text/markdown;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = docName() + '.md';
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  state.dirty = false;
  autosave();
  toast('Downloaded ' + link.download);
}

let autosaveTimer = 0;
function scheduleAutosave() {
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(autosave, 400);
}
function autosave() {
  store.set('doc', { name: els.name.value, text: cm.getValue(), dirty: state.dirty });
}

$('#btn-new').addEventListener('click', () => {
  if (!confirmReplace()) return;
  loadDocument('', 'untitled');
  if (currentView() === 'preview') setView(narrow.matches ? 'editor' : 'split');
  cm.focus();
});
$('#btn-open').addEventListener('click', chooseFile);
$('#btn-save').addEventListener('click', saveFile);
els.fileInput.addEventListener('change', () => {
  const file = els.fileInput.files[0];
  els.fileInput.value = '';
  if (file) openFile(file);
});
els.name.addEventListener('input', () => {
  updateTitle();
  scheduleAutosave();
});
els.name.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    cm.focus();
  }
});

// Drag and drop a file anywhere on the page. Capture phase, so CodeMirror
// doesn't paste the file into the text instead.
let dragDepth = 0;
const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
window.addEventListener('dragenter', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  dragDepth++;
  els.drop.hidden = false;
}, true);
window.addEventListener('dragleave', (e) => {
  if (!hasFiles(e)) return;
  if (--dragDepth <= 0) {
    dragDepth = 0;
    els.drop.hidden = true;
  }
}, true);
window.addEventListener('dragover', (e) => hasFiles(e) && e.preventDefault(), true);
window.addEventListener('drop', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  e.stopPropagation();
  dragDepth = 0;
  els.drop.hidden = true;
  const file = e.dataTransfer.files[0];
  if (file && confirmReplace()) openFile(file);
}, true);

// ---------- Copy ----------

// Plain text to the clipboard. The async clipboard API only exists on https/localhost,
// so on the LAN address it falls back to the classic copy command.
async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.style.cssText = 'position:fixed; top:0; left:0; opacity:0';
  document.body.appendChild(area);
  area.select();
  const ok = document.execCommand('copy');
  area.remove();
  if (!ok) throw new Error('copy blocked');
}

// The rendered document without the app's own bits (copy buttons, properties box).
function cleanPreview() {
  const clone = els.preview.cloneNode(true);
  clone.querySelectorAll('.code-head, .frontmatter, .empty-hint').forEach((el) => el.remove());
  clone.querySelectorAll('[data-line]').forEach((el) => el.removeAttribute('data-line'));
  return clone;
}

// Rich text: select a light-themed copy of the preview off-screen and copy it, so it
// pastes with its formatting into email, Docs, Notes…
function copyRich() {
  const box = document.createElement('div');
  box.className = 'markdown-body force-light';
  box.style.cssText = 'position:fixed; left:-10000px; top:0; width:800px; padding:0';
  box.append(...cleanPreview().childNodes);
  document.body.appendChild(box);
  const range = document.createRange();
  range.selectNodeContents(box);
  const selection = getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  const ok = document.execCommand('copy');
  selection.removeAllRanges();
  box.remove();
  if (!ok) throw new Error('copy blocked');
}

async function copyAs(kind) {
  try {
    if (kind === 'markdown') await copyText(cm.getValue());
    if (kind === 'html') await copyText(cleanPreview().innerHTML.trim());
    if (kind === 'rich') copyRich();
    toast({ markdown: 'Markdown copied', html: 'HTML copied', rich: 'Rich text copied' }[kind]);
  } catch {
    toast('The browser blocked copying');
  }
}

function toggleCopyMenu(open = els.copyMenu.hidden) {
  els.copyMenu.hidden = !open;
  els.copyButton.setAttribute('aria-expanded', String(open));
}
els.copyButton.addEventListener('click', () => toggleCopyMenu());
for (const item of els.copyMenu.querySelectorAll('[data-copy]')) {
  item.addEventListener('click', () => {
    toggleCopyMenu(false);
    copyAs(item.dataset.copy);
  });
}
document.addEventListener('click', (e) => {
  if (!e.target.closest('.menu')) toggleCopyMenu(false);
});

// Clicks inside the preview: code-block copy buttons and in-page #links.
els.preview.addEventListener('click', async (e) => {
  const copyButton = e.target.closest('.copy-code');
  if (copyButton) {
    try {
      await copyText(copyButton.closest('.code-block').querySelector('pre').textContent);
      copyButton.textContent = 'Copied';
    } catch {
      copyButton.textContent = 'Blocked';
    }
    setTimeout(() => (copyButton.textContent = 'Copy'), 1200);
    return;
  }

  const link = e.target.closest('a[href^="#"]');
  if (link) {
    e.preventDefault();
    const id = decodeURIComponent(link.getAttribute('href').slice(1));
    const heading = state.headings.find((h) => h.id === id);
    if (heading) jumpTo(heading);
    else {
      const target = els.preview.querySelector('#' + CSS.escape(id));
      if (target) scrollPreviewTo(target);
    }
  }
});

// ---------- PDF export (print → Save as PDF) ----------

let titleBeforePrint = '';
let closedDetails = [];
let printing = false; // while true, diagrams are drawn in light colors for paper

window.addEventListener('beforeprint', () => {
  if (renderTimer) render(); // include the last few keystrokes
  titleBeforePrint = document.title;
  document.title = docName(); // becomes the PDF's default file name
  closedDetails = [...els.preview.querySelectorAll('details.callout:not([open])')];
  closedDetails.forEach((d) => (d.open = true)); // print folded callouts in full
});
window.addEventListener('afterprint', () => {
  document.title = titleBeforePrint;
  closedDetails.forEach((d) => (d.open = false));
  closedDetails = [];
  if (printing) {
    printing = false;
    if (isDark()) render(); // back to dark diagrams
  }
});

async function exportPdf() {
  printing = true;
  await render(); // wait for the (light) diagrams, so they're in the PDF
  window.print();
}
$('#btn-pdf').addEventListener('click', exportPdf);

// ---------- Keyboard shortcuts & toast ----------

document.addEventListener('keydown', (e) => {
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key.toLowerCase() === 's') {
    e.preventDefault();
    saveFile();
  } else if (mod && e.key.toLowerCase() === 'o') {
    e.preventDefault();
    chooseFile();
  } else if (mod && e.key.toLowerCase() === 'p') {
    e.preventDefault();
    exportPdf();
  } else if (e.key === 'Escape') {
    toggleCopyMenu(false);
    document.body.classList.remove('outline-open');
  }
});

let toastTimer = 0;
function toast(message) {
  els.toast.textContent = message;
  els.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2000);
}

// ---------- Start ----------

async function start() {
  applyView();
  const saved = store.get('doc', null);
  if (saved) {
    els.name.value = saved.name;
    cm.setValue(saved.text);
    cm.clearHistory();
    state.dirty = saved.dirty;
    updateTitle();
    render();
    return;
  }
  // first visit: show the feature tour
  let demo = '';
  try {
    const response = await fetch('demo.md');
    if (response.ok) demo = await response.text();
  } catch { /* offline: start empty */ }
  loadDocument(demo, demo ? 'demo' : 'untitled');
}
start();
