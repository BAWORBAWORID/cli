/* ═══════════════════════════════════════════════════════════
   app.js — Terminal + File Manager
═══════════════════════════════════════════════════════════ */

/* ── Tab routing ─────────────────────────────────────────── */
const navItems = document.querySelectorAll('.nav-item[data-tab]');
const currentTabLabel = document.getElementById('currentTabLabel');

navItems.forEach(item => {
  item.addEventListener('click', e => {
    e.preventDefault();
    const tab = item.dataset.tab;
    navItems.forEach(n => n.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    item.classList.add('active');
    document.getElementById('tab-' + tab)?.classList.add('active');
    currentTabLabel.textContent = item.textContent.trim();
    if (tab === 'console') { setTimeout(() => { fitAddon?.fit(); term?.focus(); }, 50); }
    if (tab === 'files')   { fm.load(fm.cwd); }
    if (tab === 'settings') { loadSystemInfo(); }
  });
});

// Sidebar mobile toggle
const sidebarEl = document.getElementById('sidebar');
document.getElementById('sidebarToggle').addEventListener('click', () => sidebarEl.classList.toggle('open'));
document.addEventListener('click', e => {
  if (!sidebarEl.contains(e.target) && !document.getElementById('sidebarToggle').contains(e.target))
    sidebarEl.classList.remove('open');
});

/* ── Toast ───────────────────────────────────────────────── */
const toastEl = document.getElementById('toast');
let toastTimer = null;
function toast(msg, type = 'ok') {
  toastEl.textContent  = msg;
  toastEl.className    = `toast show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.className = 'toast'; }, 3000);
}

/* ── Modal ───────────────────────────────────────────────── */
const modalBackdrop = document.getElementById('modalBackdrop');
const modalTitle    = document.getElementById('modalTitle');
const modalBody     = document.getElementById('modalBody');
const modalFooter   = document.getElementById('modalFooter');

document.getElementById('modalClose').addEventListener('click', closeModal);
modalBackdrop.addEventListener('click', e => { if (e.target === modalBackdrop) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

function openModal(title, bodyHTML, footerHTML) {
  modalTitle.textContent = title;
  modalBody.innerHTML    = bodyHTML;
  modalFooter.innerHTML  = footerHTML;
  modalBackdrop.classList.add('open');
}
function closeModal() { modalBackdrop.classList.remove('open'); }

/* ═══════════════════════════════════════════════════════════
   TERMINAL
═══════════════════════════════════════════════════════════ */
const term = new Terminal({
  theme: {
    background: '#0d1117', foreground: '#c9d1d9', cursor: '#58a6ff',
    selection: 'rgba(88,166,255,0.3)',
    black: '#484f58', red: '#ff7b72', green: '#3fb950',
    yellow: '#d29922', blue: '#58a6ff', magenta: '#bc8cff',
    cyan: '#39c5cf', white: '#b1bac4',
    brightBlack: '#6e7681', brightRed: '#ffa198', brightGreen: '#56d364',
    brightYellow: '#e3b341', brightBlue: '#79c0ff',
    brightMagenta: '#d2a8ff', brightCyan: '#56d4dd', brightWhite: '#f0f6fc',
  },
  fontFamily: "'JetBrains Mono','Fira Code','Consolas',monospace",
  fontSize: 13,
  lineHeight: 1.45,
  cursorBlink: true,
  convertEol: true,
  scrollback: 10000,
  allowTransparency: true,
});

const fitAddon = new FitAddon.FitAddon();
term.loadAddon(fitAddon);
term.open(document.getElementById('terminal'));
fitAddon.fit();
term.focus();

// Auto-fit on resize
const resizeObs = new ResizeObserver(() => { try { fitAddon.fit(); } catch {} });
resizeObs.observe(document.getElementById('terminal'));

/* ── WebSocket ───────────────────────────────────────────── */
const proto = location.protocol === 'https:' ? 'wss' : 'ws';
let ws = null, wsReady = false;

const statusDot  = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
function setStatus(s) {
  statusDot.className = 'status-dot ' + s;
  statusText.textContent = s === 'online' ? 'Running' : s === 'offline' ? 'Offline' : 'Connecting...';
}

function connect() {
  ws = new WebSocket(`${proto}://${location.host}`);
  setStatus('connecting');

  ws.onopen = () => {
    const { cols, rows } = term;
    ws.send(JSON.stringify({ type: 'create', cols, rows }));
  };

  ws.onmessage = ({ data }) => {
    try {
      const msg = JSON.parse(data);
      if (msg.type === 'ready') {
        wsReady = true;
        setStatus('online');
        term.writeln('\x1b[1;32m Connected — full interactive shell ready \x1b[0m\r\n');
      } else if (msg.type === 'output') {
        term.write(msg.data);
      } else if (msg.type === 'exit') {
        wsReady = false;
        setStatus('offline');
        term.writeln('\r\n\x1b[1;31m Session ended. Reconnecting in 3s...\x1b[0m');
        setTimeout(connect, 3000);
      }
    } catch {}
  };

  ws.onclose = () => { wsReady = false; setStatus('offline'); setTimeout(connect, 3000); };
  ws.onerror = () => ws.close();
}
connect();

// xterm keyboard → PTY (full interactive)
term.onData(data => {
  if (wsReady && ws?.readyState === WebSocket.OPEN)
    ws.send(JSON.stringify({ type: 'input', data }));
});

// Notify resize
term.onResize(({ cols, rows }) => {
  if (wsReady && ws?.readyState === WebSocket.OPEN)
    ws.send(JSON.stringify({ type: 'resize', cols, rows }));
});

/* ── Command input bar ────────────────────────────────────── */
const cmdInput = document.getElementById('cmdInput');
document.getElementById('btnSend').addEventListener('click', sendCmd);
cmdInput.addEventListener('keydown', e => { if (e.key === 'Enter') sendCmd(); });
function sendCmd() {
  const v = cmdInput.value;
  if (!v.trim()) return;
  if (wsReady && ws?.readyState === WebSocket.OPEN)
    ws.send(JSON.stringify({ type: 'input', data: v + '\n' }));
  cmdInput.value = '';
  term.focus();
}

/* Console buttons */
document.getElementById('btnClear').addEventListener('click', () => term.clear());
document.getElementById('btnFullscreen').addEventListener('click', () => {
  document.body.classList.toggle('fs-console');
  setTimeout(() => fitAddon.fit(), 50);
});
document.getElementById('btnStart').addEventListener('click', () => {
  if (wsReady) ws.send(JSON.stringify({ type: 'input', data: '# start\n' }));
});
document.getElementById('btnStop').addEventListener('click', () => {
  if (wsReady) ws.send(JSON.stringify({ type: 'input', data: 'exit\n' }));
});
document.getElementById('btnRestart').addEventListener('click', () => {
  if (wsReady) { ws.send(JSON.stringify({ type: 'input', data: 'exit\n' })); setTimeout(connect, 400); }
});

/* Fake stats */
function updateStats() {
  const cpu  = Math.floor(Math.random() * 60) + 5;
  const mem  = Math.floor(Math.random() * 70) + 20;
  const disk = Math.floor(Math.random() * 40) + 10;
  document.getElementById('cpuVal').textContent  = cpu  + '%';
  document.getElementById('memVal').textContent  = mem  + '%';
  document.getElementById('diskVal').textContent = disk + '%';
  document.getElementById('netVal').textContent  =
    (Math.random()*10).toFixed(1)+' MB/s / '+(Math.random()*5).toFixed(1)+' MB/s';
  document.getElementById('cpuBar').style.width  = cpu  + '%';
  document.getElementById('memBar').style.width  = mem  + '%';
  document.getElementById('diskBar').style.width = disk + '%';
}
updateStats();
setInterval(updateStats, 4000);

/* ═══════════════════════════════════════════════════════════
   FILE MANAGER
═══════════════════════════════════════════════════════════ */
const fm = {
  cwd: '',          // relative path from FILES_ROOT

  /* ── Load directory ─────────────────────────────────────── */
  async load(rel) {
    this.cwd = rel || '';
    const listEl = document.getElementById('fmList');
    listEl.innerHTML = '<div class="fm-loading">Loading...</div>';
    this.renderBreadcrumb();

    try {
      const res  = await fetch('/api/files?path=' + encodeURIComponent(this.cwd));
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      this.renderList(data.items);
    } catch (err) {
      listEl.innerHTML = `<div class="fm-empty">Error: ${err.message}</div>`;
      toast(err.message, 'err');
    }
  },

  /* ── Render breadcrumb ───────────────────────────────────── */
  renderBreadcrumb() {
    const el   = document.getElementById('fmBreadcrumb');
    const parts = this.cwd ? this.cwd.split('/').filter(Boolean) : [];
    let html = `<span class="fm-bc-seg" data-path="">root</span>`;
    let built = '';
    for (const p of parts) {
      built += (built ? '/' : '') + p;
      const s = built;
      html += `<span class="fm-bc-sep">/</span><span class="fm-bc-seg" data-path="${s}">${p}</span>`;
    }
    el.innerHTML = html;
    el.querySelectorAll('.fm-bc-seg').forEach(seg => {
      seg.addEventListener('click', () => this.load(seg.dataset.path));
    });
  },

  /* ── Render file list ───────────────────────────────────── */
  renderList(items) {
    const el = document.getElementById('fmList');
    if (!items.length) { el.innerHTML = '<div class="fm-empty">This directory is empty.</div>'; return; }

    el.innerHTML = items.map(item => {
      const icon = item.type === 'dir' ? this.iconFolder() : this.iconFile(item.name);
      const size = item.type === 'dir' ? '—' : this.formatSize(item.size);
      const date = item.mtime ? new Date(item.mtime).toLocaleString() : '—';
      const p    = encodeURIComponent(item.path);
      const nameEl = item.type === 'dir'
        ? `<span class="name-label" onclick="fm.load('${item.path}')">${item.name}</span>`
        : `<span class="name-label">${item.name}</span>`;

      const actions = item.type === 'dir'
        ? `<button class="fm-action" title="Open"     onclick="fm.load('${item.path}')">
             ${this.iconOpen()}
           </button>
           <button class="fm-action" title="Rename"   onclick="fm.rename('${item.path}','${item.name}')">
             ${this.iconRename()}
           </button>
           <button class="fm-action del" title="Delete" onclick="fm.confirmDelete('${item.path}','${item.name}',true)">
             ${this.iconDelete()}
           </button>`
        : `<button class="fm-action" title="View"     onclick="fm.viewFile('${item.path}','${item.name}')">
             ${this.iconView()}
           </button>
           <button class="fm-action" title="Edit"     onclick="fm.editFile('${item.path}','${item.name}')">
             ${this.iconEdit()}
           </button>
           <button class="fm-action" title="Rename"   onclick="fm.rename('${item.path}','${item.name}')">
             ${this.iconRename()}
           </button>
           <button class="fm-action del" title="Delete" onclick="fm.confirmDelete('${item.path}','${item.name}',false)">
             ${this.iconDelete()}
           </button>`;

      return `<div class="fm-item ${item.type === 'dir' ? 'is-dir' : ''}">
        <div class="fm-item-name">${icon}${nameEl}</div>
        <div class="fm-item-size">${size}</div>
        <div class="fm-item-date">${date}</div>
        <div class="fm-item-actions">${actions}</div>
      </div>`;
    }).join('');
  },

  /* ── View file ──────────────────────────────────────────── */
  async viewFile(filePath, name) {
    try {
      const res  = await fetch('/api/files/read?path=' + encodeURIComponent(filePath));
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      openModal(
        '📄 ' + name,
        `<textarea class="modal-editor" readonly>${escHtml(data.content)}</textarea>`,
        `<button class="modal-btn modal-btn-cancel" onclick="closeModal()">Close</button>
         <button class="modal-btn modal-btn-ok" onclick="fm.editFile('${filePath}','${name}');closeModal()">Edit</button>`
      );
    } catch (err) { toast(err.message, 'err'); }
  },

  /* ── Edit file ──────────────────────────────────────────── */
  async editFile(filePath, name) {
    let content = '';
    try {
      const res  = await fetch('/api/files/read?path=' + encodeURIComponent(filePath));
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      content = data.content;
    } catch (err) { toast(err.message, 'err'); return; }

    openModal(
      '✏️ Edit — ' + name,
      `<textarea class="modal-editor" id="editorArea">${escHtml(content)}</textarea>`,
      `<button class="modal-btn modal-btn-cancel" onclick="closeModal()">Cancel</button>
       <button class="modal-btn modal-btn-save"   onclick="fm.saveFile('${filePath}')">Save</button>`
    );
  },

  /* ── Save file ──────────────────────────────────────────── */
  async saveFile(filePath) {
    const content = document.getElementById('editorArea')?.value ?? '';
    try {
      const res  = await fetch('/api/files/write', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath, content })
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      closeModal();
      toast('File saved.', 'ok');
    } catch (err) { toast(err.message, 'err'); }
  },

  /* ── New file modal ─────────────────────────────────────── */
  newFileModal() {
    openModal(
      '+ New File',
      `<label class="modal-label">File name</label>
       <input id="newFileName" class="modal-input" placeholder="e.g. config.json" autofocus />
       <br/><br/>
       <label class="modal-label">Content (optional)</label>
       <textarea class="modal-editor" id="newFileContent" style="min-height:200px"></textarea>`,
      `<button class="modal-btn modal-btn-cancel" onclick="closeModal()">Cancel</button>
       <button class="modal-btn modal-btn-ok"     onclick="fm.createFile()">Create</button>`
    );
    setTimeout(() => document.getElementById('newFileName')?.focus(), 50);
  },

  async createFile() {
    const name    = document.getElementById('newFileName')?.value.trim();
    const content = document.getElementById('newFileContent')?.value ?? '';
    if (!name) { toast('Enter a file name.', 'err'); return; }
    const filePath = this.cwd ? this.cwd + '/' + name : name;
    try {
      const res  = await fetch('/api/files/write', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath, content })
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      closeModal();
      toast('File created.', 'ok');
      this.load(this.cwd);
    } catch (err) { toast(err.message, 'err'); }
  },

  /* ── New folder modal ───────────────────────────────────── */
  newFolderModal() {
    openModal(
      '+ New Folder',
      `<label class="modal-label">Folder name</label>
       <input id="newFolderName" class="modal-input" placeholder="e.g. backups" autofocus />`,
      `<button class="modal-btn modal-btn-cancel" onclick="closeModal()">Cancel</button>
       <button class="modal-btn modal-btn-ok"     onclick="fm.createFolder()">Create</button>`
    );
    setTimeout(() => document.getElementById('newFolderName')?.focus(), 50);
  },

  async createFolder() {
    const name = document.getElementById('newFolderName')?.value.trim();
    if (!name) { toast('Enter a folder name.', 'err'); return; }
    const folderPath = this.cwd ? this.cwd + '/' + name : name;
    try {
      const res  = await fetch('/api/files/mkdir', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: folderPath })
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      closeModal();
      toast('Folder created.', 'ok');
      this.load(this.cwd);
    } catch (err) { toast(err.message, 'err'); }
  },

  /* ── Rename ─────────────────────────────────────────────── */
  rename(filePath, oldName) {
    openModal(
      '✏️ Rename',
      `<label class="modal-label">New name</label>
       <input id="renameInput" class="modal-input" value="${escHtml(oldName)}" autofocus />`,
      `<button class="modal-btn modal-btn-cancel" onclick="closeModal()">Cancel</button>
       <button class="modal-btn modal-btn-ok"     onclick="fm.doRename('${filePath}')">Rename</button>`
    );
    setTimeout(() => { const el = document.getElementById('renameInput'); el?.focus(); el?.select(); }, 50);
  },

  async doRename(oldPath) {
    const newName = document.getElementById('renameInput')?.value.trim();
    if (!newName) { toast('Enter a name.', 'err'); return; }
    const dir     = oldPath.includes('/') ? oldPath.substring(0, oldPath.lastIndexOf('/')) : '';
    const newPath = dir ? dir + '/' + newName : newName;
    try {
      const res  = await fetch('/api/files/rename', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: oldPath, to: newPath })
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      closeModal();
      toast('Renamed.', 'ok');
      this.load(this.cwd);
    } catch (err) { toast(err.message, 'err'); }
  },

  /* ── Delete confirm ─────────────────────────────────────── */
  confirmDelete(filePath, name, isDir) {
    openModal(
      '🗑 Delete',
      `<p class="modal-info">Are you sure you want to delete
        <strong>${escHtml(name)}</strong>${isDir ? ' and all its contents' : ''}?<br/>
        <span style="color:var(--red)">This cannot be undone.</span></p>`,
      `<button class="modal-btn modal-btn-cancel" onclick="closeModal()">Cancel</button>
       <button class="modal-btn modal-btn-delete" onclick="fm.doDelete('${filePath}')">Delete</button>`
    );
  },

  async doDelete(filePath) {
    try {
      const res  = await fetch('/api/files?path=' + encodeURIComponent(filePath), { method: 'DELETE' });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      closeModal();
      toast('Deleted.', 'ok');
      this.load(this.cwd);
    } catch (err) { toast(err.message, 'err'); }
  },

  /* ── Go up ──────────────────────────────────────────────── */
  goUp() {
    if (!this.cwd) return;
    const parts = this.cwd.split('/').filter(Boolean);
    parts.pop();
    this.load(parts.join('/'));
  },

  /* ── Helpers ────────────────────────────────────────────── */
  formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024, sizes = ['B','KB','MB','GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  },

  iconFolder()  { return `<svg viewBox="0 0 24 24" fill="none" stroke="#58a6ff" stroke-width="2" style="color:#58a6ff"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`; },
  iconFile(name) {
    const ext = (name.split('.').pop() || '').toLowerCase();
    const colors = { js:'#f7df1e', ts:'#3178c6', json:'#f39c12', py:'#3572a5', sh:'#4eaa25', md:'#8fa3bc', txt:'#8fa3bc', css:'#264de4', html:'#e34c26' };
    const c = colors[ext] || '#8fa3bc';
    return `<svg viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
  },
  iconOpen()   { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>`; },
  iconView()   { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`; },
  iconEdit()   { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`; },
  iconRename() { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>`; },
  iconDelete() { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>`; },
};

