// Build step: produces dist/ from source.
// - HTML pages live in pages/ — they get inlined (data-include="..." → partial contents)
//   and flattened into the root of dist/, so URLs stay flat regardless of source layout.
// - Top-level asset folders (css/, js/, assets/) are copied verbatim.
// - partials/ is NOT copied — it's only a source-time concept; the build inlines it.
// Run with `npm run build`.

const fs = require('node:fs');
const path = require('node:path');

const SRC = process.cwd();
const OUT = path.join(SRC, 'dist');
const PAGES = path.join(SRC, 'pages');

// Top-level entries that ship verbatim to dist/. Anything else stays in source only.
const ASSET_DIRS = ['css', 'js', 'assets'];

// Matches <tag ...data-include="path"...>...</tag>. Captures: tag, attrs-before, path, attrs-after.
const INCLUDE_RE = /<(\w+)([^>]*?)\s+data-include="([^"]+)"([^>]*?)>[\s\S]*?<\/\1>/g;

function inlinePartials(html) {
  return html.replace(INCLUDE_RE, (_match, tag, before, partialPath, after) => {
    // Strip leading slash so absolute-style paths (/partials/nav.html) join correctly.
    const relPath = partialPath.replace(/^\//, '');
    const partial = fs.readFileSync(path.join(SRC, relPath), 'utf-8').trimEnd();
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

// 1. Process every .html in pages/ → dist/<basename>.html, inlining partials along the way.
let htmlCount = 0;
for (const entry of fs.readdirSync(PAGES)) {
  if (!entry.endsWith('.html')) continue;
  const html = fs.readFileSync(path.join(PAGES, entry), 'utf-8');
  fs.writeFileSync(path.join(OUT, entry), inlinePartials(html));
  htmlCount++;
}

// 2. Copy each asset directory at its current path into dist/.
let copyCount = 0;
for (const dir of ASSET_DIRS) {
  const srcPath = path.join(SRC, dir);
  if (!fs.existsSync(srcPath)) continue;
  copyRecursive(srcPath, path.join(OUT, dir));
  copyCount++;
}

console.log(`Built ${htmlCount} HTML page(s), copied ${copyCount} asset director${copyCount === 1 ? 'y' : 'ies'} → ${path.relative(SRC, OUT)}/`);
