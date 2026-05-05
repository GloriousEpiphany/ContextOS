#!/usr/bin/env node

/**
 * ContextPrompt AI v4.0 — Native Messaging Host
 *
 * Bridges Chrome Native Messaging (stdin/stdout with 4-byte length prefix)
 * to a local HTTP server for MCP protocol access.
 *
 * Usage:
 *   node index.js [--port=19960]
 */

import http from 'node:http';
import { Buffer } from 'node:buffer';

// ── Configuration ──
const DEFAULT_PORT = 19960;
const port = parseInt(process.argv.find(a => a.startsWith('--port='))?.split('=')[1] || String(DEFAULT_PORT), 10);

// ── Native Messaging I/O ──
// Chrome sends messages to stdin as: [4-byte LE uint32 length][JSON payload]
// Responses go to stdout in the same format.

let pendingRequests = new Map(); // id -> { resolve, reject, timer }
let messageIdCounter = 1;

function readNativeMessage() {
  let buffer = Buffer.alloc(0);

  process.stdin.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);

    while (buffer.length >= 4) {
      const msgLen = buffer.readUInt32LE(0);
      if (buffer.length < 4 + msgLen) break;

      const jsonStr = buffer.slice(4, 4 + msgLen).toString('utf8');
      buffer = buffer.slice(4 + msgLen);

      try {
        const message = JSON.parse(jsonStr);
        handleNativeResponse(message);
      } catch (err) {
        console.error('[NativeHost] Failed to parse message:', err);
      }
    }
  });
}

function sendNativeMessage(message) {
  const json = JSON.stringify(message);
  const buf = Buffer.from(json, 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(buf.length, 0);
  process.stdout.write(header);
  process.stdout.write(buf);
}

function handleNativeResponse(message) {
  // Messages from extension come with an _nativeId field
  const id = message._nativeId;
  if (id && pendingRequests.has(id)) {
    const { resolve, timer } = pendingRequests.get(id);
    clearTimeout(timer);
    pendingRequests.delete(id);
    delete message._nativeId;
    resolve(message);
  }
}

function sendToExtension(payload) {
  return new Promise((resolve, reject) => {
    const id = messageIdCounter++;
    const timer = setTimeout(() => {
      pendingRequests.delete(id);
      reject(new Error('Native message timeout (30s)'));
    }, 30000);

    pendingRequests.set(id, { resolve, reject, timer });
    sendNativeMessage({ ...payload, _nativeId: id });
  });
}

// ── HTTP Server (MCP Endpoint) ──

const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', port }));
    return;
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== 'POST' || (req.url !== '/' && req.url !== '/mcp')) {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  let body = '';
  req.on('data', (chunk) => { body += chunk; });

  req.on('end', async () => {
    try {
      const jsonRpc = JSON.parse(body);

      // Forward the JSON-RPC request to the Chrome extension
      const response = await sendToExtension({
        type: 'mcp_request',
        payload: jsonRpc,
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(response));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32603,
          message: err.message || 'Internal error',
        },
      }));
    }
  });
});

// ── Start ──
readNativeMessage();

server.listen(port, '127.0.0.1', () => {
  // Log to stderr (stdout is reserved for native messaging)
  console.error(`[ContextPrompt NativeHost] MCP server listening on http://127.0.0.1:${port}`);
});

// Clean exit
process.on('SIGTERM', () => {
  server.close();
  process.exit(0);
});
process.on('SIGINT', () => {
  server.close();
  process.exit(0);
});
process.stdin.on('end', () => {
  server.close();
  process.exit(0);
});
