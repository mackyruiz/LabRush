export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function button(
  label: string,
  className: string,
  onClick: () => void,
  attrs: { ariaLabel?: string; disabled?: boolean } = {},
): HTMLButtonElement {
  const b = el('button', className, label);
  b.type = 'button';
  if (attrs.ariaLabel) b.setAttribute('aria-label', attrs.ariaLabel);
  if (attrs.disabled) b.disabled = true;
  b.addEventListener('click', (ev) => {
    ev.stopPropagation();
    onClick();
  });
  return b;
}

export function clear(node: HTMLElement): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function link(text: string, href: string): HTMLAnchorElement {
  const a = el('a', undefined, text);
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener';
  return a;
}
