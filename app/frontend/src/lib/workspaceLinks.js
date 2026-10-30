/** Collapse `/./` and `/../` (e.g. `/Shared/../demos/x` → `/demos/x`). Leaves `/Volumes/` unchanged. */
export function normalizeDatabricksFsPath(p) {
  if (p == null || typeof p !== 'string') return '';
  const t = p.trim().replace(/\/+/g, '/');
  if (!t) return '';
  if (t.startsWith('/Volumes/')) return t.replace(/\/+$/, '') || t;
  if (!t.startsWith('/')) return t;
  const segments = t.split('/').filter(Boolean);
  const stack = [];
  for (const seg of segments) {
    if (seg === '.') continue;
    if (seg === '..') {
      if (stack.length) stack.pop();
    } else stack.push(seg);
  }
  return stack.length ? `/${stack.join('/')}` : '/';
}

/** The folder a session writes to: `generation_path` (a relative one resolved from the agent notebook's folder) plus the sanitized business name. */
export function generationFolder({ generationPath, notebookPath, businessName }) {
  const gp = String(generationPath || '').trim();
  if (!gp) return '';
  const nb = normalizeDatabricksFsPath(notebookPath || '');
  const nbJoin = nb && !nb.startsWith('/Volumes/') && nb.startsWith('/') && !nb.startsWith('/Workspace') ? `/Workspace${nb}` : nb;
  const notebookDir = nbJoin.includes('/') ? nbJoin.replace(/\/[^/]+$/, '') : '';
  const root = gp.startsWith('/') || !notebookDir
    ? normalizeDatabricksFsPath(gp)
    : normalizeDatabricksFsPath(`${notebookDir}/${gp.replace(/^\.\/+/, '')}`);
  const name = businessName
    ? String(businessName).toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || '_'
    : '';
  return name && root ? normalizeDatabricksFsPath(`${root.replace(/\/+$/, '')}/${name}`) : root;
}

export function sharedFolderWarning(folder) {
  const path = workspaceWebUiHashPath(folder);
  if (!/^\/Workspace\/Shared(\/|$)/.test(path)) return '';
  return `Inspire saves this MVP under ${path.replace(/\/+$/, '')}_implemented. Everyone in the workspace can edit, republish and delete `
    + 'what is saved under /Shared, though each person sees its data only with their own access. To keep it to yourself, run Discover '
    + 'again with a generation path under your own user folder.';
}

/** `#workspace` deep-link segment — UI expects `/Workspace/...` on current control planes. */
export function workspaceWebUiHashPath(fsPath) {
  const n = normalizeDatabricksFsPath(fsPath);
  if (!n || n.startsWith('/Volumes/')) return n;
  if (n.startsWith('/Workspace')) return n;
  return `/Workspace${n}`;
}

export function workspaceNotebookUrl(databricksHost, notebookPath) {
  if (!notebookPath || !databricksHost) return '';
  const base = databricksHost.replace(/\/+$/, '').replace(/^http:\/\//i, 'https://');
  const origin = base.startsWith('http') ? base : `https://${base}`;
  const path = workspaceWebUiHashPath(notebookPath);
  const pathSeg = path.startsWith('/') ? path : `/${path}`;
  return `${origin}/#workspace${pathSeg}`;
}
