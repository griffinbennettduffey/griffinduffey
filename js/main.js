// Finds every element with a data-include attribute,
// fetches the file specified, and injects its content.

async function loadIncludes() {
  const elements = document.querySelectorAll('[data-include]');

  const fetches = Array.from(elements).map(async (el) => {
    const path = el.getAttribute('data-include');
    try {
      const response = await fetch(path);
      if (!response.ok) {
        throw new Error(`Failed to load ${path}: ${response.status}`);
      }
      const html = await response.text();
      el.innerHTML = html;
    } catch (err) {
      console.error(err);
    }
  });

  await Promise.all(fetches);

  // Mark active nav link based on current page
  highlightActiveLink();
}

function highlightActiveLink() {
  const currentPath = window.location.pathname;
  const links = document.querySelectorAll('.site-nav a');
  links.forEach((link) => {
    // Compare href path to current path
    const linkPath = new URL(link.href, window.location.origin).pathname;
    if (linkPath === currentPath) {
      link.setAttribute('aria-current', 'page');
    }
  });
}

loadIncludes();

// Scrolling tab title
let scrollingTitle = 'gggrrriiifffiiinnddduuufffeeeyyy ';
setInterval(() => {
  scrollingTitle = scrollingTitle.substring(1) + scrollingTitle.charAt(0);
  document.title = scrollingTitle;
}, 250);