// outline.js — the heading tree in the left sidebar.

const collapsed = new Set(); // ids of collapsed branches, kept across re-renders
let rows = new Map();        // heading id → its .outline-row element
let activeId = null;

/**
 * Draw the outline for `headings` ([{ level, text, id, line }]).
 * `onJump(heading)` is called when a heading is clicked.
 */
export function renderOutline(container, headings, onJump) {
  rows = new Map();
  activeId = null;
  container.textContent = '';
  if (!headings.length) {
    container.innerHTML = '<div class="outline-empty">Headings will appear here.</div>';
    return;
  }
  container.appendChild(buildList(nest(headings), onJump));
}

/** Highlight the heading the reader is currently in. */
export function setActiveHeading(id) {
  if (id === activeId) return;
  rows.get(activeId)?.classList.remove('active');
  activeId = id;
  const row = rows.get(id);
  if (!row) return;
  row.classList.add('active');

  // keep the active row visible inside the outline (without scrolling anything else)
  const box = row.closest('.outline-tree');
  const r = row.getBoundingClientRect();
  const b = box.getBoundingClientRect();
  if (r.top < b.top) box.scrollTop -= b.top - r.top + 8;
  else if (r.bottom > b.bottom) box.scrollTop += r.bottom - b.bottom + 8;
}

// Turn the flat heading list into a tree: an H3 after an H2 becomes its child.
function nest(headings) {
  const root = { level: 0, children: [] };
  const stack = [root];
  for (const h of headings) {
    const node = { ...h, children: [] };
    while (stack[stack.length - 1].level >= h.level) stack.pop();
    stack[stack.length - 1].children.push(node);
    stack.push(node);
  }
  return root.children;
}

function buildList(nodes, onJump) {
  const ul = document.createElement('ul');
  for (const node of nodes) {
    const li = document.createElement('li');
    if (collapsed.has(node.id)) li.classList.add('collapsed');

    const row = document.createElement('div');
    row.className = 'outline-row';

    const caret = document.createElement('button');
    caret.className = 'outline-caret';
    caret.innerHTML = '<svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>';
    if (node.children.length) {
      caret.title = 'Collapse / expand';
      caret.addEventListener('click', () => {
        li.classList.toggle('collapsed');
        if (li.classList.contains('collapsed')) collapsed.add(node.id);
        else collapsed.delete(node.id);
      });
    } else {
      caret.classList.add('empty');
      caret.tabIndex = -1;
    }

    const link = document.createElement('button');
    link.className = 'outline-link level-' + node.level;
    link.textContent = node.text || '(untitled)';
    link.title = node.text;
    link.addEventListener('click', () => onJump(node));

    row.append(caret, link);
    li.appendChild(row);
    if (node.children.length) li.appendChild(buildList(node.children, onJump));
    ul.appendChild(li);
    rows.set(node.id, row);
  }
  return ul;
}