/* ── File Manager toolbar buttons ────────────────────────── */
document.getElementById('fmNewFile').addEventListener('click',    () => fm.newFileModal());
document.getElementById('fmNewFolder').addEventListener('click',  () => fm.newFolderModal());
document.getElementById('fmRefresh').addEventListener('click',    () => fm.load(fm.cwd));
document.getElementById('fmBack').addEventListener('click',       () => fm.goUp());

/* ── Upload ────────────────────────────────────────────────── */
const fmFileInput  = document.getElementById('fmFileInput');
const fmUploadBtn  = document.getElementById('fmUploadBtn');
const fmDropzone   = document.getElementById('fmDropzone');
const fmProgWrap   = document.getElementById('fmUploadProgress');
const fmProgBar    = document.getElementById('fmUploadProgressBar');
const fmProgText   = document.getElementById('fmUploadProgressText');

fmUploadBtn.addEventListener('click', () => fmFileInput.click());
fmFileInput.addEventListener('change', () => {
  if (fmFileInput.files.length) {
    uploadFiles(fmFileInput.files);
    fmFileInput.value = '';
  }
});

/* ── Drag & Drop ──────────────────────────────────────────── */
const fmWrapper = document.querySelector('.fm-wrapper');
let dragCounter = 0;

fmWrapper.addEventListener('dragenter', (e) => {
  e.preventDefault(); e.stopPropagation();
  dragCounter++;
  fmDropzone.classList.add('active');
});

