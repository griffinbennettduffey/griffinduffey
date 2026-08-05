// Local dev server: builds the site, watches source, rebuilds on save, and
// auto-refreshes the browser via a tiny SSE injection. Zero dependencies.
// Run with `npm run dev`. Visit http://localhost:3000.
//
// It listens on every interface, so anything else on the same Wi-Fi — a phone,
// say — can open the LAN address printed at startup.

const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const os = require('node:os');

const PORT = 3000;
const HOST = '0.0.0.0';
const WATCH_DIRS = ['pages', 'partials', 'css', 'js', 'assets'];
const GOODREADS_RSS = 'https://www.goodreads.com/review/list_rss/43601117?shelf=currently-reading';
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
};

// Local stand-in for the password gate in functions/_middleware.js, so the
// itinerary behaves the same here as it does in production. The two copies are
// deliberately parallel — change one, change the other.
const PROTECTED = /^\/cowboymode(\.html)?\/?$/;
const COOKIE = 'cowboymode';
const MAX_AGE = 60 * 60 * 24 * 180;
const EXPECTED = sha256(process.env.COWBOY_PASSWORD || 'yellowstone');

let buildId = 0;

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function readCookie(header, name) {
  if (!header) return '';
  for (const pair of header.split(';')) {
    const eq = pair.indexOf('=');
    if (eq === -1) continue;
    if (pair.slice(0, eq).trim() === name) return pair.slice(eq + 1).trim();
  }
  return '';
}

