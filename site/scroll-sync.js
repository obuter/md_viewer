// scroll-sync.js — keep the editor and the preview at the same place in Split view.
//
// Every rendered block has data-line="<source line>" (see render.js). To sync, the
// editor's top line is turned into a preview position, or back, by interpolating
// between the two nearest blocks. Only the pane the user is touching drives the other.

export function createScrollSync(cm, previewPane, isActive) {
  let source = null; // 'editor' | 'preview'
  let frame = 0;

  const editorEl = cm.getWrapperElement();
  for (const type of ['mouseenter', 'touchstart', 'focusin', 'wheel']) {
    editorEl.addEventListener(type, () => (source = 'editor'), { passive: true });
    previewPane.addEventListener(type, () => (source = 'preview'), { passive: true });
  }

  cm.on('scroll', () => source === 'editor' && schedule(previewFromEditor));
  previewPane.addEventListener('scroll', () => source === 'preview' && schedule(editorFromPreview));

  function schedule(fn) {
    if (!isActive()) return;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(fn);
  }

  // [{ line, y }] for each block in source order; y is its offset inside the preview.
  function blocks() {
    const origin = previewPane.getBoundingClientRect().top - previewPane.scrollTop;
    const list = [];
    let last = { line: -1, y: -1 };
    for (const el of previewPane.querySelectorAll('[data-line]')) {
      const line = Number(el.dataset.line);
      const y = el.getBoundingClientRect().top - origin;
      // skip nested blocks that repeat a line, and hidden ones (inside closed <details>)
      if (line <= last.line || y < last.y || !el.getClientRects().length) continue;
      last = { line, y };
      list.push(last);
    }
    return list;
  }

  function atBottom(top, visible, total) {
    return top > 0 && top + visible >= total - 4;
  }

  // the editor's line at height y, with a fraction for how far into that line we are
  function editorLineAt(y) {
    const line = cm.lineAtHeight(y, 'local');
    const top = cm.heightAtLine(line, 'local');
    const next = cm.heightAtLine(line + 1, 'local');
    return line + Math.min(1, Math.max(0, (y - top) / Math.max(1, next - top)));
  }

  function editorHeightOf(fractionalLine) {
    const line = Math.floor(fractionalLine);
    const top = cm.heightAtLine(line, 'local');
    const next = cm.heightAtLine(line + 1, 'local');
    return top + (next - top) * (fractionalLine - line);
  }

  function previewFromEditor() {
    const info = cm.getScrollInfo();
    if (info.top <= 0) {
      previewPane.scrollTop = 0;
      return;
    }
    if (atBottom(info.top, info.clientHeight, info.height)) {
      previewPane.scrollTop = previewPane.scrollHeight;
      return;
    }
    const line = editorLineAt(info.top);
    let a = { line: 0, y: 0 };
    let b = { line: cm.lineCount(), y: previewPane.scrollHeight - previewPane.clientHeight };
    for (const block of blocks()) {
      if (block.line <= line) a = block;
      else { b = block; break; }
    }
    previewPane.scrollTop = a.y + ((b.y - a.y) * (line - a.line)) / Math.max(1, b.line - a.line);
  }

  function editorFromPreview() {
    const y = previewPane.scrollTop;
    const info = cm.getScrollInfo();
    if (y <= 0) {
      cm.scrollTo(null, 0);
      return;
    }
    if (atBottom(y, previewPane.clientHeight, previewPane.scrollHeight)) {
      cm.scrollTo(null, info.height);
      return;
    }
    let a = { line: 0, y: 0 };
    let b = { line: cm.lineCount(), y: previewPane.scrollHeight - previewPane.clientHeight };
    for (const block of blocks()) {
      if (block.y <= y) a = block;
      else { b = block; break; }
    }
    const line = a.line + ((b.line - a.line) * (y - a.y)) / Math.max(1, b.y - a.y);
    cm.scrollTo(null, editorHeightOf(Math.min(line, cm.lineCount() - 1)));
  }

  return {
    /** Re-align the preview after it was re-rendered (it follows the editor while typing). */
    refresh() {
      if (isActive() && source !== 'preview') previewFromEditor();
    },
    /** Stop syncing until the user touches a pane again (used for outline jumps). */
    pause() {
      source = null;
    },
  };
}
