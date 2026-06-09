const express = require('express');
const http    = require('http');
const WebSocket = require('ws');
const pty     = require('node-pty');
const path    = require('path');
const os      = require('os');
const fsp     = require('fs').promises;
const fs      = require('fs');
const { v4: uuidv4 } = require('uuid');
const multer  = require('multer');

const app    = express();
const server = http.createServer(app);
const wss    = new WebSocket.Server({ server });
const PORT   = process.env.PORT || 3000;

// Files root — default /app/files, can override via FILES_ROOT env
const FILES_ROOT = (process.env.FILES_ROOT || '/app/files').replace(/\/$/, '');

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '20mb' }));

app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

/* ── Path safety ──────────────────────────────────────────── */
function safePath(rel) {
  const joined = path.join(FILES_ROOT, rel || '');
  const norm   = path.normalize(joined);
  if (!norm.startsWith(FILES_ROOT)) throw new Error('Access denied');
  return norm;
}

/* ── File Manager REST API ───────────────────────────────── */

// GET /api/files?path=  → list directory
app.get('/api/files', async (req, res) => {
  try {
    const rel  = req.query.path || '';
    const abs  = safePath(rel);
    const entries = await fsp.readdir(abs, { withFileTypes: true });

    const items = await Promise.all(entries.map(async (e) => {
      const filePath = path.join(rel, e.name);
      let size = 0;
      let mtime = null;
      try {
        const st = await fsp.stat(path.join(abs, e.name));
        size  = st.size;
        mtime = st.mtime.toISOString();
      } catch {}
      return { name: e.name, type: e.isDirectory() ? 'dir' : 'file', path: filePath, size, mtime };
    }));

    items.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    res.json({ ok: true, path: rel, items });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// GET /api/files/read?path=  → read file content
app.get('/api/files/read', async (req, res) => {
  try {
    const abs = safePath(req.query.path || '');
    const stat = await fsp.stat(abs);
    if (stat.size > 5 * 1024 * 1024) return res.status(400).json({ ok: false, error: 'File too large (>5MB)' });
    const content = await fsp.readFile(abs, 'utf8');
    res.json({ ok: true, content });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// POST /api/files/write  { path, content }
app.post('/api/files/write', async (req, res) => {
  try {
    const abs = safePath(req.body.path || '');
    await fsp.mkdir(path.dirname(abs), { recursive: true });
    await fsp.writeFile(abs, req.body.content || '');
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// DELETE /api/files?path=
app.delete('/api/files', async (req, res) => {
  try {
    const abs  = safePath(req.query.path || '');
    const stat = await fsp.stat(abs);
    if (stat.isDirectory()) {
      await fsp.rm(abs, { recursive: true, force: true });
    } else {
      await fsp.unlink(abs);
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

/* ── File upload via multer ──────────────────────────────── */
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const relPath = req.body.path || '';
      const absPath = safePath(relPath);
      cb(null, absPath);
    },
    filename: (_req, file, cb) => {
      // Prevent path traversal in filename
      const name = path.basename(file.originalname);
      cb(null, name);
    }
  }),
  limits: { fileSize: 200 * 1024 * 1024 } // 200 MB max
});

// POST /api/files/upload  (multipart: field 'file' + field 'path')
app.post('/api/files/upload', (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE')
          return res.status(400).json({ ok: false, error: 'File too large (max 200 MB)' });
        return res.status(400).json({ ok: false, error: err.message });
      }
      return res.status(400).json({ ok: false, error: err.message });
    }
    if (!req.file)
      return res.status(400).json({ ok: false, error: 'No file provided' });
    res.json({ ok: true, name: req.file.filename, size: req.file.size });
  });
});

// POST /api/files/mkdir  { path }
app.post('/api/files/mkdir', async (req, res) => {
  try {
    const abs = safePath(req.body.path || '');
    await fsp.mkdir(abs, { recursive: true });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// POST /api/files/rename  { from, to }
app.post('/api/files/rename', async (req, res) => {
  try {
    const from = safePath(req.body.from || '');
    const to   = safePath(req.body.to   || '');
    await fsp.rename(from, to);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

/* ── System Info API ──────────────────────────────────────── */
function getDiskInfo(dir) {
  try {
    // Fall back to '/' if the target dir doesn't exist
    const target = fs.existsSync(dir) ? dir : '/';
    const s = fs.statfsSync(target);
    const total = s.blocks * s.bsize;
    const free  = s.bfree  * s.bsize;
    const used  = total - free;
    return { total, used, free, pct: total ? Math.round((used / total) * 100) : 0 };
  } catch { return null; }
}

function getCpuModel() {
  try {
    const cpus = os.cpus();
    if (!cpus.length) return 'N/A';
    // Deduplicate model names
    const models = [...new Set(cpus.map(c => c.model.trim()))];
    return models[0] + ' (' + cpus.length + ' cores)';
  } catch { return 'N/A'; }
}

app.get('/api/system/info', (_req, res) => {
  const totalMem = os.totalmem();
  const freeMem  = os.freemem();
  const usedMem  = totalMem - freeMem;

  const diskRoot  = getDiskInfo(FILES_ROOT);
  const diskTotal = getDiskInfo('/');

  const cpus = os.cpus();
  const load = os.loadavg();

  const info = {
    hostname: os.hostname(),
    platform: os.platform(),
    release:  os.release(),
    arch:     os.arch(),
    uptime:   os.uptime(),
    cpu: {
      model:   getCpuModel(),
      cores:   cpus.length,
      load1:   load[0],
      load5:   load[1],
      load15:  load[2]
    },
    memory: {
      total: totalMem,
      used:  usedMem,
      free:  freeMem,
      pct:   totalMem ? Math.round((usedMem / totalMem) * 100) : 0
    },
    disk: {
      root: diskRoot,
      total: diskTotal
    },
    user: os.userInfo().username
  };

  res.json({ ok: true, ...info });
});

/* ── WebSocket Terminal ───────────────────────────────────── */
const terminals = new Map();

wss.on('connection', (ws) => {
  const sessionId = uuidv4();
  let pty_ = null;

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);

      if (msg.type === 'create') {
        const shell = process.env.SHELL || '/bin/bash';
        pty_ = pty.spawn(shell, [], {
          name: 'xterm-256color',
          cols: msg.cols || 120,
          rows: msg.rows || 30,
          cwd:  '/',
          env:  { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' }
        });
        terminals.set(sessionId, pty_);

        pty_.onData(out => {
          if (ws.readyState === WebSocket.OPEN)
            ws.send(JSON.stringify({ type: 'output', data: out }));
        });

        pty_.onExit(() => {
          if (ws.readyState === WebSocket.OPEN)
            ws.send(JSON.stringify({ type: 'exit' }));
          terminals.delete(sessionId);
        });

        ws.send(JSON.stringify({ type: 'ready', sessionId }));

      } else if (msg.type === 'input' && pty_) {
        pty_.write(msg.data);

      } else if (msg.type === 'resize' && pty_) {
        const cols = Math.max(2, msg.cols);
        const rows = Math.max(1, msg.rows);
        pty_.resize(cols, rows);
      }
    } catch (e) {
      console.error('WS error:', e.message);
    }
  });

  ws.on('close', () => {
    if (pty_) { pty_.kill(); terminals.delete(sessionId); }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
  console.log(`Files root: ${FILES_ROOT}`);
});
