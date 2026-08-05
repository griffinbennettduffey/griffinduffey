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
<meta name="theme-color" content="#1c1b16">
<meta name="robots" content="noindex">
<title>Cody × Yellowstone — Aug 2026</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}
  body{
    font-family:"Times New Roman",Times,"Liberation Serif",Georgia,serif;
    background:#f2f1ea;color:#17170f;min-height:100dvh;
    display:flex;align-items:center;justify-content:center;padding:1.5rem;
  }
  form{width:100%;max-width:22rem}
  .eyebrow{font-size:.66rem;letter-spacing:.22em;text-transform:uppercase;color:#6f6d60;margin-bottom:.45rem}
  h1{font-size:1.5rem;font-weight:800;letter-spacing:-.01em;line-height:1.1}
  h1 .x{color:#c05a1f;font-weight:400;padding:0 .1em}
  .rule{height:4px;background:#c05a1f;margin:1rem 0 1.4rem}
  label{display:block;font-size:.72rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#6f6d60;margin-bottom:.4rem}
  input{
    font:inherit;font-size:1rem;width:100%;padding:.7rem .8rem;
    background:#fbfaf5;border:1px solid #d8d5c8;border-radius:.5rem;color:#17170f;
  }
  input:focus{outline:2px solid #4f5d42;outline-offset:1px;border-color:#4f5d42}
  button{
    font:inherit;font-size:.8rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;
    width:100%;margin-top:.7rem;padding:.75rem;cursor:pointer;
    background:#1c1b16;border:0;border-radius:.5rem;color:#f4f2ea;
  }
  .err{font-size:.78rem;color:#c05a1f;margin-top:.7rem;font-style:italic}
</style>
</head>
<body>
<form method="POST">
  <p class="eyebrow">Private itinerary</p>
  <h1>CODY<span class="x">×</span>YELLOWSTONE</h1>
  <div class="rule"></div>
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
