// Cloudflare Pages Function: GET /api/currently-reading
// Fetches the Goodreads "currently-reading" shelf RSS, parses it, and returns JSON.
// Cached at the edge for 15 minutes so visitors don't hammer Goodreads.

const GOODREADS_RSS = 'https://www.goodreads.com/review/list_rss/43601117?shelf=currently-reading';
const CACHE_SECONDS = 900;

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

export async function onRequestGet({ request }) {
  const debug = new URL(request.url).searchParams.has('debug');
  let books = [];
  const diag = { version: 'ua-2', upstreamStatus: null, bodyLen: 0, error: null };
  try {
    // Goodreads returns 403 to requests without a browser-like User-Agent
    // (the Workers runtime doesn't send one by default), so set it explicitly.
    const upstream = await fetch(GOODREADS_RSS, {
      headers: {
        'user-agent':
          'Mozilla/5.0 (compatible; griffinduffey.com/1.0; +https://griffinduffey.com)',
        accept: 'application/rss+xml, application/xml, text/xml',
      },
      cf: { cacheTtl: CACHE_SECONDS, cacheEverything: true },
    });
    diag.upstreamStatus = upstream.status;
    if (upstream.ok) {
      const text = await upstream.text();
      diag.bodyLen = text.length;
      books = parseGoodreadsRss(text);
    }
  } catch (err) {
    diag.error = String(err && err.message ? err.message : err);
    // fall through with empty list; client renders empty state
  }

  return new Response(JSON.stringify(debug ? { books, diag } : { books }), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': `public, max-age=${CACHE_SECONDS}, s-maxage=${CACHE_SECONDS}`,
    },
  });
}
