// Password gate for the private trip itinerary at /cowboymode.
//
// Cloudflare Pages runs this middleware ahead of every request to the project.
// Anything that isn't the itinerary passes straight through via next(); the
// itinerary itself is held behind a shared password.
//
// The password comes from the COWBOY_PASSWORD environment variable (Cloudflare
// dashboard → the Pages project → Settings → Environment variables), falling
// back to the trip default so the gate works with no dashboard setup at all.
//
// Unlocking sets a cookie holding the SHA-256 of the password, so the password
// itself never travels again and one unlock lasts the whole trip.
//
// dev.js carries a matching stand-in so `npm run dev` behaves the same locally.

// Every route that resolves to the itinerary asset: Pages serves it at
// /cowboymode, and the underlying file is still reachable at /cowboymode.html.
const PROTECTED = /^\/cowboymode(\.html)?\/?$/;
const COOKIE = 'cowboymode';
const MAX_AGE = 60 * 60 * 24 * 180; // ~6 months — one unlock outlasts the trip
const DEFAULT_PASSWORD = 'yellowstone';

export async function onRequest({ request, env, next }) {
  const url = new URL(request.url);
  if (!PROTECTED.test(url.pathname)) return next();

  const expected = await sha256(env.COWBOY_PASSWORD || DEFAULT_PASSWORD);

  if (request.method === 'POST') {
    let submitted = '';
    try {
      submitted = String((await request.formData()).get('password') || '');
    } catch {
      // Not a form post — fall through and re-prompt.
    }
    if (equals(await sha256(submitted), expected)) {
      const secure = url.protocol === 'https:' ? '; Secure' : '';
      return new Response(null, {
        status: 303,
        headers: {
          Location: url.pathname,
          'Set-Cookie': `${COOKIE}=${expected}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; SameSite=Lax${secure}`,
        },
      });
    }
    return loginPage(true);
  }

  if (equals(readCookie(request.headers.get('Cookie'), COOKIE), expected)) {
    return next();
  }
  return loginPage(false);
}

async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Compare in constant time so a wrong cookie can't be tuned byte by byte.
function equals(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function readCookie(header, name) {
  if (!header) return '';
  for (const pair of header.split(';')) {
    const eq = pair.indexOf('=');
    if (eq === -1) continue;
    if (pair.slice(0, eq).trim() === name) return pair.slice(eq + 1).trim();
  }
  return '';
}

function loginPage(failed) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<meta name="theme-color" content="#ffffff">
<meta name="robots" content="noindex">
<title>Cody × Yellowstone — Aug 2026</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}
  body{
    font-family:Times,"Times New Roman","Liberation Serif",serif;
    font-size:17px;line-height:1.5;color:#111;background:#fff;
    min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:1.5rem;
  }
  form{width:100%;max-width:20rem}
  .eyebrow{font-size:.72rem;letter-spacing:.1em;text-transform:uppercase;color:#8c8c8c;margin-bottom:.4rem}
  h1{font-size:1.3rem;font-weight:700;line-height:1.2}
  h1 .x{color:#8c8c8c;font-weight:400;padding:0 .12em}
  hr{border:0;border-top:1px solid #e0e0e0;margin:1rem 0 1.3rem}
  label{display:block;font-size:.72rem;letter-spacing:.1em;text-transform:uppercase;color:#8c8c8c;margin-bottom:.4rem}
  input{font:inherit;font-size:1rem;width:100%;padding:.55rem .6rem;background:#fff;border:1px solid #ccc;color:#111}
  input:focus{outline:none;border-color:#111}
  button{font:inherit;font-size:.85rem;width:100%;margin-top:.6rem;padding:.6rem;cursor:pointer;background:#fff;border:1px solid #111;color:#111}
  .err{font-size:.85rem;color:#666;margin-top:.7rem;font-style:italic}
</style>
</head>
<body>
<form method="POST">
  <p class="eyebrow">Private itinerary</p>
  <h1>CODY<span class="x">×</span>YELLOWSTONE</h1>
  <hr>
  <label for="p">Password</label>
  <input id="p" name="password" type="password" autocomplete="current-password" autocapitalize="off" autocorrect="off" required autofocus>
  <button type="submit">Enter</button>
  ${failed ? '<p class="err">Not quite — try again.</p>' : ''}
</form>
</body>
</html>`;
  return new Response(html, {
    status: 401,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
