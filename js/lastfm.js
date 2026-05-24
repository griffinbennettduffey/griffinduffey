// Fetches "top albums" from Last.fm for a user across multiple time windows
// and fills any element with data-widget="top-albums" on the page. Renders one
// labeled section per window — scroll to see older windows. Runs once per page
// load. Last.fm sends Access-Control-Allow-Origin: * on read endpoints so this
// works directly from the browser.

const LASTFM_USER = 'griffinduffey';
const LASTFM_API_KEY = '9a77942fe3dca583972d56be9e7629b5';
const LASTFM_LIMIT = 5;
const LASTFM_PERIODS = [
  { key: '7day', label: 'past week' },
  { key: '1month', label: 'past month' },
];

const IMG_SIZE_PREFERENCE = ['extralarge', 'large', 'medium', 'small'];

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function pickImage(images) {
  if (!Array.isArray(images)) return '';
  for (const size of IMG_SIZE_PREFERENCE) {
    const hit = images.find((img) => img.size === size && img['#text']);
    if (hit) return hit['#text'];
  }
  return '';
}

function renderAlbumList(albums) {
  if (!albums.length) {
    return '<p class="empty-state">No scrobbles in this window yet.</p>';
  }
  const items = albums
    .map((a) => {
      const cover = pickImage(a.image);
      const title = escapeHtml(a.name);
      const artist = escapeHtml(a.artist?.name ?? '');
      return `<li class="album">
        <a href="${a.url}" target="_blank" rel="noopener noreferrer">
          ${cover ? `<img src="${cover}" alt="${title} cover" loading="lazy">` : ''}
          <span class="album-meta">
            <span class="album-title">${title}</span>
            <span class="album-artist">${artist}</span>
          </span>
        </a>
      </li>`;
    })
    .join('');
  return `<ul class="album-list">${items}</ul>`;
}

function renderSection({ label }, albums) {
  return `<section class="album-section">
    <h3 class="album-section-title">${escapeHtml(label)}</h3>
    ${renderAlbumList(albums)}
  </section>`;
}

async function fetchPeriod(period) {
  const url = `https://ws.audioscrobbler.com/2.0/?method=user.gettopalbums&user=${encodeURIComponent(LASTFM_USER)}&period=${encodeURIComponent(period.key)}&limit=${LASTFM_LIMIT}&api_key=${encodeURIComponent(LASTFM_API_KEY)}&format=json`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`status ${response.status}`);
  const data = await response.json();
  return data?.topalbums?.album ?? [];
}

async function loadTopAlbums(target) {
  target.innerHTML = '<p class="empty-state">Loading…</p>';
  try {
    const results = await Promise.all(LASTFM_PERIODS.map(fetchPeriod));
    target.innerHTML = LASTFM_PERIODS.map((p, i) => renderSection(p, results[i])).join('');
  } catch (err) {
    console.error('Last.fm fetch failed:', err);
    target.innerHTML = '<p class="empty-state">Couldn’t reach Last.fm right now.</p>';
  }
}

document.querySelectorAll('[data-widget="top-albums"]').forEach(loadTopAlbums);
