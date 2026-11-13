// Hash routing: "#/build?cpu=…" works on any static host with no rewrites,
// and the whole build lives in the address bar.
import { useEffect, useState } from 'react';

export interface Route {
  path: string;
  query: string;
}

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#/, '') || '/';
  const i = raw.indexOf('?');
  return i < 0 ? { path: raw, query: '' } : { path: raw.slice(0, i), query: raw.slice(i + 1) };
}

export const href = (path: string, query = '') => `#${path}${query ? `?${query}` : ''}`;

/** Go to a route. `replace` rewrites the current history entry (used for every edit to a build). */
export function navigate(path: string, query = '', replace = false) {
  const url = href(path, query);
  if (replace) {
    history.replaceState(null, '', url);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    location.hash = url;
  }
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(location.hash));
  useEffect(() => {
    const on = () => setRoute(parseHash(location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

/** Merge keys into a query string; empty values remove the key. */
export function withParams(query: string, changes: Record<string, string | null | undefined>): string {
  const q = new URLSearchParams(query);
  for (const [k, v] of Object.entries(changes)) {
    if (v === null || v === undefined || v === '') q.delete(k);
    else q.set(k, v);
  }
  return q.toString();
}
