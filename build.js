// Build step: produces dist/ from source.
// - HTML pages live in pages/ — they get inlined (data-include="..." → partial contents)
//   and flattened into the root of dist/, so URLs stay flat regardless of source layout.
// - Top-level asset folders (css/, js/, assets/) are copied verbatim.
// - partials/ is NOT copied — it's only a source-time concept; the build inlines it.
// - data-widget="currently-reading" placeholders get filled with books fetched from
//   Goodreads RSS at build time.
// Run with `npm run build`.

const fs = require('node:fs');
const path = require('node:path');

const SRC = process.cwd();
const OUT = path.join(SRC, 'dist');
const PAGES = path.join(SRC, 'pages');

// Goodreads "currently reading" shelf for user 43601117 (Griffin Duffey).
const GOODREADS_RSS = 'https://www.goodreads.com/review/list_rss/43601117?shelf=currently-reading';

const ASSET_DIRS = ['css', 'js', 'assets'];

const INCLUDE_RE = /<(\w+)([^>]*?)\s+data-include="([^"]+)"([^>]*?)>[\s\S]*?<\/\1>/g;
const WIDGET_RE = /<(\w+)([^>]*?)\s+data-widget="currently-reading"([^>]*?)>[\s\S]*?<\/\1>/g;

function inlinePartials(html) {
  return html.replace(INCLUDE_RE, (_match, tag, before, partialPath, after) => {
    const relPath = partialPath.replace(/^\//, '');
    const partial = fs.readFileSync(path.join(SRC, relPath), 'utf-8').trimEnd();
    const attrs = `${before} ${after}`.replace(/\s+/g, ' ').trim();
    return `<${tag}${attrs ? ' ' + attrs : ''}>\n${partial}\n</${tag}>`;
  });
}

function injectCurrentlyReading(html, booksHtml) {
  return html.replace(WIDGET_RE, (_match, tag, before, after) => {
    const attrs = `${before} ${after}`.replace(/\s+/g, ' ').trim();
    return `<${tag}${attrs ? ' ' + attrs : ''}>\n${booksHtml}\n</${tag}>`;
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

function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Read <tag>...</tag>, transparently unwrapping <![CDATA[...]]> when present.
function readTag(body, tag) {
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
    const title = readTag(body, 'title');
    const author = readTag(body, 'author_name');
    const bookId = readTag(body, 'book_id');
    const cover = readTag(body, 'book_medium_image_url');
    if (title && bookId) {
      books.push({
        title,
        author,
        cover,
        url: `https://www.goodreads.com/book/show/${bookId}`,
      });
    }
  }
  return books;
}

function renderBooks(books) {
  if (!books.length) {
    return '<p class="book-list-empty">Nothing logged right now.</p>';
  }
  const items = books
    .map(
      (b) => `        <li class="book">
          <a href="${b.url}" target="_blank" rel="noopener noreferrer">
            ${b.cover ? `<img src="${b.cover}" alt="${escapeHtml(b.title)} cover" loading="lazy">` : ''}
            <span class="book-meta">
              <span class="book-title">${escapeHtml(b.title)}</span>
              <span class="book-author">${escapeHtml(b.author)}</span>
            </span>
          </a>
        </li>`,
    )
    .join('\n');
  return `      <h2 class="book-list-heading">Currently reading</h2>\n      <ul class="book-list">\n${items}\n      </ul>`;
}

async function fetchCurrentlyReading() {
  try {
    const response = await fetch(GOODREADS_RSS);
    if (!response.ok) throw new Error(`status ${response.status}`);
    const xml = await response.text();
    const books = parseGoodreadsRss(xml);
    console.log(`Fetched ${books.length} book(s) from Goodreads.`);
    return books;
  } catch (err) {
    console.warn(`Couldn't fetch Goodreads RSS (${err.message}). Widget will be empty.`);
    return [];
  }
}

async function main() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  const books = await fetchCurrentlyReading();
  const booksHtml = renderBooks(books);

  let htmlCount = 0;
  for (const entry of fs.readdirSync(PAGES)) {
    if (!entry.endsWith('.html')) continue;
    let html = fs.readFileSync(path.join(PAGES, entry), 'utf-8');
    html = inlinePartials(html);
    html = injectCurrentlyReading(html, booksHtml);
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
