// Fetches "top albums" from Last.fm for a user and fills any element with
// data-widget="top-albums" on the page. Runs once per page load.
// Last.fm sends Access-Control-Allow-Origin: * on read endpoints so this
// works directly from the browser — no proxy or backend needed.

const LASTFM_USER = 'griffinduffey';
const LASTFM_API_KEY = '9a77942fe3dca583972d56be9e7629b5';
const LASTFM_PERIOD = '1month';
const LASTFM_LIMIT = 12;

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

function renderAlbums(albums) {
  if (!albums.length) {
    return '<p class="empty-state">No recent scrobbles yet — check back once the listening kicks in.</p>';
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

async function loadTopAlbums(target) {
  target.innerHTML = '<p class="empty-state">Loading…</p>';
  const url = `https://ws.audioscrobbler.com/2.0/?method=user.gettopalbums&user=${encodeURIComponent(LASTFM_USER)}&period=${encodeURIComponent(LASTFM_PERIOD)}&limit=${LASTFM_LIMIT}&api_key=${encodeURIComponent(LASTFM_API_KEY)}&format=json`;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`status ${response.status}`);
    const data = await response.json();
    const albums = data?.topalbums?.album ?? [];
    target.innerHTML = renderAlbums(albums);
  } catch (err) {
    console.error('Last.fm fetch failed:', err);
    target.innerHTML = '<p class="empty-state">Couldn’t reach Last.fm right now.</p>';
  }
}

document.querySelectorAll('[data-widget="top-albums"]').forEach(loadTopAlbums);
