// Build step: produces dist/ from source.
// - HTML pages live in pages/ — they get inlined (data-include="..." → partial contents)
//   and flattened into the root of dist/, so URLs stay flat regardless of source layout.
// - Top-level asset folders (css/, js/, assets/) are copied verbatim.
// - partials/ is NOT copied — it's only a source-time concept; the build inlines it.
// - Dynamic widgets (data-widget="...") are filled in the browser at runtime by
//   their own scripts (see js/lastfm.js, js/goodreads.js). Last.fm has CORS so
//   its script hits the API directly; Goodreads IP-blocks the Cloudflare edge,
//   so this build fetches that shelf and emits dist/data/currently-reading.json
//   for the client to read (see writeCurrentlyReading below).
// Run with `npm run build`.

const fs = require('node:fs');
const path = require('node:path');

const SRC = process.cwd();
const OUT = path.join(SRC, 'dist');
const PAGES = path.join(SRC, 'pages');

const ASSET_DIRS = ['css', 'js', 'assets'];
// Files that have to sit at the site root to work. A service worker can only
// control the paths below its own URL, so sw.js has to be served from /sw.js
// for the trip page to keep working offline.
const ROOT_FILES = ['sw.js'];

// Goodreads IP-blocks Cloudflare's Worker/edge network (403), so we can't proxy
// the shelf live from a Pages Function. Instead we fetch it here at build time
// (from the build environment) and emit a static JSON file the client reads.
const GOODREADS_RSS =
  'https://www.goodreads.com/review/list_rss/43601117?shelf=currently-reading';

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

async function writeCurrentlyReading() {
  const outDir = path.join(OUT, 'data');
  fs.mkdirSync(outDir, { recursive: true });
  let books = [];
  const diag = { upstreamStatus: null, bodyLen: 0, error: null };
  try {
    const upstream = await fetch(GOODREADS_RSS, {
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; griffinduffey.com build)',
        accept: 'application/rss+xml, application/xml, text/xml',
      },
    });
    diag.upstreamStatus = upstream.status;
    if (upstream.ok) {
      const text = await upstream.text();
      diag.bodyLen = text.length;
      books = parseGoodreadsRss(text);
    }
  } catch (err) {
    diag.error = String(err && err.message ? err.message : err);
  }
  fs.writeFileSync(path.join(outDir, 'currently-reading.json'), JSON.stringify({ books }));
  // Build-side diagnostic so we can see reachability from the deployed site.
  fs.writeFileSync(
    path.join(outDir, 'currently-reading.debug.json'),
    JSON.stringify({ count: books.length, ...diag }),
  );
  console.log(
    `Currently-reading: ${books.length} book(s), upstream ${diag.upstreamStatus}${diag.error ? ` (error: ${diag.error})` : ''}`,
  );
}

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

async function main() {
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

  for (const file of ROOT_FILES) {
    const srcPath = path.join(SRC, file);
    if (fs.existsSync(srcPath)) fs.copyFileSync(srcPath, path.join(OUT, file));
  }

  console.log(`Built ${htmlCount} HTML page(s), copied ${copyCount} asset director${copyCount === 1 ? 'y' : 'ies'} → ${path.relative(SRC, OUT)}/`);

  await writeCurrentlyReading();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
