const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const pty = require('node-pty');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Track active terminals
const terminals = new Map();

wss.on('connection', (ws) => {
  const sessionId = uuidv4();
  let ptyProcess = null;

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);

      if (msg.type === 'create') {
        // Create new PTY session
        const shell = process.env.SHELL || '/bin/bash';
        ptyProcess = pty.spawn(shell, [], {
          name: 'xterm-color',
          cols: msg.cols || 120,
          rows: msg.rows || 30,
          cwd: process.env.HOME || '/app',
          env: { ...process.env, TERM: 'xterm-color' }
        });

        terminals.set(sessionId, ptyProcess);

        ptyProcess.onData((output) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'output', data: output }));
          }
        });

        ptyProcess.onExit(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'exit' }));
          }
          terminals.delete(sessionId);
        });

        ws.send(JSON.stringify({ type: 'ready', sessionId }));

      } else if (msg.type === 'input' && ptyProcess) {
        ptyProcess.write(msg.data);

      } else if (msg.type === 'resize' && ptyProcess) {
        ptyProcess.resize(msg.cols, msg.rows);
      }

    } catch (err) {
      console.error('WS message error:', err.message);
    }
  });

  ws.on('close', () => {
    if (ptyProcess) {
      ptyProcess.kill();
      terminals.delete(sessionId);
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
