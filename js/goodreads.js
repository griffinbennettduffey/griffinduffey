// Fetches the currently-reading shelf from /api/currently-reading (a Cloudflare
// Pages Function that proxies Goodreads RSS with edge caching). Fills any
// element with data-widget="currently-reading" on the page.

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderBooks(books) {
  if (!books.length) {
    return '<p class="empty-state">Nothing on the shelf right now.</p>';
  }
  const items = books
    .map(
      (b) => `<li class="book">
        <a href="${b.url}" target="_blank" rel="noopener noreferrer">
          ${b.cover ? `<img src="${b.cover}" alt="${escapeHtml(b.title)} cover" loading="lazy">` : ''}
          <span class="book-meta">
            <span class="book-title">${escapeHtml(b.title)}</span>
            <span class="book-author">${escapeHtml(b.author)}</span>
          </span>
        </a>
      </li>`,
    )
    .join('');
  return `<ul class="book-list">${items}</ul>`;
}

// The shelf is fetched from Goodreads at build time and written to
// /data/currently-reading.json (see build.js) because Goodreads IP-blocks the
// Cloudflare edge, so a live Pages Function can't reach it.
async function loadCurrentlyReading(target) {
  target.innerHTML = '<p class="empty-state">Loading…</p>';
  try {
    const response = await fetch('/data/currently-reading.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error(`status ${response.status}`);
    const data = await response.json();
    target.innerHTML = renderBooks(data.books ?? []);
  } catch (err) {
    console.error('Goodreads fetch failed:', err);
    target.innerHTML = '<p class="empty-state">Couldn’t reach Goodreads right now.</p>';
  }
}

document.querySelectorAll('[data-widget="currently-reading"]').forEach(loadCurrentlyReading);