fmWrapper.addEventListener('dragover', (e) => {
  e.preventDefault(); e.stopPropagation();
});

fmWrapper.addEventListener('dragleave', (e) => {
  e.preventDefault(); e.stopPropagation();
  dragCounter--;
  if (dragCounter <= 0) { dragCounter = 0; fmDropzone.classList.remove('active'); }
});

fmWrapper.addEventListener('drop', (e) => {
  e.preventDefault(); e.stopPropagation();
  dragCounter = 0;
  fmDropzone.classList.remove('active');
  const files = e.dataTransfer?.files;
  if (files?.length) uploadFiles(files);
});

/* ── Upload logic with progress ────────────────────────────── */
function uploadFiles(files) {
  const total = files.length;
  let done = 0;

  for (const file of files) {
    const formData = new FormData();
    formData.append('path', fm.cwd);
    formData.append('file', file);

    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (e) => {
      if (!e.lengthComputable) return;
      const pct = Math.round((e.loaded / e.total) * 100);
      fmProgWrap.classList.add('active');
      fmProgBar.style.setProperty('--prog', pct + '%');
      fmProgText.textContent = `Uploading ${file.name} (${pct}%)`;
    });

    xhr.addEventListener('load', () => {
      done++;
      try {
        const data = JSON.parse(xhr.responseText);
        if (data.ok) {
          toast(`Uploaded: ${data.name}`, 'ok');
        } else {
          toast(`Upload failed: ${data.error}`, 'err');
        }
      } catch {
        toast('Upload failed: parse error', 'err');
      }

      if (done >= total) {
        // All done — hide progress
        setTimeout(() => {
          fmProgWrap.classList.remove('active');
          fmProgBar.style.width = '0%';
        }, 1000);
        fm.load(fm.cwd);
      }
    });

    xhr.addEventListener('error', () => {
      done++;
      toast(`Upload failed: ${file.name}`, 'err');
      if (done >= total) {
        setTimeout(() => {
          fmProgWrap.classList.remove('active');
          fmProgBar.style.width = '0%';
        }, 1000);
      }
    });

    xhr.open('POST', '/api/files/upload');
    xhr.send(formData);
  }
}

