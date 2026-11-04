/** Плотность таблиц: комфортная (по умолчанию) или компактная. Хранится как `data-density` на корне и в localStorage. */
const KEY = 'f7-density';
const EVENT = 'f7-density-change';

export type Density = 'comfortable' | 'compact';

export function getDensity(): Density {
  return document.documentElement.getAttribute('data-density') === 'compact' ? 'compact' : 'comfortable';
}

function apply(density: Density) {
  const root = document.documentElement;
  if (density === 'compact') root.setAttribute('data-density', 'compact');
  else root.removeAttribute('data-density');
  window.dispatchEvent(new Event(EVENT));
}

export function initDensity(): void {
  try {
    if (localStorage.getItem(KEY) === 'compact') apply('compact');
  } catch {
    /* без localStorage — комфортная плотность */
  }
}

export function setDensity(density: Density): void {
  try {
    localStorage.setItem(KEY, density);
  } catch {
    /* выбор действует до перезагрузки */
  }
  apply(density);
}

export function subscribeDensity(listener: () => void): () => void {
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
