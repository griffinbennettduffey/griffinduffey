async function loadArenaChannel(container) {
  const slug = container.getAttribute('data-arena-slug');
  if (!slug) return;

  try {
    const response = await fetch(`https://api.are.na/v2/channels/${slug}?per=100`);
    if (!response.ok) throw new Error(`Are.na request failed: ${response.status}`);
    const data = await response.json();

    container.innerHTML = '';
    data.contents.forEach((block) => {
      if (block.class !== 'Image' || !block.image?.display?.url) return;

      const wrapper = document.createElement('div');
      wrapper.className = 'arena-block';

      const link = document.createElement('a');
      link.href = `https://www.are.na/block/${block.id}`;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';

      const img = document.createElement('img');
      img.src = block.image.display.url;
      img.alt = block.title || 'Untitled';
      img.loading = 'lazy';

      link.appendChild(img);
      wrapper.appendChild(link);
      container.appendChild(wrapper);
    });
  } catch (err) {
    console.error('Error loading Are.na channel:', err);
    container.innerHTML = '<p class="arena-error">Failed to load channel. Check the console for details.</p>';
  }
}

document.querySelectorAll('[data-arena-slug]').forEach(loadArenaChannel);
