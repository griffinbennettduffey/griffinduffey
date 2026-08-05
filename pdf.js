// Printable PDF of the trip itinerary — a paper backup for when the phone is
// dead or there's no signal.
//
// Takes dist/cowboymode.html and strips everything that only makes sense on a
// screen: the day nav, the start-shift buttons, the disclosure behaviour (every
// stop is expanded on paper), and the JavaScript. Map links become the address
// or the coordinates typed out, because a hyperlink is worthless in print.
//
// Run with `npm run pdf`. Writes cowboymode.pdf next to this file.

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SRC = path.join(__dirname, 'dist', 'cowboymode.html');
const PRINT_HTML = path.join(__dirname, 'dist', 'cowboymode-print.html');
const OUT_PDF = path.join(__dirname, 'cowboymode.pdf');

const CHROME_PATHS = [
  process.env.CHROME,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
];

function findChrome() {
  for (const candidate of CHROME_PATHS) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  throw new Error(
    'No Chrome/Chromium found. Set CHROME=/path/to/binary and re-run.',
  );
}

// "44.7448,-109.3862" → "44.7448, -109.3862"; anything else is a place name.
const COORD_RE = /^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/;

function decodeEntities(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

// A hyperlink is dead weight on paper. Print the destination itself.
//
// Each link's visible text now carries the full destination — place name plus
// coordinates — so it is already print-ready and is used as-is. The href is
// only a fallback, for a link whose text says nothing useful ("Open in Maps");
// there, coordinates are typed out so they can go straight into a GPS.
function linkToPlainText(href, innerHtml) {
  const label = innerHtml
    .replace(/<[^>]+>/g, '')
    .replace(/[⌖◆▸]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (label && !/^open in maps$/i.test(label)) {
    return `<span class="loc"><b>Map</b> ${label}</span>`;
  }

  let query = '';
  try {
    query = new URL(decodeEntities(href)).searchParams.get('q') || '';
  } catch {
    query = '';
  }
  const coords = query.match(COORD_RE);
  const printed = coords ? `${coords[1]}, ${coords[2]}` : query;
  return printed ? `<span class="loc"><b>Map</b> ${printed}</span>` : '';
}

const PRINT_CSS = `
<style>
  /* Print overrides. Loaded after the screen styles, so plain source order
     wins — this file is only ever rendered to paper or PDF. */
  @page{size:letter;margin:.55in .8in}
  html{font-size:16px}
  body{
    max-width:none;margin:0;padding:0;
    font-size:10pt;line-height:1.4;color:#000;background:#fff;
  }

  header{padding:0}
  .eyebrow{font-size:7.5pt;color:#555}
  h1{font-size:17pt}
  h1 .x{color:#777}
  .hdr-sub{font-size:9.5pt;color:#000;margin-top:.06in}
  .legend{font-size:8.5pt;color:#333;margin-top:.08in}

  /* One day per page: you can fold out just today and leave the rest. */
  section{margin-top:0;padding-top:.12in}
  section + section{break-before:page}
  .dayhead{margin-bottom:.12in;padding-bottom:.05in;border-bottom:1pt solid #000}
  .dayhead h2{font-size:12.5pt}
  .dayhead .meta{font-size:9.5pt;color:#222;margin-top:.03in}

  /* Never split a stop across a page boundary. */
  .stop{break-inside:avoid;padding:.075in 0;border-top:.5pt solid #bbb}
  /* A drawn square survives printing; a real checkbox widget may not. */
  .ck{
    appearance:none;-webkit-appearance:none;
    width:9pt;height:9pt;margin-top:2.5pt;border:.75pt solid #555;background:#fff;
  }
  /* Both, because details[open] summary::after outranks the plain selector. */
  details summary::after,
  details[open] summary::after{content:none;display:none}
  .time{flex-basis:.62in;font-size:9pt;color:#222}
  .time b{font-size:9.5pt}
  .time em{color:#444}
  .tl{color:#666}
  .title{font-size:10.5pt}
  .flow{font-size:8.5pt;color:#333}
  .chips{font-size:8.5pt;color:#333}
  .body{padding-left:.72in;font-size:9.5pt;line-height:1.45;color:#000}
  .kit,.lookfor,.trail{border-left:.5pt solid #999;font-size:9pt;color:#111}
  .kit>b:first-child,.lookfor>b:first-child,.trail>b.h{font-size:7.5pt;color:#555}

  /* Typed-out destination, replacing the map hyperlink. */
  .loc{display:block;margin-top:.04in;font-size:9pt;color:#000}
  .loc b{
    font-size:7.5pt;font-weight:400;letter-spacing:.08em;text-transform:uppercase;
    color:#555;margin-right:.4em;
  }

  .infoblock{margin-top:.16in;font-size:9.5pt;break-inside:avoid}
  .infoblock h3{font-size:8pt;color:#000;border-bottom:.5pt solid #999}
  .kv{padding:.02in 0;border-bottom:.5pt solid #ddd}
  .kv span:first-child{color:#333}
  footer{margin-top:.2in;padding-top:.08in;border-top:.5pt solid #999;font-size:8.5pt;color:#555}
</style>
`;

function toPrintHtml(html) {
  let out = html;

  // Every stop is expanded on paper — nothing to click.
  out = out.replace(/<details(?![^>]*\bopen\b)/g, '<details open');

  // Screen-only furniture.
  out = out.replace(/<nav>[\s\S]*?<\/nav>/g, '');
  out = out.replace(/<div class="shiftrow">[\s\S]*?<\/div>/g, '');
  out = out.replace(/<div class="shnote">[\s\S]*?<\/div>/g, '');
  out = out.replace(/<script>[\s\S]*?<\/script>/g, '');

  // Hyperlinks become typed-out addresses and coordinates.
  let links = 0;
  out = out.replace(
    /<a\b[^>]*class="maplink"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g,
    (_m, href, inner) => {
      links++;
      return linkToPlainText(href, inner);
    },
  );

  // Any remaining anchor keeps its text but loses the link.
  out = out.replace(/<a\b[^>]*>([\s\S]*?)<\/a>/g, '$1');

  out = out.replace('</head>', `${PRINT_CSS}</head>`);
  return { html: out, links };
}

// A finished PDF ends with %%EOF — the signal that Chrome is done writing.
function pdfComplete(file) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const { size } = fs.fstatSync(fd);
    if (size < 1024) return false;
    const tail = Buffer.alloc(32);
    fs.readSync(fd, tail, 0, 32, size - 32);
    return tail.toString('latin1').trimEnd().endsWith('%%EOF');
  } catch {
    return false;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

// Chrome writes the PDF and then just sits there — it does not exit on its own
// in either headless mode. So poll for a complete file and shut it down here.
function printPdf(bin, args, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    let settled = false;
    proc.stderr.on('data', (d) => {
      stderr += d;
    });

    const started = Date.now();
    const poll = setInterval(() => {
      if (pdfComplete(OUT_PDF)) {
        settled = true;
        clearInterval(poll);
        proc.kill('SIGTERM');
        resolve();
      } else if (Date.now() - started > timeoutMs) {
        settled = true;
        clearInterval(poll);
        proc.kill('SIGKILL');
        reject(new Error(`Timed out waiting for the PDF.\n${stderr}`));
      }
    }, 250);

    proc.on('error', (err) => {
      clearInterval(poll);
      reject(err);
    });
    proc.on('exit', (code) => {
      if (settled) return; // we killed it on purpose
      clearInterval(poll);
      reject(new Error(`${path.basename(bin)} exited ${code} without writing a PDF.\n${stderr}`));
    });
  });
}