function sendLogin(res, failed) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<meta name="theme-color" content="#ffffff">
<meta name="robots" content="noindex">
<title>Cody × Yellowstone — Aug 2026</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}
  body{
    font-family:Times,"Times New Roman","Liberation Serif",serif;
    font-size:17px;line-height:1.5;color:#111;background:#fff;
    min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:1.5rem;
  }
  form{width:100%;max-width:20rem}
  .eyebrow{font-size:.72rem;letter-spacing:.1em;text-transform:uppercase;color:#8c8c8c;margin-bottom:.4rem}
  h1{font-size:1.3rem;font-weight:700;line-height:1.2}
  h1 .x{color:#8c8c8c;font-weight:400;padding:0 .12em}
  hr{border:0;border-top:1px solid #e0e0e0;margin:1rem 0 1.3rem}
  label{display:block;font-size:.72rem;letter-spacing:.1em;text-transform:uppercase;color:#8c8c8c;margin-bottom:.4rem}
  input{font:inherit;font-size:1rem;width:100%;padding:.55rem .6rem;background:#fff;border:1px solid #ccc;color:#111}
  input:focus{outline:none;border-color:#111}
  button{font:inherit;font-size:.85rem;width:100%;margin-top:.6rem;padding:.6rem;cursor:pointer;background:#fff;border:1px solid #111;color:#111}
  .err{font-size:.85rem;color:#666;margin-top:.7rem;font-style:italic}
</style>
</head>
<body>
<form method="POST">
  <p class="eyebrow">Private itinerary</p>
  <h1>CODY<span class="x">×</span>YELLOWSTONE</h1>
  <hr>
  <label for="p">Password</label>
  <input id="p" name="password" type="password" autocomplete="current-password" autocapitalize="off" autocorrect="off" required autofocus>
  <button type="submit">Enter</button>
  ${failed ? '<p class="err">Not quite — try again.</p>' : ''}
</form>
</body>
</html>`;
  res.writeHead(401, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(html);
}

// Returns true when the request has been fully handled by the gate.
function gate(req, res, urlPath) {
  if (!PROTECTED.test(urlPath)) return false;

  if (req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      const submitted = new URLSearchParams(body).get('password') || '';
      if (sha256(submitted) === EXPECTED) {
        res.writeHead(303, {
          Location: urlPath,
          'Set-Cookie': `${COOKIE}=${EXPECTED}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; SameSite=Lax`,
        });
        res.end();
      } else {
        sendLogin(res, true);
      }
    });
    return true;
  }

  if (readCookie(req.headers.cookie, COOKIE) !== EXPECTED) {
    sendLogin(res, false);
    return true;
  }
  return false;
}

// Every non-internal IPv4 address, so the startup banner can offer a URL that
// a phone on the same network can actually reach.
function lanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((iface) => iface && iface.family === 'IPv4' && !iface.internal)
    .map((iface) => iface.address);
}

function runBuild() {
  return new Promise((resolve) => {
    const proc = spawn('node', ['build.js'], { stdio: 'inherit' });
    proc.on('exit', (code) => {
      if (code === 0) buildId += 1;
      resolve(code === 0);
    });
  });
}

function watchSources() {
  let pending = null;
  for (const dir of WATCH_DIRS) {
    if (!fs.existsSync(dir)) continue;
    fs.watch(dir, { recursive: true }, (_event, filename) => {
      clearTimeout(pending);
      pending = setTimeout(async () => {
        console.log(`[change] ${dir}/${filename ?? ''}`);
        await runBuild();
      }, 100);
    });
  }
}

function readXmlTag(body, tag) {
  const re = new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`);
  const m = body.match(re);
  return m ? m[1].trim() : '';
}

function parseGoodreadsRss(xml) {
  const books = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRe.exec(xml)) !== null) {
    const body = match[1];
    const title = readXmlTag(body, 'title');
    const author = readXmlTag(body, 'author_name');
    const bookId = readXmlTag(body, 'book_id');
    const cover = readXmlTag(body, 'book_medium_image_url');
    if (title && bookId) {
      books.push({ title, author, cover, url: `https://www.goodreads.com/book/show/${bookId}` });
    }
  }
  return books;
}

async function serveCurrentlyReading(res) {
  let books = [];
  try {
    const upstream = await fetch(GOODREADS_RSS);
    if (upstream.ok) books = parseGoodreadsRss(await upstream.text());
  } catch (err) {
    console.warn(`[dev] Goodreads fetch failed: ${err.message}`);
  }
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ books }));
}

function serveDist() {
  http
    .createServer((req, res) => {
      // Local stand-in for the Cloudflare Pages Function. Lets the widget work
      // in `npm run dev` without deploying. Same response shape as production.
      if (req.url === '/api/currently-reading') {
        serveCurrentlyReading(res);
        return;
      }

      // SSE endpoint that the injected client script subscribes to.
      if (req.url === '/__dev__/sse') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        });
        const tick = setInterval(() => res.write(`data: ${buildId}\n\n`), 500);
        req.on('close', () => clearInterval(tick));
        return;
      }

      const urlPath = decodeURIComponent(req.url.split('?')[0]);

      if (gate(req, res, urlPath)) return;

      let filePath = path.join('dist', urlPath === '/' ? 'index.html' : urlPath);

      // Clean URLs: try /foo → /foo.html → /foo/index.html
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        if (fs.existsSync(filePath + '.html')) {
          filePath += '.html';
        } else if (fs.existsSync(path.join(filePath, 'index.html'))) {
          filePath = path.join(filePath, 'index.html');
        } else {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
      }

      const ext = path.extname(filePath).toLowerCase();
      res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');

      if (ext === '.html') {
        let html = fs.readFileSync(filePath, 'utf-8');
        const inject = `\n<script>
(function () {
  var v = null;
  var es = new EventSource('/__dev__/sse');
  es.onmessage = function (e) {
    if (v === null) v = e.data;
    else if (e.data !== v) location.reload();
  };
})();
</script>\n`;
        if (html.includes('</body>')) html = html.replace('</body>', inject + '</body>');
        else html += inject;
        res.end(html);
      } else {
        res.end(fs.readFileSync(filePath));
      }
    })
    .listen(PORT, HOST, () => {
      const lines = [`  Serving       http://localhost:${PORT}`];
      for (const address of lanAddresses()) {
        lines.push(`  On your phone http://${address}:${PORT}/cowboymode`);
      }
      console.log(`\n${lines.join('\n')}\n  (auto-rebuild on save, browser auto-reloads)\n`);
    });
}

async function main() {
  await runBuild();
  watchSources();
  serveDist();
}

main();
