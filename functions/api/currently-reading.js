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

export async function onRequestGet() {
  let books = [];
  try {
    const upstream = await fetch(GOODREADS_RSS, {
      cf: { cacheTtl: CACHE_SECONDS, cacheEverything: true },
    });
    if (upstream.ok) {
      books = parseGoodreadsRss(await upstream.text());
    }
  } catch (_err) {
    // fall through with empty list; client renders empty state
  }

  return new Response(JSON.stringify({ books }), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': `public, max-age=${CACHE_SECONDS}, s-maxage=${CACHE_SECONDS}`,
    },
  });
}
