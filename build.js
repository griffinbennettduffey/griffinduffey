// Build step: produces dist/ from source.
// - HTML pages live in pages/ — they get inlined (data-include="..." → partial contents)
//   and flattened into the root of dist/, so URLs stay flat regardless of source layout.
// - Top-level asset folders (css/, js/, assets/) are copied verbatim.
// - partials/ is NOT copied — it's only a source-time concept; the build inlines it.
// - Dynamic widgets (data-widget="...") are filled in the browser at runtime by
//   their own scripts (see js/lastfm.js, js/goodreads.js), which hit either the
//   third-party API directly (Last.fm has CORS) or a Cloudflare Pages Function
//   (functions/api/*) for things that need a proxy.
// Run with `npm run build`.

const fs = require('node:fs');
const path = require('node:path');

const SRC = process.cwd();
const OUT = path.join(SRC, 'dist');
const PAGES = path.join(SRC, 'pages');

const ASSET_DIRS = ['css', 'js', 'assets'];

const INCLUDE_RE = /<(\w+)([^>]*?)\s+data-include="([^"]+)"([^>]*?)>[\s\S]*?<\/\1>/g;

function inlinePartials(html) {
  return html.replace(INCLUDE_RE, (_match, tag, before, partialPath, after) => {
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

function main() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  let htmlCount = 0;
  for (const entry of fs.readdirSync(PAGES)) {
    if (!entry.endsWith('.html')) continue;
    let html = fs.readFileSync(path.join(PAGES, entry), 'utf-8');
    html = inlinePartials(html);
    fs.writeFileSync(path.join(OUT, entry), html);
    htmlCount++;
  }

  let copyCount = 0;
  for (const dir of ASSET_DIRS) {
    const srcPath = path.join(SRC, dir);
    if (!fs.existsSync(srcPath)) continue;
    copyRecursive(srcPath, path.join(OUT, dir));
    copyCount++;
  }

  console.log(`Built ${htmlCount} HTML page(s), copied ${copyCount} asset director${copyCount === 1 ? 'y' : 'ies'} → ${path.relative(SRC, OUT)}/`);
}

main();
