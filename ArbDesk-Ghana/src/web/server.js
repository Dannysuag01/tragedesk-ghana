/**
 * Lightweight native Node.js HTTP server for ArbDesk
 * Serves static dashboard UI and REST API for opportunities.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

export function createArbServer(getOpportunitiesFn, port = 3000) {
  const server = http.createServer(async (req, res) => {
    const host = req.headers.host || 'localhost';
    let pathname = '/';
    try {
      const parsedUrl = new URL(req.url, `http://${host}`);
      pathname = parsedUrl.pathname;
    } catch {
      pathname = req.url.split('?')[0] || '/';
    }

    // API Endpoint: /api/opportunities
    if (pathname === '/api/opportunities') {
      try {
        const opportunities = await getOpportunitiesFn();
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify({ status: 'ok', opportunities }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'error', message: err.message }));
      }
      return;
    }

    // Static File Serving
    let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, content) => {
      if (err) {
        if (err.code === 'ENOENT') {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('404 Not Found');
        } else {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end(`Server Error: ${err.code}`);
        }
      } else {
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content, 'utf-8');
      }
    });
  });

  return {
    start: () => {
      return new Promise((resolve) => {
        server.listen(port, '0.0.0.0', () => {
          console.log(`[ArbDesk] Dashboard running at http://0.0.0.0:${port}`);
          resolve(server);
        });
      });
    },
    stop: () => {
      return new Promise((resolve) => {
        server.close(resolve);
      });
    }
  };
}

