/* ── Tab routing ─────────────────────────────────────────── */
const navItems = document.querySelectorAll('.nav-item[data-tab]');
const tabContents = document.querySelectorAll('.tab-content');
const currentTabLabel = document.getElementById('currentTabLabel');

navItems.forEach(item => {
  item.addEventListener('click', e => {
    e.preventDefault();
    const tab = item.dataset.tab;

    navItems.forEach(n => n.classList.remove('active'));
    tabContents.forEach(t => t.classList.remove('active'));

    item.classList.add('active');
    document.getElementById('tab-' + tab)?.classList.add('active');
    currentTabLabel.textContent = item.textContent.trim();

    if (tab === 'console') fitAddon?.fit();
  });
});

// Sidebar mobile toggle
const sidebarToggle = document.getElementById('sidebarToggle');
const sidebar = document.querySelector('.sidebar');
sidebarToggle?.addEventListener('click', () => sidebar.classList.toggle('open'));
document.addEventListener('click', e => {
  if (!sidebar.contains(e.target) && !sidebarToggle.contains(e.target))
    sidebar.classList.remove('open');
});

/* ── xterm + WebSocket terminal ──────────────────────────── */
const term = new Terminal({
  theme: {
    background:   '#0d1117',
    foreground:   '#c9d1d9',
    cursor:       '#58a6ff',
    cursorAccent: '#0d1117',
    selection:    'rgba(88,166,255,0.3)',
    black:        '#484f58',
    red:          '#ff7b72',
    green:        '#3fb950',
    yellow:       '#d29922',
    blue:         '#58a6ff',
    magenta:      '#bc8cff',
    cyan:         '#39c5cf',
    white:        '#b1bac4',
    brightBlack:  '#6e7681',
    brightRed:    '#ffa198',
    brightGreen:  '#56d364',
    brightYellow: '#e3b341',
    brightBlue:   '#79c0ff',
    brightMagenta:'#d2a8ff',
    brightCyan:   '#56d4dd',
    brightWhite:  '#f0f6fc',
  },
  fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
  fontSize: 13,
  lineHeight: 1.4,
  cursorBlink: true,
  convertEol: true,
  scrollback: 5000,
  allowTransparency: true,
});

const fitAddon = new FitAddon.FitAddon();
term.loadAddon(fitAddon);
term.open(document.getElementById('terminal'));
fitAddon.fit();

// Resize observer to keep terminal fitted
const resizeObs = new ResizeObserver(() => fitAddon.fit());
resizeObs.observe(document.getElementById('terminal'));

/* ── WebSocket connection ────────────────────────────────── */
const proto  = location.protocol === 'https:' ? 'wss' : 'ws';
const wsUrl  = `${proto}://${location.host}`;
let ws = null;
let wsReady = false;

const statusDot  = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');

function setStatus(state) {
  statusDot.className = 'status-dot ' + state;
  statusText.textContent = state === 'online' ? 'Running' : state === 'offline' ? 'Offline' : 'Connecting...';
}

function connect() {
  ws = new WebSocket(wsUrl);
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
        term.writeln('\x1b[1;32m Connected to server — type commands below \x1b[0m');
        term.writeln('');
      } else if (msg.type === 'output') {
        term.write(msg.data);
      } else if (msg.type === 'exit') {
        wsReady = false;
        setStatus('offline');
        term.writeln('\r\n\x1b[1;31m Session ended. Reconnecting...\x1b[0m');
        setTimeout(connect, 3000);
      }
    } catch {}
  };

  ws.onclose = () => {
    wsReady = false;
    setStatus('offline');
    setTimeout(connect, 3000);
  };

  ws.onerror = () => ws.close();
}

connect();

/* Forward xterm keyboard input to PTY */
term.onData(data => {
  if (wsReady && ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'input', data }));
  }
});

/* Notify server of resize */
term.onResize(({ cols, rows }) => {
  if (wsReady && ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'resize', cols, rows }));
  }
});

/* ── Command input bar ────────────────────────────────────── */
const cmdInput = document.getElementById('cmdInput');
const btnSend  = document.getElementById('btnSend');

function sendCommand() {
  const val = cmdInput.value.trim();
  if (!val) return;
  if (wsReady && ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'input', data: val + '\n' }));
  }
  cmdInput.value = '';
  term.focus();
}

btnSend.addEventListener('click', sendCommand);
cmdInput.addEventListener('keydown', e => { if (e.key === 'Enter') sendCommand(); });

/* ── Console action buttons ──────────────────────────────── */
document.getElementById('btnClear').addEventListener('click', () => term.clear());

const btnFullscreen = document.getElementById('btnFullscreen');
btnFullscreen.addEventListener('click', () => {
  document.body.classList.toggle('fs-console');
  fitAddon.fit();
});

/* ── Server control buttons (cosmetic) ───────────────────── */
document.getElementById('btnStart').addEventListener('click', () => {
  if (wsReady) ws.send(JSON.stringify({ type: 'input', data: '# START signal sent\n' }));
});
document.getElementById('btnStop').addEventListener('click', () => {
  if (wsReady) ws.send(JSON.stringify({ type: 'input', data: 'exit\n' }));
});
document.getElementById('btnRestart').addEventListener('click', () => {
  if (wsReady) {
    ws.send(JSON.stringify({ type: 'input', data: 'exit\n' }));
    setTimeout(connect, 500);
  }
});

/* ── Fake stats (simulated) ──────────────────────────────── */
function fakeStats() {
  const cpu  = Math.floor(Math.random() * 60) + 5;
  const mem  = Math.floor(Math.random() * 70) + 20;
  const disk = Math.floor(Math.random() * 40) + 10;

  document.getElementById('cpuVal').textContent  = cpu  + '%';
  document.getElementById('memVal').textContent  = mem  + '%';
  document.getElementById('diskVal').textContent = disk + '%';
  document.getElementById('netVal').textContent  = (Math.random()*10).toFixed(1) + ' MB/s / ' + (Math.random()*5).toFixed(1) + ' MB/s';

  document.getElementById('cpuBar').style.width  = cpu  + '%';
  document.getElementById('memBar').style.width  = mem  + '%';
  document.getElementById('diskBar').style.width = disk + '%';
}
fakeStats();
setInterval(fakeStats, 3000);
