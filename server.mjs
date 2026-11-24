// Self-hosting option: one process that rebuilds from the API every 30 minutes and serves dist/.
// Usage: npm start   (PORT=8080 by default)
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { execFile } from 'node:child_process';

const PORT = Number(process.env.PORT || 8080);
const EVERY = Number(process.env.REFRESH_MINUTES || 30) * 60e3;
const DIST = join(import.meta.dirname, 'dist');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json', '.txt': 'text/plain' };

function build() {
  return new Promise((res) => execFile(process.execPath, ['scripts/build.mjs', '--fetch', ...(process.env.SITE_URL ? ['--base', process.env.SITE_URL] : [])],
    { cwd: import.meta.dirname }, (err, out, errOut) => { console.log(new Date().toISOString(), err ? 'build failed: ' + errOut.trim() : out.trim()); res(); }));
}

await build();
setInterval(build, EVERY);

http.createServer(async (req, res) => {
  let p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  if (p.endsWith('/')) p += 'index.html';
  const file = join(DIST, p);
  try {
    if (!(await stat(file)).isFile()) throw 0;
    const long = /\/(fonts|img)\//.test(p);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': long ? 'public, max-age=604800' : 'public, max-age=60' });
    res.end(await readFile(file));
  } catch { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('not found'); }
}).listen(PORT, () => console.log(`serving dist/ on :${PORT}`));
