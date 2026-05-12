// Build step: copies the repo into dist/, inlining any HTML partials referenced
// via data-include="<path>" so the deployed pages don't need a client-side fetch
// to render the nav. Run locally with `npm run build`.

const fs = require('node:fs');
const path = require('node:path');

const SRC = process.cwd();
const OUT = path.join(SRC, 'dist');

// Entries at the repo root that should NOT be copied to dist/. Partials get
// inlined into the HTML, so the partials/ folder itself doesn't need to ship.
const SKIP = new Set([
  '.git',
  '.gitignore',
  'node_modules',
  'dist',
  'partials',
  'build.js',
  'package.json',
  'package-lock.json',
  'README.md',
]);

// Matches: <tag ...attrs... data-include="path" ...attrs...>...inner...</tag>
// Captures: 1=tagname, 2=attrs before, 3=partial path, 4=attrs after.
const INCLUDE_RE = /<(\w+)([^>]*?)\s+data-include="([^"]+)"([^>]*?)>[\s\S]*?<\/\1>/g;

function inlinePartials(html) {
  return html.replace(INCLUDE_RE, (_match, tag, before, partialPath, after) => {
    const partial = fs.readFileSync(path.join(SRC, partialPath), 'utf-8').trimEnd();
    const attrs = `${before} ${after}`.replace(/\s+/g, ' ').trim();
    return `<${tag}${attrs ? ' ' + attrs : ''}>\n${partial}\n</${tag}>`;
  });
}

function copyRecursive(src, dst) {
  if (fs.statSync(src).isDirectory()) {
    fs.mkdirSync(dst, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dst, entry));
    }
  } else {
    fs.copyFileSync(src, dst);
  }
}

// Wipe and recreate dist/ so stale files don't linger between builds.
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

let htmlCount = 0;
let copyCount = 0;

for (const entry of fs.readdirSync(SRC)) {
  if (SKIP.has(entry)) continue;
  const srcPath = path.join(SRC, entry);
  const dstPath = path.join(OUT, entry);

  if (fs.statSync(srcPath).isFile() && entry.endsWith('.html')) {
    const html = fs.readFileSync(srcPath, 'utf-8');
    fs.writeFileSync(dstPath, inlinePartials(html));
    htmlCount++;
  } else {
    copyRecursive(srcPath, dstPath);
    copyCount++;
  }
}

console.log(`Built ${htmlCount} HTML page(s), copied ${copyCount} top-level asset entr${copyCount === 1 ? 'y' : 'ies'} → ${path.relative(SRC, OUT)}/`);
