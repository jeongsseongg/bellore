export function createSellGuidePreview(document, {
  logo, title, subtitle, selected, onClick, hideLogo = false
}) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'sell-guide__preview' + (selected ? ' is-selected' : '');
  if (logo) {
    const image = document.createElement('img');
    image.src = logo;
    image.alt = '';
    button.append(image);
  } else if (!hideLogo) {
    const fallback = document.createElement('b');
    fallback.className = 'sell-guide__preview-logo';
    fallback.textContent = String(title || '?').trim().slice(0, 1).toUpperCase();
    button.append(fallback);
  }
  const copy = document.createElement('span');
  const strong = document.createElement('strong');
  const small = document.createElement('small');
  strong.textContent = title;
  small.textContent = subtitle;
  copy.append(strong, small);
  button.append(copy);
  if (hideLogo) button.classList.add('sell-guide__preview--text');
  button.addEventListener('click', onClick);
  return button;
}