/* ═══════════════════════════════════════════════════════════
   SYSTEM INFO (tab Settings)
═══════════════════════════════════════════════════════════ */

async function loadSystemInfo() {
  const grid  = document.getElementById('sysinfoGrid');
  const loading = document.getElementById('sysinfoLoading');
  loading.style.display = 'block';
  grid.style.display = 'none';

  try {
    const res  = await fetch('/api/system/info');
    const data = await res.json();
    if (!data.ok) throw new Error('Failed');

    // Overview
    document.getElementById('sysHostname').querySelector('.sys-value').textContent = data.hostname;
    document.getElementById('sysPlatform').querySelector('.sys-value').textContent =
      data.platform.charAt(0).toUpperCase() + data.platform.slice(1) + ' ' + data.release + ' (' + data.arch + ')';
    document.getElementById('sysUptime').querySelector('.sys-value').textContent = formatUptime(data.uptime);
    document.getElementById('sysUser').querySelector('.sys-value').textContent   = data.user;

    // CPU
    document.getElementById('sysCpuModel').querySelector('.sys-value').textContent = data.cpu.model;
    document.getElementById('sysCpuLoad').querySelector('.sys-value').textContent =
      data.cpu.load1.toFixed(2) + ' / ' + data.cpu.load5.toFixed(2) + ' / ' + data.cpu.load15.toFixed(2);

    // Memory
    document.getElementById('sysMemTotal').querySelector('.sys-value').textContent = formatSysBytes(data.memory.total);
    document.getElementById('sysMemUsed').querySelector('.sys-value').textContent  = formatSysBytes(data.memory.used);
    document.getElementById('sysMemFree').querySelector('.sys-value').textContent  = formatSysBytes(data.memory.free);
    document.getElementById('sysMemBar').style.width = data.memory.pct + '%';
    document.getElementById('sysMemPct').textContent = data.memory.pct + '%';

    // Disk (root filesystem)
    const disk = data.disk.root;
    if (disk) {
      document.getElementById('sysDiskTotal').querySelector('.sys-value').textContent = formatSysBytes(disk.total);
      document.getElementById('sysDiskUsed').querySelector('.sys-value').textContent  = formatSysBytes(disk.used);
      document.getElementById('sysDiskFree').querySelector('.sys-value').textContent  = formatSysBytes(disk.free);
      document.getElementById('sysDiskBar').style.width = disk.pct + '%';
      document.getElementById('sysDiskPct').textContent  = disk.pct + '%';
    }

    loading.style.display = 'none';
    grid.style.display = 'grid';
  } catch (err) {
    loading.textContent = 'Failed to load system info: ' + err.message;
  }
}

function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  let parts = [];
  if (d) parts.push(d + 'd');
  if (h) parts.push(h + 'h');
  parts.push(m + 'm');
  return parts.join(' ');
}

function formatSysBytes(v) {
  if (v === 0) return '0 B';
  const units = ['B','KB','MB','GB','TB'];
  let i = 0;
  let val = v;
  while (val >= 1024 && i < units.length - 1) { val /= 1024; i++; }
  return val.toFixed(val >= 10 ? 0 : 1) + ' ' + units[i];
}

/* ── Helper: escape HTML for injection into innerHTML ─────── */
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
