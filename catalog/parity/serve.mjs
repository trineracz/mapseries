// Serve a built catalog (catalog/dist) under /catalog/ and proxy /server/* to
// the running app, so a candidate build can be tested without redeploying.
//   node serve.mjs <distDir> <port> <upstream>
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const [distDir, port = '8090', upstream = 'http://host.docker.internal:8080'] = process.argv.slice(2);
// same headers as the Spring app (Content-Language drives the page locale → text rendering)
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.map': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff': 'font/woff',
  '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.eot': 'application/vnd.ms-fontobject' };

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/server/')) {
    http.get(upstream + req.url, (up) => { res.writeHead(up.statusCode, up.headers); up.pipe(res); })
      .on('error', (e) => { res.writeHead(502); res.end(String(e)); });
    return;
  }
  // only /catalog/... exists, like in the app (anything else must 404)
  if (!/^\/catalog(\/|$)/.test(url.pathname)) { res.writeHead(404); res.end('not found'); return; }
  let rel = url.pathname.replace(/^\/catalog\/?/, '');
  if (rel === '' || rel.endsWith('/')) rel += 'index.html';
  const file = path.join(distDir, decodeURIComponent(rel));
  if (!file.startsWith(path.resolve(distDir)) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end('not found'); return;
  }
  res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream',
    'content-language': 'cs' });
  fs.createReadStream(file).pipe(res);
}).listen(Number(port), () => console.log(`serving ${distDir} on :${port}`));
