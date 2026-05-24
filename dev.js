// Local dev server: builds the site, watches source, rebuilds on save, and
// auto-refreshes the browser via a tiny SSE injection. Zero dependencies.
// Run with `npm run dev`. Visit http://localhost:3000.

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

const PORT = 3000;
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

let buildId = 0;

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
    .listen(PORT, () => {
      console.log(`\n  Serving http://localhost:${PORT}\n  (auto-rebuild on save, browser auto-reloads)\n`);
    });
}

async function main() {
  await runBuild();
  watchSources();
  serveDist();
}

main();