async function main() {
  if (!fs.existsSync(SRC)) {
    throw new Error(`${path.relative(__dirname, SRC)} not found — run \`npm run build\` first.`);
  }

  const { html, links } = toPrintHtml(fs.readFileSync(SRC, 'utf-8'));
  fs.writeFileSync(PRINT_HTML, html);

  const chrome = findChrome();
  // Stale output would look like an instantly-finished run to the poller.
  fs.rmSync(OUT_PDF, { force: true });
  // Use a throwaway profile so this never touches a running Chrome's session.
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cowboymode-pdf-'));
  try {
    await printPdf(chrome, [
      '--headless',
      '--disable-gpu',
      '--no-sandbox',
      `--user-data-dir=${profile}`,
      '--no-pdf-header-footer',
      `--print-to-pdf=${OUT_PDF}`,
      `file://${PRINT_HTML}`,
    ]);
  } finally {
    try {
      fs.rmSync(profile, { recursive: true, force: true });
    } catch {
      // Chrome may still be releasing the directory; it's in tmp either way.
    }
  }

  const kb = Math.round(fs.statSync(OUT_PDF).size / 1024);
  console.log(
    `Wrote ${path.relative(__dirname, OUT_PDF)} (${kb} KB) — ${links} map link(s) typed out as text.`,
  );
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
