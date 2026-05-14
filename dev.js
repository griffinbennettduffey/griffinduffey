// Local dev server: builds the site, watches source, rebuilds on save, and
// auto-refreshes the browser via a tiny SSE injection. Zero dependencies.
// Run with `npm run dev`. Visit http://localhost:3000.

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

const PORT = 3000;
const WATCH_DIRS = ['pages', 'partials', 'css', 'js', 'assets'];
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

function serveDist() {
  http
    .createServer((req, res) => {
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
